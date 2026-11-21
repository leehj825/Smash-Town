// Guns test: node tests/guns.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4196, root = path.resolve(__dirname, '..');
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

    // buy guns in the garage
    await S(() => { g().addCash(50000); g().openGarage(); });
    await p.click('.gtab[data-tab="arms"]');
    const c0 = await S(() => g().cashAmount);
    await p.click('button.gbuy[data-g="shotgun"]');
    await p.click('button.gbuy[data-g="rocket"]');
    await p.click('button.gbuy[data-g="smg"]');
    const own = await S(() => ({ owned: g().guns.owned.join(','), cash: g().cashAmount, flags: g().humans.guns.join(',') }));
    ok(own.owned.includes('shotgun') && own.owned.includes('rocket') && own.owned.includes('smg') && c0 - own.cash === 3000 + 8000 + 2500, 'guns are bought for their prices', JSON.stringify(own));
    await p.click('button.gammo[data-g="smg"]');
    ok((await S(() => g().guns.reserve.smg)) === 120, 'ammo pack adds 60 rounds');
    await S(() => g().closeGarage());

    // on foot with the pistol
    await S(() => { g().enterExit(); });
    await p.waitForTimeout(700);
    const setup = await S(() => {
      const G = g(); const pl = G.humans.player;
      G.humans.equip(3);
      const f = new window.__smash.camera.position.constructor(); window.__smash.camera.getWorldDirection(f);
      const L = Math.hypot(f.x, f.z); const dx = f.x / L, dz = f.z / L;
      // a cop standing 8 m ahead of the camera direction
      const cop = G.humans.list.find((h) => h.role !== 0 && h.role !== undefined && h !== pl) || G.humans.list[5];
      return { weapon: pl.weapon, dx, dz, n: G.humans.list.length, roles: [...new Set(G.humans.list.map((h) => h.role))].join(',') };
    });
    ok(setup.weapon === 3, 'pistol equips with key slot 4', JSON.stringify(setup));
    const shot = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns;
      const before = gs.mag.pistol;
      gs.update(0.016, false, true);
      return { before, after: gs.mag.pistol, text: gs.hudText(), state: pl.state };
    });
    ok(shot.after === shot.before - 1 && /12|11/.test(shot.text), 'firing uses a round and shows ammo', JSON.stringify(shot));
    ok(shot.state !== 3, 'firing a gun does not start a melee attack');

    // hit a cop ahead of the camera
    const hit = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns;
      const f = new window.__smash.camera.position.constructor(); window.__smash.camera.getWorldDirection(f);
      const L = Math.hypot(f.x, f.z); const dx = f.x / L, dz = f.z / L;
      const cop = G.humans.list.find((h) => h !== pl && h.role === 1) ?? G.humans.list.find((h) => h !== pl && h.role === 2);
      return { found: !!cop, role: cop && cop.role, dx, dz, px: pl.x, pz: pl.z };
    });
    // use the trace directly: any human placed in the line of fire is hit first
    const tr = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns;
      const h = G.humans.list.find((q) => q !== pl);
      h.active = true; h.state = 0; h.ko = false; h.x = pl.x + 6; h.z = pl.z; h.hp = 100;
      const t = gs.trace(pl.x, pl.z, 1, 0, 40, null);
      return { kind: t && t.kind, d: t && Math.round(t.t * 10) / 10 };
    });
    ok(tr.kind === 'human' && tr.d > 4 && tr.d < 6.5, 'ray finds a person in the line of fire', JSON.stringify(tr));
    const dmg = await S(() => {
      const G = g(); const pl = G.humans.player;
      const h = G.humans.list.find((q) => q !== pl && q.active);
      const hp0 = h.hp;
      G.humans.gunHit(pl, h, 26, 1, 0, false);
      return { hp0, hp1: h.hp };
    });
    ok(dmg.hp1 <= dmg.hp0 - 20, 'a bullet hit lowers health', JSON.stringify(dmg));

    // reload cycle
    const rl = await S(() => {
      const G = g(); const gs = G.guns;
      gs.mag.pistol = 3; gs.reload();
      return { text: gs.hudText(), need: false };
    });
    ok(/RELOADING|장전/.test(rl.text), 'reload starts and shows on the HUD');
    await S(() => { const gs = g().guns; for (let i = 0; i < 20; i++) gs.update(0.1, false, false); });
    ok((await S(() => g().guns.mag.pistol)) === 12, 'reload refills the magazine');

    // SMG auto fire and running dry
    await S(() => { g().humans.equip(4); const gs = g().guns; gs.mag.smg = 3; gs.reserve.smg = 0; });
    const dry = await S(() => { const gs = g().guns; for (let i = 0; i < 12; i++) gs.update(0.1, true, true); return { mag: gs.mag.smg }; });
    ok(dry.mag === 0, 'SMG fires automatically until the magazine is empty', JSON.stringify(dry));
    // rocket explosion
    const rk = await S(async () => {
      const G = g(); const pl = G.humans.player; const gs = G.guns;
      G.humans.equip(6); gs.mag.rocket = 1;
      const sh0 = G.cameraRig.camera.position.clone();
      gs.update(0.016, false, true);
      const launched = gs.rockets.length;
      for (let i = 0; i < 90; i++) gs.tick(0.05);
      return { launched, left: gs.rockets.length };
    });
    ok(rk.launched === 1 && rk.left === 0, 'a rocket flies and explodes', JSON.stringify(rk));
    // Kids Play: gunfire never kills
    const kids = await S(() => {
      const G = g(); const pl = G.humans.player;
      const h = G.humans.list.find((q) => q !== pl && q.role === 1) ?? G.humans.list.find((q) => q !== pl);
      G.humans.kids = true; h.active = true; h.ko = false; h.hp = 5; h.state = 0;
      for (let i = 0; i < 4; i++) { h.invuln = 0; G.humans.gunHit(pl, h, 60, 1, 0, true); }
      return { dead: h.state === 8 };
    });
    ok(!kids.dead, 'Kids Play: nobody dies from gunfire');
    // busted loses spare ammo but keeps the guns
    await S(() => { const G = g(); G.guns.reserve.shotgun = 12; G.guns.loseAmmo(); });
    ok(await S(() => g().guns.reserve.shotgun === 0 && g().guns.has('shotgun')), 'losing ammo keeps the guns');
    // persistence
    await S(() => { g().guns.reserve.smg = 77; g().saveDirty = true; g().flushSave(); });
    await p.reload(); await p.waitForFunction(() => window.__smash);
    const kept = await S(() => ({ owned: g().guns.owned.join(','), smg: g().guns.reserve.smg }));
    ok(kept.owned.includes('rocket') && kept.smg === 77, 'guns and ammo survive a reload', JSON.stringify(kept));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
