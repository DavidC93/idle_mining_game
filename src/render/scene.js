/* The 2D mine: a vertical cross-section of the earth with a miner at the
   bottom of the shaft.

   Everything is procedural — no image assets — so strata colours, rock texture,
   lamps and support beams all derive from the data in resources.js. The camera
   follows the working depth, which means "going deeper" is something you watch
   happen rather than a number that changes. */
(function (G) {
  'use strict';

  var num = G.num, rng = G.rng;

  var PX_PER_M = 3.2;        // world scale
  var CELL = 21;             // rock texture cell size
  var SHAFT_W = 0.34;        // shaft width as a fraction of canvas width

  function Scene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this.camY = 0;           // world metres at the top of the viewport
    this.camTarget = 0;
    this.swingPhase = 0;
    this.impactFlash = 0;
    this.rockShake = 0;
    this.time = 0;
    this.parts = new G.Particles();
    this.lastBreakAt = 0;
    this.hitFace = 0;        // 0..1 wobble on the rock face
    this.resize();
  }

  Scene.prototype.resize = function () {
    var c = this.canvas;
    var rect = c.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(200, Math.floor(rect.width));
    this.h = Math.max(160, Math.floor(rect.height));
    c.width = Math.floor(this.w * this.dpr);
    c.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  /* ---- helpers ---------------------------------------------------------- */

  function mix(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return 'rgb(' + Math.round(ar + (br - ar) * t) + ',' +
                    Math.round(ag + (bg - ag) * t) + ',' +
                    Math.round(ab + (bb - ab) * t) + ')';
  }

  /* Resource colours are chosen to look right embedded in rock, which means
     several of them (coal, obsidian, voidstone, dirt) are nearly black. Used
     as-is for a floating label on a dark cave wall they are unreadable, so
     labels get pushed up to a minimum luminance first. */
  function readable(hex) {
    if (hex[0] !== '#' || hex.length < 7) return hex;
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    var MIN = 0.62;
    if (lum >= MIN) return hex;
    var t = lum < 0.02 ? 1 : Math.min(1, (MIN - lum) / (1 - lum));
    return 'rgb(' + Math.round(r + (255 - r) * t) + ',' +
                    Math.round(g + (255 - g) * t) + ',' +
                    Math.round(b + (255 - b) * t) + ')';
  }

  Scene.prototype.worldToScreen = function (m) { return (m - this.camY) * PX_PER_M; };

  /* The miner sits low in the viewport: the shaft above him is empty space, the
     rock below him is the thing worth looking at, and pushing him down keeps
     the ratio in favour of the geology. */
  Scene.prototype.minerScreenY = function () { return this.h * 0.70; };

  /* ---- main draw -------------------------------------------------------- */

  Scene.prototype.render = function (game, dt) {
    var s = game.s, o = game.o;
    if (!s) return;
    this.time += dt;

    var depth = G.Mining.workingDepth(s);
    this.camTarget = depth - this.minerScreenY() / PX_PER_M;
    // Critically-damped-ish follow: snappy but never jittery.
    this.camY += (this.camTarget - this.camY) * Math.min(1, dt * 5.5);

    var ctx = this.ctx;
    ctx.save();

    var shake = this.parts.shake;
    if (shake > 0.05) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    this.drawStrata(s);
    this.drawShaft(s);
    this.drawCrew(s, o);
    this.drawFace(s, o);
    this.drawMiner(s, o, dt);

    this.flushDrops(dt);
    this.parts.update(dt);
    this.parts.draw(ctx);

    ctx.restore();

    this.drawVignette();
    this.drawRuler(s);
    this.drawFlash();
    this.emitAmbient(s, dt);
  };

  /* ---- strata + rock texture -------------------------------------------- */

  Scene.prototype.drawStrata = function (s) {
    var ctx = this.ctx, h = this.h, w = this.w;
    var topM = this.camY;
    var botM = this.camY + h / PX_PER_M;

    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, w, h);

    // Sky, only while the surface is still on screen.
    if (topM < 30) {
      var horizon = this.worldToScreen(0);
      var sky = ctx.createLinearGradient(0, Math.min(0, horizon - 400), 0, horizon);
      sky.addColorStop(0, '#1b2a44');
      sky.addColorStop(0.55, '#3d4a63');
      sky.addColorStop(1, '#6b6b62');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, Math.max(0, horizon));
      this.drawSurface(horizon);
    }

    // Rock, cell by cell, coloured by whichever stratum the cell sits in.
    var startCell = Math.floor((Math.max(0, this.worldToScreen(0))) / CELL) - 1;
    var cols = Math.ceil(w / CELL) + 1;
    var rows = Math.ceil(h / CELL) + 2;

    for (var ry = startCell; ry < rows; ry++) {
      var py = ry * CELL;
      if (py + CELL < 0) continue;
      var metres = this.camY + py / PX_PER_M;
      if (metres < 0) continue;
      var st = G.stratumAt(metres);
      var nextSt = st.index + 1 < G.STRATA.length ? G.STRATA[st.index + 1] : null;

      // Blend the last few metres into the next stratum so bands do not snap.
      var t = 0;
      if (nextSt) {
        var span = 26;
        var d = nextSt.minDepth - metres;
        if (d < span) t = num.clamp(1 - d / span, 0, 1);
      }

      for (var cx = 0; cx < cols; cx++) {
        var px = cx * CELL;
        var n = rng.hash2(cx, ry);
        var base = n < 0.34 ? st.colors.dark : (n < 0.74 ? st.colors.base : st.colors.light);
        if (nextSt && t > 0) {
          var nbase = n < 0.34 ? nextSt.colors.dark : (n < 0.74 ? nextSt.colors.base : nextSt.colors.light);
          base = mix(base, nbase, t);
        }
        ctx.fillStyle = base;
        ctx.fillRect(px, py, CELL + 1, CELL + 1);

        // Sprinkle of darker speckles for grain.
        var n2 = rng.hash2(cx + 977, ry + 311);
        if (n2 > 0.82) {
          ctx.fillStyle = st.colors.accent;
          var sx = px + (rng.hash2(cx, ry + 7) * (CELL - 6)) + 3;
          var sy = py + (rng.hash2(cx + 13, ry) * (CELL - 6)) + 3;
          ctx.fillRect(sx, sy, 3, 3);
        }
        // Occasional embedded ore fleck, coloured from the stratum's table.
        var n3 = rng.hash2(cx + 5501, ry + 8803);
        if (n3 > 0.965) {
          var drop = st.drops[Math.floor(rng.hash2(cx + 31, ry + 61) * st.drops.length) % st.drops.length];
          ctx.fillStyle = G.res(drop.id).color;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.arc(px + CELL * 0.5, py + CELL * 0.5, 2.6, 0, 6.283);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Stratum boundary line + label.
      if (nextSt && metres < nextSt.minDepth && this.camY + (py + CELL) / PX_PER_M >= nextSt.minDepth) {
        var ly = this.worldToScreen(nextSt.minDepth);
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.34)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(nextSt.name + ' · ' + num.fmtDepth(nextSt.minDepth), w - 46, ly - 6);
      }
    }

    // Coloured glow for strata that are meant to feel hot or magical.
    var here = G.stratumAt(Math.max(0, this.camY + h * 0.5 / PX_PER_M));
    if (here.glow) {
      var g = ctx.createRadialGradient(w * 0.5, h * 0.7, 10, w * 0.5, h * 0.7, h * 0.85);
      g.addColorStop(0, here.glow + '22');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };

  Scene.prototype.drawSurface = function (horizon) {
    var ctx = this.ctx, w = this.w;
    // grass lip
    ctx.fillStyle = '#4a6b34';
    ctx.fillRect(0, horizon - 7, w, 8);
    ctx.fillStyle = '#5c8340';
    for (var x = 0; x < w; x += 7) {
      var hgt = 3 + rng.hash2(x, 3) * 5;
      ctx.fillRect(x, horizon - 7 - hgt, 3, hgt);
    }
    // a little headframe over the shaft
    var cx = w * 0.5;
    ctx.strokeStyle = '#3a2d21';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 44, horizon - 6); ctx.lineTo(cx - 16, horizon - 62);
    ctx.moveTo(cx + 44, horizon - 6); ctx.lineTo(cx + 16, horizon - 62);
    ctx.moveTo(cx - 20, horizon - 62); ctx.lineTo(cx + 20, horizon - 62);
    ctx.stroke();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath(); ctx.arc(cx, horizon - 66, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#6b5540'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, horizon - 66, 9, 0, 6.283); ctx.stroke();
  };

  /* ---- the shaft, beams and lamps ---------------------------------------- */

  Scene.prototype.shaftBounds = function () {
    var sw = this.w * SHAFT_W;
    var x0 = (this.w - sw) / 2;
    return { x0: x0, x1: x0 + sw, w: sw };
  };

  Scene.prototype.drawShaft = function (s) {
    var ctx = this.ctx, h = this.h;
    var b = this.shaftBounds();
    var floorY = this.minerScreenY() + 16;

    // Hollow the shaft out down to the working face.
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x0, 0, b.w, Math.max(0, floorY));
    ctx.clip();

    var grad = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
    grad.addColorStop(0, '#05070a');
    grad.addColorStop(0.5, '#0b0f16');
    grad.addColorStop(1, '#05070a');
    ctx.fillStyle = grad;
    ctx.fillRect(b.x0, 0, b.w, Math.max(0, floorY));

    // Rough hewn walls: the shaft was cut, not poured. Without these the
    // tunnel is a flat black rectangle taking up most of the screen.
    ctx.fillStyle = 'rgba(255,255,255,.028)';
    var wallStep = 17;
    var wallStart = -((this.camY * PX_PER_M) % wallStep);
    for (var wy = wallStart; wy < floorY; wy += wallStep) {
      if (wy < -wallStep) continue;
      var jitL = rng.hash2(1, Math.floor((this.camY * PX_PER_M + wy) / wallStep)) * 7;
      var jitR = rng.hash2(2, Math.floor((this.camY * PX_PER_M + wy) / wallStep)) * 7;
      ctx.fillRect(b.x0, wy, 4 + jitL, wallStep - 2);
      ctx.fillRect(b.x1 - 4 - jitR, wy, 4 + jitR, wallStep - 2);
    }

    // Power cable strung down one wall.
    ctx.strokeStyle = 'rgba(40,32,26,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var cableX = b.x1 - 9;
    ctx.moveTo(cableX, 0);
    for (var cy = 0; cy < floorY; cy += 26) {
      ctx.quadraticCurveTo(cableX + 5, cy + 13, cableX, cy + 26);
    }
    ctx.stroke();

    // Ladder down the left wall.
    ctx.strokeStyle = 'rgba(120,92,60,.55)';
    ctx.lineWidth = 2;
    var lx = b.x0 + 16;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, floorY);
    ctx.moveTo(lx + 12, 0); ctx.lineTo(lx + 12, floorY);
    ctx.stroke();
    var rungStart = Math.floor(this.camY * PX_PER_M / 14) * 14 - this.camY * PX_PER_M;
    for (var ry = rungStart; ry < floorY; ry += 14) {
      if (ry < -14) continue;
      ctx.beginPath(); ctx.moveTo(lx, ry); ctx.lineTo(lx + 12, ry); ctx.stroke();
    }
    ctx.restore();

    // Support beams and lamps every 40 m.
    var stepM = 40;
    var firstBeam = Math.floor(this.camY / stepM) * stepM;
    for (var m = firstBeam; m < this.camY + h / PX_PER_M; m += stepM) {
      if (m < 4) continue;
      var y = this.worldToScreen(m);
      if (y > floorY + 4) continue;
      this.drawBeam(b, y, m);
    }

    // Shaft walls catching the lamp light.
    ctx.strokeStyle = 'rgba(255,185,96,.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x0, 0); ctx.lineTo(b.x0, floorY);
    ctx.moveTo(b.x1, 0); ctx.lineTo(b.x1, floorY);
    ctx.stroke();

    // Minecart rails running down the shaft — reads as "this is worked ground".
    ctx.strokeStyle = 'rgba(150,120,80,.22)';
    ctx.lineWidth = 2;
    var railA = b.x0 + b.w * 0.42, railB = b.x0 + b.w * 0.62;
    ctx.beginPath();
    ctx.moveTo(railA, 0); ctx.lineTo(railA, floorY);
    ctx.moveTo(railB, 0); ctx.lineTo(railB, floorY);
    ctx.stroke();
    var tieStart = -((this.camY * PX_PER_M) % 20);
    ctx.strokeStyle = 'rgba(120,95,62,.18)';
    for (var ty = tieStart; ty < floorY; ty += 20) {
      if (ty < 0) continue;
      ctx.beginPath(); ctx.moveTo(railA - 4, ty); ctx.lineTo(railB + 4, ty); ctx.stroke();
    }

    // Loose spoil heaped against the walls at the working face.
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.moveTo(b.x0, floorY);
    ctx.lineTo(b.x0 + 26, floorY - 12);
    ctx.lineTo(b.x0 + 46, floorY);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x1, floorY);
    ctx.lineTo(b.x1 - 22, floorY - 9);
    ctx.lineTo(b.x1 - 40, floorY);
    ctx.closePath(); ctx.fill();
  };

  Scene.prototype.drawBeam = function (b, y, m) {
    var ctx = this.ctx;
    ctx.fillStyle = '#3b2c1e';
    ctx.fillRect(b.x0 - 2, y, b.w + 4, 7);
    ctx.fillStyle = '#4d3a27';
    ctx.fillRect(b.x0 - 2, y, b.w + 4, 3);
    ctx.fillRect(b.x0 + 4, y, 8, 22);
    ctx.fillRect(b.x1 - 12, y, 8, 22);

    // Lamp, with a soft pool of light.
    var lx = b.x1 - 26, ly = y + 16;
    var flicker = 0.82 + 0.18 * Math.sin(this.time * 7 + m);
    var g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 84);
    g.addColorStop(0, 'rgba(255,185,96,' + (0.30 * flicker) + ')');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(lx, ly, 84, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,208,140,' + flicker + ')';
    ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, 6.283); ctx.fill();
  };

  /* ---- the rock face being mined ---------------------------------------- */

  Scene.prototype.drawFace = function (s, o) {
    var ctx = this.ctx;
    var b = this.shaftBounds();
    var floorY = this.minerScreenY() + 16;
    var rock = s.rock;
    if (!rock) return;

    var st = G.Mining.stationStratum(s);
    var node = G.BAL.nodes[rock.type];
    var frac = num.clamp(rock.hp / rock.maxHp, 0, 1);

    // The face itself: a chunky slab across the shaft.
    var faceH = 92;
    var wob = this.hitFace * 4;
    ctx.save();
    ctx.translate(0, wob);

    ctx.fillStyle = st.colors.dark;
    ctx.fillRect(b.x0, floorY, b.w, faceH);
    ctx.fillStyle = st.colors.base;
    ctx.fillRect(b.x0, floorY, b.w, faceH * 0.55);
    // lamp-lit top lip
    ctx.fillStyle = st.colors.light;
    ctx.fillRect(b.x0, floorY, b.w, 5);
    var lit = ctx.createLinearGradient(0, floorY, 0, floorY + faceH);
    lit.addColorStop(0, 'rgba(255,190,110,.20)');
    lit.addColorStop(1, 'transparent');
    ctx.fillStyle = lit;
    ctx.fillRect(b.x0, floorY, b.w, faceH);

    // Chunk outlines so it reads as broken rock, not a rectangle.
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1.5;
    for (var i = 0; i < 7; i++) {
      var hx = b.x0 + rng.hash2(rock.seed % 997 + i, 11) * b.w;
      ctx.beginPath();
      ctx.moveTo(hx, floorY);
      ctx.lineTo(hx + (rng.hash2(i, rock.seed % 331) - 0.5) * 30, floorY + faceH);
      ctx.stroke();
    }

    // Cracks grow as HP drops — the readable feedback that a hit landed.
    var cracks = Math.floor((1 - frac) * 9);
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1.4;
    for (var c = 0; c < cracks; c++) {
      var sx = b.x0 + 10 + rng.hash2(c + 40, rock.seed % 89) * (b.w - 20);
      var sy = floorY + 6 + rng.hash2(c, 5) * (faceH - 14);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rng.hash2(c, 17) - 0.5) * 34, sy + (rng.hash2(c, 23) - 0.3) * 26);
      ctx.stroke();
    }

    /* Ore actually visible in the face, drawn from this stratum's own drop
       table. It makes the loot table something you look at rather than
       something you read in a panel. */
    var seamCount = node.loot > 1 ? 4 : 3;
    for (var q = 0; q < seamCount; q++) {
      var pick = st.drops[Math.floor(rng.hash2(rock.seed % 613 + q, 401) * st.drops.length) % st.drops.length];
      // Bias away from the middle: the miner stands dead centre now, and ore
      // drawn behind him is ore the player never sees.
      var side = (q % 2) ? 1 : -1;
      var off = 0.20 + rng.hash2(q + 90, rock.seed % 233) * 0.26;
      var ox = b.x0 + b.w * (0.5 + side * off);
      var oy = floorY + 22 + rng.hash2(q + 17, rock.seed % 179) * (faceH - 44);
      ctx.globalAlpha = 0.9;
      G.Sprites.blit(ctx, pick.id, ox, oy, 24);
      ctx.globalAlpha = 1;
    }

    // Special nodes get an unmissable coloured seam.
    if (node.color) {
      var pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = node.color;
      for (var v = 0; v < 5; v++) {
        var vx = b.x0 + 16 + rng.hash2(v + 3, rock.seed % 57) * (b.w - 32);
        var vy = floorY + 10 + rng.hash2(v, rock.seed % 71) * (faceH - 26);
        ctx.beginPath();
        ctx.ellipse(vx, vy, 7, 3.4, rng.hash2(v, 9) * 3.14, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();

      var g2 = ctx.createRadialGradient(this.w / 2, floorY + 30, 6, this.w / 2, floorY + 30, 130);
      g2.addColorStop(0, node.color + '40');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(b.x0 - 40, floorY - 40, b.w + 80, faceH + 90);

      ctx.fillStyle = node.color;
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.name, this.w / 2, floorY - 26);
    }

    ctx.restore();

    // HP bar sitting on the face.
    var bw = b.w * 0.80, bx = (this.w - bw) / 2, by = floorY + faceH + 9;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 12);
    ctx.fillStyle = node.color || '#d8b45c';
    ctx.fillRect(bx, by, bw * frac, 10);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(bx, by, bw * frac, 3);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 9);

    if (this.hitFace > 0) this.hitFace = Math.max(0, this.hitFace - 0.09);
  };

  /* ---- the miner --------------------------------------------------------- */

  Scene.prototype.drawMiner = function (s, o, dt) {
    var ctx = this.ctx;
    var b = this.shaftBounds();
    var y = this.minerScreenY();
    var x = this.w / 2;

    // Animation rate is clamped so a very fast player is still legible.
    var rate = Math.min(o.swingRate, G.BAL.maxVisualSwingRate);
    this.swingPhase = (this.swingPhase + dt * rate) % 1;
    var ph = this.swingPhase;
    // Wind up slowly, strike fast — the asymmetry is what sells the impact.
    var swing = ph < 0.62 ? (ph / 0.62) * 0.9 : 0.9 - ((ph - 0.62) / 0.38) * 2.5;
    var armAngle = -0.5 + swing;

    var bob = Math.sin(this.swingPhase * 6.283) * 1.6;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(-1, 1);   // face the shaft centre

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, 17, 15, 4, 0, 0, 6.283); ctx.fill();

    // legs
    ctx.strokeStyle = '#2f3a52'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, 6); ctx.lineTo(-6, 16);
    ctx.moveTo(3, 6);  ctx.lineTo(7, 16);
    ctx.stroke();

    // torso
    ctx.fillStyle = '#3d5175';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-7, -8, 14, 16, 4) : ctx.rect(-7, -8, 14, 16);
    ctx.fill();
    // hi-vis strap
    ctx.fillStyle = '#e2b23c';
    ctx.fillRect(-7, -2, 14, 3);

    // head
    ctx.fillStyle = '#d9a273';
    ctx.beginPath(); ctx.arc(0, -14, 6, 0, 6.283); ctx.fill();
    // helmet
    ctx.fillStyle = '#e8a13a';
    ctx.beginPath(); ctx.arc(0, -15, 6.6, Math.PI, 0); ctx.fill();
    ctx.fillRect(-8.5, -15.5, 12, 2.4);
    // headlamp
    var lampOn = 0.75 + 0.25 * Math.sin(this.time * 3.4);
    ctx.fillStyle = 'rgba(255,236,180,' + lampOn + ')';
    ctx.beginPath(); ctx.arc(-4.5, -16.5, 1.9, 0, 6.283); ctx.fill();

    // pickaxe arm
    ctx.save();
    ctx.translate(-2, -4);
    ctx.rotate(armAngle);
    ctx.strokeStyle = '#d9a273'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, 2); ctx.stroke();
    // handle
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(-27, -7); ctx.stroke();
    // head of the pickaxe, tinted by tier
    var pick = G.PICKAXES[Math.min(s.pickTier, G.PICKAXES.length - 1)];
    ctx.strokeStyle = pickColor(pick.id);
    ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-34, 2);
    ctx.quadraticCurveTo(-28, -10, -18, -13);   // upper blade
    ctx.moveTo(-34, 2);
    ctx.quadraticCurveTo(-30, 8, -22, 11);      // lower spike
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // lamp pool around the miner
    var g = ctx.createRadialGradient(x, y, 6, x, y, 150);
    g.addColorStop(0, 'rgba(255,196,120,.16)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 150, 0, 6.283); ctx.fill();
  };

  function pickColor(id) {
    var map = {
      wood: '#8a6440', stone: '#9aa0a6', flint: '#5b5b66', copper: '#d98b45',
      bronze: '#c08a3e', iron: '#c3c0bb', steel: '#9aa3b0', silver: '#e3ecf2',
      gold: '#ffcf4d', electrum: '#ffe89a', obsidian: '#4b3f60', platinum: '#f2f7fb',
      cobalt: '#5a86ea', mithril: '#96f2e6', titanium: '#c6cbe8', void: '#8a7cff',
      adamant: '#7dfa72', starforged: '#fff2c4', aetherium: '#c4f7ff', primordial: '#ffc2f2'
    };
    return map[id] || '#bbb';
  }

  /* ---- crew ------------------------------------------------------------- */

  Scene.prototype.drawCrew = function (s, o) {
    var ctx = this.ctx;
    var b = this.shaftBounds();
    var counts = {};
    for (var typeId in s.crew) {
      if (!s.crew.hasOwnProperty(typeId)) continue;
      var list = s.crew[typeId];
      for (var i = 0; i < list.length; i++) {
        counts[list[i]] = (counts[list[i]] || 0) + 1;
      }
    }
    for (var idx in counts) {
      if (!counts.hasOwnProperty(idx)) continue;
      var st = G.STRATA[idx];
      if (!st) continue;
      var m = num.clamp(s.frontier, st.minDepth + 12, st.maxDepth - 12);
      if (!isFinite(m)) m = st.minDepth + 40;
      var y = this.worldToScreen(m);
      if (y < -30 || y > this.h + 30) continue;

      var n = Math.min(6, counts[idx]);
      for (var k = 0; k < n; k++) {
        var cx = b.x0 + 26 + k * 15 + Math.sin(this.time * 2.4 + k) * 2;
        this.drawTinyMiner(cx, y, this.time * 3 + k * 1.7);
      }
      if (counts[idx] > 6) {
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('+' + (counts[idx] - 6), b.x0 + 26 + 6 * 15, y + 4);
      }
    }
  };

  Scene.prototype.drawTinyMiner = function (x, y, phase) {
    var ctx = this.ctx;
    var sw = Math.sin(phase) * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#33415e';
    ctx.fillRect(-3, -6, 6, 8);
    ctx.fillStyle = '#e8a13a';
    ctx.beginPath(); ctx.arc(0, -8, 3, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(2, -4);
    ctx.lineTo(2 + Math.cos(sw - 0.8) * 8, -4 + Math.sin(sw - 0.8) * 8);
    ctx.stroke();
    ctx.restore();
  };

  /* ---- depth ruler ------------------------------------------------------- */

  Scene.prototype.drawRuler = function (s) {
    var ctx = this.ctx, h = this.h, w = this.w;
    var x = w - 34;

    ctx.fillStyle = 'rgba(7,9,13,.55)';
    ctx.fillRect(x, 0, 34, h);

    var stepM = 25;
    var first = Math.ceil(this.camY / stepM) * stepM;
    ctx.textAlign = 'right';
    for (var m = first; m < this.camY + h / PX_PER_M; m += stepM) {
      if (m < 0) continue;
      var y = this.worldToScreen(m);
      var major = (m % 100 === 0);
      ctx.strokeStyle = major ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + (major ? 4 : 12), y + 0.5);
      ctx.lineTo(x + 30, y + 0.5);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(255,255,255,.42)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText(num.fmt(m), x + 30, y - 3);
      }
    }

    // Frontier marker: where you have actually dug to.
    var fy = this.worldToScreen(s.frontier);
    if (fy > -10 && fy < h + 10) {
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.moveTo(x + 2, fy); ctx.lineTo(x + 10, fy - 4); ctx.lineTo(x + 10, fy + 4);
      ctx.closePath(); ctx.fill();
    }
  };

  Scene.prototype.drawVignette = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    var g = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.28, w * 0.5, h * 0.55, h * 0.95);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  Scene.prototype.drawFlash = function () {
    if (this.parts.flash <= 0) return;
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.parts.flash;
    ctx.fillStyle = this.parts.flashColor;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  };

  /* Slow drifting motes so the scene is never completely static. */
  Scene.prototype.emitAmbient = function (s, dt) {
    this._dustT = (this._dustT || 0) + dt;
    if (this._dustT < 0.28) return;
    this._dustT = 0;
    var b = this.shaftBounds();
    this.parts.dust(b.x0 + Math.random() * b.w, this.minerScreenY() + 20 + Math.random() * 20);
  };

  /* ---- event hooks (called by main.js) ---------------------------------- */

  Scene.prototype.onSwing = function () {
    this.hitFace = 1;
  };

  Scene.prototype.onBreak = function (payload) {
    var b = this.shaftBounds();
    var fx = this.w / 2, fy = this.minerScreenY() + 34;
    var s = payload.s;
    var st = G.Mining.stationStratum(s);
    var node = G.BAL.nodes[payload.type];

    this.parts.chips(fx, fy, st.colors.light, payload.crit ? 14 : 7, payload.crit ? 1.7 : 1);
    this.parts.chips(fx, fy, G.res(payload.drop.id).color, payload.crit ? 8 : 4, 1.2);
    this.parts.kick(payload.crit ? 7 : 2.2);

    this.queueDrop(payload.drop.id, payload.drop.n, payload.drop.rare);

    if (payload.drop.rare) {
      this.parts.burst(fx, fy - 10, '#c48bff', 12);
      this.parts.flashScreen('#7a4bd0', 0.10);
    }
    if (payload.crit) {
      this.parts.burst(fx, fy, '#ffd257', 18);
      this.parts.text(fx, fy - 128, 'קריטי!', '#ffd257', { bold: true, size: 22, life: 0.9 });
    }
    if (payload.type !== 'normal') {
      this.parts.burst(fx, fy, node.color || '#fff', 20);
      this.parts.kick(6);
    }
    if (payload.gold > 0) {
      this.parts.text(fx, fy - 156, '+' + num.fmt(payload.gold) + ' זהב', '#f2c14e',
                      { bold: true, size: 21 });
    }
  };

  /* Drop labels are batched.

     At a few breaks per second one label per break is perfect. At a few hundred
     it is an unreadable pile of overlapping text, which is where this game ends
     up within an hour. Drops are accumulated per resource and flushed on a
     fixed cadence, stacked in lanes so several resources stay legible. */
  Scene.prototype.queueDrop = function (id, n, rare) {
    var q = this.dropQueue || (this.dropQueue = {});
    var e = q[id] || (q[id] = { n: 0, rare: false });
    e.n += n;
    if (rare) e.rare = true;
  };

  var DROP_FLUSH = 0.26;   // seconds between label batches
  var DROP_LANES = 4;      // most labels shown at once

  Scene.prototype.flushDrops = function (dt) {
    this.dropTimer = (this.dropTimer || 0) + dt;
    if (this.dropTimer < DROP_FLUSH) return;
    this.dropTimer = 0;

    var q = this.dropQueue;
    if (!q) return;
    var ids = Object.keys(q);
    if (!ids.length) return;

    // Most valuable first: if we can only show four, show the four that matter.
    ids.sort(function (a, b) {
      return G.res(b).value * q[b].n - G.res(a).value * q[a].n;
    });

    var fx = this.w / 2, fy = this.minerScreenY() + 24;
    for (var i = 0; i < Math.min(ids.length, DROP_LANES); i++) {
      var id = ids[i], e = q[id], r = G.res(id);
      this.parts.text(fx, fy - 20 - i * 34,
        '+' + num.fmtCount(e.n) + ' ' + r.name,
        e.rare ? '#d9b0ff' : readable(r.color), {
          bold: true,
          size: e.rare ? 23 : 20,
          icon: id,
          iconSize: e.rare ? 32 : 27,
          spread: 0,
          vy: -26,
          life: e.rare ? 1.9 : 1.5
        });
    }
    this.dropQueue = {};
  };

  Scene.prototype.onPrestige = function () {
    this.parts.clear();
    this.dropQueue = {};
    this.parts.flashScreen('#7fd8ff', 0.6);
    this.parts.kick(15);
    this.camY = 0;
  };

  Scene.readable = readable;
  G.Scene = Scene;
  G.PX_PER_M = PX_PER_M;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
