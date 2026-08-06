/* Resources and the strata that drop them.

   Value curve: each resource is worth ~2x the previous one, 33 raw resources
   spanning 1g .. 7.5B g. Smelted goods (recipes.js) sit ~3x above the value of
   their inputs, which is what makes the forge worth operating instead of
   dumping raw ore on the market.

   `fuel` marks a resource the forge can burn; the number is how many fuel
   units one unit provides. */
(function (G) {
  'use strict';

  var R = [
    // ---- stratum 0: topsoil -------------------------------------------------
    { id: 'dirt',       name: 'אדמה',            tier: 0, value: 1,      color: '#6b4b32', shape: 'clod' },
    { id: 'clay',       name: 'חימר',            tier: 0, value: 3,      color: '#9c6b4f', shape: 'clod' },
    { id: 'pebble',     name: 'חלוקי אבן',       tier: 0, value: 6,      color: '#8d8a83', shape: 'rock' },
    // ---- stratum 1: gravel --------------------------------------------------
    { id: 'gravel',     name: 'חצץ',             tier: 1, value: 14,     color: '#7e7a72', shape: 'rock' },
    { id: 'flint',      name: 'צור',             tier: 1, value: 30,     color: '#4a4a52', shape: 'shard' },
    { id: 'limestone',  name: 'אבן גיר',         tier: 1, value: 60,     color: '#cfc6ae', shape: 'rock' },
    // ---- stratum 2: sedimentary --------------------------------------------
    { id: 'stone',      name: 'אבן',             tier: 2, value: 120,    color: '#8a8a90', shape: 'rock' },
    { id: 'coal',       name: 'פחם',             tier: 2, value: 240,    color: '#2c2c33', shape: 'rock', fuel: 1 },
    { id: 'copperOre',  name: 'עפרת נחושת',      tier: 2, value: 480,    color: '#c87d3f', shape: 'ore' },
    // ---- stratum 3: igneous -------------------------------------------------
    { id: 'granite',    name: 'גרניט',           tier: 3, value: 950,    color: '#9b8f95', shape: 'rock' },
    { id: 'tinOre',     name: 'עפרת בדיל',       tier: 3, value: 1900,   color: '#b9c0c6', shape: 'ore' },
    { id: 'ironOre',    name: 'עפרת ברזל',       tier: 3, value: 3800,   color: '#a4614a', shape: 'ore' },
    // ---- stratum 4: deep rock -----------------------------------------------
    { id: 'quartz',     name: 'קוורץ',           tier: 4, value: 7500,   color: '#e8e6f2', shape: 'gem' },
    { id: 'silverOre',  name: 'עפרת כסף',        tier: 4, value: 15e3,   color: '#d5dde3', shape: 'ore' },
    { id: 'nickelOre',  name: 'עפרת ניקל',       tier: 4, value: 30e3,   color: '#9aa79b', shape: 'ore' },
    // ---- stratum 5: crystal caverns ----------------------------------------
    { id: 'amethyst',   name: 'אחלמה',           tier: 5, value: 60e3,   color: '#9b5ede', shape: 'gem' },
    { id: 'goldOre',    name: 'עפרת זהב',        tier: 5, value: 120e3,  color: '#f0c04a', shape: 'ore' },
    { id: 'emerald',    name: 'אזמרגד',          tier: 5, value: 240e3,  color: '#3fd67f', shape: 'gem' },
    // ---- stratum 6: magma shelf ---------------------------------------------
    { id: 'obsidian',   name: 'אובסידיאן',       tier: 6, value: 480e3,  color: '#241f2e', shape: 'shard', fuel: 4 },
    { id: 'ruby',       name: 'אודם',            tier: 6, value: 950e3,  color: '#e5395a', shape: 'gem' },
    { id: 'platinumOre',name: 'עפרת פלטינה',     tier: 6, value: 1.9e6,  color: '#dfe7ee', shape: 'ore' },
    // ---- stratum 7: abyssal strata ------------------------------------------
    { id: 'cobaltOre',  name: 'עפרת קובלט',      tier: 7, value: 3.8e6,  color: '#3f6fd6', shape: 'ore' },
    { id: 'diamond',    name: 'יהלום',           tier: 7, value: 7.5e6,  color: '#b8f4ff', shape: 'gem' },
    { id: 'mithrilOre', name: 'עפרת מית׳ריל',    tier: 7, value: 15e6,   color: '#7fe4d8', shape: 'ore' },
    // ---- stratum 8: void fissure --------------------------------------------
    { id: 'sapphire',   name: 'ספיר',            tier: 8, value: 30e6,   color: '#3a5ce0', shape: 'gem' },
    { id: 'titaniumOre',name: 'עפרת טיטניום',    tier: 8, value: 60e6,   color: '#b0b6d8', shape: 'ore' },
    { id: 'voidstone',  name: 'אבן־ריק',         tier: 8, value: 120e6,  color: '#1b1030', shape: 'shard', fuel: 20 },
    // ---- stratum 9: core mantle ---------------------------------------------
    { id: 'magmarite',  name: 'מגמריט',          tier: 9, value: 240e6,  color: '#ff7a29', shape: 'rock', fuel: 60 },
    { id: 'adamantiteOre', name: 'עפרת אדמנטיום',tier: 9, value: 480e6,  color: '#63d95a', shape: 'ore' },
    { id: 'starmetal',  name: 'מתכת־כוכב',       tier: 9, value: 950e6,  color: '#ffe9a8', shape: 'ore' },
    // ---- stratum 10: the bedrock heart --------------------------------------
    { id: 'aetheriumOre', name: 'עפרת אתריום',   tier: 10, value: 1.9e9, color: '#a8f0ff', shape: 'ore' },
    { id: 'primordialDust', name: 'אבק קדומים',  tier: 10, value: 3.8e9, color: '#ffd0f0', shape: 'clod', fuel: 400 },
    { id: 'singularityShard', name: 'רסיס סינגולריות', tier: 10, value: 7.5e9, color: '#ffffff', shape: 'gem' }
  ];

  /* ---------------------------------------------------------------------- */
  /* Strata. `gate` is the pickaxe tier required to break through the barrier
     at `minDepth`; that is the game's main craft-driven goal chain. `hardness`
     multiplies rock HP so each new layer is a real step up.                 */

  var STRATA = [
    {
      id: 'topsoil', name: 'אדמה עליונה', minDepth: 0, gate: 0, hardness: 1,
      sky: true,
      colors: { base: '#8a5f34', dark: '#61401f', light: '#a87a45', accent: '#42290f' },
      drops: [{ id: 'dirt', w: 60 }, { id: 'clay', w: 28 }, { id: 'pebble', w: 12 }]
    },
    {
      id: 'gravel', name: 'שכבת חצץ', minDepth: 60, gate: 1, hardness: 1.6,
      colors: { base: '#6f6a78', dark: '#4c4856', light: '#918ca0', accent: '#332f3c' },
      drops: [{ id: 'gravel', w: 55 }, { id: 'flint', w: 30 }, { id: 'limestone', w: 15 }]
    },
    {
      id: 'sediment', name: 'סלע משקע', minDepth: 200, gate: 2, hardness: 2.4,
      glow: '#5a8fc7',
      colors: { base: '#4f6478', dark: '#354657', light: '#6f8aa3', accent: '#243240' },
      drops: [{ id: 'stone', w: 50 }, { id: 'coal', w: 34 }, { id: 'copperOre', w: 16 }]
    },
    {
      id: 'igneous', name: 'סלע יסוד', minDepth: 500, gate: 3, hardness: 3.4,
      colors: { base: '#63465f', dark: '#452f43', light: '#83627e', accent: '#2e1e2d' },
      drops: [{ id: 'granite', w: 46 }, { id: 'tinOre', w: 32 }, { id: 'ironOre', w: 22 },
              { id: 'coal', w: 14 }, { id: 'copperOre', w: 12 }]
    },
    {
      id: 'deeprock', name: 'סלע עמוק', minDepth: 950, gate: 5, hardness: 4.6,
      glow: '#4d8ae0',
      colors: { base: '#38547a', dark: '#243a58', light: '#4e73a0', accent: '#182741' },
      drops: [{ id: 'quartz', w: 42 }, { id: 'silverOre', w: 30 }, { id: 'nickelOre', w: 20 },
              { id: 'ironOre', w: 16 }, { id: 'coal', w: 10 }]
    },
    {
      id: 'crystal', name: 'מערות גביש', minDepth: 1600, gate: 7, hardness: 6,
      glow: '#a06bff',
      colors: { base: '#4b3583', dark: '#32215d', light: '#6a4cb0', accent: '#22164a' },
      drops: [{ id: 'amethyst', w: 40 }, { id: 'goldOre', w: 28 }, { id: 'emerald', w: 18 },
              { id: 'quartz', w: 18 }, { id: 'silverOre', w: 14 }, { id: 'coal', w: 8 }]
    },
    {
      id: 'magma', name: 'מדף המגמה', minDepth: 2600, gate: 9, hardness: 8,
      glow: '#ff6a2a',
      colors: { base: '#6b2a22', dark: '#471712', light: '#95412f', accent: '#2c0d0a' },
      drops: [{ id: 'obsidian', w: 40 }, { id: 'ruby', w: 26 }, { id: 'platinumOre', w: 18 },
              { id: 'goldOre', w: 16 }]
    },
    {
      id: 'abyss', name: 'שכבות התהום', minDepth: 4000, gate: 11, hardness: 11,
      glow: '#31d6c0',
      colors: { base: '#1d4a55', dark: '#0f313a', light: '#2c6b78', accent: '#08222a' },
      drops: [{ id: 'cobaltOre', w: 38 }, { id: 'diamond', w: 26 }, { id: 'mithrilOre', w: 18 },
              { id: 'obsidian', w: 18 }]
    },
    {
      id: 'void', name: 'בקע הריק', minDepth: 6000, gate: 13, hardness: 15,
      glow: '#5b4cff',
      colors: { base: '#2a1d63', dark: '#180f42', light: '#3f2d90', accent: '#0e0830' },
      drops: [{ id: 'sapphire', w: 36 }, { id: 'titaniumOre', w: 26 }, { id: 'voidstone', w: 20 },
              { id: 'mithrilOre', w: 18 }]
    },
    {
      id: 'mantle', name: 'ליבת המעטפת', minDepth: 8500, gate: 15, hardness: 21,
      glow: '#ff9c2a',
      colors: { base: '#7a3212', dark: '#511c07', light: '#a8501f', accent: '#340f04' },
      drops: [{ id: 'magmarite', w: 36 }, { id: 'adamantiteOre', w: 26 }, { id: 'starmetal', w: 20 },
              { id: 'titaniumOre', w: 18 }]
    },
    {
      id: 'heart', name: 'לב סלע האם', minDepth: 12000, gate: 17, hardness: 30,
      glow: '#8ff0ff',
      colors: { base: '#0f4a63', dark: '#073246', light: '#186f90', accent: '#031f2e' },
      drops: [{ id: 'aetheriumOre', w: 38 }, { id: 'primordialDust', w: 26 },
              { id: 'singularityShard', w: 16 }, { id: 'starmetal', w: 20 }]
    }
  ];

  var byId = {};
  for (var i = 0; i < R.length; i++) { R[i].index = i; byId[R[i].id] = R[i]; }
  for (var s = 0; s < STRATA.length; s++) {
    STRATA[s].index = s;
    STRATA[s].maxDepth = (s + 1 < STRATA.length) ? STRATA[s + 1].minDepth : Infinity;
  }

  function res(id) { return byId[id]; }

  function stratumAt(depth) {
    for (var i = STRATA.length - 1; i >= 0; i--) {
      if (depth >= STRATA[i].minDepth) return STRATA[i];
    }
    return STRATA[0];
  }

  G.RESOURCES = R;
  G.RES_BY_ID = byId;
  G.STRATA = STRATA;
  G.res = res;
  G.stratumAt = stratumAt;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
