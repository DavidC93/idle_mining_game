/* Prestige: collapse the mine, keep the cores.

   The player's "should I reset?" question is answered on screen with a
   pending-cores number and a "+X% power" preview, because the worst thing a
   prestige system can do is make the decision feel like homework. */
(function (G) {
  'use strict';

  var State = G.State, num = G.num, BAL = G.BAL;

  /* Payout is based on what THIS run achieved, and it is netted against the
     head start the talent tree handed you.

     Two bugs live here if you are not careful. Reading the lifetime depth
     record means a fresh run qualifies the instant it starts. Not subtracting
     the `deepStart` head start means a maxed talent tree drops you in above the
     prestige threshold, so collapsing the mine immediately pays out again —
     both turn the reset button into an infinite core printer. */
  function runStartDepth(s) { return s.runStartDepth || 0; }

  function pending(s, o) {
    var gross = G.coresFor(s.frontier, s.stats.runGold, o.coreBonus);
    var alreadyGiven = G.coresFor(runStartDepth(s), 0, o.coreBonus);
    return Math.max(0, gross - alreadyGiven);
  }

  function canPrestige(s) {
    return s.frontier >= Math.max(G.PRESTIGE.minDepth, runStartDepth(s) + 300);
  }

  /* What the next run starts with, given the talent tree. */
  function startingGold(o) {
    var lv = Math.floor(o.startGoldLevels);
    if (lv <= 0) return 0;
    return Math.ceil(BAL.startGoldBase * (Math.pow(BAL.startGoldRate, lv) - 1) / (BAL.startGoldRate - 1));
  }

  function startingDepth(s, o) {
    // Never start deeper than the pickaxe you keep can legally reach.
    var b = G.nextBarrier(keptPickTier(s, o));
    return b ? Math.min(o.startDepth, b.depth) : o.startDepth;
  }

  function keptPickTier(s, o) {
    return num.clamp(Math.floor(o.keepPick), 0, s.pickTier);
  }

  function doPrestige(s, o) {
    if (!canPrestige(s)) return null;
    var gain = pending(s, o);

    var carry = {
      cores: s.cores + gain,
      coresTotal: s.coresTotal + gain,
      talents: s.talents,
      achievements: s.achievements,
      stats: s.stats,
      settings: s.settings,
      startedAt: s.startedAt,
      unlocks: s.unlocks,
      autoSell: s.autoSell,
      // A lock is a standing preference like auto-sell, not run progress.
      locked: s.locked
    };

    // Talent-preserved inventory, computed before the wipe.
    var keptInv = {};
    if (o.keepRes > 0) {
      for (var id in s.inv) {
        if (!s.inv.hasOwnProperty(id)) continue;
        var n = Math.floor(s.inv[id] * o.keepRes);
        if (n > 0) keptInv[id] = n;
      }
    }

    var ns = State.newState(carry);
    ns.stats.prestiges++;
    ns.stats.runGold = 0;
    ns.stats.runTime = 0;
    ns.inv = keptInv;

    // Re-derive with the new state so kept-pickaxe/start-depth read the
    // post-reset numbers rather than the ones we just threw away.
    ns.pickTier = keptPickTier(s, o);
    var no = G.Stats.compute(ns);
    ns.gold = startingGold(no);
    ns.frontier = startingDepth(ns, no);
    // The lifetime record survives the collapse: achievements and shop unlocks
    // hang off it, and losing those on every reset would be a punishment
    // rather than a loop.
    ns.stats.maxDepthEver = Math.max(s.stats.maxDepthEver, s.frontier);
    ns.runStartDepth = ns.frontier;
    ns.station = G.Stats.maxUnlockedStratum(ns);
    ns.depth = ns.frontier;
    ns.lastTick = Date.now();

    G.bus.emit('prestige', { s: ns, gain: gain });
    return ns;
  }

  /* ---- talents ----------------------------------------------------------- */

  function talentLevel(s, id) { return s.talents[id] || 0; }

  function buyTalent(s, id) {
    var t = G.TALENT_BY_ID[id];
    if (!t) return false;
    var lvl = talentLevel(s, id);
    if (t.max !== undefined && lvl >= t.max) return false;
    var cost = G.talentCost(t, lvl);
    if (s.cores < cost) return false;
    s.cores -= cost;
    s.talents[id] = lvl + 1;
    G.bus.emit('buy', { s: s, kind: 'talent', id: id, cost: cost });
    return true;
  }

  /* Refund the whole tree so players can experiment. Costs nothing: the fun of
     a talent tree is trying builds, and hoarding regret is not a mechanic. */
  function respec(s) {
    var refund = 0;
    for (var id in s.talents) {
      if (!s.talents.hasOwnProperty(id)) continue;
      var t = G.TALENT_BY_ID[id];
      if (!t) continue;
      for (var lvl = 0; lvl < s.talents[id]; lvl++) refund += G.talentCost(t, lvl);
    }
    s.talents = {};
    s.cores += refund;
    return refund;
  }

  G.Prestige = {
    pending: pending, canPrestige: canPrestige, doPrestige: doPrestige,
    talentLevel: talentLevel, buyTalent: buyTalent, respec: respec,
    startingGold: startingGold, keptPickTier: keptPickTier
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
