/* Deterministic-ish RNG helpers. The game uses Math.random for feel, but the
   weighted pickers live here so drop logic stays in one place. */
(function (G) {
  'use strict';

  function pickWeighted(entries, rnd) {
    var total = 0, i;
    for (i = 0; i < entries.length; i++) total += entries[i].w;
    var r = (rnd || Math.random)() * total;
    for (i = 0; i < entries.length; i++) {
      r -= entries[i].w;
      if (r <= 0) return entries[i];
    }
    return entries[entries.length - 1];
  }

  /* Expected-value-preserving integer roll: 3.4 -> 3 (60%) or 4 (40%).
     Used everywhere quantities are fractional so multipliers never round to 0. */
  function roll(x, rnd) {
    var f = Math.floor(x);
    return f + (((rnd || Math.random)() < x - f) ? 1 : 0);
  }

  function range(lo, hi, rnd) { return lo + (rnd || Math.random)() * (hi - lo); }

  function chance(p, rnd) { return (rnd || Math.random)() < p; }

  /* Cheap value-noise for the canvas rock texture — stable per coordinate. */
  function hash2(x, y) {
    var h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  G.rng = { pickWeighted: pickWeighted, roll: roll, range: range, chance: chance, hash2: hash2 };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
