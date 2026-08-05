/* Forge recipes: raw ore -> ingots and alloys.

   Every ingot is worth roughly 3x the market value of the ore burned to make
   it, so "smelt then sell" always beats "sell raw" — that gap is the reason
   the forge exists. Alloys stack on top of ingots, giving mid-game players a
   second-order production chain to optimise. */
(function (G) {
  'use strict';

  /* Smelted goods are resources too — appended to the resource table so they
     share inventory, market and UI code with raw ore. */
  var GOODS = [
    { id: 'copperIngot',   name: 'מטיל נחושת',    tier: 2,  value: 3.6e3,  color: '#e08b45', shape: 'ingot' },
    { id: 'bronzeIngot',   name: 'מטיל ארד',      tier: 3,  value: 1.1e4,  color: '#c08a3e', shape: 'ingot' },
    { id: 'ironIngot',     name: 'מטיל ברזל',     tier: 3,  value: 3.6e4,  color: '#b7b2ad', shape: 'ingot' },
    { id: 'steelIngot',    name: 'מטיל פלדה',     tier: 4,  value: 2.2e5,  color: '#8f97a3', shape: 'ingot' },
    { id: 'silverIngot',   name: 'מטיל כסף',      tier: 4,  value: 1.4e5,  color: '#e3ecf2', shape: 'ingot' },
    { id: 'goldIngot',     name: 'מטיל זהב',      tier: 5,  value: 1.1e6,  color: '#ffcf4d', shape: 'ingot' },
    { id: 'electrumIngot', name: 'מטיל אלקטרום',  tier: 5,  value: 4.5e6,  color: '#ffe89a', shape: 'ingot' },
    { id: 'platinumIngot', name: 'מטיל פלטינה',   tier: 6,  value: 1.7e7,  color: '#f2f7fb', shape: 'ingot' },
    { id: 'cobaltIngot',   name: 'מטיל קובלט',    tier: 7,  value: 4.6e7,  color: '#5a86ea', shape: 'ingot' },
    { id: 'mithrilIngot',  name: 'מטיל מית׳ריל',  tier: 7,  value: 1.6e8,  color: '#96f2e6', shape: 'ingot' },
    { id: 'titaniumIngot', name: 'מטיל טיטניום',  tier: 8,  value: 6.5e8,  color: '#c6cbe8', shape: 'ingot' },
    { id: 'voidAlloy',     name: 'סגסוגת ריק',    tier: 8,  value: 2.6e9,  color: '#6a5cff', shape: 'ingot' },
    { id: 'adamantIngot',  name: 'מטיל אדמנטיום', tier: 9,  value: 9e9,    color: '#7dfa72', shape: 'ingot' },
    { id: 'starforged',    name: 'סגסוגת כוכבים', tier: 9,  value: 3.4e10, color: '#fff2c4', shape: 'ingot' },
    { id: 'aetheriumIngot',name: 'מטיל אתריום',   tier: 10, value: 4.5e10, color: '#c4f7ff', shape: 'ingot' },
    { id: 'primordialAlloy', name: 'סגסוגת קדומים', tier: 10, value: 5e11, color: '#ffc2f2', shape: 'ingot' }
  ];

  /* time = base seconds per craft at forge speed 1.
     fuel = fuel units consumed (coal is 1 unit each; deeper fuels are worth more). */
  var RECIPES = [
    { id: 'copperIngot',   out: { id: 'copperIngot', n: 1 },   time: 3,
      inputs: [{ id: 'copperOre', n: 2 }], fuel: 2, unlockTier: 2 },
    { id: 'bronzeIngot',   out: { id: 'bronzeIngot', n: 1 },   time: 5,
      inputs: [{ id: 'copperOre', n: 2 }, { id: 'tinOre', n: 1 }], fuel: 3, unlockTier: 3 },
    { id: 'ironIngot',     out: { id: 'ironIngot', n: 1 },     time: 6,
      inputs: [{ id: 'ironOre', n: 3 }], fuel: 4, unlockTier: 3 },
    { id: 'steelIngot',    out: { id: 'steelIngot', n: 1 },    time: 10,
      inputs: [{ id: 'ironIngot', n: 3 }], fuel: 8, unlockTier: 4 },
    { id: 'silverIngot',   out: { id: 'silverIngot', n: 1 },   time: 8,
      inputs: [{ id: 'silverOre', n: 3 }], fuel: 5, unlockTier: 4 },
    { id: 'goldIngot',     out: { id: 'goldIngot', n: 1 },     time: 12,
      inputs: [{ id: 'goldOre', n: 3 }], fuel: 8, unlockTier: 5 },
    { id: 'electrumIngot', out: { id: 'electrumIngot', n: 1 }, time: 18,
      inputs: [{ id: 'goldIngot', n: 2 }, { id: 'silverIngot', n: 3 }], fuel: 14, unlockTier: 5 },
    { id: 'platinumIngot', out: { id: 'platinumIngot', n: 1 }, time: 16,
      inputs: [{ id: 'platinumOre', n: 3 }, { id: 'obsidian', n: 4 }], fuel: 12, unlockTier: 6 },
    { id: 'cobaltIngot',   out: { id: 'cobaltIngot', n: 1 },   time: 20,
      inputs: [{ id: 'cobaltOre', n: 3 }, { id: 'obsidian', n: 2 }], fuel: 18, unlockTier: 7 },
    { id: 'mithrilIngot',  out: { id: 'mithrilIngot', n: 1 },  time: 26,
      inputs: [{ id: 'mithrilOre', n: 3 }, { id: 'diamond', n: 1 }], fuel: 25, unlockTier: 7 },
    { id: 'titaniumIngot', out: { id: 'titaniumIngot', n: 1 }, time: 32,
      inputs: [{ id: 'titaniumOre', n: 3 }, { id: 'voidstone', n: 2 }], fuel: 35, unlockTier: 8 },
    { id: 'voidAlloy',     out: { id: 'voidAlloy', n: 1 },     time: 45,
      inputs: [{ id: 'voidstone', n: 3 }, { id: 'titaniumIngot', n: 2 }, { id: 'sapphire', n: 2 }],
      fuel: 60, unlockTier: 8 },
    { id: 'adamantIngot',  out: { id: 'adamantIngot', n: 1 },  time: 55,
      inputs: [{ id: 'adamantiteOre', n: 3 }, { id: 'magmarite', n: 2 }], fuel: 90, unlockTier: 9 },
    { id: 'starforged',    out: { id: 'starforged', n: 1 },    time: 75,
      inputs: [{ id: 'starmetal', n: 3 }, { id: 'adamantIngot', n: 2 }], fuel: 140, unlockTier: 9 },
    { id: 'aetheriumIngot',out: { id: 'aetheriumIngot', n: 1 },time: 95,
      inputs: [{ id: 'aetheriumOre', n: 3 }, { id: 'singularityShard', n: 1 }], fuel: 220, unlockTier: 10 },
    { id: 'primordialAlloy', out: { id: 'primordialAlloy', n: 1 }, time: 130,
      inputs: [{ id: 'primordialDust', n: 4 }, { id: 'aetheriumIngot', n: 2 },
               { id: 'singularityShard', n: 1 }], fuel: 350, unlockTier: 10 }
  ];

  /* ---------------------------------------------------------------------- */
  /* Pickaxes. Power roughly x2.9 per tier; each one is a concrete "next goal"
     that also unlocks the depth gate of a stratum.                          */

  var PICKAXES = [
    { tier: 0,  id: 'wood',      name: 'מכוש עץ',           power: 1,      cost: null },
    { tier: 1,  id: 'stone',     name: 'מכוש אבן',          power: 3,
      cost: { gold: 60, mats: [{ id: 'pebble', n: 20 }, { id: 'clay', n: 25 }] } },
    { tier: 2,  id: 'flint',     name: 'מכוש צור',          power: 9,
      cost: { gold: 480, mats: [{ id: 'flint', n: 40 }, { id: 'limestone', n: 25 }] } },
    { tier: 3,  id: 'copper',    name: 'מכוש נחושת',        power: 26,
      cost: { gold: 5310, mats: [{ id: 'copperIngot', n: 12 }] } },
    { tier: 4,  id: 'bronze',    name: 'מכוש ארד',          power: 76,
      cost: { gold: 7.49e+04, mats: [{ id: 'bronzeIngot', n: 20 }, { id: 'granite', n: 60 }] } },
    { tier: 5,  id: 'iron',      name: 'מכוש ברזל',         power: 220,
      cost: { gold: 1.29e+06, mats: [{ id: 'ironIngot', n: 25 }] } },
    { tier: 6,  id: 'steel',     name: 'מכוש פלדה',         power: 640,
      cost: { gold: 2.6e+07, mats: [{ id: 'steelIngot', n: 30 }, { id: 'ironIngot', n: 40 }] } },
    { tier: 7,  id: 'silver',    name: 'מכוש כסף',          power: 1.9e3,
      cost: { gold: 6.07e+08, mats: [{ id: 'silverIngot', n: 40 }, { id: 'steelIngot', n: 25 }] } },
    { tier: 8,  id: 'gold',      name: 'מכוש זהב',          power: 5.5e3,
      cost: { gold: 1.6e+10, mats: [{ id: 'goldIngot', n: 35 }, { id: 'amethyst', n: 30 }] } },
    { tier: 9,  id: 'electrum',  name: 'מכוש אלקטרום',      power: 16e3,
      cost: { gold: 4.7e+11, mats: [{ id: 'electrumIngot', n: 25 }, { id: 'emerald', n: 25 }] } },
    { tier: 10, id: 'obsidian',  name: 'מכוש אובסידיאן',    power: 47e3,
      cost: { gold: 1.53e+13, mats: [{ id: 'obsidian', n: 80 }, { id: 'platinumIngot', n: 20 }] } },
    { tier: 11, id: 'platinum',  name: 'מכוש פלטינה',       power: 140e3,
      cost: { gold: 5.43e+14, mats: [{ id: 'platinumIngot', n: 45 }, { id: 'ruby', n: 30 }] } },
    { tier: 12, id: 'cobalt',    name: 'מכוש קובלט',        power: 400e3,
      cost: { gold: 2.09e+16, mats: [{ id: 'cobaltIngot', n: 40 }, { id: 'diamond', n: 25 }] } },
    { tier: 13, id: 'mithril',   name: 'מכוש מית׳ריל',      power: 1.2e6,
      cost: { gold: 8.72e+17, mats: [{ id: 'mithrilIngot', n: 45 }, { id: 'cobaltIngot', n: 30 }] } },
    { tier: 14, id: 'titanium',  name: 'מכוש טיטניום',      power: 3.4e6,
      cost: { gold: 3.9e+19, mats: [{ id: 'titaniumIngot', n: 45 }, { id: 'sapphire', n: 35 }] } },
    { tier: 15, id: 'void',      name: 'מכוש הריק',         power: 10e6,
      cost: { gold: 1.86e+21, mats: [{ id: 'voidAlloy', n: 40 }, { id: 'titaniumIngot', n: 40 }] } },
    { tier: 16, id: 'adamant',   name: 'מכוש אדמנטיום',     power: 29e6,
      cost: { gold: 9.46e+22, mats: [{ id: 'adamantIngot', n: 45 }, { id: 'magmarite', n: 70 }] } },
    { tier: 17, id: 'starforged',name: 'מכוש מחושל־כוכבים', power: 84e6,
      cost: { gold: 5.1e+24, mats: [{ id: 'starforged', n: 40 }, { id: 'magmarite', n: 60 }] } },
    { tier: 18, id: 'aetherium', name: 'מכוש אתריום',       power: 240e6,
      cost: { gold: 2.9e+26, mats: [{ id: 'aetheriumIngot', n: 40 }, { id: 'primordialDust', n: 60 }] } },
    { tier: 19, id: 'primordial',name: 'מכוש הקדומים',      power: 700e6,
      cost: { gold: 1.74e+28, mats: [{ id: 'primordialAlloy', n: 35 },
                                   { id: 'singularityShard', n: 40 }] } }
  ];

  var recipeById = {};
  for (var i = 0; i < RECIPES.length; i++) recipeById[RECIPES[i].id] = RECIPES[i];

  G.GOODS = GOODS;
  G.RECIPES = RECIPES;
  G.RECIPE_BY_ID = recipeById;
  G.PICKAXES = PICKAXES;

  /* Fold smelted goods into the shared resource table. */
  G.registerGoods = function () {
    for (var i = 0; i < GOODS.length; i++) {
      GOODS[i].crafted = true;
      GOODS[i].index = G.RESOURCES.length;
      G.RESOURCES.push(GOODS[i]);
      G.RES_BY_ID[GOODS[i].id] = GOODS[i];
    }
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
