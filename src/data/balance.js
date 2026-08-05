/* Central tuning constants. Everything the balance simulator (tools/sim.js)
   wants to poke at lives here rather than being scattered through the systems. */
(function (G) {
  'use strict';

  G.BAL = {
    /* Rock HP = hpBase * hpGrowth^depth * stratum.hardness.
       hpGrowth is the single most sensitive number in the game: it sets how
       fast the wall rises against the player's exponential upgrade curve. */
    hpBase: 3.5,
    /* Rock hardness per metre. This is the brake on the whole economy: depth
       multiplies income (deeper ore is worth more) and depth is bought with
       power, so if HP does not climb fast enough the two feed each other and
       gold diverges. Do not lower it without re-running tools/validate.js. */
    hpGrowth: 1.010,

    /* Swings per second before speed multipliers. Fast enough that the very
       first minute already produces visible drops. */
    baseSwingRate: 1.6,
    /* Animation stops speeding up past this; extra speed becomes damage so the
       scene never turns into a strobe. */
    maxVisualSwingRate: 6,

    baseDepthPerBreak: 1,
    /* Overkill damage chains into the next rock, up to this many per swing.
       Kept small on purpose: it is the one place where raw power turns into
       raw income, so an unbounded value makes over-levelled players print gold. */
    chainCap: 12,
    baseYield: 2,          // units per drop roll
    dropRolls: 1,          // number of loot rolls per break
    baseCrit: 0.0,
    baseCritMult: 4,       // crits instantly shatter and multiply loot by this
    baseLuck: 0.02,        // chance a roll upgrades to the next stratum's table

    /* Special nodes. Weights are relative to `normal`. */
    nodes: {
      normal:     { w: 100, hp: 1,  loot: 1,   color: null },
      rich:       { w: 5.5, hp: 1.8, loot: 4,  name: 'עורק עשיר',  color: '#ffd257' },
      geode:      { w: 3.0, hp: 2.4, loot: 3,  name: 'גאודה',      color: '#8ff0ff', gemBias: true },
      treasure:   { w: 1.8, hp: 2.0, loot: 1,  name: 'תיבת אוצר',  color: '#ffb03a', goldBurst: 45 },
      motherlode: { w: 0.5, hp: 6.0, loot: 14, name: 'מרבץ ענק',   color: '#ff5edb' }
    },

    /* Market. Selling a lot of one thing depresses its price and it recovers
       over time — gives the market screen an actual decision in it. */
    market: { minPrice: 0.35, recoverPerSec: 0.02, impactPerSale: 0.00004 },

    forge: { baseSpeed: 1 },

    offline: {
      baseEfficiency: 0.45,   // fraction of online rate credited while away
      baseCapSeconds: 4 * 3600,
      maxCapSeconds: 48 * 3600
    },

    /* Starting gold per level of the `inheritance` talent. */
    startGoldBase: 500,
    startGoldRate: 4.2,

    tickHz: 20                // logic ticks per second
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
