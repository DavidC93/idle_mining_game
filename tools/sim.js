/* Headless balance simulator.
 *
 *   node tools/sim.js [hours] [--verbose] [--prestige]
 *
 * Runs the real game systems with a greedy "buy the best value-per-gold thing
 * I can afford" agent and prints the progression curve. The point is to catch
 * walls (hours of no progress) and runaways (endgame reached in 20 minutes)
 * before a human ever plays it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const say = (...m) => fs.writeSync(1, m.join(' ') + '\n');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/util/num.js', 'src/util/rng.js',
  'src/data/balance.js', 'src/data/resources.js', 'src/data/recipes.js',
  'src/data/upgrades.js', 'src/data/talents.js', 'src/data/achievements.js',
  'src/data/contracts.js',
  'src/systems/events.js', 'src/systems/state.js', 'src/systems/stats.js',
  'src/systems/mining.js', 'src/systems/forge.js', 'src/systems/market.js',
  'src/systems/shop.js', 'src/systems/contracts.js', 'src/systems/prestige.js',
  'src/systems/achievements.js', 'src/systems/offline.js', 'src/systems/game.js'
];

const sandbox = { console, Date, Math, JSON, localStorage: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const G = sandbox.MG;

/* Balance sweep hooks: tools/sweep.js sets these to explore the two constants
   that dominate pacing without editing the data files. */
if (process.env.MG_HPGROWTH) G.BAL.hpGrowth = parseFloat(process.env.MG_HPGROWTH);
if (process.env.MG_SHARPRATE) G.UPGRADE_BY_ID.sharpness.rate = parseFloat(process.env.MG_SHARPRATE);
if (process.env.MG_QUIET) { const noop = () => {}; global.__quiet = true; }
const { num, State, Stats, Shop, Market, Forge, Prestige, Mining } = G;

/* ---------------------------------------------------------------------- */
/* The agent. Not optimal — deliberately a bit dumb, like a real player:
   forge the pickaxe when possible, keep the forge fed, sell surplus, then buy
   the cheapest useful upgrade. */

