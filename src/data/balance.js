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
       gold diverges. Do not lower it without re-running tools/validate.js.

       Set against the power ceiling rather than by feel: the pickaxe ladder tops
       out at x57280 and the three power upgrades at x3.3e7 combined, so the
       deepest rock the game can ever contain must sit under that product. At
       1.0013 per metre, bedrock (16km, hardness 30) has 1.1e11 HP against a
       maximum hit of 1.9e12 — reachable only with both ladders near the top,
       which is exactly where the bottom of the mine should be. */
    hpGrowth: 1.0013,

    /* The bottom. Past the last stratum there is no new ore and no new value,
       so digging further was pure number inflation — and beyond ~250km
       hpGrowth^depth overflows to Infinity and the whole HP brake silently
       stops existing. Reaching bedrock is the run's finish line; going further
       is what prestige is for. */
    bedrock: 16000,

    /* Swings per second before speed multipliers. Deliberately unhurried: the
       opening should read as a person working, not a drill. One swing a second
       against a 3.5 HP rock is a find every three or four seconds, and the
       speed upgrade adds 1% a level from there. */
    baseSwingRate: 1.0,
    /* Animation stops speeding up past this; extra speed becomes damage so the
       scene never turns into a strobe. */
    maxVisualSwingRate: 6,

    baseDepthPerBreak: 1,
    /* Overkill damage chains into the next rock, up to this many per swing.
       Kept small on purpose: it is the one place where raw power turns into
       raw income, so an unbounded value makes over-levelled players print gold. */
    chainCap: 12,
    baseYield: 1,          // units per drop roll
    dropRolls: 1,          // number of loot rolls per break
    baseCrit: 0.0,
    baseCritMult: 4,       // crits instantly shatter and multiply loot by this
    baseLuck: 0.02,
    /* What `luck` does. Most of it biases the rarity roll inside the layer you
       are standing in; only a small slice of it reaches into the next layer.
       It used to be entirely the latter, at up to 60%, which meant a lucky
       player skipped a whole tier of the loot economy and every "rare" find
       arrived far too early to feel rare. */
    luckRarityBoost: { uncommon: 2.0, rare: 5.0 },
    crossLayerShare: 0.12,

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
    /* Flooding the market with one resource depresses its price, and it
       recovers over a couple of minutes. Strong enough that dumping a huge
       stack of one ore is visibly worse than selling a spread of goods. */
    market: { minPrice: 0.22, recoverPerSec: 0.006, impactPerSale: 0.00055 },

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
