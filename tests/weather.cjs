// Phase 7 test: weather and radio stations. node tests/weather.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4192, root = path.resolve(__dirname, '..');
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
    await p.waitForTimeout(600);

    const clear = await S(() => { const W = window.__smash.weather, E = window.__smash.env; W.setMode('clear'); for (let i = 0; i < 12; i++) W.update(1, window.__smash.camera); return { fog: E.fog.density, grip: W.grip, rain: W.rainAmount }; });
    const storm = await S(() => { const W = window.__smash.weather, E = window.__smash.env; W.setMode('storm'); for (let i = 0; i < 14; i++) W.update(1, window.__smash.camera); return { fog: E.fog.density, grip: W.grip, rain: W.rainAmount, lines: W.group.children[0].visible, sun: E.sun.intensity }; });
    ok(storm.fog > clear.fog * 2.5 && storm.grip < 0.8 && clear.grip > 0.99, 'a storm thickens the fog and loosens the grip', JSON.stringify({ clear, storm }));
    ok(storm.rain > 1.2 && storm.lines, 'rain streaks show in a storm');
    const dry = await S(() => { const W = window.__smash.weather; W.setMode('clear'); for (let i = 0; i < 20; i++) W.update(1, window.__smash.camera); return { grip: Math.round(W.grip * 100) / 100, lines: W.group.children[0].visible }; });
    ok(dry.grip === 1 && !dry.lines, 'clearing the weather restores grip and hides the rain', JSON.stringify(dry));
    const grip = await S(() => { const W = window.__smash.weather; W.setMode('rain'); for (let i = 0; i < 20; i++) W.update(1, window.__smash.camera); return window.__smash.game.driving ? Math.round(g().driving.ctrl.constructor.gripMul * 100) / 100 : -1; });
    ok(grip > 0.8 && grip < 0.92, 'rain lowers the car grip multiplier', String(grip));
    const indoors = await S(() => { const W = window.__smash.weather; W.indoors = true; W.update(0.1, window.__smash.camera); const v = W.group.children[0].visible; W.indoors = false; return v; });
    ok(indoors === false, 'no rain streaks indoors');
    await S(() => window.__smash.weather.setMode('clear'));

    // radio stations
    const st = await S(() => { const R = window.__smash.radio; const names = []; for (let i = 0; i < 3; i++) { R.setStation(i); names.push(R.name); } return names; });
    ok(st.join('|') === 'Beach Chill|Downtown Synth|Harbor Industrial', 'three radio stations exist', st.join(' | '));
    await S(() => { window.__smash.game.audio.init(); });
    const seq = [];
    for (let i = 0; i < 4; i++) { await p.keyboard.press('KeyN'); await p.waitForTimeout(150); seq.push(await S(() => localStorage.getItem('smashtown.radio2'))); }
    ok(seq.join(',') === '1,2,off,0', 'N cycles stations and off', seq.join(','));
    const play = await S(async () => { const R = window.__smash.radio; const G = g(); G.audio.init(); R.setStation(1); R.setEnabled(true); await new Promise((r) => setTimeout(r, 900)); R.setStation(2); await new Promise((r) => setTimeout(r, 900)); return { on: R.enabled, ctx: G.audio.context && G.audio.context.state }; });
    ok(play.on && !!play.ctx, 'stations play without errors', JSON.stringify(play));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
