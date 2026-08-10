/* Resources and the strata that drop them.

   Values are not hand-written. Every resource declares which stratum it belongs
   to and how rare it is, and its price falls out of a formula:

       value = base * stratumStep^stratum * rarityMultiplier

   Two reasons. First, hand-tuned prices drift out of step with the drop tables
   and nothing catches it. Second, the two curves that decide how fast a player
   gets rich — how much deeper ore is worth, and how much rarer ore is worth —
   become single numbers you can reason about instead of 49 numbers you cannot. */
(function (G) {
  'use strict';

  /* --- the two curves that set the whole economy ------------------------- */

  var VALUE = {
    base: 2,
    /* Worth per stratum. This was 8x, which meant the last layer paid a
       billion times the first and the late game printed money. */
    stratumStep: 3.6,
    rarity: { common: 1, uncommon: 2.6, rare: 7 }
  };

  /* Drop weights by rarity. `carry` is the previous stratum's common still
     turning up here, which keeps layers feeling connected rather than swapping
     wholesale.

     `rare` is not a constant. A flat 5% everywhere sounds principled and plays
     badly, because the very first pickaxe is built from the surface layer's
     rare drop — so the game opened with a twenty-minute wait for twenty pebbles
     before anything at all could be upgraded. Rarity should tighten as you go
     down, not greet you at the door: about 20% at the surface, easing to about
     5% at the core, where a rare find is supposed to stop you in your tracks.

     Expressed as a share of all rolls rather than as a weight, because the
     carry-over entries differ from layer to layer and a fixed weight quietly
     made rares *more* common in some deep layers than the one above. */
  var WEIGHT = { common: 100, uncommon: 30, carry: 18 };
  var RARE_SHARE_TOP = 0.20, RARE_SHARE_DECAY = 0.86;

  function rareShare(stratum) {
    return RARE_SHARE_TOP * Math.pow(RARE_SHARE_DECAY, stratum);
  }

  function priceOf(stratum, rarity) {
    var v = VALUE.base * Math.pow(VALUE.stratumStep, stratum) * VALUE.rarity[rarity];
    // Round to 3 significant figures so the UI shows tidy numbers.
    if (v < 1000) return Math.max(1, Math.round(v));
    var mag = Math.pow(10, Math.floor(Math.log10(v)) - 2);
    return Math.round(v / mag) * mag;
  }

  /* --- resources ---------------------------------------------------------
     s = stratum, r = rarity. Progression materials (the ores recipes need) are
     common or uncommon; the rare slot in each layer is the luxury find, so a
     bad rarity roll never blocks the pickaxe chain.                         */

  var R = [
    { id: 'dirt',      name: 'אדמה',       s: 0, r: 'common',   color: '#8a6440', shape: 'clod' },
    { id: 'clay',      name: 'חימר',       s: 0, r: 'uncommon', color: '#b87d5c', shape: 'clod' },
    { id: 'pebble',    name: 'חלוקי אבן',  s: 0, r: 'rare',     color: '#a9a59c', shape: 'rock' },

    { id: 'gravel',    name: 'חצץ',        s: 1, r: 'common',   color: '#8e8a80', shape: 'rock' },
    { id: 'flint',     name: 'צור',        s: 1, r: 'uncommon', color: '#5a5a68', shape: 'shard' },
    { id: 'limestone', name: 'אבן גיר',    s: 1, r: 'rare',     color: '#e0d6bc', shape: 'rock' },

    { id: 'coal',      name: 'פחם',        s: 2, r: 'common',   color: '#37373f', shape: 'rock', fuel: 1 },
    { id: 'copperOre', name: 'עפרת נחושת', s: 2, r: 'uncommon', color: '#e08a42', shape: 'ore' },
    { id: 'stone',     name: 'אבן',        s: 2, r: 'rare',     color: '#9a9aa2', shape: 'rock' },

    { id: 'granite',   name: 'גרניט',      s: 3, r: 'common',   color: '#ab9ea6', shape: 'rock' },
    { id: 'tinOre',    name: 'עפרת בדיל',  s: 3, r: 'uncommon', color: '#c6ced6', shape: 'ore' },
    { id: 'ironOre',   name: 'עפרת ברזל',  s: 3, r: 'rare',     color: '#b56a50', shape: 'ore' },

    { id: 'quartz',    name: 'קוורץ',      s: 4, r: 'common',   color: '#eeecf8', shape: 'gem' },
    { id: 'silverOre', name: 'עפרת כסף',   s: 4, r: 'uncommon', color: '#dde5eb', shape: 'ore' },
    { id: 'nickelOre', name: 'עפרת ניקל',  s: 4, r: 'rare',     color: '#a6b3a7', shape: 'ore' },

    { id: 'amethyst',  name: 'אחלמה',      s: 5, r: 'common',   color: '#a96bef', shape: 'gem' },
    { id: 'goldOre',   name: 'עפרת זהב',   s: 5, r: 'uncommon', color: '#ffcd52', shape: 'ore' },
    { id: 'emerald',   name: 'אזמרגד',     s: 5, r: 'rare',     color: '#4ae68d', shape: 'gem' },

    { id: 'obsidian',  name: 'אובסידיאן',  s: 6, r: 'common',   color: '#2c2638', shape: 'shard', fuel: 4 },
    { id: 'platinumOre', name: 'עפרת פלטינה', s: 6, r: 'uncommon', color: '#e8eff6', shape: 'ore' },
    { id: 'ruby',      name: 'אודם',       s: 6, r: 'rare',     color: '#f2456a', shape: 'gem' },

    { id: 'cobaltOre', name: 'עפרת קובלט', s: 7, r: 'common',   color: '#4a7ce0', shape: 'ore' },
    { id: 'mithrilOre',name: 'עפרת מית׳ריל', s: 7, r: 'uncommon', color: '#8bf0e3', shape: 'ore' },
    { id: 'diamond',   name: 'יהלום',      s: 7, r: 'rare',     color: '#c6f8ff', shape: 'gem' },

    { id: 'voidstone', name: 'אבן־ריק',    s: 8, r: 'common',   color: '#241640', shape: 'shard', fuel: 20 },
    { id: 'titaniumOre', name: 'עפרת טיטניום', s: 8, r: 'uncommon', color: '#bcc2e4', shape: 'ore' },
    { id: 'sapphire',  name: 'ספיר',       s: 8, r: 'rare',     color: '#4568ee', shape: 'gem' },

    { id: 'magmarite', name: 'מגמריט',     s: 9, r: 'common',   color: '#ff8636', shape: 'rock', fuel: 60 },
    { id: 'adamantiteOre', name: 'עפרת אדמנטיום', s: 9, r: 'uncommon', color: '#6fe565', shape: 'ore' },
    { id: 'starmetal', name: 'מתכת־כוכב',  s: 9, r: 'rare',     color: '#fff0b4', shape: 'ore' },

    { id: 'primordialDust', name: 'אבק קדומים', s: 10, r: 'common', color: '#ffd8f4', shape: 'clod', fuel: 400 },
    { id: 'aetheriumOre', name: 'עפרת אתריום', s: 10, r: 'uncommon', color: '#b4f4ff', shape: 'ore' },
    { id: 'singularityShard', name: 'רסיס סינגולריות', s: 10, r: 'rare', color: '#ffffff', shape: 'gem' }
  ];

  for (var i = 0; i < R.length; i++) {
    R[i].tier = R[i].s;
    R[i].value = priceOf(R[i].s, R[i].r);
  }

  /* --- strata -------------------------------------------------------------
     `gate` is the pickaxe tier needed to break the barrier at `minDepth`;
     `hardness` multiplies rock HP. Drop tables list the layer's own three
     resources plus a carry-over, and take their weights from the rarity of the
     resource itself — so a layer's rare item is rare everywhere, always.     */

  var STRATA = [
    /* NB: 'gravel' is both a resource id and a stratum id, so these two blocks
       get written by hand — a pattern keyed on the id alone finds the resource
       first and repaints the wrong layer. */
    { id: 'topsoil',  name: 'אדמה עליונה', minDepth: 0,     gate: 0,  hardness: 1,   sky: true,
      colors: { base: '#b87a3c', dark: '#8a5423', light: '#dda45c', accent: '#5c3410' } },
    { id: 'gravel',   name: 'שכבת חצץ',    minDepth: 60,    gate: 1,  hardness: 1.6,
      colors: { base: '#8b86a8', dark: '#635e83', light: '#b3aed0', accent: '#443f60' } },
    { id: 'sediment', name: 'סלע משקע',    minDepth: 200,   gate: 2,  hardness: 2.4, glow: '#5a8fc7',
      colors: { base: '#4f7fb5', dark: '#33578a', light: '#77a8dc', accent: '#223d63' } },
    { id: 'igneous',  name: 'סלע יסוד',    minDepth: 500,   gate: 3,  hardness: 3.4,
      colors: { base: '#8a4f8e', dark: '#5f3163', light: '#b174b5', accent: '#3f1f42' } },
    { id: 'deeprock', name: 'סלע עמוק',    minDepth: 950,   gate: 5,  hardness: 4.6, glow: '#4d8ae0',
      colors: { base: '#3a6cc0', dark: '#244894', light: '#5a95e8', accent: '#16306b' } },
    { id: 'crystal',  name: 'מערות גביש',  minDepth: 1600,  gate: 7,  hardness: 6,   glow: '#a06bff',
      colors: { base: '#6a45c8', dark: '#48298f', light: '#9370f0', accent: '#2f1a68' } },
    { id: 'magma',    name: 'מדף המגמה',   minDepth: 2600,  gate: 9,  hardness: 8,   glow: '#ff6a2a',
      colors: { base: '#b2411f', dark: '#7d2510', light: '#e0703a', accent: '#521404' } },
    { id: 'abyss',    name: 'שכבות התהום', minDepth: 4000,  gate: 11, hardness: 11,  glow: '#31d6c0',
      colors: { base: '#178a86', dark: '#0c5f5f', light: '#2fc0b4', accent: '#054040' } },
    { id: 'void',     name: 'בקע הריק',    minDepth: 6000,  gate: 13, hardness: 15,  glow: '#5b4cff',
      colors: { base: '#4331a8', dark: '#2c1d78', light: '#6a52e0', accent: '#1a0f52' } },
    { id: 'mantle',   name: 'ליבת המעטפת', minDepth: 8500,  gate: 15, hardness: 21,  glow: '#ff9c2a',
      colors: { base: '#c25718', dark: '#8d360a', light: '#ee8433', accent: '#5c2004' } },
    { id: 'heart',    name: 'לב סלע האם',  minDepth: 12000, gate: 17, hardness: 30,  glow: '#8ff0ff',
      colors: { base: '#1274a0', dark: '#08506f', light: '#2ba3d4', accent: '#03354c' } }
  ];

  /* Ore from an earlier layer that a recipe in this layer still consumes.
     Fuel is here too: past the coal layer the forge would otherwise stall with
     no in-game way to work out why. */
  var CARRY_OVER = {
    igneous:  ['coal', 'copperOre'],   // bronze ingot
    deeprock: ['coal', 'ironOre'],     // steel ingot
    crystal:  ['coal', 'silverOre']    // electrum ingot
  };

  var byId = {};
  for (i = 0; i < R.length; i++) { R[i].index = i; byId[R[i].id] = R[i]; }

  /* Build each stratum's drop table from the resources assigned to it. */
  for (var s = 0; s < STRATA.length; s++) {
    var st = STRATA[s];
    st.index = s;
    st.maxDepth = (s + 1 < STRATA.length) ? STRATA[s + 1].minDepth : Infinity;
    st.drops = [];
    var rareRes = null;
    for (i = 0; i < R.length; i++) {
      if (R[i].s !== s) continue;
      // held back: its weight depends on the total of everything else
      if (R[i].r === 'rare') { rareRes = R[i]; continue; }
      st.drops.push({ id: R[i].id, rarity: R[i].r, w: WEIGHT[R[i].r] });
    }
    // the previous layer's staple, still showing up
    if (s > 0) {
      for (i = 0; i < R.length; i++) {
        if (R[i].s === s - 1 && R[i].r === 'common') {
          st.drops.push({ id: R[i].id, rarity: 'carry', w: WEIGHT.carry });
        }
      }
    }
    // Progression carry-overs: ore an upcoming recipe still needs, at a low
    // weight. Without these the pickaxe chain silently requires walking back up
    // the shaft — tools/validate.js fails the build if any of them go missing.
    var extra = CARRY_OVER[st.id];
    if (extra) {
      for (i = 0; i < extra.length; i++) {
        st.drops.push({ id: extra[i], rarity: 'carry', w: 14 });
      }
    }

    /* Fold duplicates together. A resource can arrive here twice — once as the
       previous layer's staple and again as a progression carry-over — and two
       rows for the same ore is both a wrong-looking drop table on screen and a
       weight that reads differently than the sum it actually is. */
    var merged = [], seen = {};
    for (i = 0; i < st.drops.length; i++) {
      var dr = st.drops[i];
      if (seen[dr.id] === undefined) { seen[dr.id] = merged.length; merged.push(dr); }
      else merged[seen[dr.id]].w += dr.w;
    }

    /* Now the rare find, sized so it lands on exactly the share this depth is
       meant to have: share = w / (w + rest)  ⇒  w = rest·share/(1 − share). */
    if (rareRes) {
      var rest = 0;
      for (i = 0; i < merged.length; i++) rest += merged[i].w;
      var share = rareShare(s);
      merged.push({ id: rareRes.id, rarity: 'rare', w: rest * share / (1 - share) });
    }
    st.drops = merged;
  }

  function res(id) { return byId[id]; }

  function stratumAt(depth) {
    for (var k = STRATA.length - 1; k >= 0; k--) {
      if (depth >= STRATA[k].minDepth) return STRATA[k];
    }
    return STRATA[0];
  }

  G.VALUE_CURVE = VALUE;
  G.DROP_WEIGHT = WEIGHT;
  G.priceOf = priceOf;
  G.RESOURCES = R;
  G.RES_BY_ID = byId;
  G.STRATA = STRATA;
  G.res = res;
  G.stratumAt = stratumAt;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
