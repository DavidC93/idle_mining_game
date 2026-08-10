/* Content validation. Run with `node tools/validate.js`.
 *
 * The bug this exists to prevent: a pickaxe whose recipe needs ore that only
 * drops behind the gate that pickaxe opens. That is unwinnable and invisible
 * in the data files, so we prove reachability by forward simulation instead.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/util/num.js', 'src/util/rng.js',
  'src/data/balance.js', 'src/data/resources.js', 'src/data/recipes.js',
  'src/data/upgrades.js', 'src/data/talents.js', 'src/data/achievements.js',
  'src/data/contracts.js'
];
const sandbox = { console, Date, Math, JSON };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.MG;
G.registerGoods();

const errors = [];
const warnings = [];
const ok = [];

function err(m) { errors.push(m); }
function warn(m) { warnings.push(m); }

/* ---- 1. every referenced id exists ------------------------------------- */
for (const st of G.STRATA) {
  for (const d of st.drops) if (!G.RES_BY_ID[d.id]) err(`stratum ${st.id}: unknown drop "${d.id}"`);
}
for (const r of G.RECIPES) {
  if (!G.RES_BY_ID[r.out.id]) err(`recipe ${r.id}: unknown output "${r.out.id}"`);
  for (const i of r.inputs) if (!G.RES_BY_ID[i.id]) err(`recipe ${r.id}: unknown input "${i.id}"`);
}
for (const p of G.PICKAXES) {
  if (!p.cost) continue;
  for (const m of p.cost.mats) if (!G.RES_BY_ID[m.id]) err(`pickaxe ${p.id}: unknown material "${m.id}"`);
}
if (!errors.length) ok.push('all resource / recipe / pickaxe ids resolve');

/* ---- 2. reachability: can a player actually climb the whole chain? ------ */
{
  const have = new Set();                 // resource ids obtainable so far
  let pickTier = 0;
  const openStrata = () => {
    for (const st of G.STRATA) {
      if (pickTier >= st.gate) for (const d of st.drops) have.add(d.id);
    }
  };
  const expandCrafts = () => {
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of G.RECIPES) {
        if (have.has(r.out.id)) continue;
        if (r.inputs.every(i => have.has(i.id))) { have.add(r.out.id); grew = true; }
      }
    }
  };

  openStrata(); expandCrafts();
  let progressed = true;
  while (progressed && pickTier < G.PICKAXES.length - 1) {
    progressed = false;
    const next = G.PICKAXES[pickTier + 1];
    if (next.cost.mats.every(m => have.has(m.id))) {
      pickTier++;
      openStrata(); expandCrafts();
      progressed = true;
    }
  }
  if (pickTier < G.PICKAXES.length - 1) {
    const stuck = G.PICKAXES[pickTier + 1];
    const missing = stuck.cost.mats.filter(m => !have.has(m.id)).map(m => m.id);
    err(`progression deadlock at pickaxe tier ${pickTier + 1} (${stuck.name}): ` +
        `unreachable material(s) ${missing.join(', ')}`);
  } else {
    ok.push(`progression reachable: all ${G.PICKAXES.length} pickaxe tiers and ${G.STRATA.length} strata`);
  }
}

/* ---- 2b. no backtracking on the critical path ---------------------------
   The miner auto-follows the deepest stratum his pickaxe allows. If forging
   the *next* pickaxe needs ore that only drops further up the shaft, the
   player has to notice the station selector and manually walk back — fine as
   an optional strategy, unacceptable as a hidden requirement on the main
   progression spine. Fuel is exempt: going back for coal is a deliberate
   mechanic that the depot and the crew both exist to solve. */
{
  const dropsAt = idx => new Set(G.STRATA[idx].drops.map(d => d.id));
  const stationFor = pickTier => {
    let last = 0;
    for (let i = 0; i < G.STRATA.length; i++) {
      if (pickTier >= G.STRATA[i].gate) last = i; else break;
    }
    return last;
  };
  // Craftables reachable from a stratum's own drops, following the recipe graph.
  const closure = idx => {
    const have = dropsAt(idx);
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of G.RECIPES) {
        if (have.has(r.out.id)) continue;
        if (r.inputs.every(i => have.has(i.id))) { have.add(r.out.id); grew = true; }
      }
    }
    return have;
  };

  for (let tier = 1; tier < G.PICKAXES.length; tier++) {
    const station = stationFor(tier - 1);          // where the player stands while forging it
    const reachable = closure(station);
    const missing = G.PICKAXES[tier].cost.mats
      .filter(m => !reachable.has(m.id))
      .map(m => m.id);
    if (missing.length) {
      err(`pickaxe ${G.PICKAXES[tier].id} needs ${missing.join(', ')}, which do not drop at ` +
          `"${G.STRATA[station].name}" where the player is standing — forces backtracking`);
    }
  }
  if (!errors.length) ok.push('every pickaxe is forgeable without backtracking to an earlier stratum');
}

