/* The forge: turns ore into ingots worth ~3x their inputs.

   Slots run in parallel and each holds one job. Fuel is a shared pool drawn
   from any burnable resource, cheapest first, so the player never has to
   micro-manage which fuel to use. */
(function (G) {
  'use strict';

  var State = G.State, BAL = G.BAL;

  function slotCount(s) { return 1 + (s.forgeSlotsBought || 0); }

  function fuelSources() {
    var out = [];
    for (var i = 0; i < G.RESOURCES.length; i++) {
      if (G.RESOURCES[i].fuel) out.push(G.RESOURCES[i]);
    }
    out.sort(function (a, b) { return a.fuel - b.fuel; });
    return out;
  }
  var FUELS = null;

  function availableFuel(s) {
    if (!FUELS) FUELS = fuelSources();
    var total = 0;
    for (var i = 0; i < FUELS.length; i++) total += (s.inv[FUELS[i].id] || 0) * FUELS[i].fuel;
    return total;
  }

  function burnFuel(s, amount) {
    if (!FUELS) FUELS = fuelSources();
    if (availableFuel(s) < amount - 1e-9) return false;
    for (var i = 0; i < FUELS.length && amount > 1e-9; i++) {
      var f = FUELS[i], have = s.inv[f.id] || 0;
      if (have <= 0) continue;
      var need = Math.min(have, Math.ceil(amount / f.fuel));
      State.take(s, f.id, need);
      amount -= need * f.fuel;
    }
    return true;
  }

  function fuelCost(recipe, o) {
    return Math.max(1, Math.ceil(recipe.fuel * o.fuel));
  }

  function canStart(s, recipe, o) {
    for (var i = 0; i < recipe.inputs.length; i++) {
      if (!State.has(s, recipe.inputs[i].id, recipe.inputs[i].n)) return false;
    }
    return availableFuel(s) >= fuelCost(recipe, o);
  }

  function recipeUnlocked(s, recipe) {
    // Visible once you have ever seen one of its inputs — the forge menu grows
    // as the mine does instead of dumping 16 recipes on a new player.
    for (var i = 0; i < recipe.inputs.length; i++) {
      if ((s.stats.gathered[recipe.inputs[i].id] || 0) > 0) return true;
    }
    return false;
  }

  function start(s, recipeId, o) {
    var recipe = G.RECIPE_BY_ID[recipeId];
    if (!recipe) return false;
    if (s.forge.jobs.length >= slotCount(s)) return false;
    if (!canStart(s, recipe, o)) return false;
    for (var i = 0; i < recipe.inputs.length; i++) State.take(s, recipe.inputs[i].id, recipe.inputs[i].n);
    burnFuel(s, fuelCost(recipe, o));
    s.forge.jobs.push({ id: recipeId, t: 0, dur: recipe.time });
    G.bus.emit('forgeStart', { s: s, recipe: recipe });
    return true;
  }

  function cancel(s, index) {
    var job = s.forge.jobs[index];
    if (!job) return false;
    // Refund inputs but not the fuel — heat, once spent, is spent.
    var recipe = G.RECIPE_BY_ID[job.id];
    for (var i = 0; i < recipe.inputs.length; i++) State.add(s, recipe.inputs[i].id, recipe.inputs[i].n);
    s.forge.jobs.splice(index, 1);
    return true;
  }

  function tick(s, dt, o) {
    if (!s.unlocks.forge) return;
    var speed = BAL.forge.baseSpeed * o.forge;
    for (var i = s.forge.jobs.length - 1; i >= 0; i--) {
      var job = s.forge.jobs[i];
      job.t += dt * speed;
      if (job.t >= job.dur) {
        var recipe = G.RECIPE_BY_ID[job.id];
        var n = recipe.out.n * (o.forgeOutput || 1);
        State.add(s, recipe.out.id, n);
        s.stats.totalSmelted += n;
        s.forge.jobs.splice(i, 1);
        G.bus.emit('forgeDone', { s: s, recipe: recipe, n: n });
      }
    }
    if (s.unlocks.autoSmelt && s.forge.auto) {
      var guard = 0;
      while (s.forge.jobs.length < slotCount(s) && guard++ < 8) {
        if (!start(s, s.forge.auto, o)) break;
      }
    }
  }

  /* Offline forge output. Rather than replaying jobs one by one we compute how
     many full cycles the elapsed time allows, bounded by input stock. */
  function catchUp(s, seconds, o) {
    if (!s.unlocks.forge || !s.unlocks.autoSmelt || !s.forge.auto) return 0;
    var recipe = G.RECIPE_BY_ID[s.forge.auto];
    if (!recipe) return 0;
    var speed = BAL.forge.baseSpeed * o.forge;
    var cycles = Math.floor(seconds * speed / recipe.time) * slotCount(s);
    if (cycles <= 0) return 0;

    // Cap by whatever the inventory can actually feed.
    var i;
    for (i = 0; i < recipe.inputs.length; i++) {
      cycles = Math.min(cycles, Math.floor((s.inv[recipe.inputs[i].id] || 0) / recipe.inputs[i].n));
    }
    var perFuel = fuelCost(recipe, o);
    cycles = Math.min(cycles, Math.floor(availableFuel(s) / perFuel));
    if (cycles <= 0) return 0;

    for (i = 0; i < recipe.inputs.length; i++) State.take(s, recipe.inputs[i].id, recipe.inputs[i].n * cycles);
    burnFuel(s, perFuel * cycles);
    var made = recipe.out.n * cycles * (o.forgeOutput || 1);
    State.add(s, recipe.out.id, made);
    s.stats.totalSmelted += made;
    return made;
  }

  /* Fuel depot: buys coal with gold when the pool runs dry. */
  function depotTick(s, o) {
    if (!s.unlocks.coalDepot) return;
    if (availableFuel(s) >= 200) return;
    var coal = G.res('coal');
    var price = coal.value * 3;           // convenience costs a premium
    var want = 500;
    var afford = Math.floor(s.gold / price);
    var n = Math.min(want, afford);
    if (n <= 0) return;
    s.gold -= n * price;
    State.add(s, 'coal', n);
  }

  G.Forge = {
    slotCount: slotCount, availableFuel: availableFuel, fuelCost: fuelCost,
    canStart: canStart, recipeUnlocked: recipeUnlocked, start: start, cancel: cancel,
    tick: tick, catchUp: catchUp, depotTick: depotTick, burnFuel: burnFuel
  };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
