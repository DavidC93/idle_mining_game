/* Small DOM helpers and reusable widgets. Plain DOM on purpose: the panels
   re-render a few times a second and hand-built nodes are cheaper and more
   predictable than diffing a template string. */
(function (G) {
  'use strict';

  var num = G.num;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function frag() { return document.createDocumentFragment(); }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* A titled card with a body you fill in. */
  function card(title, sub, opts) {
    opts = opts || {};
    var c = el('div', 'card');
    if (title) {
      var h = el('header');
      var left = el('div');
      left.appendChild(el('b', null, title));
      if (sub) { left.appendChild(document.createTextNode(' ')); left.appendChild(el('small', null, sub)); }
      h.appendChild(left);
      if (opts.right) h.appendChild(opts.right);
      c.appendChild(h);
    }
    var body = el('div', 'card-body' + (opts.tight ? ' tight' : ''));
    c.appendChild(body);
    c.body = body;
    return c;
  }

  /* The workhorse: an icon + name + description + cost row that is also a button. */
  function buyRow(cfg) {
    var b = el('button', 'row');
    b.type = 'button';
    if (cfg.locked) b.classList.add('locked');
    if (cfg.maxed) b.classList.add('maxed');
    if (cfg.affordable && !cfg.maxed && !cfg.locked) b.classList.add('affordable');

    b.appendChild(el('span', 'row-icon', cfg.icon || '•'));

    var main = el('div', 'row-main');
    var nameRow = el('div', 'row-name');
    nameRow.appendChild(el('span', null, cfg.name));
    if (cfg.level) nameRow.appendChild(el('span', 'lv', cfg.level));
    main.appendChild(nameRow);
    if (cfg.desc) main.appendChild(el('div', 'row-desc', cfg.desc));
    if (cfg.extra) main.appendChild(cfg.extra);
    b.appendChild(main);

    var cost = el('div', 'row-cost');
    if (cfg.maxed) {
      cost.appendChild(el('span', 'good', 'מקסימום'));
    } else if (cfg.costText) {
      cost.appendChild(el('span', cfg.affordable ? 'afford' : 'no', cfg.costText));
      if (cfg.costSub) cost.appendChild(el('small', null, cfg.costSub));
    }
    b.appendChild(cost);

    if (cfg.onClick) b.addEventListener('click', cfg.onClick);
    if (cfg.disabled) b.disabled = true;
    return b;
  }

  function bar(frac, cls) {
    var w = el('div', 'bar' + (cls ? ' ' + cls : ''));
    var i = el('i');
    i.style.width = (num.clamp(frac, 0, 1) * 100).toFixed(2) + '%';
    w.appendChild(i);
    w.fill = i;
    return w;
  }

  function button(label, cls, onClick) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function empty(text) { return el('div', 'empty', text); }

  /* Coloured swatch + name + count, used all over the inventory UI. */
  function resChip(resId, qty, opts) {
    opts = opts || {};
    var r = G.res(resId);
    var node = el(opts.button ? 'button' : 'div', 'inv-item');
    if (opts.button) node.type = 'button';
    var sw = el('span', 'inv-swatch');
    sw.style.background = r.color;
    node.appendChild(sw);
    var t = el('div', 'inv-text');
    t.appendChild(el('b', null, r.name));
    t.appendChild(el('small', null, opts.subtitle !== undefined ? opts.subtitle : num.fmtCount(qty)));
    node.appendChild(t);
    node.title = r.name + (opts.title ? ' — ' + opts.title : '');
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    if (opts.selling) node.classList.add('selling');
    return node;
  }

  /* "12 פחם / 40" style requirement list that reddens what you are short of. */
  function costList(s, mats, opts) {
    opts = opts || {};
    var w = el('div', 'recipe-cost');
    for (var i = 0; i < mats.length; i++) {
      var m = mats[i];
      var have = s.inv[m.id] || 0;
      var short = have < m.n;
      var sp = el('span', short ? 'short' : null);
      sp.textContent = G.res(m.id).name + ' ' + num.fmtCount(Math.min(have, m.n)) + '/' + num.fmtCount(m.n);
      w.appendChild(sp);
    }
    if (opts.fuel) {
      var haveF = opts.fuelHave, needF = opts.fuel;
      var f = el('span', haveF < needF ? 'short' : null);
      f.textContent = '🔥 דלק ' + num.fmtCount(Math.min(haveF, needF)) + '/' + num.fmtCount(needF);
      w.appendChild(f);
    }
    return w;
  }

  G.UIC = {
    el: el, frag: frag, clear: clear, card: card, buyRow: buyRow, bar: bar,
    button: button, empty: empty, resChip: resChip, costList: costList
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
