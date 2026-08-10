/* Number formatting + small math helpers.
   Works in browser (globalThis.MG) and in node (tools/sim.js). */
(function (G) {
  'use strict';

  var SUFFIX = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
    'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
    'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg'
  ];

  /* 1234567 -> "1.23M". Keeps 3 significant-ish digits so the eye can read
     growth at a glance, which is most of what an idle game's HUD is for. */
  function fmt(n, decimals) {
    if (n === Infinity) return '∞';
    if (!isFinite(n) || n === null || n === undefined) return '0';
    var neg = n < 0;
    n = Math.abs(n);
    if (n < 1000) {
      var d = decimals !== undefined ? decimals : (n < 10 && n % 1 !== 0 ? 1 : 0);
      return (neg ? '-' : '') + trimZeros(n.toFixed(d));
    }
    var tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) {
      return (neg ? '-' : '') + n.toExponential(2).replace('e+', 'e');
    }
    var scaled = n / Math.pow(1000, tier);
    var dec = decimals !== undefined ? decimals
                                     : (scaled < 10 ? 2 : (scaled < 100 ? 1 : 0));
    return (neg ? '-' : '') + trimZeros(scaled.toFixed(dec)) + SUFFIX[tier];
  }

  function trimZeros(s) {
    if (s.indexOf('.') === -1) return s;
    return s.replace(/\.?0+$/, '');
  }

  /* Integer-ish display for counts (no suffix until 100k). */
  function fmtCount(n) {
    if (n < 100000) return Math.floor(n).toLocaleString('en-US');
    return fmt(n);
  }

  function fmtPct(x, dec) {
    return (x * 100).toFixed(dec === undefined ? 1 : dec) + '%';
  }

  /* Seconds -> "3ש 12ד" style compact duration (Hebrew units). */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '—';
    if (sec < 1) return 'מיד';
    if (sec < 60) return Math.ceil(sec) + 'ש׳';
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    if (m < 60) return m + 'ד ' + s + 'ש׳';
    var h = Math.floor(m / 60); m = m % 60;
    if (h < 24) return h + 'ש ' + m + 'ד';
    var d = Math.floor(h / 24); h = h % 24;
    if (d < 365) return d + 'י ' + h + 'ש';
    return Math.floor(d / 365) + 'שנ ' + (d % 365) + 'י';
  }

  function fmtDepth(m) {
    if (m < 1000) return Math.floor(m) + ' מ׳';
    return fmt(m) + ' מ׳';
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Sum of a geometric series: cost of buying `count` levels starting at `owned`.
     Lets the UI offer x10 / max buys without a loop. */
  function geoSum(base, rate, owned, count) {
    if (rate === 1) return base * count;
    return base * Math.pow(rate, owned) * (Math.pow(rate, count) - 1) / (rate - 1);
  }

  /* Inverse of geoSum: how many levels can `money` buy. */
  function geoMax(base, rate, owned, money) {
    if (money <= 0) return 0;
    if (rate === 1) return Math.floor(money / base);
    var v = money * (rate - 1) / (base * Math.pow(rate, owned)) + 1;
    if (v <= 0) return 0;
    return Math.max(0, Math.floor(Math.log(v) / Math.log(rate)));
  }

  G.num = {
    fmt: fmt, fmtCount: fmtCount, fmtPct: fmtPct, fmtTime: fmtTime, fmtDepth: fmtDepth,
    clamp: clamp, lerp: lerp, geoSum: geoSum, geoMax: geoMax
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
