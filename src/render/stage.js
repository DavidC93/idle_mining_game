/* The stage: whatever occupies the big view.

   Panels can claim the stage by declaring a `stageView`. Selecting such a panel
   swaps the main view instead of burying its content in the side column — on a
   phone the side column is a narrow scrolling strip, and a live process shown
   there may as well not exist. */
(function (G) {
  'use strict';

  var Stage = {
    canvas: null,
    view: 'mine',
    views: {},
    switchT: 0,          // crossfade timer

    init: function (canvas) {
      this.canvas = canvas;
      this.views.mine = new G.Scene(canvas);
      this.views.forge = new G.ForgeScene(canvas);
      return this;
    },

    current: function () { return this.views[this.view] || this.views.mine; },
    mine: function () { return this.views.mine; },
    forge: function () { return this.views.forge; },

    has: function (name) { return !!this.views[name]; },

    set: function (name) {
      if (!this.views[name] || this.view === name) return false;
      this.view = name;
      this.switchT = 0.36;
      G.bus.emit('stageView', { view: name });
      return true;
    },

    resize: function () {
      for (var k in this.views) if (this.views.hasOwnProperty(k)) this.views[k].resize();
    },

    render: function (game, dt) {
      var v = this.current();
      v.render(game, dt);

      // A brief wipe on switch so the change reads as deliberate rather than
      // as the screen glitching.
      if (this.switchT > 0) {
        this.switchT = Math.max(0, this.switchT - dt);
        var t = this.switchT / 0.36;
        var ctx = v.ctx;
        ctx.save();
        ctx.globalAlpha = t * 0.85;
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, v.w, v.h * (1 - (1 - t) * 0));
        ctx.restore();
      }
    }
  };

  G.Stage = Stage;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
