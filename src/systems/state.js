/* Game state: shape, creation, save/load, migration. */
(function (G) {
  'use strict';

  var SAVE_KEY = 'mineDeep.save.v1';
  var VERSION = 1;

  function newState(carry) {
    var s = {
      version: VERSION,
      gold: 0,
      cores: 0,
      coresTotal: 0,

      depth: 0,
      frontier: 0,        // deepest depth reached this run (where digging resumes)
      runStartDepth: 0,   // where this run began; prestige payout is netted against it
      station: 0,         // stratum index the miner is working
      stationAuto: true,  // follow the deepest reachable stratum automatically
      pickTier: 0,

      rock: null,         // created lazily by mining.js
      swingTimer: 0,

      inv: {},
      upgrades: {},
      unlocks: {},
      forgeSlotsBought: 0,
      forge: { jobs: [], auto: null },
      crew: {},           // typeId -> array of stratum indices
      autoSell: {},
      locked: {},         // resId -> 1 while the player has it held back from sale
      market: {},         // resId -> price factor (1 = normal)
      contracts: { active: [], nextRoll: 0 },

      talents: {},
      achievements: {},

      stats: {
        maxDepthEver: 0, totalBreaks: 0, lifetimeGold: 0, runGold: 0,
        totalSmelted: 0, rareFinds: 0, specialNodes: 0, crits: 0,
        prestiges: 0, contractsDone: 0, playTime: 0, runTime: 0,
        gathered: {}, sold: {}
      },

      settings: { sfx: true, particles: true, autoSave: true, buyAmount: 1,
                  haptics: true, invMode: 'sell' },
      log: [],
      lastTick: Date.now(),
      lastSave: Date.now(),
      startedAt: Date.now()
    };

    if (carry) {
      s.cores = carry.cores;
      s.coresTotal = carry.coresTotal;
      s.talents = carry.talents;
      s.achievements = carry.achievements;
      s.stats = carry.stats;
      s.settings = carry.settings;
      s.startedAt = carry.startedAt;
      s.unlocks = carry.unlocks;      // permanent quality-of-life stays bought
      s.autoSell = carry.autoSell;
    }
    return s;
  }

  /* ---- persistence ------------------------------------------------------ */

  /* Set by wipe(). Erasing the save is always followed by a page reload, and a
     reload fires `beforeunload` — which saves. The old save was therefore
     written straight back a moment after being deleted, and "start over" did
     nothing at all. Latching the flag here rather than unbinding the listener
     covers every save path at once: the unload handler, the visibility handler
     and the autosave timer. */
  var wiped = false;

  function save(s) {
    if (wiped) return false;
    try {
      s.lastSave = Date.now();
      s.lastTick = Date.now();
      var data = JSON.stringify(s, replacer);
      localStorage.setItem(SAVE_KEY, data);
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  /* Log lines are display-only; dropping them keeps saves small. */
  function replacer(key, value) {
    if (key === 'log' || key === 'rock') return undefined;
    return value;
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return migrate(s);
    } catch (e) {
      console.warn('load failed', e);
      return null;
    }
  }

  function migrate(s) {
    var base = newState();
    // Shallow-fill any keys added since the save was written.
    for (var k in base) {
      if (!base.hasOwnProperty(k)) continue;
      if (s[k] === undefined) s[k] = base[k];
    }
    for (var sk in base.stats) {
      if (base.stats.hasOwnProperty(sk) && s.stats[sk] === undefined) s.stats[sk] = base.stats[sk];
    }
    for (var gk in base.settings) {
      if (base.settings.hasOwnProperty(gk) && s.settings[gk] === undefined) s.settings[gk] = base.settings[gk];
    }
    if (!s.forge) s.forge = { jobs: [], auto: null };
    if (!s.forge.jobs) s.forge.jobs = [];
    if (!s.contracts) s.contracts = { active: [], nextRoll: 0 };

    /* Bring the save back under the current ceilings.

       Level and roster caps are what make total income finite. A save written
       against an older, looser table would otherwise walk straight through them
       — a level-190 sharpness or a hundred-strong crew keeps its full effect
       forever, because nothing recomputes those numbers after purchase. */
    for (var i = 0; i < G.UPGRADES.length; i++) {
      var up = G.UPGRADES[i];
      if (up.max !== undefined && s.upgrades[up.id] > up.max) s.upgrades[up.id] = up.max;
    }
    for (i = 0; i < G.CREW_TYPES.length; i++) {
      var ct = G.CREW_TYPES[i], roster = s.crew && s.crew[ct.id];
      if (ct.max !== undefined && roster && roster.length > ct.max) roster.length = ct.max;
    }
    if (s.frontier > G.BAL.bedrock) s.frontier = G.BAL.bedrock;

    s.log = [];
    s.rock = null;
    s.version = VERSION;
    return s;
  }

  function wipe() {
    wiped = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function exportSave(s) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(s, replacer))));
  }

  function importSave(text) {
    var obj = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
    return migrate(obj);
  }

  /* ---- inventory helpers ------------------------------------------------ */

  function has(s, id, n) { return (s.inv[id] || 0) >= n; }

  function add(s, id, n) {
    if (n <= 0) return;
    s.inv[id] = (s.inv[id] || 0) + n;
    s.stats.gathered[id] = (s.stats.gathered[id] || 0) + n;
  }

  function take(s, id, n) {
    if ((s.inv[id] || 0) < n) return false;
    s.inv[id] -= n;
    if (s.inv[id] < 1e-9) delete s.inv[id];
    return true;
  }

  function canAfford(s, cost) {
    if (cost.gold && s.gold < cost.gold) return false;
    if (cost.mats) {
      for (var i = 0; i < cost.mats.length; i++) {
        if (!has(s, cost.mats[i].id, cost.mats[i].n)) return false;
      }
    }
    return true;
  }

  function pay(s, cost) {
    if (!canAfford(s, cost)) return false;
    if (cost.gold) s.gold -= cost.gold;
    if (cost.mats) {
      for (var i = 0; i < cost.mats.length; i++) take(s, cost.mats[i].id, cost.mats[i].n);
    }
    return true;
  }

  G.State = {
    SAVE_KEY: SAVE_KEY, VERSION: VERSION,
    newState: newState, save: save, load: load, wipe: wipe,
    exportSave: exportSave, importSave: importSave,
    has: has, add: add, take: take, canAfford: canAfford, pay: pay
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
