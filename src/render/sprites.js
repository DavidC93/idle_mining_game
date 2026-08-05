/* Procedural resource sprites.

   Every resource gets a drawn icon rather than a coloured square. Shapes come
   from the `shape` field in the data (clod / rock / shard / ore / gem / ingot)
   and the exact silhouette is seeded from the resource id, so gravel and stone
   share a family look but are never the same rock twice.

   Drawn once into an offscreen canvas and cached: the inventory grid can show
   forty of these and the mine scene draws them inside particles, so they have
   to be free after the first frame. */
(function (G) {
  'use strict';

  var cache = {};      // "id@size" -> canvas
  var urlCache = {};   // "id@size" -> data URL

  /* ---- colour helpers ---------------------------------------------------- */

  function rgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function css(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function lighten(hex, t) {
    var c = rgb(hex);
    return css([c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]);
  }
  function darken(hex, t) {
    var c = rgb(hex);
    return css([c[0] * (1 - t), c[1] * (1 - t), c[2] * (1 - t)]);
  }

  /* Deterministic per-resource randomness: the same ore always looks the same. */
  function seeded(id) {
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return function () {
      h ^= h << 13; h >>>= 0;
      h ^= h >> 17;
      h ^= h << 5; h >>>= 0;
      return h / 4294967295;
    };
  }

  /* An irregular closed blob, `n` vertices, radius jittered by `wobble`. */
  function blobPath(ctx, n, r, wobble, rnd, round) {
    var pts = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = r * (1 - wobble + rnd() * wobble * 2);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.88]);
    }
    ctx.beginPath();
    if (round) {
      ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
      for (i = 0; i < n; i++) {
        var cur = pts[i], nxt = pts[(i + 1) % n];
        ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2);
      }
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
    return pts;
  }

  /* ---- shape renderers ---------------------------------------------------
     Each draws into a box of side `S` centred on the origin.                */

  var SHAPES = {

    /* Loose earth: soft lumpy mass with grit on top. */
    clod: function (ctx, S, color, rnd) {
      var r = S * 0.40;
      blobPath(ctx, 9, r, 0.16, rnd, true);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = lighten(color, 0.22);
      ctx.beginPath();
      ctx.ellipse(-r * 0.22, -r * 0.30, r * 0.62, r * 0.38, -0.4, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = darken(color, 0.34);
      for (var i = 0; i < 9; i++) {
        var a = rnd() * 6.283, d = rnd() * r * 0.85;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.85, S * (0.018 + rnd() * 0.022), 0, 6.283);
        ctx.fill();
      }
    },

    /* Hard stone: angular chunk with a lit facet and a shadowed one. */
    rock: function (ctx, S, color, rnd) {
      var r = S * 0.40;
      blobPath(ctx, 7, r, 0.20, rnd, false);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = darken(color, 0.45);
      ctx.lineWidth = S * 0.035;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      // lit facet, upper left
      ctx.fillStyle = lighten(color, 0.28);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.2); ctx.lineTo(-r * 0.15, -r); ctx.lineTo(r * 0.32, -r * 0.28);
      ctx.lineTo(-r * 0.35, r * 0.18);
      ctx.closePath(); ctx.fill();
      // shadowed facet, lower right
      ctx.fillStyle = darken(color, 0.3);
      ctx.beginPath();
      ctx.moveTo(r, r * 0.1); ctx.lineTo(r * 0.1, r); ctx.lineTo(-r * 0.4, r * 0.5);
      ctx.lineTo(r * 0.45, -r * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    /* Brittle glassy splinter: flint, obsidian, voidstone. */
    shard: function (ctx, S, color, rnd) {
      var r = S * 0.44;
      var tilt = -0.35 + rnd() * 0.7;
      ctx.save();
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.42, -r * 0.05);
      ctx.lineTo(r * 0.16, r);
      ctx.lineTo(-r * 0.34, r * 0.35);
      ctx.lineTo(-r * 0.40, -r * 0.34);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = darken(color, 0.5);
      ctx.lineWidth = S * 0.03;
      ctx.stroke();
      // cleavage plane catching the light
      ctx.fillStyle = lighten(color, 0.45);
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.16, -r * 0.1);
      ctx.lineTo(-r * 0.02, r * 0.55); ctx.lineTo(-r * 0.20, -r * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    /* Ore is rock with metal in it — a grey host stone carrying coloured
       nuggets. Drawing it as a solid block of colour would make copper ore and
       a copper ingot look identical, which is exactly the distinction the
       forge is built on. */
    ore: function (ctx, S, color, rnd) {
      var r = S * 0.40;
      var host = '#6e7078';
      blobPath(ctx, 8, r, 0.18, rnd, false);
      ctx.fillStyle = host;
      ctx.fill();
      ctx.strokeStyle = darken(host, 0.45);
      ctx.lineWidth = S * 0.035;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = lighten(host, 0.20);
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.3); ctx.lineTo(-r * 0.1, -r); ctx.lineTo(r * 0.3, -r * 0.4);
      ctx.lineTo(-r * 0.5, r * 0.1); ctx.closePath(); ctx.fill();

      // metal inclusions
      var n = 4 + Math.floor(rnd() * 3);
      for (var i = 0; i < n; i++) {
        var a = rnd() * 6.283, d = rnd() * r * 0.62;
        var x = Math.cos(a) * d, y = Math.sin(a) * d * 0.85;
        var rad = S * (0.05 + rnd() * 0.055);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, rad, rad * 0.78, rnd() * 3.14, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = lighten(color, 0.5);
        ctx.beginPath();
        ctx.arc(x - rad * 0.28, y - rad * 0.3, rad * 0.3, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    },

    /* Cut stone: symmetric, faceted, with a glint. */
    gem: function (ctx, S, color, rnd) {
      var r = S * 0.40;
      var top = -r, waist = -r * 0.22, bot = r * 0.92;
      var hw = r * 0.68;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(hw, waist);
      ctx.lineTo(hw * 0.55, bot);
      ctx.lineTo(-hw * 0.55, bot);
      ctx.lineTo(-hw, waist);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = darken(color, 0.42);
      ctx.lineWidth = S * 0.03;
      ctx.stroke();

      // crown table
      ctx.fillStyle = lighten(color, 0.42);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(hw, waist); ctx.lineTo(0, waist * 0.2); ctx.lineTo(-hw, waist);
      ctx.closePath(); ctx.fill();
      // pavilion shadow
      ctx.fillStyle = darken(color, 0.26);
      ctx.beginPath();
      ctx.moveTo(0, waist * 0.2); ctx.lineTo(hw, waist); ctx.lineTo(hw * 0.55, bot);
      ctx.closePath(); ctx.fill();
      // facet lines
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = S * 0.018;
      ctx.beginPath();
      ctx.moveTo(-hw, waist); ctx.lineTo(hw, waist);
      ctx.moveTo(0, waist * 0.2); ctx.lineTo(0, bot);
      ctx.stroke();
      // glint
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.arc(-hw * 0.38, waist * 0.55, S * 0.035, 0, 6.283);
      ctx.fill();
    },

    /* Refined metal: a trapezoid bar seen slightly from above. */
    ingot: function (ctx, S, color) {
      var w = S * 0.40, h = S * 0.15, d = S * 0.13;
      ctx.save();
      ctx.translate(0, S * 0.06);
      // front face
      ctx.beginPath();
      ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.lineTo(w * 0.82, h * 1.6); ctx.lineTo(-w * 0.82, h * 1.6);
      ctx.closePath();
      ctx.fillStyle = darken(color, 0.24);
      ctx.fill();
      // top face
      ctx.beginPath();
      ctx.moveTo(-w, 0); ctx.lineTo(w, 0);
      ctx.lineTo(w * 0.74, -d * 1.5); ctx.lineTo(-w * 0.74, -d * 1.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // top highlight
      ctx.beginPath();
      ctx.moveTo(-w * 0.72, -d * 0.35); ctx.lineTo(w * 0.2, -d * 0.35);
      ctx.lineTo(w * 0.1, -d * 1.1); ctx.lineTo(-w * 0.62, -d * 1.1);
      ctx.closePath();
      ctx.fillStyle = lighten(color, 0.45);
      ctx.fill();
      // outline
      ctx.strokeStyle = darken(color, 0.5);
      ctx.lineWidth = S * 0.028;
      ctx.beginPath();
      ctx.moveTo(-w, 0); ctx.lineTo(-w * 0.74, -d * 1.5); ctx.lineTo(w * 0.74, -d * 1.5);
      ctx.lineTo(w, 0); ctx.lineTo(w * 0.82, h * 1.6); ctx.lineTo(-w * 0.82, h * 1.6);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  };

  /* ---- public API --------------------------------------------------------- */

  function drawInto(ctx, resId, S) {
    var r = G.res(resId);
    if (!r) return;
    var shape = SHAPES[r.shape] || SHAPES.rock;
    var rnd = seeded(resId);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    // soft contact shadow so icons sit on the panel instead of floating
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(0, S * 0.36, S * 0.30, S * 0.06, 0, 0, 6.283);
    ctx.fill();
    ctx.save();
    shape(ctx, S, r.color, rnd);
    ctx.restore();
    ctx.restore();
  }

  /* Cached offscreen canvas, rendered at 2x for crisp edges when scaled. */
  function canvasFor(resId, size) {
    var key = resId + '@' + size;
    if (cache[key]) return cache[key];
    var scale = 2;
    var c = document.createElement('canvas');
    c.width = size * scale;
    c.height = size * scale;
    var ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    drawInto(ctx, resId, size);
    cache[key] = c;
    return c;
  }

  function urlFor(resId, size) {
    var key = resId + '@' + size;
    if (urlCache[key]) return urlCache[key];
    urlCache[key] = canvasFor(resId, size).toDataURL();
    return urlCache[key];
  }

  /* Blit a cached sprite centred on (x, y) in an arbitrary context. */
  function blit(ctx, resId, x, y, size) {
    var c = canvasFor(resId, size);
    ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
  }

  G.Sprites = { canvas: canvasFor, url: urlFor, blit: blit, drawInto: drawInto, SHAPES: SHAPES };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
