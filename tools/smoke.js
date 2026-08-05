/* Browser smoke test.
 *
 *   node tools/smoke.js [seconds] [--shot out.png]
 *
 * Loads the game in a real browser, fast-forwards the simulation, and fails on
 * any console error, page error, or obviously broken state. Catches the class
 * of bug the headless balance sim cannot see: typos in render code, missing DOM
 * ids, and panels that throw when a system unlocks.
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');

const args = process.argv.slice(2);
const seconds = parseFloat(args.find(a => !a.startsWith('--')) || '20');
const shotIdx = args.indexOf('--shot');
const shot = shotIdx >= 0 ? args[shotIdx + 1] : null;
const URL = process.env.MG_URL || 'http://localhost:8971/index.html';

(async () => {
  /* The preinstalled browser may not match this playwright build's expected
     revision, so find it rather than trusting the default lookup path. */
  const fs = require('fs');
  const candidates = fs.existsSync('/opt/pw-browsers')
    ? fs.readdirSync('/opt/pw-browsers')
        .filter(d => d.startsWith('chromium'))
        .map(d => `/opt/pw-browsers/${d}/chrome-linux/${d.includes('headless') ? 'headless_shell' : 'chrome'}`)
        .filter(p => fs.existsSync(p))
    : [];
  const browser = candidates.length
    ? await chromium.launch({ executablePath: candidates[0] })
    : await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const booted = await page.evaluate(() => !!(window.MG && window.MG.Game && window.MG.Game.s));
  if (!booted) { console.log('✗ game did not boot'); errors.forEach(e => console.log('  ' + e)); process.exit(1); }

  /* Fast-forward: drive game.tick directly, far faster than real time, and
     cycle every panel so their build() code actually runs. */
  const result = await page.evaluate(async (secs) => {
    const G = window.MG, game = G.Game;
    const out = { steps: 0, panelErrors: [], snapshots: [] };
    const panels = G.PANELS.map(p => p.id);

    for (let i = 0; i < secs * 20; i++) {
      game.tick(0.05);
      out.steps++;

      // Buy whatever is cheap so the game actually progresses through unlocks.
      if (i % 40 === 0) {
        const s = game.s, o = game.o;
        for (const u of G.UNLOCKS) {
          if (!s.unlocks[u.id] && G.Shop.unlockVisible(s, u) && s.gold >= u.cost) G.Shop.buyUnlock(s, u.id);
        }
        for (const up of G.UPGRADES) {
          if (!G.Stats.condMet(s, up.unlock) || G.Shop.upgradeMaxed(s, up)) continue;
          const c = G.Shop.upgradeCost(up, G.Shop.upgradeLevel(s, up.id));
          if (s.gold > c * 3) G.Shop.buyUpgrade(s, up.id, 1);
        }
        if (s.unlocks.forge) {
          for (const r of G.RECIPES) {
            if (G.Forge.recipeUnlocked(s, r) && G.Forge.canStart(s, r, o)) { G.Forge.start(s, r.id, o); break; }
          }
        }
        G.Shop.forgePick(s);
        for (const id of Object.keys(s.inv)) {
          if (!G.res(id).fuel && s.inv[id] > 60) G.Market.sell(s, id, s.inv[id] - 40, o);
        }
        if (s.unlocks.crew) G.Shop.hireCrew(s, 'digger');
        game.refresh();
      }

      // Every panel, rendered for real.
      if (i % 100 === 0) {
        for (const id of panels) {
          const p = G.PANELS.find(x => x.id === id);
          if (!p.visible(game)) continue;
          try { p.build(game); } catch (e) { out.panelErrors.push(id + ': ' + e.message); }
        }
      }
      if (i % 400 === 0) {
        out.snapshots.push({
          t: (i / 20) | 0,
          depth: Math.round(game.s.frontier),
          gold: G.num.fmt(game.s.gold),
          pick: game.s.pickTier,
          unlocks: Object.keys(game.s.unlocks).length
        });
      }
      if (i % 200 === 0) await new Promise(r => setTimeout(r, 0));
    }

    const s = game.s;
    out.final = {
      depth: s.frontier, gold: s.gold, pickTier: s.pickTier,
      breaks: s.stats.totalBreaks, unlocks: Object.keys(s.unlocks),
      achievements: G.Achievements.count(s),
      nan: !isFinite(s.gold) || !isFinite(s.frontier) || isNaN(s.gold) || isNaN(s.frontier),
      rockOk: !!s.rock && isFinite(s.rock.hp)
    };

    // Exercise prestige if it is reachable.
    if (G.Prestige.canPrestige(s)) {
      const ns = G.Prestige.doPrestige(s, game.o);
      if (ns) { game.s = ns; game.refresh(); out.prestiged = true; }
    }
    // Save + reload round trip.
    try {
      const code = G.State.exportSave(game.s);
      const back = G.State.importSave(code);
      out.saveRoundTrip = back && typeof back.gold === 'number';
    } catch (e) { out.saveError = e.message; }

    return out;
  }, seconds);

  /* Deep-path checks. A short run never reaches prestige or an offline gap, so
     we drive those two directly — they are the highest-risk code in the game
     because they rebuild or rewrite the whole state object. */
  const deep = await page.evaluate(() => {
    const G = window.MG, game = G.Game, out = {};

    // --- offline: pretend the tab was closed for two hours
    const before = { gold: game.s.gold, depth: game.s.frontier };
    game.s.lastTick = Date.now() - 2 * 3600 * 1000;
    const rep = G.Offline.run(game.s);
    game.refresh();
    out.offline = rep ? {
      credited: Math.round(rep.creditedSeconds),
      gold: rep.gold, depth: rep.depth,
      finite: isFinite(rep.gold) && isFinite(rep.depth) && rep.gold >= 0,
      grew: game.s.gold >= before.gold && game.s.frontier >= before.depth
    } : { missing: true };
    try { G.UI.showOfflineReport(rep); out.offlineModal = !document.getElementById('modal-root').hidden; }
    catch (e) { out.offlineModalError = e.message; }
    G.UI.closeModal();

    // --- prestige: force a deep, rich run and collapse it
    game.s.frontier = 5000;
    game.s.stats.maxDepthEver = Math.max(game.s.stats.maxDepthEver, 5000);
    game.s.stats.runGold = 1e9;
    game.s.pickTier = 8;
    game.refresh();
    const gain = G.Prestige.pending(game.s, game.o);
    const prevTotal = game.s.coresTotal;
    const ns = G.Prestige.doPrestige(game.s, game.o);
    if (ns) {
      game.s = ns; game.refresh();
      out.prestige = {
        gain: gain,
        coresGranted: ns.coresTotal - prevTotal,
        depthReset: ns.frontier < 5000,
        goldReset: ns.gold < 1e9,
        keptAchievements: Object.keys(ns.achievements).length,
        keptUnlocks: Object.keys(ns.unlocks).length,
        // The bug that made prestige an infinite core printer: qualifying again
        // the instant the new run starts.
        immediatelyRequalifies: G.Prestige.canPrestige(ns) && G.Prestige.pending(ns, game.o) > 0
      };
    } else out.prestige = { failed: true };

    // --- talents spend + free respec
    let bought = 0;
    ns.cores += 500;
    for (let i = 0; i < 40; i++) if (G.Prestige.buyTalent(ns, 'veteran')) bought++;
    const refund = G.Prestige.respec(ns);
    out.talents = { bought: bought, refund: refund, cores: ns.cores };
    game.refresh();

    // --- the game must keep running after all that
    for (let i = 0; i < 100; i++) game.tick(0.05);
    out.aliveAfter = isFinite(game.s.gold) && !!game.s.rock && isFinite(game.s.rock.hp);
    return out;
  });

  console.log('  deep paths:');
  console.log('    offline  ', JSON.stringify(deep.offline));
  console.log('    modal    ', deep.offlineModal ? 'opened' : ('FAILED ' + (deep.offlineModalError || '')));
  console.log('    prestige ', JSON.stringify(deep.prestige));
  console.log('    talents  ', JSON.stringify(deep.talents));
  console.log('    alive    ', deep.aliveAfter);
  if (!deep.offline.finite || !deep.offline.grew) errors.push('offline progress did not credit sane gains');
  if (!deep.offlineModal) errors.push('offline report modal did not open');
  if (deep.prestige.failed) errors.push('prestige failed');
  else {
    if (deep.prestige.coresGranted !== deep.prestige.gain) errors.push('prestige granted the wrong number of cores');
    if (!deep.prestige.depthReset || !deep.prestige.goldReset) errors.push('prestige did not reset the run');
    if (deep.prestige.immediatelyRequalifies) errors.push('prestige re-qualifies immediately (infinite cores)');
  }
  if (deep.talents.bought < 1) errors.push('could not buy a talent with cores');
  if (deep.talents.refund < 1) errors.push('respec refunded nothing');
  if (!deep.aliveAfter) errors.push('game state broken after prestige');

  // Click through the real tabs. Re-query by index each time: the tab strip is
  // rebuilt on a timer, so held element handles go stale.
  const tabCount = (await page.$$('#tabs .tab')).length;
  for (let i = 0; i < tabCount; i++) {
    const t = (await page.$$('#tabs .tab'))[i];
    if (!t) continue;
    await t.click({ timeout: 4000 }).catch(e => errors.push('tab click ' + i + ': ' + e.message));
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(400);

  if (shot) {
    await page.screenshot({ path: path.resolve(shot) });
  }

  await browser.close();

  console.log('');
  console.log('  progression:');
  for (const s of result.snapshots) {
    console.log(`    t=${String(s.t).padStart(4)}s  depth ${String(s.depth).padStart(6)}m  ` +
                `gold ${s.gold.padStart(8)}  pick ${s.pick}  unlocks ${s.unlocks}`);
  }
  const f = result.final;
  console.log('');
  console.log(`  final: depth ${Math.round(f.depth)}m · pick ${f.pickTier} · ${f.breaks} breaks · ` +
              `${f.achievements} achievements · unlocks: ${f.unlocks.join(', ') || 'none'}`);
  console.log(`  prestige exercised: ${result.prestiged ? 'yes' : 'not reachable in this window'}`);
  console.log(`  save round-trip: ${result.saveRoundTrip ? 'ok' : 'FAILED ' + (result.saveError || '')}`);
  console.log('');

  let bad = 0;
  if (f.nan) { console.log('  ✗ NaN/Infinity leaked into gold or depth'); bad++; }
  if (!f.rockOk) { console.log('  ✗ rock state invalid'); bad++; }
  if (!result.saveRoundTrip) { console.log('  ✗ save/load round trip failed'); bad++; }
  for (const e of result.panelErrors) { console.log('  ✗ panel ' + e); bad++; }
  for (const e of errors) { console.log('  ✗ ' + e); bad++; }

  if (bad === 0) console.log('  ✓ no console errors, no panel errors, state finite\n');
  process.exit(bad ? 1 : 0);
})();
