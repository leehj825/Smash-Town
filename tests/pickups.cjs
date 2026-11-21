// Pickups + radio test: node tests/pickups.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4197, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
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
    const info = await S(() => { const list = []; g().pickups.forEach((t, x, z) => list.push([t, x, z])); const w = g().world; const inside = list.filter(([, x, z]) => w.boxes.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)).length; return { n: list.length, inside, types: [...new Set(list.map((q) => q[0]))].sort().join(',') }; });
    ok(info.n >= 20 && info.inside === 0, 'pickups placed outside buildings', JSON.stringify(info));
    ok(info.types === 'armor,burger,cash,health', 'all four pickup types exist');
    // exit the car, hurt the player, stand on a health pack
    await S(() => { g().enterExit(); });
    await p.waitForTimeout(600);
    const r = await S(async () => {
      const G = g(); const pl = G.humans.player;
      let hp = null; G.pickups.forEach((t, x, z) => { if (t === 'health' && !hp) hp = { x, z }; });
      pl.x = hp.x; pl.z = hp.z; pl.hp = 30;
      await new Promise((res) => setTimeout(res, 800));
      return { hp: pl.hp, onFoot: G.onFoot };
    });
    ok(r.onFoot && r.hp >= 70, 'health pack heals on foot', JSON.stringify(r));
    const a = await S(async () => {
      const G = g(); const pl = G.humans.player;
      let ap = null; G.pickups.forEach((t, x, z) => { if (t === 'armor' && !ap) ap = { x, z }; });
      pl.x = ap.x; pl.z = ap.z;
      await new Promise((res) => setTimeout(res, 800));
      return { armor: G.humans.armor, bar: document.getElementById('parmor-fill').style.width };
    });
    ok(a.armor === 25 && a.bar === '50%', 'armor pickup adds 25 and shows on the bar', JSON.stringify(a));
    const burger = await S(async () => {
      const G = g(); const pl = G.humans.player; G.cash = 500; pl.hp = 20;
      let bp = null; G.pickups.forEach((t, x, z) => { if (t === 'burger' && !bp) bp = { x, z }; });
      pl.x = bp.x; pl.z = bp.z;
      await new Promise((res) => setTimeout(res, 800));
      return { hp: pl.hp, cash: G.cashAmount };
    });
    ok(burger.hp === 100 && burger.cash === 485, 'burger stand heals fully for $15', JSON.stringify(burger));
    // radio
    const rad = await S(async () => {
      const R = window.__smash.radio; const G = g();
      G.audio.init(); R.setEnabled(true);
      await new Promise((res) => setTimeout(res, 1200));
      return { on: R.enabled, state: G.audio.context && G.audio.context.state };
    });
    ok(rad.on && !!rad.state, 'radio starts with an audio context', JSON.stringify(rad));
    await p.keyboard.press('KeyN'); await p.waitForTimeout(300);
    ok(await S(() => localStorage.getItem('smashtown.radio2')) === '1' && await S(() => window.__smash.radio.station) === 1, 'N switches to the next radio station');
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