function agentStep(game) {
  const s = game.s, o = game.o;

  // 1. Unlocks are almost always worth it the moment they are affordable.
  for (const u of G.UNLOCKS) {
    if (!s.unlocks[u.id] && Shop.unlockVisible(s, u) && s.gold >= u.cost * 1.2) {
      Shop.buyUnlock(s, u.id);
      game.refresh();
    }
  }

  // 2. Keep the forge busy. Priority goes to whatever the next pickaxe is
  //    short of — a real player forges toward their next power jump, not
  //    toward the highest sticker price on the recipe list.
  if (s.unlocks.forge) {
    // Walk the recipe tree for the next pickaxe and smelt the deepest thing we
    // are actually short of, the way a player reading the recipe would.
    const need = (id, qty, depth) => {
      if (depth > 6) return null;
      if ((s.inv[id] || 0) >= qty) return null;
      const r = G.RECIPE_BY_ID[id];
      if (!r) return null;
      for (const i of r.inputs) {
        const deeper = need(i.id, i.n, depth + 1);
        if (deeper) return deeper;
      }
      return Forge.canStart(s, r, o) ? r : null;
    };

    let target = null;
    const want = Shop.nextPick(s);
    if (want && want.cost.mats) {
      for (const m of want.cost.mats) {
        target = need(m.id, m.n, 0);
        if (target) break;
      }
    }
    if (!target) {
      let bestVal = 0;
      for (const r of G.RECIPES) {
        if (!Forge.recipeUnlocked(s, r) || !Forge.canStart(s, r, o)) continue;
        const v = G.res(r.out.id).value * r.out.n / r.time;
        if (v > bestVal) { bestVal = v; target = r; }
      }
    }
    if (target) {
      if (s.unlocks.autoSmelt) s.forge.auto = target.id;
      while (s.forge.jobs.length < Forge.slotCount(s) && Forge.start(s, target.id, o)) { /* fill */ }
    }
    if (s.gold > Shop.forgeSlotCost(s) * 4) { Shop.buyForgeSlot(s); game.refresh(); }
  }

  // 3. Forge the next pickaxe as soon as materials allow — it is always the
  //    single biggest power jump available.
  if (Shop.forgePick(s)) game.refresh();

  // 4. Sell everything that is not reserved for the forge or the next pickaxe.
  const reserved = new Set();
  const nextPick = Shop.nextPick(s);
  if (nextPick && nextPick.cost.mats) for (const m of nextPick.cost.mats) reserved.add(m.id);
  for (const r of G.RECIPES) {
    if (Forge.recipeUnlocked(s, r)) for (const i of r.inputs) reserved.add(i.id);
  }
  for (const id of Object.keys(s.inv)) {
    const r = G.res(id);
    if (r.fuel) continue;
    if (reserved.has(id)) {
      // keep a working stock, sell the excess
      const keep = 400;
      if (s.inv[id] > keep) Market.sell(s, id, s.inv[id] - keep, o);
    } else {
      Market.sell(s, id, s.inv[id], o);
    }
  }

  // 5. Buy upgrades: cheapest-first, but never spend below the pickaxe reserve.
  const pickGold = nextPick ? nextPick.cost.gold : 0;
  let budget = s.gold - pickGold * 0.5;
  let guard = 0;
  while (budget > 0 && guard++ < 60) {
    let best = null, bestCost = Infinity;
    for (const u of G.UPGRADES) {
      if (!Stats.condMet(s, u.unlock) || Shop.upgradeMaxed(s, u)) continue;
      const c = Shop.upgradeCost(u, Shop.upgradeLevel(s, u.id));
      if (c < bestCost && c <= budget) { bestCost = c; best = u; }
    }
    if (!best) break;
    Shop.buyUpgrade(s, best.id, 1);
    budget -= bestCost;
    game.refresh();
  }

  // 6. Hire crew when gold is plentiful.
  if (s.unlocks.crew) {
    for (const t of [...G.CREW_TYPES].reverse()) {
      if (!Stats.condMet(s, t.unlock)) continue;
      let g2 = 0;
      while (s.gold > Shop.crewCost(s, t) * 6 && g2++ < 5) { Shop.hireCrew(s, t.id); game.refresh(); }
      break;
    }
  }
}

/* ---------------------------------------------------------------------- */

function run(hours, opts) {
  const game = G.Game;
  game.init(State.newState());
  game.s.stats.runTime = 0;

  const dt = 0.25;                 // simulation granularity
  const totalSteps = Math.round(hours * 3600 / dt);
  const agentEvery = Math.round(2 / dt);
  const rows = [];
  let nextReport = 0;
  const reportTimes = buildReportTimes(hours);
  let ri = 0;
  let prestiges = 0;

  for (let step = 0; step < totalSteps; step++) {
    game.tick(dt);
    if (step % agentEvery === 0) agentStep(game);

    const t = step * dt;
    if (ri < reportTimes.length && t >= reportTimes[ri]) {
      rows.push(snapshot(game, t));
      ri++;
    }

    // NOTE: read game.s fresh each iteration. prestige swaps the state object,
    // and a captured reference keeps re-triggering on the old, deep state.
    const s = game.s;
    if (opts.prestige && Prestige.canPrestige(s)) {
      // Reset when a reset would more than double the permanent power bonus.
      const gain = Prestige.pending(s, game.o);
      if (gain > Math.max(5, s.coresTotal * 0.6)) {
        const ns = Prestige.doPrestige(s, game.o);
        if (ns) {
          spendCores(ns);
          game.s = ns;
          game.refresh();
          prestiges++;
        }
      }
    }
  }
  rows.push(snapshot(game, hours * 3600));
  return { rows, game, prestiges };
}

/* Simple talent priority for the prestige sim. */
function spendCores(s) {
  const order = ['veteran', 'richVeins', 'momentum', 'goldTouch', 'deepStart',
                 'forgemaster', 'heirloom', 'coreAffinity', 'prospector', 'crewLegacy'];
  let guard = 0;
  let bought = true;
  while (bought && guard++ < 500) {
    bought = false;
    for (const id of order) {
      if (Prestige.buyTalent(s, id)) { bought = true; break; }
    }
  }
}