/* ---- 3. fuel is available at every depth ------------------------------- */
{
  let seenFuel = false;
  for (const st of G.STRATA) {
    const hasFuel = st.drops.some(d => G.RES_BY_ID[d.id].fuel);
    if (hasFuel) seenFuel = true;
    else if (seenFuel && st.gate >= 2) {
      // acceptable only if the player can go back for it, which they always can
      // (the station selector) — flag as info, not an error.
      warn(`stratum ${st.id} drops no fuel; players must farm a shallower layer or buy the depot`);
    }
  }
  ok.push('fuel sources present in the drop tables');
}

/* ---- 4. smelting is actually profitable -------------------------------- */
for (const r of G.RECIPES) {
  const inVal = r.inputs.reduce((a, i) => a + G.RES_BY_ID[i.id].value * i.n, 0);
  const outVal = G.RES_BY_ID[r.out.id].value * r.out.n;
  const ratio = outVal / inVal;
  if (ratio < 1.5) err(`recipe ${r.id}: only ${ratio.toFixed(2)}x value — not worth smelting`);
  else if (ratio > 6) warn(`recipe ${r.id}: ${ratio.toFixed(2)}x value — suspiciously generous`);
}
ok.push('every recipe converts inputs into a meaningfully more valuable output');

/* ---- 5. monotonic curves ------------------------------------------------ */
for (let i = 1; i < G.PICKAXES.length; i++) {
  if (G.PICKAXES[i].power <= G.PICKAXES[i - 1].power) err(`pickaxe ${G.PICKAXES[i].id}: power not increasing`);
}
for (let i = 1; i < G.STRATA.length; i++) {
  if (G.STRATA[i].minDepth <= G.STRATA[i - 1].minDepth) err(`stratum ${G.STRATA[i].id}: minDepth not increasing`);
  if (G.STRATA[i].gate < G.STRATA[i - 1].gate) err(`stratum ${G.STRATA[i].id}: gate goes backwards`);
  if (G.STRATA[i].hardness <= G.STRATA[i - 1].hardness) err(`stratum ${G.STRATA[i].id}: hardness not increasing`);
}
ok.push('pickaxe power, stratum depth, gate and hardness curves are monotonic');

/* ---- 6. no duplicate ids ------------------------------------------------ */
{
  const seen = new Set();
  for (const r of G.RESOURCES) {
    if (seen.has(r.id)) err(`duplicate resource id "${r.id}"`);
    seen.add(r.id);
  }
  const ids = [G.UPGRADES, G.UNLOCKS, G.TALENTS, G.ACHIEVEMENTS, G.CREW_TYPES];
  for (const list of ids) {
    const s2 = new Set();
    for (const x of list) {
      if (s2.has(x.id)) err(`duplicate id "${x.id}"`);
      s2.add(x.id);
    }
  }
  ok.push('no duplicate ids');
}

