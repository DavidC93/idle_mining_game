/* The core loop: swing -> damage -> break -> loot -> depth.

   Everything else in the game hangs off this. It is written so a single call
   can also process a large `dt` (offline catch-up) without simulating every
   individual swing — see `bulkBreaks`. */
(function (G) {
  'use strict';

  var BAL = G.BAL, num = G.num, rng = G.rng, State = G.State;

  /* ---- node types -------------------------------------------------------- */

  var NODE_KEYS = ['normal', 'rich', 'geode', 'treasure', 'motherlode'];

  var _nodeTable = null, _nodeTableSpecial = -1;

  function nodeTable(special) {
    if (_nodeTableSpecial === special) return _nodeTable;
    var entries = [];
    for (var i = 0; i < NODE_KEYS.length; i++) {
      var k = NODE_KEYS[i], def = BAL.nodes[k];
      entries.push({ id: k, w: k === 'normal' ? def.w : def.w * special });
    }
    _nodeTable = entries;
    _nodeTableSpecial = special;
    return entries;
  }

  function pickNodeType(s) {
    return rng.pickWeighted(nodeTable(s.unlocks.seismic ? 2 : 1)).id;
  }

  /* ---- station / depth bookkeeping --------------------------------------- */

  function stationStratum(s) {
    return G.STRATA[num.clamp(s.station, 0, G.STRATA.length - 1)];
  }

  /* Keep the miner where the player expects him.

     In auto mode (the default) he always works the deepest stratum his pickaxe
     can enter. Without this the game deadlocks: the frontier stalls at a gate,
     the player forges the pickaxe that opens it, and nothing ever moves the
     miner past the barrier because only a frontier advance updated the station,
     and only a station at the frontier advances the frontier. */
  function syncStation(s) {
    var target;
    if (s.stationAuto) {
      target = G.Stats.maxUnlockedStratum(s);
    } else {
      target = num.clamp(s.station, 0, G.Stats.maxUnlockedStratum(s));
    }
    if (target !== s.station) {
      s.station = target;
      spawnRock(s);
      G.bus.emit('stationChange', { s: s, station: target });
      return true;
    }
    return false;
  }

  function setStation(s, index, auto) {
    s.stationAuto = !!auto;
    if (!auto) s.station = num.clamp(index, 0, G.Stats.maxUnlockedStratum(s));
    syncStation(s);
  }

  /* Depth the miner is physically standing at, given the chosen station. */
  function workingDepth(s) {
    var frontierStratum = G.stratumAt(s.frontier);
    if (s.station >= frontierStratum.index) return s.frontier;
    var st = stationStratum(s);
    return num.clamp(s.frontier, st.minDepth, st.maxDepth - 1);
  }

  function atFrontier(s) {
    return s.station >= G.stratumAt(s.frontier).index;
  }

  function spawnRock(s) {
    var st = stationStratum(s);
    var d = workingDepth(s);
    var type = pickNodeType(s);
    var def = BAL.nodes[type];
    var hp = G.Stats.rockHP(d, st) * def.hp;
    s.depth = d;
    s.rock = { hp: hp, maxHp: hp, type: type, seed: Math.floor(Math.random() * 1e9) };
    return s.rock;
  }

  function ensureRock(s) {
    if (!s.rock) spawnRock(s);
    return s.rock;
  }

  /* Metres gained per rock broken. Additive, not multiplicative: depth is the
     game's pacing spine, and an exponential multiplier here would let one
     upgrade line skip whole strata and wreck every other curve. */
  function depthPerBreak(o) {
    return o.depthPerBreak !== undefined ? o.depthPerBreak : (BAL.baseDepthPerBreak + o.depthFlat);
  }

  /* ---- loot -------------------------------------------------------------- */

  /* Drop weights for a stratum with the player's luck folded in.

     Luck no longer means "read from the next layer" — it means "the rarity roll
     inside this layer leans richer". The rare item of a layer starts at about
     5% of rolls and climbs with luck, so it stays a find rather than a staple. */
  var _wBuf = [];
  function weightedTable(stratum, o) {
    var boost = BAL.luckRarityBoost;
    _wBuf.length = 0;
    for (var i = 0; i < stratum.drops.length; i++) {
      var d = stratum.drops[i];
      var w = d.w;
      if (d.rarity === 'uncommon') w *= 1 + o.luck * boost.uncommon;
      else if (d.rarity === 'rare') w *= 1 + o.luck * boost.rare;
      _wBuf.push({ id: d.id, rarity: d.rarity, w: w });
    }
    return _wBuf;
  }

  /* One break's worth of loot at `stratumIdx`. Returns {id, n, rare}. */
  function rollDrop(s, o, stratumIdx, lootMult) {
    var stratum = G.STRATA[stratumIdx];
    var deeper = false;

    // A thin slice of luck still reaches into the next layer — the genuinely
    // surprising find, not the everyday one.
    if (stratumIdx + 1 < G.STRATA.length && rng.chance(o.luck * BAL.crossLayerShare)) {
      stratum = G.STRATA[stratumIdx + 1];
      deeper = true;
    }

    var table = weightedTable(stratum, o);
    if (s.rock && BAL.nodes[s.rock.type].gemBias) {
      var gems = [];
      for (var i = 0; i < table.length; i++) {
        if (G.res(table[i].id).shape === 'gem') gems.push(table[i]);
      }
      if (gems.length) table = gems;
    }

    var pickEntry = rng.pickWeighted(table);
    var qty = BAL.baseYield * o.yield * lootMult * (deeper ? 1.5 : 1);
    // Flagged rare — and shown as such — when it is a deeper-layer find or the
    // layer's own rare drop.
    var isRare = deeper || pickEntry.rarity === 'rare';
    return { id: pickEntry.id, n: rng.roll(qty), rare: isRare, deeper: deeper };
  }

  function grantDrop(s, drop) {
    if (drop.n <= 0) drop.n = 1;
    State.add(s, drop.id, drop.n);
    if (drop.rare) s.stats.rareFinds++;
  }

  /* ---- breaking ---------------------------------------------------------- */

  function breakRock(s, o, wasCrit) {
    var type = s.rock ? s.rock.type : 'normal';
    var def = BAL.nodes[type];
    var stratumIdx = stationStratum(s).index;
    var lootMult = def.loot * (wasCrit ? o.critMult : 1);

    var drop = rollDrop(s, o, stratumIdx, lootMult);
    grantDrop(s, drop);

    var goldGain = 0;
    if (def.goldBurst) {
      // Treasure pays in gold, scaled off the stratum's own resource values so
      // it stays meaningful at every depth.
      goldGain = stratumValue(stratumIdx) * def.goldBurst * o.price;
      s.gold += goldGain;
      s.stats.lifetimeGold += goldGain;
      s.stats.runGold += goldGain;
    }

    s.stats.totalBreaks++;
    if (wasCrit) s.stats.crits++;
    if (type !== 'normal') s.stats.specialNodes++;

    var advanced = 0;
    if (atFrontier(s)) {
      var cap = G.Stats.depthCap(s);
      if (s.frontier < cap) {
        advanced = depthPerBreak(o) * (type === 'motherlode' ? 3 : 1);
        s.frontier = Math.min(cap, s.frontier + advanced);
        if (s.frontier > s.stats.maxDepthEver) s.stats.maxDepthEver = s.frontier;
        // Follow the frontier into a newly opened stratum.
        var fs = G.stratumAt(s.frontier);
        if (fs.index > s.station) s.station = fs.index;
      }
    }

    G.bus.emit('break', { s: s, type: type, drop: drop, crit: wasCrit, gold: goldGain, advanced: advanced });
    spawnRock(s);
    return drop;
  }

  /* Average market value of a stratum's drop table — used for treasure payouts
     and contract pricing. */
  var _stratumValueCache = {};
  function stratumValue(idx) {
    if (_stratumValueCache[idx] !== undefined) return _stratumValueCache[idx];
    var st = G.STRATA[idx], total = 0, w = 0;
    for (var i = 0; i < st.drops.length; i++) {
      total += G.res(st.drops[i].id).value * st.drops[i].w;
      w += st.drops[i].w;
    }
    var v = total / w;
    _stratumValueCache[idx] = v;
    return v;
  }

  /* ---- per-frame tick ---------------------------------------------------- */

  /* Work budget for one tick. Past this we stop simulating rock-by-rock and
     settle statistically — same expected value, bounded cost, so a late-game
     player with thousands of swings per second still renders at 60fps. */
  var MAX_SWINGS_PER_TICK = 200;
  var MAX_BREAKS_PER_TICK = 150;

  function tick(s, dt, o) {
    syncStation(s);
    ensureRock(s);

    s.swingTimer += o.swingRate * dt;
    var swings = Math.floor(s.swingTimer);
    if (swings <= 0) {
      if (s.unlocks.drill) drillTick(s, o, dt);
      crewTick(s, o, dt);
      return;
    }
    s.swingTimer -= swings;

    var perSwing = Math.min(BAL.chainCap, Math.max(1, o.hitPower / Math.max(1e-9, s.rock.maxHp)));
    if (swings > MAX_SWINGS_PER_TICK || swings * perSwing > MAX_BREAKS_PER_TICK) {
      bulkSwings(s, o, swings);
    } else {
      for (var i = 0; i < swings; i++) doSwing(s, o);
    }

    if (s.unlocks.drill) drillTick(s, o, dt);
    crewTick(s, o, dt);
  }

  /* A swing deals hitPower damage and carries overkill into the next rock, so
     raw power never stops mattering once the player outgrows a layer — it just
     turns into "one swing, five rocks explode", which is exactly the feeling
     the upgrade was bought for. */
  function doSwing(s, o) {
    if (o.crit > 0 && rng.chance(o.crit)) { breakRock(s, o, true); return; }
    var damage = o.hitPower, chain = 0;
    while (damage > 0 && chain < BAL.chainCap) {
      if (damage >= s.rock.hp) {
        damage -= s.rock.hp;
        breakRock(s, o, false);
        chain++;
      } else {
        s.rock.hp -= damage;
        damage = 0;
      }
    }
  }

  /* Statistical settlement for ticks containing an absurd number of swings
     (offline catch-up, or a very over-levelled player farming a shallow layer).
     Same expected value, bounded cost. */
  function bulkSwings(s, o, swings) {
    var st = stationStratum(s);
    var avgHp = G.Stats.rockHP(workingDepth(s), st) * 1.2;
    var breaksPerSwing = Math.min(BAL.chainCap, o.hitPower / avgHp);
    var n = Math.floor(swings * Math.max(breaksPerSwing, 0));
    if (n <= 0) {
      s.rock.hp = Math.max(0, s.rock.hp - o.hitPower * swings);
      return;
    }
    grantBulk(s, o, st.index, n);
    if (atFrontier(s)) {
      var cap = G.Stats.depthCap(s);
      s.frontier = Math.min(cap, s.frontier + n * depthPerBreak(o));
      if (s.frontier > s.stats.maxDepthEver) s.stats.maxDepthEver = s.frontier;
      var fs = G.stratumAt(s.frontier);
      if (fs.index > s.station) s.station = fs.index;
      spawnRock(s);
    }
  }

  /* Credit `n` breaks at a stratum without spawning rocks. Used by bulk catch-up,
     crew output and offline progress. */
  function grantBulk(s, o, stratumIdx, n) {
    if (n <= 0) return;
    var stratum = G.STRATA[stratumIdx];
    var perBreak = BAL.baseYield * o.yield * (1 + o.crit * (o.critMult - 1));
    var totals = {};

    function addTable(table, count, mult) {
      var w = 0, i;
      for (i = 0; i < table.length; i++) w += table[i].w;
      for (i = 0; i < table.length; i++) {
        var q = count * (table[i].w / w) * perBreak * mult;
        totals[table[i].id] = (totals[table[i].id] || 0) + q;
      }
    }

    // Same rarity weighting as a live roll, or crew and offline loot quietly
    // pays out a different distribution than the one on screen.
    var deeperCount = n * o.luck * BAL.crossLayerShare;
    var here = weightedTable(stratum, o).slice();
    addTable(here, n - deeperCount, 1);
    if (stratumIdx + 1 < G.STRATA.length && deeperCount > 0) {
      addTable(weightedTable(G.STRATA[stratumIdx + 1], o).slice(), deeperCount, 1.5);
    }

    for (var id in totals) {
      if (totals.hasOwnProperty(id)) State.add(s, id, rng.roll(totals[id]));
    }
    s.stats.totalBreaks += n;
    s.stats.rareFinds += Math.floor(deeperCount);
    return totals;
  }

  /* The drill works the frontier even when the miner has walked back up to farm
     a shallower layer — that, not raw speed, is what it is for.

     It fights rock HP like everything else. An earlier version added metres
     directly, which turned it into a teleporter the moment swing speed grew:
     depth was the one quantity in the game with no resistance behind it. */
  var DRILL_SWING_SHARE = 0.5;
  var DRILL_POWER_SHARE = 0.3;

  function drillTick(s, o, dt) {
    var cap = G.Stats.depthCap(s);
    if (s.frontier >= cap) return;
    var stratum = G.stratumAt(s.frontier);
    var hp = G.Stats.rockHP(s.frontier, stratum);
    var perSwing = Math.min(BAL.chainCap, (o.hitPower * DRILL_POWER_SHARE) / hp);
    var breaks = DRILL_SWING_SHARE * o.swingRate * perSwing * dt;
    if (!(breaks > 0)) return;

    s.frontier = Math.min(cap, s.frontier + breaks * depthPerBreak(o));
    if (s.frontier > s.stats.maxDepthEver) s.stats.maxDepthEver = s.frontier;

    s._drillAcc = (s._drillAcc || 0) + breaks;
    if (s._drillAcc >= 1) {
      var n = Math.floor(s._drillAcc);
      s._drillAcc -= n;
      grantBulk(s, o, stratum.index, n);
    }
  }

  function crewTick(s, o, dt) {
    var acc = s._crewAcc || (s._crewAcc = {});
    for (var typeId in s.crew) {
      if (!s.crew.hasOwnProperty(typeId)) continue;
      var type = G.CREW_BY_ID[typeId];
      if (!type) continue;
      var list = s.crew[typeId];
      for (var i = 0; i < list.length; i++) {
        var stratumIdx = num.clamp(list[i], 0, G.STRATA.length - 1);
        var key = typeId + ':' + stratumIdx;
        acc[key] = (acc[key] || 0) + crewBreakRate(s, o, type, stratumIdx) * dt;
        if (acc[key] >= 1) {
          var n = Math.floor(acc[key]);
          acc[key] -= n;
          grantBulk(s, o, stratumIdx, n);
        }
      }
    }
  }

  /* How many rocks per second the player themselves manages at a given layer.
     Every other producer in the game is expressed as a fraction of this, so
     they all inherit the same brakes: rock HP, the chain cap, swing speed. */
  function playerBreakRate(s, o, stratumIdx) {
    var stratum = G.STRATA[stratumIdx];
    var depth = num.clamp(s.frontier, stratum.minDepth, stratum.maxDepth - 1);
    var hp = G.Stats.rockHP(depth, stratum);
    return o.swingRate * Math.min(BAL.chainCap, o.hitPower / hp);
  }

  /* A crew member works at a fixed fraction of the player's rate.

     They used to have their own absolute breaks-per-second, which meant a
     late-tier hire produced a hundred thousand times what the player did and
     the training multiplier was applied twice — once to their output and again
     to their power. Expressing them as a share of the player's rate makes the
     whole passive economy inherit the limits the active one already has. */
  function crewBreakRate(s, o, type, stratumIdx) {
    return playerBreakRate(s, o, stratumIdx) * type.share * o.crew;
  }

  function crewBreaksPerSec(s, o) {
    var total = 0;
    for (var typeId in s.crew) {
      if (!s.crew.hasOwnProperty(typeId)) continue;
      var type = G.CREW_BY_ID[typeId];
      if (!type) continue;
      var list = s.crew[typeId];
      for (var i = 0; i < list.length; i++) {
        total += crewBreakRate(s, o, type, num.clamp(list[i], 0, G.STRATA.length - 1));
      }
    }
    return total;
  }

  G.Mining = {
    tick: tick, doSwing: doSwing, spawnRock: spawnRock, ensureRock: ensureRock, breakRock: breakRock,
    grantBulk: grantBulk, stratumValue: stratumValue, workingDepth: workingDepth,
    stationStratum: stationStratum, atFrontier: atFrontier,
    syncStation: syncStation, setStation: setStation,
    crewBreaksPerSec: crewBreaksPerSec, crewBreakRate: crewBreakRate,
    playerBreakRate: playerBreakRate, pickNodeType: pickNodeType, depthPerBreak: depthPerBreak
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
