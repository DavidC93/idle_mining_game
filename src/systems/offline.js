/* Offline progress.

   Rather than inventing a separate formula (which always ends up disagreeing
   with the live game), we replay the real systems in coarse steps over an
   efficiency-scaled window. What you get while away is therefore, by
   construction, a fraction of what you would have got while watching. */
(function (G) {
  'use strict';

  var num = G.num;
  var MAX_STEPS = 360;

  function elapsedSeconds(s) {
    return Math.max(0, (Date.now() - (s.lastTick || Date.now())) / 1000);
  }

  function run(s) {
    var raw = elapsedSeconds(s);
    if (raw < 30) { s.lastTick = Date.now(); return null; }

    var o = G.Stats.compute(s);
    var capped = Math.min(raw, o.offlineCap);
    var effective = capped * num.clamp(o.offline, 0, 1.5);

    var before = {
      gold: s.gold,
      depth: s.frontier,
      inv: shallowCopy(s.inv),
      smelted: s.stats.totalSmelted,
      breaks: s.stats.totalBreaks
    };

    var steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(effective / 10)));
    var dt = effective / steps;
    for (var i = 0; i < steps; i++) {
      G.Mining.tick(s, dt, o);
      // Stats change as depth grows; refresh occasionally rather than never.
      if (i % 60 === 59) o = G.Stats.compute(s);
    }

    G.Forge.catchUp(s, effective, o);
    G.Market.autoSellTick(s, o);
    G.Achievements.check(s);
    s.lastTick = Date.now();

    var gained = {};
    for (var id in s.inv) {
      if (!s.inv.hasOwnProperty(id)) continue;
      var d = s.inv[id] - (before.inv[id] || 0);
      if (d > 0) gained[id] = d;
    }

    return {
      awaySeconds: raw,
      creditedSeconds: capped,
      efficiency: o.offline,
      capped: raw > o.offlineCap,
      gold: s.gold - before.gold,
      depth: s.frontier - before.depth,
      breaks: s.stats.totalBreaks - before.breaks,
      smelted: s.stats.totalSmelted - before.smelted,
      gained: gained
    };
  }

  function shallowCopy(o) {
    var c = {};
    for (var k in o) if (o.hasOwnProperty(k)) c[k] = o[k];
    return c;
  }

  G.Offline = { run: run, elapsedSeconds: elapsedSeconds };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
