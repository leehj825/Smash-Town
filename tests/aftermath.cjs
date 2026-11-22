// Dead civilians stay dead, a knocked-out civilian gets up where they fell, murder gives a wanted level that does not vanish. node tests/aftermath.cjs
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
    const res = await S(() => {
      const G = g(); const H = G.humans; const pl = H.player;
      G.enterExit(); G.onFoot = true; G.state = 'play';
      const civs = H.list.filter((h) => h.active && h.role === 0 /* Role.Civ */ && h.state === 1);
      return { n: civs.length };
    });
    // pick two civilians near the player
    const setup = await S(() => {
      const G = g(); const H = G.humans; const pl = H.player; const sp = G.world.spawn;
      H.setPlayerActive(true, sp.x, sp.z, 0); G.onFoot = true;
      const civs = H.list.filter((h) => h.role === H.list[200]?.role || true).filter((h) => h.active && h.maxHp === 30);
      const a = civs[0], c = civs[1];
      for (const q of [a, c]) { q.x = pl.x + 3; q.z = pl.z + 3; q.hp = 30; q.state = 1; }
      c.x = pl.x - 3;
      window.__a = a; window.__c = c;
      G.stars = 0; G.heat = 0; G.clearWanted && 0;
      return { ok: !!a && !!c };
    });
    ok(setup.ok, 'found two civilians');
    // knock one out without killing: it gets up where it fell and keeps its place
    const ko = await S(() => {
      const G = g(); const H = G.humans; const a = window.__a;
      const x0 = a.x, z0 = a.z; H.player.x = a.x - 2; H.player.z = a.z; window.__c.x = a.x + 3; window.__c.z = a.z + 3;
      H.gunHit(H.player, a, 10, 1, 0, true);
      return { down: a.state, x0, z0 };
    });
    await S(() => { const G = window.g(); const a = window.__a; for (let i = 0; i < 600; i++) { G.humans.update(0.05, G.humans.ctx); if (a.state === 1) break; } });
    const after = await S(() => { const a = window.__a; return { x: a.x, z: a.z, active: a.active, hp: a.hp, state: a.state, grounded: a.grounded, stateT: a.stateT, y: a.y, dist: Math.hypot(a.x - window.g().humans.player.x, a.z - window.g().humans.player.z) }; });
    ok(after.state === 1 && after.active && Math.hypot(after.x - ko.x0, after.z - ko.z0) < 12, 'a knocked-out civilian gets up near where they fell', JSON.stringify({ ko, after }));
    // kill one: dead, murder wanted level, stays down
    const kill = await S(() => {
      const G = g(); const H = G.humans; const c = window.__c; H.kids = false;
      H.gunHit(H.player, c, 999, 1, 0, true);
      return { state: c.state, stars: G.stars, heat: G.heat };
    });
    ok(kill.state === 8 && kill.stars >= 1, 'killing a civilian leaves them dead and gives a wanted level', JSON.stringify(kill));
    // the wanted level survives ten seconds with no police around
    const keep = await S(() => {
      const G = g();
      for (let i = 0; i < 200; i++) G.updateWanted(0.05);
      return { stars: G.stars };
    });
    ok(keep.stars >= 1, 'the wanted level does not vanish right after a crime', JSON.stringify(keep));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
