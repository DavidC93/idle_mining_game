/* The market. Prices sag when you dump a lot of one thing and recover over
   time, which gives the sell screen an actual decision: spread your sales, or
   accept a haircut to cash out now. */
(function (G) {
  'use strict';

  var State = G.State, BAL = G.BAL, num = G.num;

  function factor(s, id) {
    var f = s.market[id];
    return f === undefined ? 1 : f;
  }

  function unitPrice(s, id, o) {
    var r = G.res(id);
    if (!r) return 0;
    var p = r.value * o.price * factor(s, id);
    if (!r.crafted) p *= o.orePrice;
    return p;
  }

  /* A locked resource is never sold, by any route.

     Enforced here rather than at each button, because "sell" has four callers —
     the inventory chip, sell-all, the auto-seller and the headless tools — and
     a lock the player set is worthless if any one of them forgets to ask. */
  function locked(s, id) {
    return !!(s.locked && s.locked[id]);
  }

  function setLocked(s, id, on) {
    if (!s.locked) s.locked = {};
    if (on) s.locked[id] = 1; else delete s.locked[id];
    return locked(s, id);
  }

  function toggleLock(s, id) {
    return setLocked(s, id, !locked(s, id));
  }

  function sell(s, id, qty, o) {
    if (locked(s, id)) return 0;
    qty = Math.min(qty, s.inv[id] || 0);
    if (qty <= 0) return 0;
    var gross = 0;
    var f = factor(s, id);
    var r = G.res(id);
    var base = r.value * o.price * (r.crafted ? 1 : o.orePrice);

    // Integrate the price decay across the sale instead of charging the
    // pre-sale price for every unit — dumping 10k ore should feel different
    // from selling 10 ore a thousand times.
    var impact = BAL.market.impactPerSale;
    var fEnd = Math.max(BAL.market.minPrice, f - impact * qty);
    var avg = (f + fEnd) / 2;
    gross = base * qty * avg;

    State.take(s, id, qty);
    s.market[id] = fEnd;
    s.gold += gross;
    s.stats.lifetimeGold += gross;
    s.stats.runGold += gross;
    s.stats.sold[id] = (s.stats.sold[id] || 0) + qty;
    G.bus.emit('sell', { s: s, id: id, qty: qty, gold: gross });
    return gross;
  }

  function sellAll(s, filter, o) {
    var total = 0;
    for (var id in s.inv) {
      if (!s.inv.hasOwnProperty(id)) continue;
      if (filter && !filter(id)) continue;
      total += sell(s, id, s.inv[id], o);
    }
    return total;
  }

  function tick(s, dt) {
    var rec = BAL.market.recoverPerSec * dt;
    for (var id in s.market) {
      if (!s.market.hasOwnProperty(id)) continue;
      if (s.market[id] >= 1) { delete s.market[id]; continue; }
      s.market[id] = Math.min(1, s.market[id] + rec);
    }
  }

  function autoSellTick(s, o) {
    if (!s.unlocks.autoSell) return 0;
    var total = 0;
    for (var id in s.autoSell) {
      if (!s.autoSell.hasOwnProperty(id) || !s.autoSell[id]) continue;
      var have = s.inv[id] || 0;
      if (have > 0) total += sell(s, id, have, o);
    }
    return total;
  }

  /* Total liquidation value of the current inventory — used by the prestige
     screen, where locks are beside the point because a reset takes everything. */
  function inventoryValue(s, o) {
    var total = 0;
    for (var id in s.inv) {
      if (!s.inv.hasOwnProperty(id)) continue;
      total += unitPrice(s, id, o) * s.inv[id];
    }
    return total;
  }

  /* What the warehouse would actually pay out right now. Anything the player
     has locked is not for sale, so quoting it as "worth X" would be a lie the
     next tap on "sell everything" immediately exposes. */
  function sellableValue(s, o) {
    var total = 0;
    for (var id in s.inv) {
      if (!s.inv.hasOwnProperty(id) || locked(s, id)) continue;
      total += unitPrice(s, id, o) * s.inv[id];
    }
    return total;
  }

  G.Market = {
    unitPrice: unitPrice, sell: sell, sellAll: sellAll, tick: tick,
    autoSellTick: autoSellTick, inventoryValue: inventoryValue,
    sellableValue: sellableValue, factor: factor,
    locked: locked, setLocked: setLocked, toggleLock: toggleLock
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
