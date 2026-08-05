/* Bootstrap and the frame loop.

   Logic runs on a fixed 20Hz accumulator so behaviour does not depend on frame
   rate; rendering runs as fast as the browser will give us. */
(function (G) {
  'use strict';

  var BAL = G.BAL;
  var STEP = 1 / BAL.tickHz;
  var SAVE_EVERY = 15;

  var scene, acc = 0, lastFrame = 0, saveTimer = 0;

  function boot() {
    var saved = null;
    try { saved = G.State.load(); } catch (e) { /* corrupt save: start fresh */ }

    var game = G.Game;
    game.init(saved || G.State.newState());

    scene = new G.Scene(document.getElementById('mine-canvas'));
    G.UI.init(game, scene);

    // Offline catch-up before the first frame so the report reflects reality.
    var report = null;
    if (saved) {
      try { report = G.Offline.run(game.s); } catch (e) { console.warn('offline failed', e); }
      game.refresh();
    }

    wireScene(game);

    if (report) G.UI.showOfflineReport(report);
    else if (!saved) firstRun();

    window.addEventListener('resize', function () { scene.resize(); });
    window.addEventListener('beforeunload', function () { G.State.save(game.s); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) G.State.save(game.s);
    });

    // Clicking the mine gives one extra swing — small, but it makes the scene
    // feel like a thing you can touch rather than a screensaver.
    document.getElementById('mine-canvas').addEventListener('pointerdown', function () {
      G.Mining.doSwing(game.s, game.o);
      scene.onSwing();
      scene.parts.kick(1.5);
    });

    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function wireScene(game) {
    G.bus.on('break', function (p) { scene.onBreak(p); });
    G.bus.on('forgeDone', function (p) {
      scene.parts.text(scene.w * 0.5, scene.h * 0.3,
        '🔥 ' + G.num.fmtCount(p.n) + ' ' + G.res(p.recipe.out.id).name,
        G.Scene.readable(G.res(p.recipe.out.id).color), { bold: true });
    });
  }

  function firstRun() {
    G.UI.log('התחלת לחפור. אדמה, חימר, אבנים — כל דבר שווה משהו.', 'good');
    G.UI.toast('⛏', 'ברוך הבא למעמקים', 'הכורה עובד לבד. אתה מחליט לאן זה הולך.');
  }

  function frame(now) {
    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (dt > 0.5) dt = 0.5;          // tab was backgrounded; offline handles long gaps

    var game = G.Game;

    acc += dt;
    var steps = 0;
    while (acc >= STEP && steps < 8) {
      game.tick(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 8) acc = 0;        // never let the accumulator spiral

    G.UI.tick(dt);
    scene.render(game, dt);

    saveTimer += dt;
    if (saveTimer > SAVE_EVERY) {
      saveTimer = 0;
      if (game.s.settings.autoSave) G.State.save(game.s);
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