/* ---- 7. the exponent budget --------------------------------------------- */
/* An upgrade that multiplies income by (1+g) per level while costing r^n gold
   makes income scale as gold^(ln(1+g)/ln r). If those exponents sum to >= 1
   across all income-multiplying upgrades, gold reaches infinity in finite time
   and the game eats itself. This check is here because that is exactly what
   happened during development and it is invisible by inspection. */
{
  const BUDGET = 0.85;
  const contribution = (per, rate) => Math.log(1 + per) / Math.log(rate);

  /* Every income line counts, capped or not.

     This used to skip any line with max <= 60 on the theory that a cap makes
     the exponent moot. It does not: the exponent decides how fast you reach the
     cap, and with five lines all "safely capped" the player hit every ceiling
     inside forty minutes. Boundedness is section 7a's job; this section is
     purely about speed, so it ignores caps entirely. */

  /* Stats that multiply gold income at a fixed depth. `power` is handled
     separately below because it has two mutually exclusive regimes. */
  const INCOME_STATS = new Set(['speed', 'yield', 'price', 'orePrice', 'crew', 'forge']);

  /* The paths gold can actually flow along. These are multiplicative chains:
     mining yield feeds the forge, forge speed multiplies throughput, and price
     multiplies the revenue of whatever comes out — so their exponents ADD. */
  const paths = {
    'mine→sell': ['speed', 'yield', 'price', 'orePrice'],
    'mine→forge→sell': ['speed', 'yield', 'forge', 'price'],
    'crew→forge→sell': ['crew', 'yield', 'forge', 'price']
  };

  const perStat = {};
  for (const u of G.UPGRADES) {
    const effs = u.effect.multi || [u.effect];
    for (const e of effs) {
      if (!e.mult || !INCOME_STATS.has(e.mult)) continue;
      perStat[e.mult] = (perStat[e.mult] || 0) + contribution(e.per, u.rate);
    }
  }
  /* The depth feedback term.

     Deeper ore is worth more, and depth is bought with mining power, so depth
     contributes its own exponent on top of the upgrade paths:

         value(d) ~ e^(a·d)      a = ln(value per stratum) / stratum thickness
         d_max    ~ p·ln(gold)/k p = power exponent, k = ln(hpGrowth)
         ⇒ value  ~ gold^(a·p/k)

     This term is invisible in the upgrade tables and was the reason the economy
     still diverged after every individual upgrade line had been made safe. */
  let depthExp = 0, powerExp = 0;
  {
    let p = 0;
    for (const u of G.UPGRADES) {
      const effs = u.effect.multi || [u.effect];
      for (const e of effs) {
        if (e.mult !== 'power') continue;
        p += contribution(e.per, u.rate);
      }
    }
    /* The pickaxe ladder is a power line too, and an easy one to miss: each
       tier multiplies power by ~2.9 for a gold cost that multiplies by R, so it
       contributes ln(2.9)/ln(R) exactly like a repeatable upgrade would. With a
       shallow cost ramp this term alone pushed the economy over 1.0. */
    let lnPow = 0, lnCost = 0, steps = 0;
    for (let i = 2; i < G.PICKAXES.length; i++) {
      lnPow += Math.log(G.PICKAXES[i].power / G.PICKAXES[i - 1].power);
      lnCost += Math.log(G.PICKAXES[i].cost.gold / G.PICKAXES[i - 1].cost.gold);
      steps++;
    }
    var pickExp = (lnPow / steps) / (lnCost / steps);
    p += pickExp;

    // Average value multiple and thickness across stratum boundaries.
    let lnRatio = 0, thickness = 0, n = 0;
    const avgValue = st => {
      let t = 0, w = 0;
      for (const d of st.drops) { t += G.RES_BY_ID[d.id].value * d.w; w += d.w; }
      return t / w;
    };
    for (let i = 1; i < G.STRATA.length; i++) {
      lnRatio += Math.log(avgValue(G.STRATA[i]) / avgValue(G.STRATA[i - 1]));
      thickness += G.STRATA[i].minDepth - G.STRATA[i - 1].minDepth;
      n++;
    }
    const a = (lnRatio / n) / (thickness / n);
    const k = Math.log(G.BAL.hpGrowth);
    depthExp = a * p / k;
    powerExp = p;
    ok.push(`depth feedback exponent ${depthExp.toFixed(2)} ` +
            `(power ${p.toFixed(2)} = upgrades + pickaxe ladder ${pickExp.toFixed(2)}, hpGrowth ${G.BAL.hpGrowth})`);
  }

  /* Power has two regimes and they are mutually exclusive, so the honest term
     is the larger of the two, not their sum:

       under the chain cap  power multiplies break rate directly  -> powerExp
       at the chain cap     power buys depth, and depth buys value -> depthExp

     Summing them (the old model) double-counted one mechanism and still
     under-predicted the runaway, because it was quietly dropping the capped
     power upgrades from powerExp. Taking the max counts each mechanism once at
     full strength, which is the worst case a player can actually be in. */
  const powerTerm = Math.max(powerExp, depthExp);
  const powerLabel = powerExp >= depthExp ? 'power' : 'depth';

  for (const [name, stats] of Object.entries(paths)) {
    const upgradeExp = stats.reduce((a, st) => a + (perStat[st] || 0), 0);
    const total = upgradeExp + powerTerm;
    const detail = stats.filter(st => perStat[st]).map(st => `${st} ${perStat[st].toFixed(2)}`).join(' + ') +
                   ` + ${powerLabel} ${powerTerm.toFixed(2)}`;
    if (total >= 1) err(`income runaway on ${name}: ${detail} = ${total.toFixed(2)} >= 1.00`);
    else if (total > BUDGET) warn(`${name} exponent ${total.toFixed(2)} (${detail}) is close to the 1.00 cliff`);
    else ok.push(`${name} exponent ${total.toFixed(2)} (${detail})`);
  }
}