function buildReportTimes(hours) {
  const marks = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  const out = marks.filter(m => m <= hours * 3600);
  for (let h = 2; h <= hours; h *= 2) out.push(h * 3600);
  for (let h = 12; h <= hours; h += 12) out.push(h * 3600);
  return [...new Set(out)].sort((a, b) => a - b);
}

function snapshot(game, t) {
  const s = game.s, o = game.o;
  const st = G.stratumAt(s.frontier);
  return {
    t,
    depth: s.frontier,
    stratum: st.name,
    pick: G.PICKAXES[s.pickTier].name,
    pickTier: s.pickTier,
    gold: s.gold,
    lifetime: s.stats.lifetimeGold,
    dps: o.dps,
    hp: Stats.rockHP(Mining.workingDepth(s), Mining.stationStratum(s)),
    breaks: s.stats.totalBreaks,
    cores: s.coresTotal,
    prestiges: s.stats.prestiges,
    upgrades: Object.values(s.upgrades).reduce((a, b) => a + b, 0),
    blocked: s.frontier >= Stats.depthCap(s) - 1e-6
  };
}

/* ---------------------------------------------------------------------- */

const args = process.argv.slice(2);
const hours = parseFloat(args.find(a => !a.startsWith('--')) || '24');
const opts = { verbose: args.includes('--verbose'), prestige: args.includes('--prestige') };

const { rows, game, prestiges } = run(hours, opts);

if (process.env.MG_QUIET) {
  const last = rows[rows.length - 1];
  say(`hpGrowth=${G.BAL.hpGrowth} sharpRate=${G.UPGRADE_BY_ID.sharpness.rate} ` +
      `-> ${hours}h: depth ${num.fmt(last.depth)}m (${last.stratum}) pick ${last.pickTier}/19 ` +
      `lifetime ${num.fmt(last.lifetime)}g`);
  process.exit(0);
}

const pad = (v, n) => String(v).padStart(n);
say('');
say(`=== ${hours}h sim ${opts.prestige ? '(with prestige)' : '(single run)'} ===`);
say('  time    | depth      | stratum        | pickaxe          | gold/s(life) | DPS        | rockHP     | gate?');
say('  --------+------------+----------------+------------------+--------------+------------+------------+------');
let prev = null;
for (const r of rows) {
  const rate = prev ? (r.lifetime - prev.lifetime) / (r.t - prev.t) : 0;
  say('  ' +
    pad(num.fmtTime(r.t), 7) + ' | ' +
    pad(num.fmt(r.depth) + 'm', 10) + ' | ' +
    pad(r.stratum, 14) + ' | ' +
    pad(r.pick + ' (' + r.pickTier + ')', 16) + ' | ' +
    pad(num.fmt(rate) + '/s', 12) + ' | ' +
    pad(num.fmt(r.dps), 10) + ' | ' +
    pad(num.fmt(r.hp), 10) + ' | ' +
    (r.blocked ? ' WALL' : ''));
  prev = r;
}
const last = rows[rows.length - 1];
say('');
say(`  final: depth ${num.fmt(last.depth)}m · pick ${last.pick} · lifetime ${num.fmt(last.lifetime)}g · ` +
            `${num.fmt(last.breaks)} breaks · ${last.upgrades} upgrade levels · ${last.prestiges} prestiges · ${num.fmt(last.cores)} cores`);
if (opts.verbose) {
  say('  upgrades:', JSON.stringify(game.s.upgrades));
  say('  unlocks :', Object.keys(game.s.unlocks).join(', ') || '(none)');
  say('  talents :', JSON.stringify(game.s.talents));
  say('  inv     :', JSON.stringify(game.s.inv));
  say('  gathered:', JSON.stringify(game.s.stats.gathered));
  say('  nextPick:', JSON.stringify(Shop.nextPick(game.s)));
}
say('');
