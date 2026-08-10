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

    init: function (game, stage) {
      this.game = game;
      this.stage = stage;
      this.scene = stage.mine();
      // Whatever is already open on load is not "new" — otherwise every tab
      // wears an attention dot from the first frame and the dot means nothing.
      for (var i = 0; i < G.PANELS.length; i++) {
        if (G.PANELS[i].visible(game)) this.seenTabs[G.PANELS[i].id] = true;
      }
      this.buildTabs();
      this.bindTopbar();
      this.bindStation();
      this.bindEvents();
      this.refresh();
    },

    /* ---- tabs ----------------------------------------------------------- */

    /* Rebuild the tab strip only when its contents actually change.

       Rebuilding on a timer destroyed and recreated every tab button twice a
       second. A normal-speed click holds the mouse down for 150-400ms, so the
       button the user pressed was usually gone by the time they released and
       no click event ever fired — three out of four tab clicks were silently
       swallowed. */
    /* How many tabs fit on one row before the rest go behind "עוד".

       Seven tabs wrapped to three rows and ate a quarter of a phone screen —
       the panel underneath is where the actual information is. One row, always,
       with the overflow one tap away. */
    tabSlots: function () {
      var w = document.getElementById('side').clientWidth || window.innerWidth;
      return num.clamp(Math.floor(w / 78), 3, 7);
    },

    /* Which panels sit on the bar. Order is fixed so the bar never reshuffles
       under the player's thumb, except that the active panel is always on it. */
    splitTabs: function (visible) {
      var slots = this.tabSlots();
      if (visible.length <= slots) return { bar: visible, more: [] };

      var bar = visible.slice(0, slots - 1);      // last slot is the More button
      var more = visible.slice(slots - 1);
      var self = this;
      var activeInMore = more.filter(function (p) { return p.id === self.activeTab; })[0];
      if (activeInMore) {
        // Swap the active panel onto the bar so you can always see where you are.
        more = more.filter(function (p) { return p !== activeInMore; });
        more.unshift(bar[bar.length - 1]);
        bar[bar.length - 1] = activeInMore;
      }
      return { bar: bar, more: more };
    },

    buildTabs: function (force) {
      var self = this;
      var visible = G.PANELS.filter(function (p) { return p.visible(self.game); });
      var split = this.splitTabs(visible);
      var moreNew = split.more.some(function (p) { return !self.seenTabs[p.id]; });

      var sig = split.bar.map(function (p) {
        return p.id + (p.id === self.activeTab ? '*' : '') + (self.seenTabs[p.id] ? '' : '!');
      }).join('|') + '#' + split.more.length + (moreNew ? '!' : '');
      if (!force && sig === this.tabSig) return;
      this.tabSig = sig;

      var nav = document.getElementById('tabs');
      U.clear(nav);
      split.bar.forEach(function (p) { nav.appendChild(self.tabButton(p)); });

      if (split.more.length) {
        var m = el('button', 'tab tab-more');
        m.type = 'button';
        m.dataset.panel = '__more';
        m.appendChild(el('span', null, '⋯'));
        m.appendChild(el('span', null, 'עוד'));
        if (moreNew) m.appendChild(el('span', 'dot'));
        m.addEventListener('click', function () { self.haptic(10); self.openMore(split.more); });
        nav.appendChild(m);
      }
    },

    tabButton: function (p) {
      var self = this;
      var t = el('button', 'tab' + (p.id === this.activeTab ? ' active' : ''));
      t.type = 'button';
      t.dataset.panel = p.id;
      t.appendChild(el('span', null, p.icon));
      t.appendChild(el('span', null, p.label));
      if (!this.seenTabs[p.id] && p.id !== this.activeTab) t.appendChild(el('span', 'dot'));
      t.addEventListener('click', function () { self.selectTab(p.id); });
      return t;
    },

    selectTab: function (id) {
      this.activeTab = id;
      this.seenTabs[id] = true;
      this.haptic(10);
      this.closeMore();
      this.applyStageView();
      this.buildTabs(true);
      this.renderPanel();
    },

    /* ---- overflow sheet -------------------------------------------------- */

    openMore: function (panels) {
      var self = this;
      var sheet = document.getElementById('more-sheet');
      var list = document.getElementById('more-list');
      U.clear(list);
      panels.forEach(function (p) {
        var b = el('button', 'more-item' + (p.id === self.activeTab ? ' active' : ''));
        b.type = 'button';
        b.dataset.panel = p.id;
        b.appendChild(el('span', 'more-icon', p.icon));
        b.appendChild(el('b', null, p.label));
        if (!self.seenTabs[p.id]) b.appendChild(el('span', 'dot'));
        b.addEventListener('click', function () { self.selectTab(p.id); });
        list.appendChild(b);
      });
      sheet.hidden = false;
    },

    closeMore: function () {
      var sheet = document.getElementById('more-sheet');
      if (sheet) sheet.hidden = true;
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
      /* A panel can ask to fit instead of scroll; the mine screen does, because
         it is the one the player watches and it should never move under a
         thumb. Below a usable height — a short landscape phone, a small desktop
         window — fitting would mean clipping, so scrolling comes back rather
         than the content going missing. The threshold is the fitted layout's
         own minimum: two action tiles, a card header and two rows of chips. */
      var fits = !!panel.noScroll && scroller.clientHeight >= 240;
      scroller.classList.toggle('no-scroll', fits);
      U.clear(host);
      host.appendChild(panel.build(this.game));
      scroller.scrollTop = fits ? 0 : top;
    },

    refresh: function () { this.dirty = true; },

    /* A panel with a `stageView` takes over the main view when selected.
       Everything else falls back to the mine. */
    applyStageView: function () {
      var want = 'mine';
      for (var i = 0; i < G.PANELS.length; i++) {
        var p = G.PANELS[i];
        if (p.id === this.activeTab && p.stageView && p.visible(this.game)) want = p.stageView;
      }
      if (!this.stage.has(want)) want = 'mine';
      this.stage.set(want);
      this.syncStageChrome();
    },

    /* Overlay controls belong to the mine; hide them when the stage is showing
       something else, and name whatever has taken over. */
    syncStageChrome: function () {
      var onMine = this.stage.view === 'mine';
      var title = document.getElementById('stage-title');
      document.getElementById('station-bar').hidden = !onMine;
      if (!onMine) document.getElementById('gate-banner').hidden = true;

      document.getElementById('ticker').hidden = !onMine;
      if (onMine) { title.hidden = true; return; }
      var panel = null;
      for (var i = 0; i < G.PANELS.length; i++) {
        if (G.PANELS[i].stageView === this.stage.view) panel = G.PANELS[i];
      }
      title.hidden = false;
      document.getElementById('stage-title-icon').textContent = panel ? panel.icon : '•';
      document.getElementById('stage-title-text').textContent = panel ? panel.label : '';
    },

    /* Short buzz on meaningful taps. Silently absent on desktop and on iOS
       Safari, which is fine — it is reinforcement, never information. */
    haptic: function (ms) {
      if (!this.game || !this.game.s.settings.haptics) return;
      if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) { /* ignore */ } }
    },

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
        if (this.busy()) {
          // Held for later: rebuilding now would yank the control out from
          // under the user's finger.
          this.dirty = true;
        } else {
            this.panelTimer = 0;
          this.dirty = false;
          this.buildTabs();
          this.renderPanel();
          this.refreshModal();
          this.applyStageView();
        }
      }
    },

    /* True while the user is mid-interaction with the panel. Rebuilding then
       is what makes clicks disappear: the pressed element is replaced before
       the pointer comes back up, and an open <select> closes instantly. */
    busy: function () {
      if (this.pointerDown) return true;
      var a = document.activeElement;
      if (a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {
        var side = document.getElementById('side');
        var modal = document.getElementById('modal-root');
        if (side && side.contains(a)) return true;
        if (modal && !modal.hidden && modal.contains(a)) return true;
      }
      return false;
    },

    /* The wall banner. This is the single most important piece of guidance in
       the game: without it a blocked player just sees the depth number stop. */
    updateGate: function (s) {
      var banner = document.getElementById('gate-banner');
      if (this.stage.view !== 'mine') { banner.hidden = true; return; }
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
                         '. חשל אותו בכפתור "המכוש".');
    },

    /* ---- top bar controls ------------------------------------------------ */

    bindTopbar: function () {
      var self = this;
      document.getElementById('btn-settings').addEventListener('click', function () {
        self.openSettings();
      });

      /* Pointer-down anywhere in the panel column pauses rebuilds until the
         pointer comes back up, so a press always reaches the element it
         started on. The timeout is a safety net for a pointerup that never
         arrives (dragged out of the window, lost capture). */
      function holdRebuilds() {
        self.pointerDown = true;
        clearTimeout(self._pdTimer);
        self._pdTimer = setTimeout(function () { self.pointerDown = false; }, 4000);
      }
      document.getElementById('side').addEventListener('pointerdown', holdRebuilds, true);
      // The modal is a live surface too now, so it needs the same protection.
      document.getElementById('modal-root').addEventListener('pointerdown', holdRebuilds, true);

      function release() {
        if (!self.pointerDown) return;
        self.pointerDown = false;
        clearTimeout(self._pdTimer);
        self.refresh();
      }
      window.addEventListener('resize', function () {
        self.tabSig = null;      // slot count may have changed
        self.refresh();
      });
      document.getElementById('more-close').addEventListener('click', function () { self.closeMore(); });
      document.querySelector('#more-sheet .more-backdrop')
        .addEventListener('click', function () { self.closeMore(); });

      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
      window.addEventListener('blur', release);

      /* Touch hardening.
         - iOS fires a synthetic double-tap zoom unless gestures are cancelled.
         - Pull-to-refresh at the top of the panel list reloads the game, which
           reads as "my progress vanished" even though the save survives. */
      document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
      document.addEventListener('dblclick', function (e) { e.preventDefault(); });
      document.body.addEventListener('touchmove', function (e) {
        if (e.touches.length > 1) e.preventDefault();     // pinch zoom
      }, { passive: false });

      /* Buzz on every successful purchase, wherever it came from. */
      G.bus.on('buy', function () { self.haptic(12); });
      G.bus.on('pickUpgrade', function () { self.haptic(30); });
      G.bus.on('achievement', function () { self.haptic(24); });
      G.bus.on('prestige', function () { self.haptic(60); });
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
      document.getElementById('station-bar').style.display =
        (maxIdx > 0 && this.stage.view === 'mine') ? '' : 'none';
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
      // The mine stage is a narrow strip on phones; more than a couple of
      // toasts and the player cannot see the thing the toasts are about.
      var maxToasts = window.innerWidth < 900 ? 2 : 4;
      while (host.children.length > maxToasts) host.removeChild(host.firstChild);
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

    /* A modal whose contents keep up with the game.

       The warehouse and the pickaxe both live in modals now, and both show
       numbers that the act of using them changes: sell a stack and its chip
       should go, forge a pickaxe and the next tier should appear. Remembering
       the builder lets the normal refresh cycle rebuild the open modal exactly
       the way it rebuilds a panel — including the mid-press guard, so a rebuild
       never yanks a button out from under a finger. */
    openLiveModal: function (title, buildBody) {
      this.liveModal = { title: title, build: buildBody };
      this.openModal(title, buildBody);
    },

    refreshModal: function () {
      if (!this.liveModal) return;
      var root = document.getElementById('modal-root');
      if (root.hidden) { this.liveModal = null; return; }
      var body = document.getElementById('modal-body');
      var top = body.scrollTop;
      U.clear(body);
      this.liveModal.build(body);
      body.scrollTop = top;
    },

    closeModal: function () {
      this.liveModal = null;
      document.getElementById('modal-root').hidden = true;
    },

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
            G.Stage.mine().onPrestige();
            self.stage.set('mine');
            self.syncStageChrome();
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

        body.appendChild(el('h4', null, 'מגע'));
        var hap = U.button(
          (s.settings.haptics ? '✅' : '⬜') + ' רטט במגע', 'sm', function () {
            s.settings.haptics = !s.settings.haptics;
            if (s.settings.haptics) self.haptic(20);
            self.closeModal(); self.openSettings();
          });
        hap.style.marginBottom = '12px';
        body.appendChild(hap);

        body.appendChild(el('h4', null, 'איך משחקים'));
        var ul = el('ul');
        [
          'הכורה כורה לבד, תמיד. אתה מחליט מה לעשות עם מה שהוא מוצא.',
          'מוכרים משאבים בשביל זהב, מתיכים אותם בכבשן בשביל פי 3 ומשדרגים.',
          'כל שכבה חסומה במחסום שדורש מכוש מדרגה מסוימת — זה היעד הבא שלך.',
          'אפשר לחזור לשכבות רדודות (בורר "אזור עבודה") כדי לאסוף חומרים ישנים.',
          'צוות עובד ברקע בשכבה שהצבת אותו בה, גם כשאתה כורה במקום אחר.',
          'כפתור ⟳ ליד מתכון = התכה אוטומטית. במחסן יש מתג "מכירה / אוטומטי".',
          'לחיצה על תצוגת המכרה = הנפה נוספת ביד.',
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
        if (e.key === 'Escape') { self.closeModal(); self.closeMore(); }
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
        G.Stage.mine().parts.flashScreen('#f2c14e', 0.35);
        G.Stage.mine().parts.kick(9);
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
