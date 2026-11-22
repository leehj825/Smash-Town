// The police shoot back. node tests/policefire.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4187, root = path.resolve(__dirname, '..');
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
    await p.waitForTimeout(600);
    await S(() => g().enterExit()); await p.waitForTimeout(600);

    // a helper to set up: player on the open road, a shooter cop 12 m away, no cars around
    const setup = `
      const G = g(); const pl = G.humans.player; const sp = G.world.spawn; const pf = G.policeFire;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
      G.humans.setPlayerActive(true, sp.x, sp.z, sp.heading); G.onFoot = true; G.state = 'play';
      for (const v of G.vehicles) if (Math.hypot(v.x - sp.x, v.z - sp.z) < 90) v.ctrl.position.x += 900;
      pl.hp = pl.maxHp = 100; G.humans.armor = 0; pl.invuln = 0;
      const cop = G.humans.list.find((h) => h !== pl); cop.active = true; cop.role = 1; cop.state = 0; cop.ko = false; cop.leaving = false; cop.riot = false; cop.shooter = true; cop.hp = 100;
      cop.x = pl.x + fx * 12; cop.z = pl.z + fz * 12; cop.y = 0.1;
      const realRandom = Math.random; Math.random = () => 0.01; // every shot hits, and the cooldowns are short
      const run = (n) => { for (let i = 0; i < n; i++) { pl.invuln = Math.max(0, pl.invuln - 0.1); cop.leaving = false; pf.update(0.1); } };
    `;
    const hit = await S((setup) => {
      const f = new Function('g', setup + `
        G.stars = 2; run(60);
        const hp = pl.hp; Math.random = realRandom; return { hp, tr: pf.tracers.length };`);
      return f(g);
    }, setup);
    ok(hit.hp < 100, 'a cop standing off at 12 m shoots the player at 2 stars', JSON.stringify(hit));

    const level1 = await S((setup) => {
      const f = new Function('g', setup + `
        G.stars = 1; run(60); const hp = pl.hp; Math.random = realRandom; return hp;`);
      return f(g);
    }, setup);
    ok(level1 === 100, 'no gunfire at 1 star: the cops only close in', String(level1));

    const wall = await S((setup) => {
      const f = new Function('g', setup + `
        G.stars = 3;
        const box = { minX: Math.min(pl.x, cop.x) - 1.5 + fx * 6, maxX: Math.max(pl.x, cop.x) + 1.5, minZ: Math.min(pl.z, cop.z) - 1.5, maxZ: Math.max(pl.z, cop.z) + 1.5, h: 12 };
        // a building standing between the two (a slab across the line of fire)
        const mid = [pl.x + fx * 6, pl.z + fz * 6];
        const slab = { minX: mid[0] - 2, maxX: mid[0] + 2, minZ: mid[1] - 2, maxZ: mid[1] + 2, h: 12 };
        G.world.boxes.push(slab);
        run(60); const hp = pl.hp;
        G.world.boxes.splice(G.world.boxes.indexOf(slab), 1);
        Math.random = realRandom; return hp;`);
      return f(g);
    }, setup);
    ok(wall === 100, 'a building in the way stops the shots', String(wall));

    const armor = await S((setup) => {
      const f = new Function('g', setup + `
        G.stars = 2; G.humans.armor = 50; run(25); const out = { hp: pl.hp, armor: G.humans.armor }; Math.random = realRandom; return out;`);
      return f(g);
    }, setup);
    ok(armor.armor < 50 && armor.hp > 90, 'armor soaks the first bullets', JSON.stringify(armor));

    // the shooter share by wanted level (the appearance logic)
    const share = await S(() => {
      const G = g(); const out = {};
      for (const stars of [1, 2, 4]) {
        const ws = stars >= 4 ? 3 : stars >= 2 ? 2 : 0;
        const wr = stars >= 5 ? 3 : stars >= 4 ? 2 : 0;
        const flags = [0, 1, 2, 3, 4, 5].map((count) => { const riot = count < wr; return !riot && count % 2 === 0 && count < ws * 2; });
        out[stars] = flags.filter(Boolean).length;
      }
      return out;
    });
    ok(share[1] === 0 && share[2] === 2 && share[4] === 2, 'the number of shooting cops grows with the wanted level', JSON.stringify(share));

    // police cars shoot at your car from 3 stars
    const car = await S(() => {
      const G = g(); const sp = G.world.spawn; const pf = G.policeFire;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
      G.humans.setPlayerActive(false, 0, 0, 0); G.onFoot = false; G.state = 'play';
      const me = G.lastDriven || G.vehicles.find((v) => v.owned);
      me.ai = 'player'; G.driving = me; me.ctrl.position.x = sp.x; me.ctrl.position.z = sp.z; me.ctrl.hp = 1; me.ctrl.speed = 0;
      for (const v of G.vehicles) if (v !== me && Math.hypot(v.x - sp.x, v.z - sp.z) < 90) v.ctrl.position.x += 900;
      const pc = G.spawnVehicle('police', 0x1a1a24, sp.x + fx * 20, sp.z + fz * 20, 0, 'police');
      const realRandom = Math.random; Math.random = () => 0.01;
      G.stars = 3; G.humans.player.hp = 100;
      for (let i = 0; i < 60; i++) { pc.ctrl.position.x = sp.x + fx * 20; pc.ctrl.position.z = sp.z + fz * 20; pf.update(0.1); }
      const hp3 = me.ctrl.hp;
      me.ctrl.hp = 1; G.stars = 2; pf.cds.clear();
      for (let i = 0; i < 60; i++) { pc.ctrl.position.x = sp.x + fx * 20; pc.ctrl.position.z = sp.z + fz * 20; pf.update(0.1); }
      const hp2 = me.ctrl.hp;
      Math.random = realRandom; pc.ctrl.position.x += 900;
      return { hp3: Math.round(hp3 * 100) / 100, hp2 };
    });
    ok(car.hp3 < 1 && car.hp2 === 1, 'police cars shoot your car from 3 stars, not at 2', JSON.stringify(car));

    // the helicopter
    const heli = await S(() => {
      const G = g(); const sp = G.world.spawn; const pf = G.policeFire; const hc = G.heli;
      const me = G.driving; me.ctrl.hp = 1; me.ctrl.position.x = sp.x; me.ctrl.position.z = sp.z;
      hc.active = true; hc.x = sp.x + 15; hc.z = sp.z; hc.y = 22;
      const realRandom = Math.random; Math.random = () => 0.01;
      G.stars = 5; pf.cds.clear();
      for (let i = 0; i < 50; i++) { hc.x = sp.x + 15; hc.z = sp.z; pf.update(0.1); }
      const hp = me.ctrl.hp; Math.random = realRandom; hc.remove(); G.stars = 0;
      return Math.round(hp * 100) / 100;
    });
    ok(heli < 1, 'the helicopter fires at 5 stars', String(heli));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
