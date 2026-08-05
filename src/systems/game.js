/* Orchestrator: owns the state object and drives every system once per tick.
   Deliberately free of DOM/canvas references so tools/sim.js can run it headless. */
(function (G) {
  'use strict';

  var BAL = G.BAL;

  var Game = {
    s: null,
    o: null,
    statsAge: 0,
    goldRateWindow: [],
    lastGold: 0,

    init: function (state) {
      G.registerGoods();
      this.s = state || G.State.newState();
      if (!this.s.rock) G.Mining.spawnRock(this.s);
      this.refresh();
      return this.s;
    },

    /* Recompute derived stats. Called on any purchase and a few times a second
       otherwise — cheap, but not free, so we do not do it every frame. */
    refresh: function () {
      this.o = G.Stats.compute(this.s);
      return this.o;
    },

    tick: function (dt) {
      var s = this.s;
      if (!s) return;
      if (dt > 5) dt = 5;                 // tab-throttle guard; offline handles the rest

      s.stats.playTime += dt;
      s.stats.runTime += dt;

      this.statsAge += dt;
      if (this.statsAge > 0.25) { this.refresh(); this.statsAge = 0; }
      var o = this.o;

      G.Mining.tick(s, dt, o);
      G.Forge.tick(s, dt, o);
      G.Forge.depotTick(s, o);
      G.Market.tick(s, dt);
      G.Market.autoSellTick(s, o);
      G.Contracts.tick(s, dt, o);
      G.Achievements.check(s);

      s.lastTick = Date.now();
    },

    /* Gold per second, smoothed over a few seconds so the HUD does not flicker. */
    sampleGoldRate: function (dt) {
      var s = this.s;
      var delta = s.stats.lifetimeGold - this.lastGold;
      this.lastGold = s.stats.lifetimeGold;
      this.goldRateWindow.push({ d: delta, t: dt });
      var totalT = 0, totalD = 0;
      for (var i = this.goldRateWindow.length - 1; i >= 0; i--) {
        totalT += this.goldRateWindow[i].t;
        totalD += this.goldRateWindow[i].d;
        if (totalT > 4) { this.goldRateWindow.splice(0, i); break; }
      }
      return totalT > 0 ? totalD / totalT : 0;
    },

    /* Breaks per second the player is currently sustaining, for the HUD. */
    breakRate: function () {
      var o = this.o, s = this.s;
      var st = G.Mining.stationStratum(s);
      var hp = G.Stats.rockHP(G.Mining.workingDepth(s), st);
      var perSwing = Math.min(40, o.hitPower / hp);
      var active = o.swingRate * Math.max(perSwing, o.hitPower / hp);
      return Math.min(o.swingRate * 40, active) + G.Mining.crewBreaksPerSec(s, o);
    }
  };

  G.Game = Game;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
