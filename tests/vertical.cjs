// Phase 5 test: ladders, rooftops, shops. node tests/vertical.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4194, root = path.resolve(__dirname, '..');
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
    await S(() => { g().enterExit(); });
    await p.waitForTimeout(600);

    const w = await S(() => { const W = g().world; const bad = W.roofs.filter((r) => W.boxes.some((b) => b !== r.box && r.ladder.x > b.minX && r.ladder.x < b.maxX && r.ladder.z > b.minZ && r.ladder.z < b.maxZ)).length; return { n: W.roofs.length, bad, stars: g().collectibles.total, heights: W.roofs.map((r) => Math.round(r.h)).join(',') }; });
    ok(w.n >= 4 && w.n <= 10 && w.bad === 0, 'climbable roofs exist with ladders on open ground', JSON.stringify(w));
    ok(w.stars === 12 + Math.min(4, w.n), 'rooftop stars were added to the golden stars', String(w.stars));

    // climb up
    const up = await S(() => {
      const G = g(); const pl = G.humans.player; const r = G.world.roofs[0];
      G.humans.setPlayerActive(true, r.ladder.x + r.ladder.nx * 0.5, r.ladder.z + r.ladder.nz * 0.5, 0);
      const lo = G.ladderOption();
      if (!lo || !lo.up) return { option: false };
      G.startClimb(lo);
      for (let i = 0; i < 80; i++) G.update(0.05);
      return { option: true, roof: !!pl.roof, y: Math.round(pl.y * 10) / 10, h: Math.round(r.h * 10) / 10, climbing: !!G.climb };
    });
    ok(up.option && up.roof && !up.climbing && Math.abs(up.y - up.h) < 0.2, 'F at a ladder climbs to the roof', JSON.stringify(up));
    // stay on the roof, collect the rooftop star only from up there
    const walk = await S(() => {
      const G = g(); const pl = G.humans.player; const r = G.world.roofs[0];
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      pl.x = cx; pl.z = cz;
      for (let i = 0; i < 20; i++) G.update(0.05);
      return { y: Math.round(pl.y * 10) / 10, h: Math.round(r.h * 10) / 10, dx: Math.round(Math.abs(pl.x - cx) * 10) / 10 };
    });
    ok(Math.abs(walk.y - walk.h) < 0.2 && walk.dx < 1, 'you can walk on the roof (no collision with your own building)', JSON.stringify(walk));
    const star = await S(() => {
      const G = g(); const pl = G.humans.player; const roofs = G.world.roofs;
      const idx = G.world.landmarks.collectibles.findIndex((c, i) => c.y && !G.collectibles.isCollected(i));
      const c = G.world.landmarks.collectibles[idx];
      const r = roofs.find((q) => Math.abs((q.minX + q.maxX) / 2 - c.x) < 1 && Math.abs((q.minZ + q.maxZ) / 2 - c.z) < 1);
      // from the street underneath: no
      pl.roof = null; pl.y = 0.1; pl.x = c.x; pl.z = c.z + 40; // far
      const street = G.collectibles.tryCollect(c.x, c.z, 4, 0.1);
      const onRoof = G.collectibles.tryCollect(c.x, c.z, 4, r.h);
      return { street, onRoof, idx };
    });
    ok(star.street === -1 && star.onRoof === star.idx, 'rooftop stars can only be collected from the roof', JSON.stringify(star));
    // fall damage from the edge
    const fall = await S(() => {
      const G = g(); const pl = G.humans.player; const r = G.world.roofs[0];
      G.humans.kids = false; pl.hp = pl.maxHp = 100;
      pl.roof = r; pl.y = r.h; pl.grounded = true; pl.peak = r.h; pl.x = r.maxX + 1.2; pl.z = (r.minZ + r.maxZ) / 2; pl.vx = pl.vz = 0;
      for (let i = 0; i < 60; i++) G.update(0.05);
      return { y: Math.round(pl.y * 10) / 10, roof: !!pl.roof, hp: Math.round(pl.hp) };
    });
    ok(fall.y < 0.5 && !fall.roof && fall.hp < 100, 'walking off the roof drops you and hurts (Kids Play off)', JSON.stringify(fall));
    const kidsFall = await S(() => {
      const G = g(); const pl = G.humans.player; const r = G.world.roofs[0];
      G.humans.kids = true; pl.hp = pl.maxHp = 100;
      pl.roof = r; pl.y = r.h; pl.grounded = true; pl.peak = r.h; pl.x = r.maxX + 1.2; pl.z = (r.minZ + r.maxZ) / 2;
      for (let i = 0; i < 60; i++) G.update(0.05);
      return { hp: Math.round(pl.hp) };
    });
    ok(kidsFall.hp === 100, 'Kids Play: falls do not hurt', JSON.stringify(kidsFall));

    // rooftop dash: start on the first roof, then reach three more
    const dash = await S(() => {
      const G = g(); const D = G.roofDash; const pl = G.humans.player; const start = G.world.roofs[0];
      G.stars = 0; G.state = 'play'; G.onFoot = true;
      const at = (r) => { pl.roof = r; pl.x = (r.minX + r.maxX) / 2; pl.z = (r.minZ + r.maxZ) / 2; pl.y = r.h; };
      D.cooldown = 0; at(start); D.update(0.1);
      const started = D.active; const cash0 = G.cashAmount;
      for (const r of D.chain.slice()) { at(r); D.update(0.1); }
      return { started, done: !D.active, gain: G.cashAmount - cash0, chain: D.chain.length };
    });
    ok(dash.started && dash.done && dash.gain === 2750 && dash.chain === 3, 'Rooftop Dash: three roofs for $2,750 in total', JSON.stringify(dash));
    await S(() => { const pl = g().humans.player; pl.roof = null; pl.y = 0.1; });

    // shops
    const shops = await S(() => { const G = g(); const R = G.interiors.rooms; const bad = R.filter((r) => G.world.boxes.some((b) => r.door.x > b.minX && r.door.x < b.maxX && r.door.z > b.minZ && r.door.z < b.maxZ)).length; return { n: R.length, bad, ids: R.map((r) => r.id).join(',') }; });
    ok(shops.n === 5 && shops.bad === 0, 'five shop doors on open pavement', JSON.stringify(shops));
    await S(() => { const G = g(); G.stars = 5; const r = G.interiors.rooms[0]; G.humans.setPlayerActive(true, r.door.x, r.door.z, 0); G.enterBuilding(r); });
    await p.waitForTimeout(700);
    ok(await S(() => g().inside === null), 'doors are locked while wanted');
    await S(() => { const G = g(); G.stars = 0; G.heat = 0; G.cash = 1000; G.interiors.rooms[0] && 0; });
    await S(() => { const G = g(); const r = G.interiors.rooms[0]; G.humans.setPlayerActive(true, r.door.x, r.door.z, 0); G.enterBuilding(r); });
    await p.waitForTimeout(900);
    const inside = await S(() => { const G = g(); const pl = G.humans.player; return { in: G.inside && G.inside.id, x: Math.round(pl.x), z: Math.round(pl.z), fx: Math.round(G.focusX) }; });
    ok(inside.in === 'donut' && inside.x > 2900, 'F at a door fades into the shop', JSON.stringify(inside));
    const vehBefore = await S(() => g().vehicles.slice(0, 6).map((v) => [Math.round(v.x), Math.round(v.z)]));
    for (let i = 0; i < 40; i++) await S(() => g().update(0.05));
    const vehAfter = await S(() => g().vehicles.slice(0, 6).map((v) => [Math.round(v.x), Math.round(v.z)]));
    ok(JSON.stringify(vehBefore) === JSON.stringify(vehAfter), 'the street is frozen while you are inside');
    const buy = await S(() => { const G = g(); const pl = G.humans.player; const r = G.inside; pl.x = r.counter.x; pl.z = r.counter.z + 2; pl.hp = 40; const c0 = G.cashAmount; G.shopAction(r); return { hp: pl.hp, paid: c0 - G.cashAmount }; });
    ok(buy.hp === pl100() && buy.paid === 10, 'donut: $10 restores full health', JSON.stringify(buy));
    function pl100() { return 100; }
    const wall = await S(() => { const G = g(); const pl = G.humans.player; const r = G.inside; pl.x = r.ox + 5; pl.z = r.oz; for (let i = 0; i < 90; i++) { pl.vx = 9; G.update(1 / 60); } return { x: pl.x - r.ox }; });
    ok(wall.x < 7.1, 'walls stop you inside the shop', JSON.stringify(wall));
    await S(() => { const G = g(); const pl = G.humans.player; const r = G.inside; pl.x = r.exit.x; pl.z = r.exit.z; G.leaveBuilding(); });
    await p.waitForTimeout(900);
    const out = await S(() => { const G = g(); const pl = G.humans.player; const r = G.interiors.rooms[0]; return { inside: !!G.inside, d: Math.round(Math.hypot(pl.x - r.door.x, pl.z - r.door.z)) }; });
    ok(!out.inside && out.d < 4, 'leaving returns you to the street door', JSON.stringify(out));
    // gun shop uses the arms panel only
    await S(() => { const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'gun'); G.humans.setPlayerActive(true, r.door.x, r.door.z, 0); G.enterBuilding(r); });
    await p.waitForTimeout(900);
    await S(() => { const G = g(); G.shopAction(G.inside); });
    const gun = await S(() => ({ state: g().state, tabs: document.querySelectorAll('.gtab').length, repair: !!document.getElementById('g-repair') }));
    ok(gun.state === 'garage' && gun.tabs === 1 && !gun.repair, 'gun shop opens the arms panel only', JSON.stringify(gun));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
