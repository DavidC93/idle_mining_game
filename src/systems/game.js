/* Orchestrator: owns the state object and drives every system once per tick.
   Deliberately free of DOM/canvas references so tools/sim.js can run it headless. */
(function (G) {
  'use strict';

  var BAL = G.BAL;

  var Game = {
    s: null,
    o: null,
    statsAge: 0,
    goldRate: 0,
    lastGold: 0,

    init: function (state) {
      G.registerGoods();
      this.s = state || G.State.newState();
      // Rebase the rate estimator, or loading a save reads the whole lifetime
      // total as one frame's income.
      this.lastGold = this.s.stats.lifetimeGold;
      this.goldRate = 0;
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

    /* Gold per second for the HUD.

       Income is lumpy — a sale lands the whole stack in one frame and then
       nothing happens for half a minute. A short averaging window therefore
       spent most of its life reading exactly 0 and snapping to a big number
       whenever a sale fell inside it, which is both useless as information and
       visually jumpy.

       An exponential moving average fixes both. Its expected value is still the
       true average gold per second, but it decays smoothly between lumps
       instead of falling off a cliff, and the weight is proportional to dt so
       the reading does not depend on frame rate. */
    goldRateTau: 12,        // seconds; how long one sale keeps showing

    sampleGoldRate: function (dt) {
      var s = this.s;
      var delta = s.stats.lifetimeGold - this.lastGold;
      this.lastGold = s.stats.lifetimeGold;
      if (!(dt > 0)) return this.goldRate || 0;

      var k = 1 - Math.exp(-dt / this.goldRateTau);
      this.goldRate = (this.goldRate || 0) + (delta / dt - (this.goldRate || 0)) * k;
      // Park tiny residue at zero so the HUD shows "0" rather than "0.0001".
      if (this.goldRate < 1e-3) this.goldRate = 0;
      return this.goldRate;
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
