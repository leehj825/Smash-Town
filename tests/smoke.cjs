// Headless smoke test: node tests/smoke.cjs   (needs `playwright` with Chromium installed; builds and serves dist itself)
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed (npm i -g playwright)'); process.exit(2); }

const PORT = 4199;
const root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails++; };

(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const url = `http://localhost:${PORT}/`;
  const errs = [];
  try {
    // ---------- desktop
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript(() => { window.__pad = null; navigator.getGamepads = () => [window.__pad]; });
    await p.goto(url);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, arg) => p.evaluate(fn, arg);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    ok(await S(() => !document.getElementById('howto').hidden), 'tutorial shows on first play');
    const t0 = await S(() => window.__smash.game.time);
    await p.waitForTimeout(400);
    ok((await S(() => window.__smash.game.time)) === t0, 'game is frozen behind the tutorial');
    await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    ok(await S(() => document.getElementById('howto').hidden), 'Enter closes the tutorial');
    ok(await S(() => JSON.parse(localStorage.getItem('smashtown.settings.v1')).tutorialDone), 'tutorial flag saved');

    // perf numbers (informational)
    await p.waitForTimeout(1500);
    const perf = await S(async () => {
      let n = 0; const t = performance.now();
      await new Promise((res) => { const f = () => { n++; if (performance.now() - t > 3000) res(); else requestAnimationFrame(f); }; f(); });
      const r = window.__smash.renderer.info.render;
      return { fps: Math.round((n * 1000) / (performance.now() - t)), calls: r.calls, tris: r.triangles };
    });
    console.log('INFO  headless software-GL perf', JSON.stringify(perf));

    // navigation + story step
    const g0 = await S(() => window.__smash.game.goal);
    ok(!!g0 && /Donna/.test(g0.label), 'story goal exists', g0 && g0.label);
    await S(([x, z]) => { const d = window.__smash.game.driving; d.ctrl.position.x = x; d.ctrl.position.z = z; }, [g0.x + 3, g0.z]);
    await p.waitForTimeout(600);
    ok(await S(() => window.__smash.game.story.dialogOpen), 'arriving opens the dialogue');
    for (let i = 0; i < 4; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(120); }
    ok((await S(() => window.__smash.game.story.step)) === 2, 'dialogue advances the story');

    // map
    await p.keyboard.press('KeyM'); await p.waitForTimeout(200);
    ok(await S(() => window.__smash.bigmap.isOpen), 'M opens the map');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await S(() => !window.__smash.bigmap.isOpen && document.getElementById('pause').hidden), 'Esc closes the map without pausing');

    // settings persistence
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await p.click('.seg.sens[data-v="1.5"]'); await p.click('.seg.shake[data-v="0"]'); await p.click('.seg.fov[data-v="8"]');
    // rebinding: use = G
    await p.click('#btn-controls'); await p.waitForTimeout(100);
    await p.click('button.key[data-act="use"]'); await p.keyboard.press('KeyG'); await p.waitForTimeout(100);
    const st = await S(() => JSON.parse(localStorage.getItem('smashtown.settings.v1')));
    ok(st.sens === 1.5 && st.shake === 0 && st.fov === 8 && st.binds.use === 'KeyG', 'settings and key binding saved', JSON.stringify(st.binds));
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await S(() => document.getElementById('controls').hidden && !document.getElementById('pause').hidden), 'Esc closes controls, stays paused');
    await p.click('#btn-resume'); await p.waitForTimeout(200);
    ok(await S(() => !window.__smash.game.onFoot), 'in the car before using the rebound key');
    await p.keyboard.press('KeyF'); await p.waitForTimeout(200);
    ok(await S(() => !window.__smash.game.onFoot), 'old key F no longer works after rebinding');
    await S(() => { const d = window.__smash.game.driving; d.ctrl.speed = 0; });
    await p.keyboard.press('KeyG'); await p.waitForTimeout(500);
    ok(await S(() => window.__smash.game.onFoot), 'rebound key G exits the car');

    // reload keeps settings; new game wipes the save
    await p.reload(); await p.waitForFunction(() => window.__smash);
    ok(await S(() => document.querySelector('.seg.sens[data-v="1.5"]').classList.contains('sel')), 'settings restored after reload');
    await S(() => window.__smash.startGame()); await p.waitForTimeout(500);
    ok(await S(() => document.getElementById('howto').hidden), 'tutorial not shown again');
    for (let i = 0; i < 4 && (await S(() => window.__smash.game.state === 'dialog')); i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(150); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    await S(() => { localStorage.setItem('smashtown.save.v1', JSON.stringify({ cash: 999999, unlocked: ['sports', 'sedan'], selected: 'sports' })); });
    await S(() => { const b = document.getElementById('btn-newgame'); b.click(); b.click(); }); // same task: software GL is too slow for two real clicks inside the 4 s arm window
    await p.waitForFunction(() => window.__smash); await p.waitForTimeout(800);
    ok(await S(() => { const s = localStorage.getItem('smashtown.save.v1'); return !s || JSON.parse(s).cash !== 999999; }), 'New game erases the save');
    await ctx.close();

    // ---------- touch layouts
    for (const [name, vp] of [['844x390', { width: 844, height: 390 }], ['667x375', { width: 667, height: 375 }]]) {
      const c2 = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      const q = await c2.newPage();
      q.on('pageerror', (e) => errs.push(e.message));
      await q.addInitScript(() => localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })));
      await q.goto(url); await q.waitForFunction(() => window.__smash);
      await q.evaluate(() => window.__smash.startGame());
      await q.waitForTimeout(1200);
      const ov = await q.evaluate(() => {
        const ids = ['btn-pause', 'btn-map', 'story-pill', 'minimap', 'status'];
        const r = ids.map((id) => [id, document.getElementById(id).getBoundingClientRect()]);
        const bad = [];
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], c = r[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push(r[i][0] + '/' + r[j][0]); }
        const btns = Array.from(document.querySelectorAll('#touch button')).filter((x) => x.offsetParent).map((x) => [x.textContent, x.getBoundingClientRect()]);
        for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i][1], c = btns[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) bad.push('touch:' + btns[i][0] + '/' + btns[j][0]); }
        return bad;
      });
      ok(ov.length === 0, `touch HUD has no overlaps at ${name}`, ov.join(','));
      await q.tap('#btn-map'); await q.waitForTimeout(300);
      ok(await q.evaluate(() => window.__smash.bigmap.isOpen), `map button works at ${name}`);
      await c2.close();
    }
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close();
    srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