/* ---- 7a. the income ceiling ---------------------------------------------
   Stronger than the exponent budget and much harder to get wrong: if every
   line that multiplies income has a level cap, total income has a finite
   ceiling and cannot diverge no matter which feedback path the analysis
   missed. The exponent check above only covers uncapped lines, and it did miss
   one — at the frontier, mining power multiplies income as well as buying
   depth, which is not visible in any upgrade table. */
{
  const INCOME_STATS = ['power', 'speed', 'yield', 'price', 'orePrice', 'forge', 'crew'];
  const ceiling = {};
  const uncapped = [];
  for (const u of G.UPGRADES) {
    const effs = u.effect.multi || [u.effect];
    for (const e of effs) {
      if (!e.mult || !INCOME_STATS.includes(e.mult)) continue;
      if (u.max === undefined) { uncapped.push(`${u.id} (${e.mult})`); continue; }
      ceiling[e.mult] = (ceiling[e.mult] || 1) * Math.pow(1 + e.per, u.max);
    }
  }
  if (uncapped.length) {
    err(`income lines with no level cap: ${uncapped.join(', ')} — income has no ceiling`);
  } else {
    const parts = INCOME_STATS.filter(k => ceiling[k])
      .map(k => `${k} x${G.num.fmt(ceiling[k])}`);
    const total = INCOME_STATS.reduce((a, k) => a * (ceiling[k] || 1), 1);
    ok.push(`income ceiling x${G.num.fmt(total)} from shop upgrades (${parts.join(', ')})`);
  }
}

/* ---- 7b. rarity actually means something --------------------------------- */
/* The player's complaint that fixed this: rare ore turned up constantly. A
   layer's rare drop should be a find, not a staple, and no layer should dump
   a pile of brand-new resources on you at once. */
{
  /* Rare share is a curve, not a number: generous at the surface so the first
     pickaxe is reachable, tight at the bottom so a rare find still means
     something. What matters is the shape — it must only ever go down. */
  const MAX_RARE_SHARE = 0.24;      // surface
  const MIN_RARE_SHARE = 0.02;      // core
  const DEEPEST_ALLOWED = 0.09;     // the last layer must actually feel rare
  const shares = [];
  for (const st of G.STRATA) {
    const total = st.drops.reduce((a, d) => a + d.w, 0);
    const rare = st.drops.filter(d => d.rarity === 'rare').reduce((a, d) => a + d.w, 0);
    const share = rare / total;
    shares.push({ id: st.id, name: st.name, share });
    if (share > MAX_RARE_SHARE) {
      err(`stratum ${st.id}: rare drops are ${(share * 100).toFixed(1)}% — not rare`);
    }
    if (rare > 0 && share < MIN_RARE_SHARE) {
      warn(`stratum ${st.id}: rare drops are ${(share * 100).toFixed(1)}% — so rare they read as broken`);
    }
    const fresh = st.drops.filter(d => d.rarity !== 'carry').length;
    if (fresh > 3) err(`stratum ${st.id} introduces ${fresh} new resources at once`);
  }
  for (let i = 1; i < shares.length; i++) {
    if (shares[i].share > shares[i - 1].share + 1e-9) {
      err(`rare drops get MORE common with depth at "${shares[i].name}" ` +
          `(${(shares[i - 1].share * 100).toFixed(1)}% → ${(shares[i].share * 100).toFixed(1)}%)`);
    }
  }
  const last = shares[shares.length - 1];
  if (last.share > DEEPEST_ALLOWED) {
    err(`the deepest layer still drops rares ${(last.share * 100).toFixed(1)}% of the time`);
  } else {
    ok.push(`rare drops taper ${(shares[0].share * 100).toFixed(1)}% → ` +
            `${(last.share * 100).toFixed(1)}% with depth, max 3 new resources per layer`);
  }

  // Luck must bias the rarity roll, not hand the player the next layer.
  const maxLuck = 0.60;
  const cross = maxLuck * G.BAL.crossLayerShare;
  if (cross > 0.12) err(`luck reaches into the next layer ${(cross * 100).toFixed(0)}% of the time`);
  else ok.push(`at max luck, ${(cross * 100).toFixed(1)}% of drops come from the next layer down`);
}

/* ---- 8. achievements are all wired up ----------------------------------- */
for (const a of G.ACHIEVEMENTS) {
  if (typeof a.test !== 'function') err(`achievement ${a.id}: no test function`);
  if (!a.reward) err(`achievement ${a.id}: no reward`);
}
ok.push(`${G.ACHIEVEMENTS.length} achievements wired`);

/* ---- report ------------------------------------------------------------- */
console.log('');
for (const m of ok) console.log('  ✓ ' + m);
for (const m of warnings) console.log('  ! ' + m);
for (const m of errors) console.log('  ✗ ' + m);
console.log('');
console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)`);
console.log('');
process.exit(errors.length ? 1 : 0);
