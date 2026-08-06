/* The forge, as a full stage view.

   Smelting is the game's second production loop and on a phone it was invisible
   — a progress bar buried under a tab. Given its own canvas it becomes the
   thing you watch: ore going into the fire, the bar climbing, an ingot landing
   in the tray. Same data, wildly different sense of "something is happening". */
(function (G) {
  'use strict';

  var num = G.num, rng = G.rng;

  function ForgeScene(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 0; this.h = 0; this.dpr = 1;
    this.time = 0;
    this.parts = new G.Particles();
    this.tray = [];          // recently finished goods, for the output shelf
    this.resize();
  }

  ForgeScene.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(200, Math.floor(rect.width));
    this.h = Math.max(160, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  /* Slots are laid out in a grid that stays readable from four slots to eight,
     and on a phone as well as a desktop. */
  ForgeScene.prototype.layout = function (count) {
    var cols = count <= 2 ? count : (count <= 6 ? Math.ceil(count / 2) : 4);
    var rows = Math.ceil(count / cols);
    /* A phone in portrait gives this view about 350px of height for two rows
       of furnaces plus a fuel gauge and an output tray. Fixed percentage
       padding pushed everything into everything else, so the chrome gets a
       fixed pixel budget and the furnaces take what is left. */
    var short = this.h < 460;
    var padX = this.w * (short ? 0.04 : 0.07);
    var padTop = short ? 34 : this.h * 0.20;
    var padBottom = short ? 74 : this.h * 0.24;
    var gw = this.w - padX * 2, gh = Math.max(80, this.h - padTop - padBottom);
    var cw = gw / cols, ch = gh / rows;
    var size = Math.min(cw * 0.88, ch * (short ? 0.72 : 0.84), 148);
    return { cols: cols, rows: rows, padX: padX, padTop: padTop, cw: cw, ch: ch,
             size: size, labels: size >= 74 && !short };
  };

  ForgeScene.prototype.render = function (game, dt) {
    var s = game.s, o = game.o, ctx = this.ctx;
    this.time += dt;

    var slots = G.Forge.slotCount(s);
    var fuel = G.Forge.availableFuel(s);
    var burning = s.forge.jobs.length > 0;

    this.drawRoom(burning, fuel);

    var L = this.layout(slots);
    for (var i = 0; i < slots; i++) {
      var col = i % L.cols, row = Math.floor(i / L.cols);
      var cx = L.padX + col * L.cw + L.cw / 2;
      var cy = L.padTop + row * L.ch + L.ch / 2;
      this.drawSlot(s, o, i, cx, cy, L.size, L.labels);
    }

    this.drawFuelGauge(s, fuel, o);
    this.drawTray(dt);
    this.drawAuto(s);

    this.emitEmbers(dt, burning);
    this.parts.update(dt);
    this.parts.draw(ctx);
  };

  /* ---- room ------------------------------------------------------------- */

  ForgeScene.prototype.drawRoom = function (burning, fuel) {
    var ctx = this.ctx, w = this.w, h = this.h;

    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1119');
    g.addColorStop(0.55, '#241419');
    g.addColorStop(1, '#150c10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // brick wall
    var bh = 26, bw = 54;
    ctx.strokeStyle = 'rgba(255,255,255,.028)';
    ctx.lineWidth = 1;
    for (var y = 0; y < h; y += bh) {
      var off = ((y / bh) | 0) % 2 ? bw / 2 : 0;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
      for (var x = -off; x < w; x += bw) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + bh); ctx.stroke();
      }
    }

    // heat haze from the floor, brighter while anything is actually burning
    var heat = burning && fuel > 0 ? 1 : 0.35;
    var pulse = 0.85 + 0.15 * Math.sin(this.time * 2.1);
    var hg = ctx.createRadialGradient(w / 2, h * 1.02, 10, w / 2, h * 1.02, h * 0.9);
    hg.addColorStop(0, 'rgba(255,120,40,' + (0.30 * heat * pulse) + ')');
    hg.addColorStop(0.5, 'rgba(255,80,20,' + (0.10 * heat) + ')');
    hg.addColorStop(1, 'transparent');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, w, h);

    // floor
    ctx.fillStyle = '#120a0d';
    ctx.fillRect(0, h - h * 0.13, w, h * 0.13);
    ctx.strokeStyle = 'rgba(255,140,60,.16)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h - h * 0.13); ctx.lineTo(w, h - h * 0.13); ctx.stroke();
  };

  /* ---- one furnace mouth ------------------------------------------------- */

  ForgeScene.prototype.drawSlot = function (s, o, index, cx, cy, size, labels) {
    var ctx = this.ctx;
    var job = s.forge.jobs[index];
    var half = size / 2;
    var progress = job ? num.clamp(job.t / job.dur, 0, 1) : 0;

    ctx.save();
    ctx.translate(cx, cy);

    // furnace body
    var body = ctx.createLinearGradient(0, -half, 0, half);
    body.addColorStop(0, '#4a3128');
    body.addColorStop(1, '#2b1a15');
    ctx.fillStyle = body;
    roundRect(ctx, -half, -half, size, size, size * 0.16);
    ctx.fill();
    ctx.strokeStyle = '#5d3d2f';
    ctx.lineWidth = 3;
    ctx.stroke();

    // the mouth
    var mr = half * 0.66;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, -mr, -mr, mr * 2, mr * 2, mr * 0.3);
    ctx.clip();

    ctx.fillStyle = '#0b0405';
    ctx.fillRect(-mr, -mr, mr * 2, mr * 2);

    if (job) {
      // Fire intensity rises with progress: the piece is getting hotter.
      var flick = 0.7 + 0.3 * Math.sin(this.time * 11 + index * 2.3);
      var intensity = (0.45 + progress * 0.55) * flick;
      var fg = ctx.createRadialGradient(0, mr * 0.5, 2, 0, mr * 0.5, mr * 1.7);
      fg.addColorStop(0, 'rgba(255,240,180,' + (0.95 * intensity) + ')');
      fg.addColorStop(0.28, 'rgba(255,160,40,' + (0.85 * intensity) + ')');
      fg.addColorStop(0.62, 'rgba(220,60,15,' + (0.5 * intensity) + ')');
      fg.addColorStop(1, 'transparent');
      ctx.fillStyle = fg;
      ctx.fillRect(-mr, -mr, mr * 2, mr * 2);

      // coals
      for (var c = 0; c < 6; c++) {
        var t = (this.time * 0.7 + c * 0.37) % 1;
        var bx = (rng.hash2(c + index * 7, 3) - 0.5) * mr * 1.5;
        var by = mr * 0.72 - t * mr * 0.35;
        ctx.fillStyle = 'rgba(255,' + Math.round(90 + 120 * (1 - t)) + ',40,' + (0.8 * (1 - t)) + ')';
        ctx.beginPath();
        ctx.arc(bx, by, 2.4 + rng.hash2(c, index) * 2, 0, 6.283);
        ctx.fill();
      }

      // the piece being made, rising out of the heat as it finishes
      var recipe = G.RECIPE_BY_ID[job.id];
      if (recipe) {
        var iconSize = mr * 1.05;
        ctx.save();
        ctx.globalAlpha = 0.35 + progress * 0.65;
        var lift = -mr * 0.05 - progress * mr * 0.28;
        var wob = Math.sin(this.time * 4 + index) * 1.5 * (1 - progress);
        G.Sprites.blit(ctx, recipe.out.id, wob, lift, iconSize);
        ctx.restore();
        // white-hot rim as it nears completion
        if (progress > 0.7) {
          ctx.globalAlpha = (progress - 0.7) / 0.3 * 0.5;
          ctx.fillStyle = '#fff3c4';
          ctx.beginPath();
          ctx.arc(wob, lift, iconSize * 0.5, 0, 6.283);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // cold: faint embers only
      ctx.fillStyle = 'rgba(120,50,30,.22)';
      ctx.beginPath();
      ctx.ellipse(0, mr * 0.6, mr * 0.7, mr * 0.18, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();

    // mouth frame
    ctx.strokeStyle = job ? 'rgba(255,150,60,.65)' : 'rgba(255,255,255,.10)';
    ctx.lineWidth = 3;
    roundRect(ctx, -mr, -mr, mr * 2, mr * 2, mr * 0.3);
    ctx.stroke();

    // progress bar under the mouth
    var bw2 = size * 0.78, bx2 = -bw2 / 2, by2 = half - size * 0.15;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    roundRect(ctx, bx2, by2, bw2, 9, 4.5); ctx.fill();
    if (job) {
      var pg = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
      pg.addColorStop(0, '#ff7a29');
      pg.addColorStop(1, '#ffd257');
      ctx.fillStyle = pg;
      roundRect(ctx, bx2, by2, Math.max(6, bw2 * progress), 9, 4.5); ctx.fill();
    }

    // label
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    if (!labels) { /* no room under the furnace; the panel lists them instead */ }
    else if (job) {
      var r2 = G.RECIPE_BY_ID[job.id];
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = '#ffd9a8';
      ctx.fillText(G.res(r2.out.id).name, 0, half + 18);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,220,180,.7)';
      ctx.fillText(num.fmtTime((job.dur - job.t) / (o.forge || 1)), 0, half + 33);
    } else {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fillText('תא פנוי', 0, half + 18);
    }
    ctx.direction = 'ltr';
    ctx.restore();
  };

  /* ---- fuel gauge -------------------------------------------------------- */

  ForgeScene.prototype.drawFuelGauge = function (s, fuel, o) {
    var ctx = this.ctx, w = this.w, h = this.h;
    var short = h < 460;
    var bw = Math.min(w * 0.78, 320), bx = (w - bw) / 2, by = h - 26;

    // A gauge with no maximum is meaningless; scale against what the current
    // recipes actually burn so "low" means "about to stall".
    var need = 1;
    for (var i = 0; i < s.forge.jobs.length; i++) {
      var r = G.RECIPE_BY_ID[s.forge.jobs[i].id];
      if (r) need = Math.max(need, G.Forge.fuelCost(r, o));
    }
    var full = Math.max(need * 8, 100);
    var frac = num.clamp(fuel / full, 0, 1);
    var low = frac < 0.18;

    ctx.fillStyle = 'rgba(0,0,0,.5)';
    roundRect(ctx, bx, by, bw, 14, 7); ctx.fill();
    var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    if (low) { g.addColorStop(0, '#a8321f'); g.addColorStop(1, '#ff5f3a'); }
    else { g.addColorStop(0, '#7a3a12'); g.addColorStop(1, '#ffab3a'); }
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, Math.max(4, bw * frac), 14, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, 13, 7); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '600 11.5px system-ui, sans-serif';
    var blink = low ? (0.55 + 0.45 * Math.sin(this.time * 6)) : 1;
    ctx.globalAlpha = blink;
    var label = '🔥 דלק · ' + num.fmt(fuel) + (low ? '  — כמעט נגמר!' : '');
    if (short) {
      // No spare vertical room on a phone: the reading goes inside the bar
      // rather than on a line of its own that the output tray then lands on.
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(label, w / 2, by + 11);
      ctx.fillStyle = '#fff1dd';
      ctx.fillText(label, w / 2, by + 11);
    } else {
      ctx.fillStyle = low ? '#ff9f8a' : 'rgba(255,220,180,.85)';
      ctx.fillText(label, w / 2, by - 7);
    }
    ctx.globalAlpha = 1;
    ctx.direction = 'ltr';
  };

  /* ---- output tray ------------------------------------------------------- */

  ForgeScene.prototype.pushOutput = function (resId, n) {
    this.tray.unshift({ id: resId, n: n, age: 0 });
    if (this.tray.length > 6) this.tray.pop();
    // a little celebratory pop from the furnace
    this.parts.burst(this.w / 2, this.h * 0.5, '#ffd257', 14);
    this.parts.kick(3);
  };

  ForgeScene.prototype.drawTray = function (dt) {
    var ctx = this.ctx, w = this.w, h = this.h;
    var short = h < 460;
    var size = short ? 22 : 30;
    var step = short ? 34 : 42;
    // Desktop: well clear of the fuel gauge and its caption underneath.
    var y = short ? h - 50 : h - 88;

    for (var i = this.tray.length - 1; i >= 0; i--) {
      var t = this.tray[i];
      t.age += dt;
      if (t.age > 6) { this.tray.splice(i, 1); continue; }
      var alpha = t.age > 5 ? (6 - t.age) : 1;
      var x = w * 0.5 + (i - (this.tray.length - 1) / 2) * step;
      ctx.globalAlpha = alpha;
      var rise = Math.max(0, 1 - t.age * 4) * 14;
      G.Sprites.blit(ctx, t.id, x, y - rise, size);
      ctx.textAlign = 'center';
      ctx.font = '700 10.5px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.85)';
      // Count sits above the icon on a phone; below it, it lands on the gauge.
      var ty = short ? y - rise - size * 0.75 : y + 24 - rise;
      ctx.strokeText('×' + num.fmtCount(t.n), x, ty);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('×' + num.fmtCount(t.n), x, ty);
      ctx.globalAlpha = 1;
    }
  };

  ForgeScene.prototype.drawAuto = function (s) {
    if (!s.unlocks.autoSmelt || !s.forge.auto) return;
    var ctx = this.ctx;
    var r = G.RECIPE_BY_ID[s.forge.auto];
    if (!r) return;
    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(120,230,160,.9)';
    ctx.fillText('⟳ מזין אוטומטי: ' + G.res(r.out.id).name, this.w / 2,
                 this.h < 460 ? 20 : this.h * 0.085);
    ctx.direction = 'ltr';
  };

  ForgeScene.prototype.emitEmbers = function (dt, burning) {
    this._t = (this._t || 0) + dt;
    var every = burning ? 0.09 : 0.5;
    if (this._t < every) return;
    this._t = 0;
    this.parts.dust(this.w * (0.15 + Math.random() * 0.7), this.h * 0.82,
      'rgba(255,' + (110 + Math.random() * 90 | 0) + ',60,.75)');
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  G.ForgeScene = ForgeScene;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
