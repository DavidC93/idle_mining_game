/* Supply contracts — the short-horizon goal layer.

   Each contract asks for a quantity of something the player can actually reach
   right now, priced off live market value so the reward stays meaningful at
   every stage of the game. */
(function (G) {
  'use strict';

  var State = G.State, rng = G.rng, num = G.num;

  /* Resources the player has actually produced — the only fair thing to ask for. */
  function candidateResources(s) {
    var out = [];
    for (var id in s.stats.gathered) {
      if (!s.stats.gathered.hasOwnProperty(id)) continue;
      if (s.stats.gathered[id] < 10) continue;
      out.push(id);
    }
    // Bias toward the good stuff: sort by value, keep the top two thirds.
    out.sort(function (a, b) { return G.res(a).value - G.res(b).value; });
    if (out.length > 6) out = out.slice(Math.floor(out.length / 3));
    return out;
  }

  function make(s, o) {
    var pool = candidateResources(s);
    if (!pool.length) return null;

    var tier = G.CONTRACT_TIERS[Math.min(
      G.CONTRACT_TIERS.length - 1,
      Math.floor(Math.random() * (s.stats.prestiges > 0 ? 4 : 3))
    )];
    var id = pool[Math.floor(Math.random() * pool.length)];
    var r = G.res(id);

    // Quantity is anchored to production rate, not to a flat number, so a
    // contract is always "a few minutes of work" rather than trivial or absurd.
    var producedPerMin = Math.max(1, (s.stats.gathered[id] || 0) / Math.max(1, s.stats.runTime / 60));
    var qty = Math.max(5, Math.ceil(producedPerMin * tier.qtyMult / 10));
    qty = Math.min(qty, 5e6);

    var pay = r.value * qty * tier.payMult * o.price;
    return {
      uid: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36),
      from: G.CONTRACT_FLAVOR[Math.floor(Math.random() * G.CONTRACT_FLAVOR.length)],
      tier: tier.id, tierLabel: tier.label,
      resId: id, qty: qty, gold: pay, cores: tier.cores,
      created: Date.now()
    };
  }

  function refill(s, o) {
    if (!s.unlocks.contracts) return;
    while (s.contracts.active.length < G.CONTRACT_SLOTS) {
      var c = make(s, o);
      if (!c) return;
      s.contracts.active.push(c);
    }
  }

  function canComplete(s, c) { return (s.inv[c.resId] || 0) >= c.qty; }

  function complete(s, uid, o) {
    var idx = -1, i;
    for (i = 0; i < s.contracts.active.length; i++) {
      if (s.contracts.active[i].uid === uid) { idx = i; break; }
    }
    if (idx < 0) return false;
    var c = s.contracts.active[idx];
    if (!canComplete(s, c)) return false;

    State.take(s, c.resId, c.qty);
    s.gold += c.gold;
    s.stats.lifetimeGold += c.gold;
    s.stats.runGold += c.gold;
    if (c.cores) { s.cores += c.cores; s.coresTotal += c.cores; }
    s.stats.contractsDone++;
    s.contracts.active.splice(idx, 1);
    G.bus.emit('contractDone', { s: s, contract: c });
    refill(s, o);
    return true;
  }

  /* Discard one you do not want; a fresh one rolls in its place. */
  function reroll(s, uid, o) {
    for (var i = 0; i < s.contracts.active.length; i++) {
      if (s.contracts.active[i].uid === uid) {
        s.contracts.active.splice(i, 1);
        refill(s, o);
        return true;
      }
    }
    return false;
  }

  function tick(s, dt, o) {
    if (!s.unlocks.contracts) return;
    if (s.contracts.active.length < G.CONTRACT_SLOTS) refill(s, o);
  }

  G.Contracts = {
    make: make, refill: refill, canComplete: canComplete, complete: complete,
    reroll: reroll, tick: tick
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
