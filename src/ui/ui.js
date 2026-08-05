/* UI controller: top bar, tabs, ticker, toasts, modals.

   Panels are rebuilt on a timer rather than on every frame — the canvas needs
   60fps, the shop list does not, and rebuilding DOM sixty times a second is how
   idle games end up melting phones. */
(function (G) {
  'use strict';

  var U = G.UIC, num = G.num, el = U.el;

  var UI = {
    game: null,
    scene: null,
    activeTab: 'mine',
    dirty: true,
    panelTimer: 0,
    lastGoldShown: 0,
    seenTabs: {},

    init: function (game, scene) {
      this.game = game;
      this.scene = scene;
      this.buildTabs();
      this.bindTopbar();
      this.bindStation();
      this.bindEvents();
      this.refresh();
    },

    /* ---- tabs ----------------------------------------------------------- */

    buildTabs: function () {
      var nav = document.getElementById('tabs');
      U.clear(nav);
      var self = this;
      G.PANELS.forEach(function (p) {
        if (!p.visible(self.game)) return;
        var t = el('button', 'tab' + (p.id === self.activeTab ? ' active' : ''));
        t.type = 'button';
        t.appendChild(el('span', null, p.icon));
        t.appendChild(el('span', null, p.label));
        if (!self.seenTabs[p.id] && p.id !== self.activeTab) t.appendChild(el('span', 'dot'));
        t.addEventListener('click', function () {
          self.activeTab = p.id;
          self.seenTabs[p.id] = true;
          self.buildTabs();
          self.renderPanel();
        });
        nav.appendChild(t);
      });
    },

    renderPanel: function () {
      var host = document.getElementById('panels');
      var self = this;
      var panel = null;
      for (var i = 0; i < G.PANELS.length; i++) {
        if (G.PANELS[i].id === this.activeTab && G.PANELS[i].visible(this.game)) panel = G.PANELS[i];
      }
      if (!panel) { this.activeTab = 'mine'; panel = G.PANELS[0]; }

      // Preserve scroll position across the rebuild so shopping does not jump.
      var scroller = document.getElementById('panel-scroll');
      var top = scroller.scrollTop;
      U.clear(host);
      host.appendChild(panel.build(this.game));
      scroller.scrollTop = top;
    },

    refresh: function () { this.dirty = true; },

    /* ---- per-frame top bar ---------------------------------------------- */

    tick: function (dt) {
      var game = this.game, s = game.s, o = game.o;

      var rate = game.sampleGoldRate(dt);
      setText('v-gold', num.fmt(s.gold));
      setText('v-goldrate', num.fmt(rate) + '/ש׳');
      setText('v-depth', num.fmtDepth(s.frontier));
      setText('v-stratum', G.Mining.stationStratum(s).name);
      setText('v-power', num.fmt(o.hitPower));
      setText('v-rate', num.fmt(game.breakRate()) + ' שבירות/ש׳');

      var coresBox = document.getElementById('stat-cores');
      if (s.coresTotal > 0 || s.stats.prestiges > 0) {
        coresBox.hidden = false;
        setText('v-cores', num.fmt(s.cores));
      }

      this.updateGate(s);

      this.panelTimer += dt;
      if (this.dirty || this.panelTimer > 0.5) {
        this.panelTimer = 0;
        this.dirty = false;
        this.buildTabs();
        this.renderPanel();
      }
    },

    /* The wall banner. This is the single most important piece of guidance in
       the game: without it a blocked player just sees the depth number stop. */
    updateGate: function (s) {
      var banner = document.getElementById('gate-banner');
      var cap = G.Stats.depthCap(s);
      if (!isFinite(cap) || s.frontier < cap - 0.5) { banner.hidden = true; return; }

      var blockedStratum = null;
      for (var i = 0; i < G.STRATA.length; i++) {
        if (G.STRATA[i].minDepth === cap) { blockedStratum = G.STRATA[i]; break; }
      }
      if (!blockedStratum) { banner.hidden = true; return; }
      var needPick = G.PICKAXES[blockedStratum.gate];
      banner.hidden = false;
      setText('gate-title', 'מחסום ב־' + num.fmtDepth(cap));
      setText('gate-sub', 'כדי לפרוץ אל ' + blockedStratum.name + ' דרוש ' + needPick.name +
                         '. חשל אותו בלשונית "המכרה".');
    },

    /* ---- top bar controls ------------------------------------------------ */

    bindTopbar: function () {
      var self = this;
      document.getElementById('btn-settings').addEventListener('click', function () {
        self.openSettings();
      });
    },

    bindStation: function () {
      var self = this;
      var sel = document.getElementById('station-select');
      var auto = document.getElementById('btn-station-auto');

      sel.addEventListener('change', function () {
        G.Mining.setStation(self.game.s, parseInt(sel.value, 10), false);
        self.syncStation();
        self.refresh();
      });
      auto.addEventListener('click', function () {
        var s = self.game.s;
        G.Mining.setStation(s, s.station, !s.stationAuto);
        self.syncStation();
        self.refresh();
      });
      this.syncStation();
      setInterval(function () { self.syncStation(); }, 700);
    },

    syncStation: function () {
      var s = this.game.s;
      var sel = document.getElementById('station-select');
      var maxIdx = G.Stats.maxUnlockedStratum(s);

      if (sel.dataset.max !== String(maxIdx)) {
        sel.dataset.max = String(maxIdx);
        U.clear(sel);
        for (var i = 0; i <= maxIdx; i++) {
          var o = el('option', null, G.STRATA[i].name + ' · ' + num.fmtDepth(G.STRATA[i].minDepth));
          o.value = i;
          sel.appendChild(o);
        }
      }
      if (sel.value !== String(s.station)) sel.value = String(s.station);

      var auto = document.getElementById('btn-station-auto');
      auto.classList.toggle('chip-on', !!s.stationAuto);
      // With only one layer open there is nothing to choose between.
      document.getElementById('station-bar').style.display = maxIdx > 0 ? '' : 'none';
    },

    /* ---- ticker + toasts -------------------------------------------------- */

    log: function (text, cls) {
      var t = document.getElementById('ticker');
      var line = el('div', 'line' + (cls ? ' ' + cls : ''), text);
      t.appendChild(line);
      while (t.children.length > 8) t.removeChild(t.firstChild);
    },

    toast: function (icon, title, sub, cls) {
      var host = document.getElementById('toasts');
      var t = el('div', 'toast' + (cls ? ' ' + cls : ''));
      t.appendChild(el('span', 't-icon', icon));
      var body = el('div');
      body.appendChild(el('b', null, title));
      if (sub) body.appendChild(el('small', null, sub));
      t.appendChild(body);
      host.appendChild(t);
      setTimeout(function () {
        t.classList.add('out');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
      }, 3600);
      while (host.children.length > 4) host.removeChild(host.firstChild);
    },

    /* ---- modals ---------------------------------------------------------- */

    openModal: function (title, buildBody) {
      var root = document.getElementById('modal-root');
      document.getElementById('modal-title').textContent = title;
      var body = document.getElementById('modal-body');
      U.clear(body);
      buildBody(body);
      root.hidden = false;
    },

    closeModal: function () { document.getElementById('modal-root').hidden = true; },

    confirmPrestige: function (gain) {
      var self = this;
      this.openModal('לפוצץ את המכרה?', function (body) {
        body.appendChild(el('p',
          'אתה מאבד: זהב, מכוש, שדרוגים, צוות, מלאי ואת כל העומק שחפרת בריצה הזו.'));
        body.appendChild(el('p',
          'אתה מקבל: ' + num.fmt(gain) + ' ליבות סלע. כל ליבה נותנת +2% עוצמת כרייה לתמיד, ' +
          'ואפשר להוציא אותן בעץ הכישרונות.'));
        body.appendChild(el('p', 'הישגים, מתקנים שרכשת וליבות — נשארים.'));
        var actions = el('div');
        actions.style.cssText = 'display:flex;gap:8px;margin-top:14px';
        actions.appendChild(U.button('בטל', '', function () { self.closeModal(); }));
        var go = U.button('פוצץ', 'primary', function () {
          var ns = G.Prestige.doPrestige(self.game.s, self.game.o);
          if (ns) {
            self.game.s = ns;
            self.game.refresh();
            self.scene.onPrestige();
            self.activeTab = 'prestige';
            self.toast('💠', 'המכרה קרס', '+' + num.fmt(gain) + ' ליבות סלע', 'core');
            self.log('המכרה התמוטט. ' + num.fmt(gain) + ' ליבות סלע נאספו מההריסות.', 'big');
            self.refresh();
          }
          self.closeModal();
        });
        go.style.flex = '1';
        actions.appendChild(go);
        body.appendChild(actions);
      });
    },

    openSettings: function () {
      var self = this, s = this.game.s;
      this.openModal('הגדרות', function (body) {
        body.appendChild(el('h4', null, 'שמירה'));
        body.appendChild(el('p', 'המשחק נשמר אוטומטית בדפדפן כל 15 שניות.'));

        var row = el('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px';
        row.appendChild(U.button('שמור עכשיו', 'sm', function () {
          G.State.save(s); self.toast('💾', 'נשמר', '');
        }));
        row.appendChild(U.button('ייצוא', 'sm', function () {
          var ta = document.getElementById('save-io');
          ta.value = G.State.exportSave(s);
          ta.select();
        }));
        row.appendChild(U.button('ייבוא', 'sm', function () {
          var ta = document.getElementById('save-io');
          try {
            var ns = G.State.importSave(ta.value);
            self.game.s = ns;
            self.game.refresh();
            self.refresh();
            self.closeModal();
            self.toast('📥', 'נטען', 'המשחק שוחזר');
          } catch (e) {
            self.toast('⚠', 'ייבוא נכשל', 'הקוד לא תקין');
          }
        }));
        body.appendChild(row);

        var ta = el('textarea');
        ta.id = 'save-io';
        ta.placeholder = 'הדבק כאן קוד שמירה כדי לייבא, או לחץ "ייצוא".';
        body.appendChild(ta);

        body.appendChild(el('h4', null, 'איך משחקים'));
        var ul = el('ul');
        [
          'הכורה כורה לבד, תמיד. אתה מחליט מה לעשות עם מה שהוא מוצא.',
          'מוכרים משאבים בשביל זהב, מתיכים אותם בכבשן בשביל פי 3 ומשדרגים.',
          'כל שכבה חסומה במחסום שדורש מכוש מדרגה מסוימת — זה היעד הבא שלך.',
          'אפשר לחזור לשכבות רדודות (בורר "אזור עבודה") כדי לאסוף חומרים ישנים.',
          'צוות עובד ברקע בשכבה שהצבת אותו בה, גם כשאתה כורה במקום אחר.',
          'כשמגיעים מספיק עמוק — מפוצצים הכל ומתחילים מחדש חזק יותר.'
        ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
        body.appendChild(ul);

        body.appendChild(el('h4', null, 'התחלה מחדש'));
        var wipe = U.button('מחק שמירה והתחל מאפס', 'danger', function () {
          if (wipe.dataset.armed) {
            G.State.wipe();
            location.reload();
          } else {
            wipe.dataset.armed = '1';
            wipe.textContent = 'בטוח? לחץ שוב';
          }
        });
        body.appendChild(wipe);
      });
    },

    showOfflineReport: function (rep) {
      var self = this;
      if (!rep || (rep.gold <= 0 && rep.depth <= 0 && !Object.keys(rep.gained).length)) return;
      this.openModal('בזמן שלא היית', function (body) {
        body.appendChild(el('p', 'הכורה המשיך לעבוד ' + num.fmtTime(rep.creditedSeconds) +
          ' (ביעילות ' + num.fmtPct(rep.efficiency, 0) + ')' +
          (rep.capped ? ' — הגעת לתקרת הצבירה.' : '.')));

        var g = el('div', 'offline-gain');
        function box(label, value, cls) {
          var d = el('div');
          d.appendChild(el('span', 'muted', label));
          d.appendChild(el('b', cls || null, value));
          return d;
        }
        if (rep.gold > 0) g.appendChild(box('זהב', num.fmt(rep.gold), 'gold'));
        if (rep.depth > 0) g.appendChild(box('עומק', '+' + num.fmtDepth(rep.depth)));
        if (rep.breaks > 0) g.appendChild(box('סלעים', num.fmt(rep.breaks)));
        if (rep.smelted > 0) g.appendChild(box('מטילים', num.fmt(rep.smelted)));
        body.appendChild(g);

        var ids = Object.keys(rep.gained);
        if (ids.length) {
          ids.sort(function (a, b) { return G.res(b).value * rep.gained[b] - G.res(a).value * rep.gained[a]; });
          body.appendChild(el('h4', null, 'נאסף'));
          var grid = el('div', 'inv-grid');
          for (var i = 0; i < Math.min(ids.length, 12); i++) {
            grid.appendChild(U.resChip(ids[i], rep.gained[ids[i]], {
              subtitle: '+' + num.fmtCount(rep.gained[ids[i]])
            }));
          }
          body.appendChild(grid);
        }

        var ok = U.button('חזרה לעבודה', 'primary wide', function () { self.closeModal(); });
        ok.style.marginTop = '14px';
        body.appendChild(ok);
      });
    },

    /* ---- game event wiring ------------------------------------------------ */

    bindEvents: function () {
      var self = this;

      document.getElementById('modal-close').addEventListener('click', function () { self.closeModal(); });
      document.querySelector('.modal-backdrop').addEventListener('click', function () { self.closeModal(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.closeModal();
      });

      G.bus.on('achievement', function (p) {
        self.toast(p.ach.icon, 'הישג: ' + p.ach.name, G.Achievements.rewardText(p.ach), 'ach');
        self.log('🏆 ' + p.ach.name + ' — ' + G.Achievements.rewardText(p.ach), 'big');
        self.refresh();
      });

      G.bus.on('unlocked', function (p) {
        self.toast('🔓', p.name, 'נפתח מתקן חדש', 'unlock');
        self.log('נפתח: ' + p.name, 'good');
        self.seenTabs = {};
        self.refresh();
      });

      G.bus.on('pickUpgrade', function (p) {
        self.toast('⛏', p.pick.name, 'עוצמה ' + num.fmt(p.pick.power), 'ach');
        self.log('חישלת ' + p.pick.name + '!', 'big');
        self.scene.parts.flashScreen('#f2c14e', 0.35);
        self.scene.parts.kick(9);
        self.refresh();
      });

      G.bus.on('contractDone', function (p) {
        self.log('📜 ' + p.contract.from + ' שילם ' + num.fmt(p.contract.gold) + ' זהב.', 'good');
      });

      G.bus.on('stationChange', function (p) {
        var st = G.STRATA[p.station];
        self.log('הכורה עבר אל ' + st.name + '.', 'good');
      });

      /* Only the interesting breaks reach the ticker — otherwise it is noise. */
      G.bus.on('break', function (p) {
        if (p.type === 'motherlode') {
          self.log('💥 מרבץ ענק! ' + num.fmtCount(p.drop.n) + ' ' + G.res(p.drop.id).name, 'big');
        } else if (p.type === 'treasure') {
          self.log('🎁 תיבת אוצר: ' + num.fmt(p.gold) + ' זהב', 'big');
        } else if (p.drop.rare) {
          self.log('✨ ממצא נדיר: ' + num.fmtCount(p.drop.n) + ' ' + G.res(p.drop.id).name, 'rare');
        }
      });
    }
  };

  function setText(id, text) {
    var n = document.getElementById(id);
    if (n && n.textContent !== text) n.textContent = text;
  }

  G.UI = UI;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
