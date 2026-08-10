/* Purchasing: repeatable upgrades, one-shot unlocks, forge slots, crew hires
   and pickaxe forging. */
(function (G) {
  'use strict';

  var State = G.State, num = G.num;

  /* ---- repeatable upgrades ---------------------------------------------- */

  /* The opening levels are discounted.

     A pure base·rate^n curve is right for the long run and unkind at the start:
     the very first purchase of a line costs full price while the player has
     nothing, so the first ten minutes are spent watching a number crawl toward
     one upgrade. Easing the first levels in — 40% of list price at level 0,
     back to full by level 12 — changes only the opening, leaves the exponent
     that governs pacing untouched, and keeps the curve monotonic because the
     discount only ever shrinks. */
  var EASE_LEVELS = 12, EASE_FLOOR = 0.4;

  function easeFactor(level) {
    if (level >= EASE_LEVELS) return 1;
    return EASE_FLOOR + (1 - EASE_FLOOR) * (level / EASE_LEVELS);
  }

  function upgradeCost(up, level) {
    return Math.ceil(up.base * Math.pow(up.rate, level) * easeFactor(level));
  }

  function upgradeLevel(s, id) { return s.upgrades[id] || 0; }

  function upgradeMaxed(s, up) {
    return up.max !== undefined && upgradeLevel(s, up.id) >= up.max;
  }

  /* Cost of `n` levels from `lvl`. Exact through the eased range — at most a
     dozen terms — then the closed form, which is what the rest of the curve is. */
  function sumCost(up, lvl, n) {
    var total = 0, i = 0;
    for (; i < n && lvl + i < EASE_LEVELS; i++) total += upgradeCost(up, lvl + i);
    if (i < n) total += num.geoSum(up.base, up.rate, lvl + i, n - i);
    return total;
  }

  function maxAffordable(up, lvl, gold) {
    var n = 0, spent = 0, c;
    while (lvl + n < EASE_LEVELS) {
      c = upgradeCost(up, lvl + n);
      if (spent + c > gold) return n;
      spent += c; n++;
    }
    return n + num.geoMax(up.base, up.rate, lvl + n, gold - spent);
  }

  /* Cost of the next `count` levels (count may be 'max'). */
  function bulkCost(s, up, count) {
    var lvl = upgradeLevel(s, up.id);
    if (count === 'max') {
      count = maxAffordable(up, lvl, s.gold);
      if (up.max !== undefined) count = Math.min(count, up.max - lvl);
      if (count <= 0) return { count: 0, cost: Infinity };
    } else if (up.max !== undefined) {
      count = Math.min(count, up.max - lvl);
      if (count <= 0) return { count: 0, cost: Infinity };
    }
    return { count: count, cost: Math.ceil(sumCost(up, lvl, count)) };
  }

  function buyUpgrade(s, id, count) {
    var up = G.UPGRADE_BY_ID[id];
    if (!up || !G.Stats.condMet(s, up.unlock)) return false;
    var b = bulkCost(s, up, count === undefined ? 1 : count);
    if (b.count <= 0 || s.gold < b.cost) return false;
    s.gold -= b.cost;
    s.upgrades[id] = upgradeLevel(s, id) + b.count;
    G.bus.emit('buy', { s: s, kind: 'upgrade', id: id, count: b.count, cost: b.cost });
    return true;
  }

  /* ---- one-shot unlocks -------------------------------------------------- */

  function unlockVisible(s, u) {
    return G.Stats.condMet(s, u.unlock);
  }

  function buyUnlock(s, id) {
    var u = G.UNLOCK_BY_ID[id];
    if (!u || s.unlocks[id] || !unlockVisible(s, u) || s.gold < u.cost) return false;
    s.gold -= u.cost;
    s.unlocks[id] = true;
    G.bus.emit('buy', { s: s, kind: 'unlock', id: id, cost: u.cost });
    G.bus.emit('unlocked', { s: s, id: id, name: u.name });
    return true;
  }

  /* ---- forge slots ------------------------------------------------------- */

  function forgeSlotCost(s) {
    var n = (s.forgeSlotsBought || 0) + 1;
    return n < G.FORGE_SLOTS.length ? G.FORGE_SLOTS[n] : Infinity;
  }

  function buyForgeSlot(s) {
    var c = forgeSlotCost(s);
    if (!isFinite(c) || s.gold < c) return false;
    s.gold -= c;
    s.forgeSlotsBought = (s.forgeSlotsBought || 0) + 1;
    G.bus.emit('buy', { s: s, kind: 'forgeSlot', cost: c });
    return true;
  }

  /* ---- crew -------------------------------------------------------------- */

  function crewCount(s, typeId) { return (s.crew[typeId] || []).length; }

  /* A full roster is a real ceiling, not a soft one — see the note on `max` in
     data/upgrades.js. Returning Infinity keeps every caller that only compares
     against gold (the shop rows, the sim's agent) correct without special cases. */
  function crewFull(s, type) {
    return type.max !== undefined && crewCount(s, type.id) >= type.max;
  }

  function crewCost(s, type) {
    if (crewFull(s, type)) return Infinity;
    return Math.ceil(type.base * Math.pow(type.rate, crewCount(s, type.id)));
  }

  function hireCrew(s, typeId, stratumIdx) {
    var type = G.CREW_BY_ID[typeId];
    if (!type || !s.unlocks.crew || !G.Stats.condMet(s, type.unlock)) return false;
    if (crewFull(s, type)) return false;
    var cost = crewCost(s, type);
    if (s.gold < cost) return false;
    s.gold -= cost;
    if (!s.crew[typeId]) s.crew[typeId] = [];
    var target = stratumIdx === undefined ? G.Stats.maxUnlockedStratum(s) : stratumIdx;
    s.crew[typeId].push(num.clamp(target, 0, G.Stats.maxUnlockedStratum(s)));
    G.bus.emit('buy', { s: s, kind: 'crew', id: typeId, cost: cost });
    return true;
  }

  /* Move every crew member of a type to a stratum — the UI never asks the
     player to place workers one at a time. */
  function assignCrew(s, typeId, stratumIdx) {
    var list = s.crew[typeId];
    if (!list) return false;
    var target = num.clamp(stratumIdx, 0, G.Stats.maxUnlockedStratum(s));
    for (var i = 0; i < list.length; i++) list[i] = target;
    return true;
  }

  /* ---- pickaxes ---------------------------------------------------------- */

  function nextPick(s) {
    return s.pickTier + 1 < G.PICKAXES.length ? G.PICKAXES[s.pickTier + 1] : null;
  }

  function forgePick(s) {
    var p = nextPick(s);
    if (!p || !State.canAfford(s, p.cost)) return false;
    State.pay(s, p.cost);
    s.pickTier++;
    G.bus.emit('pickUpgrade', { s: s, pick: p });
    return true;
  }

  G.Shop = {
    upgradeCost: upgradeCost, upgradeLevel: upgradeLevel, upgradeMaxed: upgradeMaxed,
    bulkCost: bulkCost, buyUpgrade: buyUpgrade,
    unlockVisible: unlockVisible, buyUnlock: buyUnlock,
    forgeSlotCost: forgeSlotCost, buyForgeSlot: buyForgeSlot,
    crewCount: crewCount, crewCost: crewCost, crewFull: crewFull,
    hireCrew: hireCrew, assignCrew: assignCrew,
    nextPick: nextPick, forgePick: forgePick
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
