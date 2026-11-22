// City systems: traffic lights, news, taxi, bounty hunter... node tests/city.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4195, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 800, height: 480 } });
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(800);

    const lights = await S(() => {
      const G = g(); const L = G.lights;
      const heads = L.heads.length;
      const seen = new Set();
      for (let i = 0; i < 40; i++) { L.update(0.5); seen.add(L.heads[0].axisZ ? 'z' : 'x'); }
      return { heads, junctions: heads / 4 };
    });
    ok(lights.heads > 100, 'junctions have traffic light heads', JSON.stringify(lights));
    const news = await S(() => {
      const G = g(); G.news.report('murder', true);
      const el = document.getElementById('news');
      return { shown: el.classList.contains('show'), text: el.textContent, n: G.news.log.length };
    });
    ok(news.shown && /BREAKING NEWS|속보/.test(news.text) && news.n === 1, 'a breaking-news banner reports what you did', JSON.stringify(news));
    const taxi = await S(() => {
      const G = g(); const T = G.taxi; const sp = G.world.spawn;
      G.humans.setPlayerActive(false, 0, 0, 0);
      const v = G.spawnVehicle('taxi', 0xffc400, sp.x, sp.z, sp.heading, 'player', true);
      G.driving = v; G.onFoot = false; G.state = 'play'; G.inside = null; G.stars = 0;
      for (let i = 0; i < 160 && !T.active; i++) T.update(0.05);
      const started = T.active;
      v.ctrl.position.x = T.from.x; v.ctrl.position.z = T.from.z; v.ctrl.vx = v.ctrl.vz = 0;
      T.update(0.05);
      const riding = T.phase === 'ride';
      const cash0 = G.cash;
      v.ctrl.position.x = T.to.x; v.ctrl.position.z = T.to.z; v.ctrl.vx = v.ctrl.vz = 0;
      T.update(0.05);
      return { started, riding, paid: G.cash - cash0, fares: T.completed };
    });
    ok(taxi.started && taxi.riding && taxi.paid >= 40 && taxi.fares === 1, 'a taxi gets a fare, picks them up and is paid at the destination', JSON.stringify(taxi));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
