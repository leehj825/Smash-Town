// Render cost check: draw calls and triangles for a calm scene and a worst-case scene. node tests/perf.cjs
// (Headless software GL cannot measure frame rate; calls and triangles are the numbers that transfer to real devices.)
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4191, root = path.resolve(__dirname, '..');
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
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    const measure = () => S(() => {
      const r = window.__smash.renderer; r.info.autoReset = false; r.info.reset();
      window.__smash.composer.render();
      const i = r.info.render; const out = { calls: i.calls, tris: i.triangles };
      r.info.autoReset = true; return out;
    });
    const calm = await measure();
    console.log('INFO  calm scene', JSON.stringify(calm));
    // worst case: five stars, full police, helicopter, storm, on foot with a riot squad
    await S(() => {
      const G = g(); G.stars = 5; G.heat = 400;
      for (let i = 0; i < 30; i++) G.update(0.5);
      G.heli.cooldown = 0; G.updateHeli(6);
      window.__smash.weather.setMode('storm'); for (let i = 0; i < 14; i++) window.__smash.weather.update(1, window.__smash.camera);
      for (let i = 0; i < 20; i++) G.update(0.1);
    });
    const worst = await measure();
    const nPolice = await S(() => g().vehicles.filter((v) => v.isPolice).length);
    console.log('INFO  worst case (5 stars, storm, helicopter)', JSON.stringify({ ...worst, policeCars: nPolice }));
    ok(calm.calls < 320, 'calm scene stays under 320 draw calls', String(calm.calls));
    ok(worst.calls < 420, 'worst case stays under 420 draw calls', String(worst.calls));
    ok(worst.tris < 900000, 'worst case stays under 900k triangles', String(worst.tris));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
