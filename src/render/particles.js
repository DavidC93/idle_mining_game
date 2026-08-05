/* Particles, floating numbers and screen shake — the "juice" layer.

   All of it is decorative: nothing here touches game state. If the particle
   budget is exceeded the oldest ones are dropped rather than skipping frames,
   because a game that stutters when it gets exciting feels worse than one that
   draws fewer sparks. */
(function (G) {
  'use strict';

  var MAX = 260;

  function Particles() {
    this.list = [];
    this.shake = 0;
    this.shakeDecay = 5.5;
    this.flash = 0;
    this.flashColor = '#fff';
  }

  Particles.prototype.clear = function () { this.list.length = 0; };

  Particles.prototype._push = function (p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  };

  /* Rock chips flying off a struck face. */
  Particles.prototype.chips = function (x, y, color, n, force) {
    n = n || 6;
    force = force || 1;
    for (var i = 0; i < n; i++) {
      var a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.4;
      var sp = (40 + Math.random() * 130) * force;
      this._push({
        kind: 'chip',
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40 * force,
        size: 1.6 + Math.random() * 3.2,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 12,
        color: color,
        life: 0, max: 0.55 + Math.random() * 0.5
      });
    }
  };

  /* A drifting label: "+12 פחם". */
  Particles.prototype.text = function (x, y, text, color, opts) {
    opts = opts || {};
    this._push({
      kind: 'text',
      x: x + (Math.random() - 0.5) * 26,
      y: y,
      vx: (Math.random() - 0.5) * 14,
      vy: -(34 + Math.random() * 16),
      text: text,
      color: color || '#fff',
      size: opts.size || 13,
      bold: !!opts.bold,
      life: 0, max: opts.life || 1.15
    });
  };

  /* Radial burst for crits and special nodes. */
  Particles.prototype.burst = function (x, y, color, n) {
    n = n || 14;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * 6.283 + Math.random() * 0.3;
      var sp = 90 + Math.random() * 150;
      this._push({
        kind: 'spark',
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: 1.5 + Math.random() * 2.5,
        color: color,
        life: 0, max: 0.4 + Math.random() * 0.45
      });
    }
  };

  /* Slow motes drifting in lamp light — pure atmosphere. */
  Particles.prototype.dust = function (x, y, color) {
    this._push({
      kind: 'dust',
      x: x, y: y,
      vx: (Math.random() - 0.5) * 8,
      vy: -6 - Math.random() * 10,
      size: 0.7 + Math.random() * 1.4,
      color: color || 'rgba(255,200,140,.5)',
      life: 0, max: 1.8 + Math.random() * 1.6
    });
  };

  Particles.prototype.kick = function (amount) {
    this.shake = Math.min(16, this.shake + amount);
  };

  Particles.prototype.flashScreen = function (color, amount) {
    this.flash = Math.min(0.7, this.flash + amount);
    this.flashColor = color;
  };

  Particles.prototype.update = function (dt) {
    var l = this.list, w = 0;
    for (var i = 0; i < l.length; i++) {
      var p = l[i];
      p.life += dt;
      if (p.life >= p.max) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'chip') { p.vy += 520 * dt; p.rot += p.vr * dt; }
      else if (p.kind === 'spark') { p.vx *= 0.94; p.vy = p.vy * 0.94 + 120 * dt; }
      else if (p.kind === 'text') { p.vy *= 0.965; }
      else if (p.kind === 'dust') { p.vx += (Math.random() - 0.5) * 12 * dt; }

      l[w++] = p;
    }
    l.length = w;

    if (this.shake > 0) this.shake = Math.max(0, this.shake - this.shakeDecay * dt * (1 + this.shake));
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
  };

  Particles.prototype.draw = function (ctx) {
    var l = this.list;
    for (var i = 0; i < l.length; i++) {
      var p = l[i];
      var t = p.life / p.max;
      var alpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.globalAlpha = Math.max(0, alpha);

      if (p.kind === 'text') {
        ctx.font = (p.bold ? '700 ' : '600 ') + p.size + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'chip') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  G.Particles = Particles;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
