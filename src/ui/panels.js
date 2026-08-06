/* Panel bodies. Each panel exposes { id, label, icon, visible(game), build(game) }.

   Panels rebuild their DOM wholesale a few times a second. That is fine at this
   scale and removes a whole class of "the UI says 3 but you have 4" bugs — the
   screen is always a direct function of state. */
(function (G) {
  'use strict';

  var U = G.UIC, num = G.num, el = U.el;

  function goldText(v) { return num.fmt(v) + ' ז׳'; }

  /* ---------------------------------------------------------------------- */
  /* Live stat readouts.

     "+8% mining power per level" tells you nothing about whether the next
     purchase is worth 40,000 gold. "3.4 -> 3.7 swings per second" does. Every
     repeatable purchase shows its real current value and what the pending buy
     would make it. */

  function fmtReadout(v, kind) {
    switch (kind) {
      case 'mult':  return '×' + num.fmt(v);
      case 'pct':   return num.fmtPct(v, v < 0.1 ? 1 : 0);
      case 'time':  return num.fmtTime(v);
      case 'depth': return num.fmtDepth(v);
      default:      return num.fmt(v);
    }
  }

  /* "label: current → next", with the delta coloured by whether it helps. */
  function readoutLine(def, cur, next) {
    var ro = G.Stats.readoutFor(def);
    if (!ro) return null;
    var a = cur[ro.key], b = next ? next[ro.key] : null;
    var line = el('div', 'row-stat');
    line.appendChild(el('span', 'row-stat-label', ro.label));
    line.appendChild(el('b', null, fmtReadout(a, ro.kind)));
    if (next && Math.abs(b - a) > 1e-9) {
      var better = ro.lower ? b < a : b > a;
      line.appendChild(el('span', 'row-stat-arrow', '←'));
      line.appendChild(el('b', better ? 'good' : 'bad', fmtReadout(b, ro.kind)));
    }
    return line;
  }

  /* Some upgrades move a second thing worth knowing about; surface it so the
     player is not guessing at what a purchase really does. */
  function extraNote(id, cur) {
    if (id === 'sharpness' || id === 'lanterns' || id === 'resonance') {
      return 'נזק לשנייה: ' + num.fmt(cur.dps);
    }
    if (id === 'swiftness') return 'נזק לשנייה: ' + num.fmt(cur.dps);
    if (id === 'critChance') return 'שלל ממוצע לשבירה: ×' +
      num.fmt(1 + cur.crit * (cur.critMult - 1));
    if (id === 'critPower') return 'שלל ממוצע לשבירה: ×' +
      num.fmt(1 + cur.crit * (cur.critMult - 1));
    return null;
  }

  /* =====================================================================
     MINE — the pickaxe, the current layer, and what you are carrying
     ===================================================================== */

  var mine = {
    id: 'mine', label: 'המכרה', icon: '⛏',
    visible: function () { return true; },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag();

      /* --- pickaxe / forge next tier --- */
      var pick = G.PICKAXES[Math.min(s.pickTier, G.PICKAXES.length - 1)];
      var next = G.Shop.nextPick(s);
      var pc = U.card('המכוש שלך', pick.name);
      var cur = el('div');
      cur.appendChild(el('div', 'dim', 'עוצמה בסיסית: ' + num.fmt(pick.power) +
        ' · עוצמה כוללת: ' + num.fmt(o.hitPower)));
      pc.body.appendChild(cur);

      if (next) {
        var canPay = G.State.canAfford(s, next.cost);
        var wrap = el('div');
        wrap.style.marginTop = '10px';
        wrap.appendChild(el('div', 'section-title', 'הדרגה הבאה'));
        var mats = next.cost.mats.slice();
        var row = U.buyRow({
          icon: '🔨',
          name: next.name,
          desc: 'עוצמה ' + num.fmt(next.power) + ' (פי ' + (next.power / pick.power).toFixed(1) + ')' +
                gateNote(next.tier),
          costText: goldText(next.cost.gold),
          affordable: canPay,
          extra: U.costList(s, mats),
          onClick: function () {
            if (G.Shop.forgePick(s)) { game.refresh(); G.UI.refresh(); }
          }
        });
        wrap.appendChild(row);
        pc.body.appendChild(wrap);
      } else {
        pc.body.appendChild(el('div', 'good', 'חישלת את המכוש האחרון. אגדה.'));
      }
      f.appendChild(pc);

      /* --- current layer --- */
      var st = G.Mining.stationStratum(s);
      var lc = U.card('שכבה נוכחית', st.name);
      var lb = lc.body;
      lb.appendChild(el('div', 'dim',
        'עומק עבודה: ' + num.fmtDepth(G.Mining.workingDepth(s)) +
        ' · קושי סלע: ' + num.fmt(G.Stats.rockHP(G.Mining.workingDepth(s), st))));
      lb.appendChild(el('div', 'section-title', 'מה נמצא כאן'));
      var dl = el('div', 'inv-grid');
      var totalW = 0, i;
      for (i = 0; i < st.drops.length; i++) totalW += st.drops[i].w;
      for (i = 0; i < st.drops.length; i++) {
        var d = st.drops[i];
        dl.appendChild(U.resChip(d.id, 0, {
          subtitle: Math.round(d.w / totalW * 100) + '% · ' + num.fmt(G.res(d.id).value) + 'ז׳'
        }));
      }
      lb.appendChild(dl);
      f.appendChild(lc);

      /* --- inventory --- */
      var ids = Object.keys(s.inv).filter(function (k) { return s.inv[k] > 0; });
      ids.sort(function (a, b) { return G.res(b).value * s.inv[b] - G.res(a).value * s.inv[a]; });

      var sellAllBtn = U.button('מכור הכל', 'sm', function () {
        var got = G.Market.sellAll(s, function (id) { return !G.res(id).fuel; }, o);
        if (got > 0) G.UI.toast('🪙', 'נמכר', num.fmt(got) + ' זהב');
        game.refresh(); G.UI.refresh();
      });
      var header = el('div', 'card-actions');
      if (s.unlocks.autoSell) {
        header.appendChild(U.segmented([
          { value: 'sell', label: 'מכירה', title: 'הקשה מוכרת את כל הערימה' },
          { value: 'auto', label: '⟳ אוטומטי', title: 'הקשה מסמנת משאב למכירה אוטומטית' }
        ], s.settings.invMode || 'sell', function (v) {
          s.settings.invMode = v; G.UI.haptic(10); G.UI.refresh();
        }));
      }
      header.appendChild(sellAllBtn);

      var ic = U.card('המחסן', ids.length ? num.fmt(G.Market.inventoryValue(s, o)) + ' ז׳ בשווי' : '',
                      { right: header, tight: true });
      if (!ids.length) {
        ic.body.appendChild(U.empty('המחסן ריק. הכורה עובד — תן לו רגע.'));
      } else {
        var grid = el('div', 'inv-grid');
        var autoMode = s.unlocks.autoSell && s.settings.invMode === 'auto';
        for (i = 0; i < ids.length; i++) {
          (function (id) {
            var unit = G.Market.unitPrice(s, id, o);
            var factor = G.Market.factor(s, id);
            grid.appendChild(U.resChip(id, s.inv[id], {
              button: true,
              subtitle: num.fmtCount(s.inv[id]) + ' · ' + num.fmt(unit) + 'ז׳',
              title: (autoMode ? 'הקשה מסמנת למכירה אוטומטית' : 'הקשה מוכרת') +
                     (factor < 0.99 ? ' (מחיר שוק ' + Math.round(factor * 100) + '%)' : ''),
              selling: !!s.autoSell[id],
              onClick: function () {
                if (autoMode) {
                  s.autoSell[id] = !s.autoSell[id];
                  G.UI.haptic(14);
                  G.UI.toast(s.autoSell[id] ? '⟳' : '✋',
                             G.res(id).name,
                             s.autoSell[id] ? 'יימכר אוטומטית' : 'מכירה אוטומטית בוטלה');
                } else {
                  var got = G.Market.sell(s, id, s.inv[id], o);
                  if (got > 0) {
                    G.UI.haptic(12);
                    G.UI.toast('🪙', G.res(id).name, '+' + num.fmt(got) + ' זהב');
                  }
                }
                game.refresh(); G.UI.refresh();
              }
            }));
          })(ids[i]);
        }
        ic.body.appendChild(grid);
      }
      f.appendChild(ic);
      return f;
    }
  };

  /* Compact icon + value + caption, for at-a-glance status. */
  function statChip(icon, value, label, cls) {
    var c = el('div', 'stat-chip' + (cls ? ' ' + cls : ''));
    c.appendChild(el('span', 'stat-chip-icon', icon));
    var t = el('div');
    t.appendChild(el('b', null, value));
    t.appendChild(el('small', null, label));
    c.appendChild(t);
    return c;
  }

  function gateNote(tier) {
    for (var i = 0; i < G.STRATA.length; i++) {
      if (G.STRATA[i].gate === tier) {
        return ' · פותח את ' + G.STRATA[i].name + ' (' + num.fmtDepth(G.STRATA[i].minDepth) + ')';
      }
    }
    return '';
  }

  /* =====================================================================
     FORGE
     ===================================================================== */

  var forge = {
    id: 'forge', label: 'הכבשן', icon: '🔥',
    stageView: 'forge',
    visible: function (game) { return !!game.s.unlocks.forge; },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag(), i;

      var fuel = G.Forge.availableFuel(s);
      var slots = G.Forge.slotCount(s);

      /* The stage draws the furnaces themselves, so the panel is controls only
         — repeating four progress bars underneath a picture of four progress
         bars just costs the player screen height. */
      var busy = s.forge.jobs.length;
      var slotCard = U.card('כבשן', busy + '/' + slots + ' תאים פעילים');

      var status = el('div', 'forge-status');
      status.appendChild(statChip('🔥', num.fmt(fuel), 'דלק', fuel < 30 ? 'bad' : null));
      status.appendChild(statChip('🏭', busy + '/' + slots, 'תאים'));
      status.appendChild(statChip('⚡', '×' + num.fmt(o.forge), 'מהירות'));
      slotCard.body.appendChild(status);

      if (busy) {
        var stopAll = U.button('רוקן את הכבשן', 'sm wide', function () {
          for (var k = s.forge.jobs.length - 1; k >= 0; k--) G.Forge.cancel(s, k);
          game.refresh(); G.UI.refresh();
        });
        stopAll.style.marginTop = '8px';
        slotCard.body.appendChild(stopAll);
      } else {
        var hint = el('div', 'muted', 'הכבשן כבוי. בחר מתכון מהרשימה כדי להתחיל.');
        hint.style.cssText = 'font-size:11.5px;margin-top:8px';
        slotCard.body.appendChild(hint);
      }

      var slotCost = G.Shop.forgeSlotCost(s);
      if (isFinite(slotCost)) {
        var sb = U.button('תא נוסף — ' + goldText(slotCost), 'wide sm', function () {
          if (G.Shop.buyForgeSlot(s)) { game.refresh(); G.UI.refresh(); }
        });
        sb.disabled = s.gold < slotCost;
        sb.style.marginTop = '8px';
        slotCard.body.appendChild(sb);
      }
      f.appendChild(slotCard);

      /* --- recipes --- */
      var rc = U.card('מתכונים');
      var any = false;
      for (i = 0; i < G.RECIPES.length; i++) {
        (function (recipe) {
          if (!G.Forge.recipeUnlocked(s, recipe)) return;
          any = true;
          var out = G.res(recipe.out.id);
          var need = G.Forge.fuelCost(recipe, o);
          var can = G.Forge.canStart(s, recipe, o) && s.forge.jobs.length < slots;
          var isAuto = s.forge.auto === recipe.id;

          var inVal = 0;
          for (var k = 0; k < recipe.inputs.length; k++) {
            inVal += G.res(recipe.inputs[k].id).value * recipe.inputs[k].n;
          }
          var gain = out.value * recipe.out.n / inVal;

          var row = U.buyRow({
            icon: U.resIcon(recipe.out.id, 26),
            name: out.name,
            desc: 'פי ' + gain.toFixed(1) + ' מערך החומרים · ' +
                  num.fmtTime(recipe.time / (o.forge || 1)) + ' · שווי ' + num.fmt(out.value) + 'ז׳',
            costText: can ? 'התך' : '—',
            affordable: can,
            extra: U.costList(s, recipe.inputs, { fuel: need, fuelHave: fuel }),
            onClick: function () {
              if (G.Forge.start(s, recipe.id, o)) G.UI.haptic(12);
              game.refresh(); G.UI.refresh();
            },
            // Tappable auto-smelt. This used to be Shift+click, which simply
            // does not exist on a phone.
            toggle: s.unlocks.autoSmelt ? {
              icon: '⟳',
              label: 'אוטו',
              active: isAuto,
              title: isAuto ? 'הפסק התכה אוטומטית' : 'התך את זה שוב ושוב',
              onClick: function () {
                s.forge.auto = isAuto ? null : recipe.id;
                G.UI.haptic(14);
                G.UI.toast('⟳', isAuto ? 'הופסקה התכה אוטומטית' : 'התכה אוטומטית',
                           isAuto ? '' : out.name);
                game.refresh(); G.UI.refresh();
              }
            } : null
          });
          rc.body.appendChild(row);
        })(G.RECIPES[i]);
      }
      if (!any) rc.body.appendChild(U.empty('עדיין לא מצאת עפרות שאפשר להתיך. תמשיך לחפור.'));
      f.appendChild(rc);
      return f;
    }
  };

  /* =====================================================================
     UPGRADES + automation unlocks
     ===================================================================== */

  var upgrades = {
    id: 'upgrades', label: 'שדרוגים', icon: '📈',
    visible: function () { return true; },
    build: function (game) {
      var s = game.s, f = U.frag(), i;

      /* buy-amount selector */
      var amounts = el('div', 'buy-amounts');
      [1, 10, 25, 'max'].forEach(function (a) {
        var c = el('button', 'chip' + (s.settings.buyAmount === a ? ' chip-on' : ''),
                   a === 'max' ? 'מקס' : '×' + a);
        c.addEventListener('click', function () { s.settings.buyAmount = a; G.UI.refresh(); });
        amounts.appendChild(c);
      });

      var uc = U.card('שדרוגים', null, { right: amounts });
      var shownAny = false;
      for (i = 0; i < G.UPGRADES.length; i++) {
        (function (up) {
          var unlocked = G.Stats.condMet(s, up.unlock);
          if (!unlocked) return;
          shownAny = true;
          var lvl = G.Shop.upgradeLevel(s, up.id);
          var maxed = G.Shop.upgradeMaxed(s, up);
          var b = G.Shop.bulkCost(s, up, s.settings.buyAmount);
          var can = !maxed && b.count > 0 && s.gold >= b.cost;

          var next = maxed || b.count <= 0 ? null : G.Stats.preview(s, 'upgrade', up.id, b.count);
          var stats = el('div', 'row-stats');
          var line = readoutLine(up, game.o, next);
          if (line) stats.appendChild(line);
          var note = extraNote(up.id, game.o);
          if (note) stats.appendChild(el('div', 'row-stat muted', note));

          uc.body.appendChild(U.buyRow({
            icon: up.icon,
            name: up.name,
            level: 'רמה ' + lvl + (up.max !== undefined ? '/' + up.max : ''),
            desc: up.desc,
            extra: stats,
            costText: maxed ? null : goldText(b.cost),
            costSub: maxed ? null : (b.count > 1 ? '×' + b.count : null),
            affordable: can,
            maxed: maxed,
            onClick: function () {
              if (G.Shop.buyUpgrade(s, up.id, s.settings.buyAmount)) { game.refresh(); G.UI.refresh(); }
            }
          }));
        })(G.UPGRADES[i]);
      }
      if (!shownAny) uc.body.appendChild(U.empty('אין שדרוגים זמינים עדיין.'));
      f.appendChild(uc);

      /* one-shot unlocks */
      var vc = U.card('מתקנים', 'רכישה חד־פעמית');
      var anyUnlock = false;
      for (i = 0; i < G.UNLOCKS.length; i++) {
        (function (u) {
          if (s.unlocks[u.id]) return;
          if (!G.Shop.unlockVisible(s, u)) return;
          anyUnlock = true;
          vc.body.appendChild(U.buyRow({
            icon: u.icon, name: u.name, desc: u.desc,
            costText: goldText(u.cost),
            affordable: s.gold >= u.cost,
            onClick: function () {
              if (G.Shop.buyUnlock(s, u.id)) { game.refresh(); G.UI.refresh(); }
            }
          }));
        })(G.UNLOCKS[i]);
      }
      if (!anyUnlock) vc.body.appendChild(U.empty('רכשת את כל מה שזמין. חפור עמוק יותר כדי לפתוח עוד.'));
      f.appendChild(vc);
      return f;
    }
  };

  /* =====================================================================
     CREW
     ===================================================================== */

  var crew = {
    id: 'crew', label: 'צוות', icon: '👥',
    visible: function (game) { return !!game.s.unlocks.crew; },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag(), i;
      var maxStratum = G.Stats.maxUnlockedStratum(s);

      var head = U.card('הצוות', num.fmt(G.Mining.crewBreaksPerSec(s, o)) + ' שבירות/ש׳ סה״כ');
      head.body.appendChild(el('div', 'muted',
        'אנשי צוות כורים ברקע בשכבה שהצבת אותם בה — כך משיגים משאבים משכבות שכבר עברת.'));
      head.body.lastChild.style.cssText = 'font-size:11.5px;line-height:1.5';
      f.appendChild(head);

      for (i = 0; i < G.CREW_TYPES.length; i++) {
        (function (type) {
          if (!G.Stats.condMet(s, type.unlock)) return;
          var n = G.Shop.crewCount(s, type.id);
          var cost = G.Shop.crewCost(s, type);
          var c = U.card(type.icon + ' ' + type.name, n + ' מועסקים');

          c.body.appendChild(U.buyRow({
            icon: '➕', name: 'שכור עוד אחד',
            desc: 'תפוקה: ' + type.breaks + ' הנפות/ש׳ · עוצמה ' +
                  Math.round(type.powerShare * 100) + '% מהמכוש שלך',
            costText: goldText(cost),
            affordable: s.gold >= cost,
            onClick: function () {
              if (G.Shop.hireCrew(s, type.id)) { game.refresh(); G.UI.refresh(); }
            }
          }));

          if (n > 0) {
            var assignWrap = el('div');
            assignWrap.style.marginTop = '8px';
            assignWrap.appendChild(el('div', 'section-title', 'הצב את כולם ב־'));
            var sel = el('select');
            sel.style.cssText = 'width:100%;margin-top:6px;padding:7px 9px;background:#1d2330;' +
                                'border:1px solid #2a3140;border-radius:8px;color:inherit';
            var current = (s.crew[type.id] && s.crew[type.id][0]) || 0;
            for (var k = 0; k <= maxStratum; k++) {
              var opt = el('option', null, G.STRATA[k].name + ' (' + num.fmtDepth(G.STRATA[k].minDepth) + ')');
              opt.value = k;
              if (k === current) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.addEventListener('change', function () {
              G.Shop.assignCrew(s, type.id, parseInt(sel.value, 10));
              game.refresh(); G.UI.refresh();
            });
            assignWrap.appendChild(sel);

            var perSec = G.Mining.crewBreakRate(s, o, type, current) * n;
            assignWrap.appendChild(el('div', 'muted num',
              '≈ ' + num.fmt(perSec) + ' שבירות/ש׳ מהקבוצה הזו'));
            assignWrap.lastChild.style.cssText = 'font-size:11px;margin-top:5px';
            c.body.appendChild(assignWrap);
          }
          f.appendChild(c);
        })(G.CREW_TYPES[i]);
      }
      return f;
    }
  };

  /* =====================================================================
     CONTRACTS
     ===================================================================== */

  var contracts = {
    id: 'contracts', label: 'חוזים', icon: '📜',
    visible: function (game) { return !!game.s.unlocks.contracts; },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag();
      var c = U.card('חוזי אספקה', s.stats.contractsDone + ' הושלמו');
      var list = s.contracts.active;
      if (!list.length) {
        c.body.appendChild(U.empty('אין חוזים כרגע. כרה עוד קצת וסוחרים יגיעו.'));
      }
      for (var i = 0; i < list.length; i++) {
        (function (ct) {
          var r = G.res(ct.resId);
          var have = s.inv[ct.resId] || 0;
          var ready = have >= ct.qty;

          var box = el('div', 'contract');
          var top = el('div', 'contract-top');
          top.appendChild(el('span', 'contract-from', ct.from));
          top.appendChild(el('span', 'contract-tier', ct.tierLabel));
          box.appendChild(top);

          var ask = el('div', 'contract-ask');
          ask.appendChild(el('span', null, 'דרוש: '));
          ask.appendChild(el('b', null, num.fmtCount(ct.qty) + ' ' + r.name));
          ask.appendChild(el('span', 'muted', '  (יש לך ' + num.fmtCount(have) + ')'));
          box.appendChild(ask);
          box.appendChild(U.bar(have / ct.qty, ready ? 'ok' : ''));

          var pay = el('div', 'muted');
          pay.style.cssText = 'margin:7px 0;font-size:12px';
          pay.innerHTML = '';
          pay.appendChild(el('span', 'gold', goldText(ct.gold)));
          if (ct.cores) {
            pay.appendChild(document.createTextNode(' + '));
            pay.appendChild(el('span', 'core', ct.cores + ' 💠'));
          }
          box.appendChild(pay);

          var actions = el('div', 'contract-actions');
          var done = U.button('מסור', ready ? 'primary sm' : 'sm', function () {
            if (G.Contracts.complete(s, ct.uid, o)) {
              G.UI.toast('📜', 'חוזה הושלם', ct.from + ' שילם ' + goldText(ct.gold));
              game.refresh(); G.UI.refresh();
            }
          });
          done.disabled = !ready;
          actions.appendChild(done);
          actions.appendChild(U.button('החלף', 'sm', function () {
            G.Contracts.reroll(s, ct.uid, o); G.UI.refresh();
          }));
          box.appendChild(actions);
          c.body.appendChild(box);
        })(list[i]);
      }
      f.appendChild(c);
      return f;
    }
  };

  /* =====================================================================
     PRESTIGE
     ===================================================================== */

  var prestige = {
    id: 'prestige', label: 'התמוטטות', icon: '💠',
    visible: function (game) {
      return game.s.stats.prestiges > 0 || game.s.frontier >= G.PRESTIGE.minDepth * 0.5;
    },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag(), i;

      var gain = G.Prestige.pending(s, o);
      var can = G.Prestige.canPrestige(s) && gain > 0;

      var c = U.card('התמוטטות המכרה', 'איפוס תמורת ליבות');
      c.body.appendChild(el('div', 'muted',
        'פיצוץ מבוקר קובר את המכרה. אתה מאבד זהב, מכוש, שדרוגים ועומק — ' +
        'ומקבל ליבות סלע שנשארות איתך לנצח.'));
      c.body.lastChild.style.cssText = 'font-size:12px;line-height:1.6;margin-bottom:10px';

      var stat = el('div', 'offline-gain');
      function box(label, value, cls) {
        var d = el('div');
        d.appendChild(el('span', 'muted', label));
        d.appendChild(el('b', cls || null, value));
        return d;
      }
      stat.appendChild(box('ליבות שתקבל', num.fmt(gain), 'core'));
      stat.appendChild(box('ליבות זמינות', num.fmt(s.cores), 'core'));
      stat.appendChild(box('סה״כ ליבות', num.fmt(s.coresTotal), 'core'));
      stat.appendChild(box('בונוס עוצמה', '+' + num.fmtPct(G.PRESTIGE.perCorePower * s.coresTotal, 0)));
      c.body.appendChild(stat);

      if (!can) {
        var needed = Math.max(G.PRESTIGE.minDepth, (s.runStartDepth || 0) + 300);
        c.body.appendChild(el('div', 'muted',
          'צריך להגיע לעומק ' + num.fmtDepth(needed) + ' בריצה הזו (כרגע ' +
          num.fmtDepth(s.frontier) + ').'));
        c.body.lastChild.style.fontSize = '12px';
      } else {
        var keep = G.Prestige.keptPickTier(s, o);
        var startG = G.Prestige.startingGold(o);
        var keeps = [];
        if (keep > 0) keeps.push('מכוש ' + G.PICKAXES[keep].name);
        if (o.startDepth > 0) keeps.push('התחלה בעומק ' + num.fmtDepth(o.startDepth));
        if (startG > 0) keeps.push(goldText(startG) + ' פתיחה');
        if (o.keepRes > 0) keeps.push(num.fmtPct(o.keepRes, 0) + ' מהמשאבים');
        if (keeps.length) {
          c.body.appendChild(el('div', 'good', 'תשמור: ' + keeps.join(' · ')));
          c.body.lastChild.style.cssText = 'font-size:12px;margin-bottom:8px';
        }
        var btn = U.button('פוצץ את המכרה — +' + num.fmt(gain) + ' 💠', 'primary wide', function () {
          G.UI.confirmPrestige(gain);
        });
        c.body.appendChild(btn);
      }
      f.appendChild(c);

      /* --- talents --- */
      var tc = U.card('עץ הכישרונות', num.fmt(s.cores) + ' 💠 זמינות', {
        right: U.button('איפוס חינם', 'sm', function () {
          var back = G.Prestige.respec(s);
          G.UI.toast('💠', 'הוחזרו ' + num.fmt(back) + ' ליבות', 'בנה מחדש איך שבא לך');
          game.refresh(); G.UI.refresh();
        })
      });
      for (i = 0; i < G.TALENTS.length; i++) {
        (function (t) {
          var lvl = G.Prestige.talentLevel(s, t.id);
          var maxed = lvl >= t.max;
          var cost = G.talentCost(t, lvl);
          var nextO = maxed ? null : G.Stats.preview(s, 'talent', t.id, 1);
          var tStats = el('div', 'row-stats');
          var tLine = readoutLine(t, o, nextO);
          if (tLine) tStats.appendChild(tLine);

          tc.body.appendChild(U.buyRow({
            icon: t.icon,
            name: t.name,
            level: lvl + '/' + t.max,
            desc: t.desc,
            extra: tLine ? tStats : null,
            costText: maxed ? null : num.fmt(cost) + ' 💠',
            affordable: !maxed && s.cores >= cost,
            maxed: maxed,
            onClick: function () {
              if (G.Prestige.buyTalent(s, t.id)) { game.refresh(); G.UI.refresh(); }
            }
          }));
        })(G.TALENTS[i]);
      }
      f.appendChild(tc);
      return f;
    }
  };

  /* =====================================================================
     ACHIEVEMENTS + STATS
     ===================================================================== */

  var records = {
    id: 'records', label: 'הישגים', icon: '🏆',
    visible: function () { return true; },
    build: function (game) {
      var s = game.s, o = game.o, f = U.frag(), i;

      var done = G.Achievements.count(s);
      var ac = U.card('הישגים', done + '/' + G.ACHIEVEMENTS.length);
      var grid = el('div', 'ach-grid');
      for (i = 0; i < G.ACHIEVEMENTS.length; i++) {
        var a = G.ACHIEVEMENTS[i];
        var got = !!s.achievements[a.id];
        var box = el('div', 'ach' + (got ? ' done' : ''));
        box.appendChild(el('div', 'ach-icon', a.icon));
        box.appendChild(el('b', null, a.name));
        box.appendChild(el('small', null, a.desc));
        box.appendChild(el('small', got ? 'gold' : 'muted', G.Achievements.rewardText(a)));
        if (!got && a.prog) {
          box.appendChild(U.bar(a.prog(s) / a.goal));
        }
        grid.appendChild(box);
      }
      ac.body.appendChild(grid);
      f.appendChild(ac);

      /* --- live stats --- */
      var sc = U.card('סטטיסטיקה');
      var dl = el('dl', 'kv');
      function kv(k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
      kv('עומק נוכחי', num.fmtDepth(s.frontier));
      kv('שיא עומק אי־פעם', num.fmtDepth(s.stats.maxDepthEver));
      kv('סלעים שנשברו', num.fmtCount(s.stats.totalBreaks));
      kv('מכות קריטיות', num.fmtCount(s.stats.crits));
      kv('ממצאים נדירים', num.fmtCount(s.stats.rareFinds));
      kv('צמתים מיוחדים', num.fmtCount(s.stats.specialNodes));
      kv('פריטים שהותכו', num.fmtCount(s.stats.totalSmelted));
      kv('זהב במצטבר', num.fmt(s.stats.lifetimeGold));
      kv('זהב בריצה הזו', num.fmt(s.stats.runGold));
      kv('חוזים שהושלמו', num.fmtCount(s.stats.contractsDone));
      kv('התמוטטויות', num.fmtCount(s.stats.prestiges));
      kv('זמן משחק', num.fmtTime(s.stats.playTime));
      kv('זמן בריצה הזו', num.fmtTime(s.stats.runTime));
      sc.body.appendChild(dl);
      f.appendChild(sc);

      /* --- derived multipliers, so the player can see what upgrades did --- */
      var mc = U.card('מכפילים נוכחיים');
      var dl2 = el('dl', 'kv');
      function kv2(k, v) { dl2.appendChild(el('dt', null, k)); dl2.appendChild(el('dd', null, v)); }
      kv2('עוצמת כרייה', '×' + num.fmt(o.power));
      kv2('מהירות הנפה', '×' + num.fmt(o.speed) + ' (' + num.fmt(o.swingRate) + '/ש׳)');
      kv2('כמות משאבים', '×' + num.fmt(o.yield));
      kv2('מחירי מכירה', '×' + num.fmt(o.price));
      kv2('ערך עפרות גולמיות', '×' + num.fmt(o.orePrice));
      kv2('מהירות היתוך', '×' + num.fmt(o.forge));
      kv2('תפוקת צוות', '×' + num.fmt(o.crew));
      kv2('עומק לכל שבירה', num.fmt(G.Mining.depthPerBreak(o)) + ' מ׳');
      kv2('סיכוי נדיר', num.fmtPct(o.luck));
      kv2('סיכוי קריטי', num.fmtPct(o.crit) + ' (×' + num.fmt(o.critMult) + ')');
      kv2('יעילות לא־מקוונת', num.fmtPct(o.offline, 0) + ' · עד ' + num.fmtTime(o.offlineCap));
      mc.body.appendChild(dl2);
      f.appendChild(mc);
      return f;
    }
  };

  G.PANELS = [mine, forge, upgrades, crew, contracts, prestige, records];
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
