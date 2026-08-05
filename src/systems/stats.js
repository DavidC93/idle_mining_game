/* Derived stats: folds upgrades, talents, achievements, unlocks and cores into
   one flat multiplier bundle.

   Convention: `mult` effects compound per level ((1+per)^level) while `add`
   effects are linear. Costs grow faster than either, so every upgrade line has
   built-in diminishing returns per gold spent without needing special cases. */
(function (G) {
  'use strict';

  var BAL = G.BAL;

  function blank() {
    return {
      power: 1, speed: 1, yield: 1, price: 1, orePrice: 1,
      depthFlat: 0,
      forge: 1, crew: 1, fuel: 1,
      luck: BAL.baseLuck, crit: BAL.baseCrit, critMult: BAL.baseCritMult,
      offline: BAL.offline.baseEfficiency, offlineCap: BAL.offline.baseCapSeconds,
      startDepth: 0, keepPick: 0, keepRes: 0, coreBonus: 1, startGoldLevels: 0
    };
  }

  function applyEffect(out, eff, level) {
    if (!eff) return;
    if (eff.multi) {
      for (var i = 0; i < eff.multi.length; i++) applyEffect(out, eff.multi[i], level);
      return;
    }
    if (eff.mult) out[eff.mult] *= Math.pow(1 + eff.per, level);
    else if (eff.add) out[eff.add] += eff.per * level;
    else if (eff.decay) out[eff.decay] *= Math.pow(1 - eff.per, level);
  }

  function compute(s) {
    var o = blank(), i, id, lvl;

    // --- repeatable gold upgrades
    for (i = 0; i < G.UPGRADES.length; i++) {
      var u = G.UPGRADES[i];
      lvl = s.upgrades[u.id] || 0;
      if (lvl > 0) applyEffect(o, u.effect, lvl);
    }

    // --- prestige talents
    for (i = 0; i < G.TALENTS.length; i++) {
      var t = G.TALENTS[i];
      lvl = s.talents[t.id] || 0;
      if (lvl > 0) applyEffect(o, t.effect, lvl);
    }

    // --- achievements (flat permanent bumps)
    for (i = 0; i < G.ACHIEVEMENTS.length; i++) {
      var a = G.ACHIEVEMENTS[i];
      if (!s.achievements[a.id] || !a.reward) continue;
      if (a.reward.mult) o[a.reward.mult] *= (1 + a.reward.v);
      else if (a.reward.add) o[a.reward.add] += a.reward.v;
    }

    // --- cores held: the "never a loss" prestige bonus
    o.power *= (1 + G.PRESTIGE.perCorePower * s.coresTotal);

    // --- one-shot unlocks
    if (s.unlocks.magmaTap) o.fuel *= 0.2;
    if (s.unlocks.refinery) o.forgeOutput = 2;

    o.forgeOutput = o.forgeOutput || 1;
    o.coreBonus = o.coreBonus;   // built from `add: coreBonus` starting at 1
    o.offlineCap = Math.min(o.offlineCap, BAL.offline.maxCapSeconds);
    o.crit = Math.min(o.crit, 0.95);
    /* Hard-capped well below 1: `luck` upgrades a drop to the next stratum's
       table, so at 90%+ the player effectively skips a whole tier of the loot
       economy and the layer they are standing in stops mattering. */
    o.luck = Math.min(o.luck, 0.60);
    o.keepRes = Math.min(o.keepRes, 0.8);

    // --- pickaxe
    var pick = G.PICKAXES[Math.min(s.pickTier, G.PICKAXES.length - 1)];
    o.pickPower = pick.power;
    o.hitPower = pick.power * o.power;
    o.swingRate = BAL.baseSwingRate * o.speed;
    o.dps = o.hitPower * o.swingRate;

    // Player-facing quantities, so the shop can quote the number the player
    // actually experiences rather than the internal multiplier behind it.
    o.yieldPerBreak = BAL.baseYield * o.yield;
    o.depthPerBreak = BAL.baseDepthPerBreak + o.depthFlat;

    return o;
  }

  /* Stats as they would be with `id` bumped by `levels`. Used to show players
     what the next purchase actually buys, in real units. compute() is pure, so
     bumping the level, computing and putting it back is safe. */
  function preview(s, kind, id, levels) {
    var bag = kind === 'talent' ? s.talents : s.upgrades;
    var before = bag[id] || 0;
    bag[id] = before + (levels || 1);
    var o;
    try { o = compute(s); } finally { bag[id] = before; }
    return o;
  }

  /* Which derived stat a definition moves, for definitions that do not name one
     explicitly. Lets the talent tree get the same readouts as the shop for free. */
  var READOUT_BY_STAT = {
    power:       { key: 'hitPower',      label: 'עוצמת מכה',        kind: 'num' },
    speed:       { key: 'swingRate',     label: 'הנפות בשנייה',     kind: 'num' },
    yield:       { key: 'yieldPerBreak', label: 'משאבים לכל שבירה', kind: 'num' },
    depthFlat:   { key: 'depthPerBreak', label: 'מטרים לכל שבירה',  kind: 'num' },
    price:       { key: 'price',         label: 'מחיר מכירה',       kind: 'mult' },
    orePrice:    { key: 'orePrice',      label: 'ערך עפרה גולמית',  kind: 'mult' },
    forge:       { key: 'forge',         label: 'מהירות היתוך',     kind: 'mult' },
    crew:        { key: 'crew',          label: 'תפוקת צוות',       kind: 'mult' },
    fuel:        { key: 'fuel',          label: 'צריכת דלק',        kind: 'mult', lower: true },
    luck:        { key: 'luck',          label: 'סיכוי לממצא נדיר', kind: 'pct' },
    crit:        { key: 'crit',          label: 'סיכוי קריטי',      kind: 'pct' },
    critMult:    { key: 'critMult',      label: 'מכפיל שלל קריטי',  kind: 'mult' },
    offline:     { key: 'offline',       label: 'יעילות לא־מקוונת', kind: 'pct' },
    offlineCap:  { key: 'offlineCap',    label: 'תקרת צבירה',       kind: 'time' },
    startDepth:  { key: 'startDepth',    label: 'עומק פתיחה',       kind: 'depth' },
    keepPick:    { key: 'keepPick',      label: 'דרגות מכוש נשמרות', kind: 'num' },
    keepRes:     { key: 'keepRes',       label: 'משאבים נשמרים',    kind: 'pct' },
    coreBonus:   { key: 'coreBonus',     label: 'ליבות בהתמוטטות',  kind: 'mult' }
  };

  function readoutFor(def) {
    if (def.readout) return def.readout;
    var eff = def.effect;
    if (!eff) return null;
    var first = eff.multi ? eff.multi[0] : eff;
    var stat = first.mult || first.add || first.decay;
    return READOUT_BY_STAT[stat] || null;
  }

  /* Rock HP at a depth inside a stratum. */
  function rockHP(depth, stratum) {
    return BAL.hpBase * Math.pow(BAL.hpGrowth, depth) * stratum.hardness;
  }

  /* Is `cond` satisfied? Shared by upgrades, unlocks and crew types. */
  function condMet(s, cond) {
    if (!cond) return true;
    if (cond.depth !== undefined && s.stats.maxDepthEver < cond.depth) return false;
    if (cond.unlocked && !s.unlocks[cond.unlocked]) return false;
    if (cond.upgrade && (s.upgrades[cond.upgrade[0]] || 0) < cond.upgrade[1]) return false;
    if (cond.resource && (s.stats.gathered[cond.resource[0]] || 0) < cond.resource[1]) return false;
    return true;
  }

  /* Highest stratum the player is allowed to stand in, given the pickaxe.

     Keyed off this run's frontier, not the lifetime record: after a cave-in you
     genuinely have to dig back down. `maxDepthEver` is a lifetime stat used by
     achievements and shop unlocks, which you keep. */
  function maxUnlockedStratum(s) {
    var last = 0;
    for (var i = 0; i < G.STRATA.length; i++) {
      if (s.pickTier >= G.STRATA[i].gate && s.frontier + 1e-6 >= G.STRATA[i].minDepth) last = i;
      else break;
    }
    return last;
  }

  /* Depth beyond which the player cannot dig until the next pickaxe is forged.
     Returning a hard wall (rather than just slower digging) is what turns the
     forge into a goal instead of an optimisation. */
  function depthCap(s) {
    for (var i = 0; i < G.STRATA.length; i++) {
      if (s.pickTier < G.STRATA[i].gate) return G.STRATA[i].minDepth;
    }
    return Infinity;
  }

  G.Stats = {
    compute: compute, preview: preview, readoutFor: readoutFor,
    rockHP: rockHP, condMet: condMet,
    maxUnlockedStratum: maxUnlockedStratum, depthCap: depthCap, blank: blank
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
