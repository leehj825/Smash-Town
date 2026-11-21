// Phase 6 test: second story arc, stats, achievements, daily challenges, shop ownership, street quests. node tests/story2.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4193, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); } window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(600);

    // ---- walk the whole story, first arc included (the story code is driven directly)
    const run = await S(() => {
      const G = g(); const st = G.story; const log = [];
      G.stars = 0;
      const cash0 = G.cashAmount;
      let guard = 0;
      while (!st.done && guard++ < 400) {
        G.stars = 0; G.heat = 0;
        if (G.state === 'dialog') { st.advanceDialog(); continue; }
        const kind = st.stepKind();
        const before = st.ch + ':' + st.step;
        if (kind === 'goto') { const o = st.objective(); const d = G.driving; if (d && !G.onFoot) { d.ctrl.position.x = o.x; d.ctrl.position.z = o.z; } else { G.humans.player.x = o.x; G.humans.player.z = o.z; } }
        else if (kind === 'smash') st.prog = 9999;
        else if (kind === 'steal') { const l = st.limoCar; if (l) { G.driving = l; l.ai = 'player'; G.onFoot = false; } }
        else if (kind === 'drive') { const o = st.objective(); const l = st.limoCar; if (l && o) { G.driving = l; G.onFoot = false; l.ctrl.position.x = o.x; l.ctrl.position.z = o.z; } }
        G.update(0.05);
        if (before !== st.ch + ':' + st.step && log.length < 60) log.push(before);
      }
      return { done: st.done, ch: st.ch, gain: G.cashAmount - cash0, unlocked: G.save.unlocked.join(','), steps: log.length, guard };
    });
    ok(run.done && run.ch === 8, 'all eight chapters can be completed', JSON.stringify(run));
    ok(run.unlocked.includes('supercar') && run.unlocked.includes('monster'), 'the supercar and the monster truck are story rewards');
    ok(run.gain >= 1000 + 1500 + 2500 + 3000 + 10000 + 4000 + 5000 + 20000, 'chapter rewards add up', String(run.gain));
    const mood = await S(() => ({ saved: g().mood.saved, flagged: !!g().scene.children.length }));
    ok(mood.saved, 'the town reacts after the first arc (festival flags)');

    // ---- achievements and daily challenges
    const ach = await S(() => { const G = g(); const c0 = G.cashAmount; G.progress.add('smashes', 60); return { has: G.progress.ach.includes('smash50'), gain: G.cashAmount - c0 }; });
    ok(ach.has && ach.gain >= 500, 'achievements unlock with a cash reward', JSON.stringify(ach));
    const daily = await S(() => {
      const G = g(); const P = G.progress;
      const before = P.daily.done.length;
      const keys = P.daily.ids.slice();
      const c0 = G.cashAmount;
      for (const k of ['smashes', 'driveM', 'stars', 'copsKO', 'gigs', 'earned', 'roofs', 'quests']) P.add(k, 100000);
      return { ids: keys.length, done: P.daily.done.length, before, gain: G.cashAmount - c0 };
    });
    ok(daily.ids === 3 && daily.done === 3 && daily.gain > 1000, 'three daily challenges complete and pay out', JSON.stringify(daily));

    // ---- own a shop
    const own = await S(() => {
      const G = g(); G.cash = 50000; const r = G.interiors.rooms.find((q) => q.id === 'arcade');
      G.humans.setPlayerActive(true, r.door.x, r.door.z, 0); G.onFoot = true;
      G.inside = r; G.ret = { x: r.door.x, z: r.door.z, h: 0 };
      G.humans.setPlayerActive(true, r.desk.x, r.desk.z, 0);
      const c0 = G.cashAmount;
      G.deskAction(r);
      const bought = G.progress.owned.includes('arcade'); const paid = c0 - G.cashAmount;
      for (let i = 0; i < 120; i++) G.progress.tick(1);
      const waiting = Math.floor(G.progress.pending.arcade);
      const c1 = G.cashAmount; G.deskAction(r);
      return { bought, paid, waiting, got: G.cashAmount - c1 };
    });
    ok(own.bought && own.paid === 12000 && own.waiting === 180 && own.got === 180, 'buying a shop earns income you collect at the desk', JSON.stringify(own));
    await S(() => { const G = g(); G.inside = null; G.humans.setPlayerActive(true, G.ret.x, G.ret.z, 0); G.onFoot = false; });

    // ---- street quests
    const taxi = await S(() => {
      const G = g(); const q = G.sideQuests; G.stars = 0; G.state = 'play';
      if (G.onFoot) G.enterExit();
      if (!G.driving) return { err: 'no car' };
      q.cool = 0; q.next = 'taxi';
      q.update(0.1);
      if (q.mode !== 'fareWait') return { err: 'no fare ' + q.mode };
      const d = G.driving; d.ctrl.position.x = q.pickup.x; d.ctrl.position.z = q.pickup.z; d.ctrl.speed = 0;
      q.update(0.1);
      if (q.mode !== 'fareRide') return { err: 'no ride ' + q.mode };
      d.ctrl.position.x = q.drop.x; d.ctrl.position.z = q.drop.z;
      const c0 = G.cashAmount, n0 = G.progress.stats.quests;
      q.update(0.1);
      return { mode: q.mode, gain: G.cashAmount - c0, quests: G.progress.stats.quests - n0 };
    });
    ok(taxi.mode === 'idle' && taxi.gain >= 400 && taxi.quests === 1, 'taxi fare: pick up, drive, drop off for cash', JSON.stringify(taxi));
    const thief = await S(() => {
      const G = g(); const q = G.sideQuests; const pl = G.humans.player;
      if (!G.onFoot) G.enterExit();
      const civ = G.humans.list.find((h) => h.role === 0 && h.active && h !== pl) ?? G.humans.list.find((h) => h !== pl && h.active);
      civ.x = pl.x + 60; civ.z = pl.z; civ.state = 0;
      q.cool = 0; q.next = 'thief'; G.stars = 0; G.state = 'play';
      q.update(0.1);
      if (q.mode !== 'thief') return { err: 'no thief ' + q.mode };
      q.thief.x = pl.x + 1; q.thief.z = pl.z;
      const c0 = G.cashAmount;
      q.update(0.1);
      return { mode: q.mode, gain: G.cashAmount - c0 };
    });
    ok(thief.mode === 'idle' && thief.gain === 600, 'thief quest: catch the pickpocket for $600', JSON.stringify(thief));

    // ---- stats panel and persistence
    await S(() => { g().flushSave(); });
    await p.reload(); await p.waitForFunction(() => window.__smash);
    await S(() => window.__smash.startGame()); await p.waitForTimeout(500);
    const kept = await S(() => { const P = g().progress; return { ach: P.ach.length, owned: P.owned.join(','), smash: P.stats.smashes >= 60, daily: P.daily.done.length, ch: g().story.ch }; });
    ok(kept.ach >= 1 && kept.owned === 'arcade' && kept.smash && kept.daily === 3 && kept.ch === 8, 'progress, ownership and story survive a reload', JSON.stringify(kept));
    await S(() => window.__smash.statsPanel.open());
    const panel = await S(() => ({ open: window.__smash.statsPanel.isOpen, rows: document.querySelectorAll('#stats .erow').length }));
    ok(panel.open && panel.rows > 20, 'the stats panel lists stats, achievements and daily challenges', JSON.stringify(panel));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
