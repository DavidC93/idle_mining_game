/* Tiny event bus. Systems announce what happened; the renderer and UI decide
   how loud to be about it. Keeps game logic free of canvas/DOM references so
   the same code can run headless in the balance simulator. */
(function (G) {
  'use strict';

  var handlers = {};

  function on(name, fn) {
    (handlers[name] || (handlers[name] = [])).push(fn);
    return fn;
  }

  function off(name, fn) {
    var list = handlers[name];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(name, payload) {
    var list = handlers[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](payload);
  }

  G.bus = { on: on, off: off, emit: emit, _handlers: handlers };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
