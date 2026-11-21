// Crosshair and aiming test. node tests/crosshair.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4189, root = path.resolve(__dirname, '..');
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
    await S(() => { const G = g(); G.addCash(50000); for (const id of ['smg', 'rocket']) G.guns.buyGun(id); G.humans.guns = G.guns.flags(); });
    const shown = () => S(() => !document.getElementById('crosshair').hidden);
    const frames = (n) => S((n) => { for (let i = 0; i < n; i++) g().update(1 / 60); }, n);

    // in the car, or on foot with fists: no crosshair
    await frames(3);
    ok(!(await shown()), 'no crosshair while driving');
    await S(() => g().enterExit()); await p.waitForTimeout(600);
    await S(() => { g().humans.equip(0); }); await frames(3);
    ok(!(await shown()), 'no crosshair with fists');
    await S(() => { g().humans.equip(4); }); await frames(3);
    ok(await shown(), 'crosshair with a gun in hand');

    // zoom: right mouse, the AIM button or the left trigger tighten the camera
    const fov = await S(() => {
      const G = g(); const cam = window.__smash.camera; const out = {};
      G.input.setVirtual('aim', false); for (let i = 0; i < 90; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.aim = cam.fov;
      G.input.setVirtual('aim', true); for (let i = 0; i < 90; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.zoom = cam.fov;
      G.input.setVirtual('aim', false); G.humans.equip(0); for (let i = 0; i < 120; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.fists = cam.fov;
      G.humans.equip(4);
      return out;
    });
    ok(fov.zoom < fov.aim - 3 && fov.aim < fov.fists - 2, 'the camera tightens when a gun is out and zooms when aiming', JSON.stringify(fov));

    // the body keeps facing where the camera points, even when walking sideways
    const face = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); G.cameraRig.footYaw = 1.2; pl.heading = 0;
      for (let i = 0; i < 40; i++) { pl.mvx = 3; pl.mvz = 0; G.update(1 / 60); }
      return Math.round(pl.heading * 10) / 10;
    });
    ok(face === 1.2, 'the body faces the camera direction', String(face));
    // sprinting lowers the gun: the crosshair goes and the body turns with the movement
    const sprint = await S(() => {
      const G = g(); const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(G.input), 'nitro');
      Object.defineProperty(G.input, 'nitro', { get: () => true, configurable: true });
      G.update(1 / 60); const hidden = document.getElementById('crosshair').hidden;
      delete G.input.nitro;
      return hidden;
    });
    ok(sprint === true, 'sprinting hides the crosshair');

    // what the crosshair points at
    const look = await S(() => {
      const G = g(); const pl = G.humans.player; const cam = window.__smash.camera; const gs = G.guns;
      G.humans.equip(4);
      const aimAt = (x, y, z, from) => { cam.position.set(from[0], from[1], from[2]); cam.lookAt(x, y, z); cam.updateMatrixWorld(true); gs.updateAim(); return { ...gs.aimPoint }; };
      const base = [pl.x - 3, 2.2, pl.z];
      const dummy = G.humans.list.find((h) => h !== pl);
      dummy.active = true; dummy.state = 0; dummy.ko = false; dummy.hp = 100; dummy.invuln = 0;
      dummy.x = pl.x + 14; dummy.z = pl.z; dummy.y = 0.1;
      const out = {};
      dummy.role = 1; out.cop = aimAt(dummy.x, 1.0, dummy.z, base).hostile;
      dummy.role = 0; out.civ = aimAt(dummy.x, 1.0, dummy.z, base).hostile;
      dummy.x += 500;
      const pc = G.vehicles.find((v) => v.isPolice) ?? G.spawnVehicle('police', 0x1a1a24, pl.x + 14, pl.z, 0, 'parked');
      pc.ctrl.position.x = pl.x + 14; pc.ctrl.position.z = pl.z;
      out.car = aimAt(pc.x, 0.8, pc.z, base).hostile;
      pc.ctrl.position.x += 500;
      const ground = aimAt(pl.x + 30, 0.0, pl.z, [pl.x - 3, 2.2, pl.z]);
      out.groundT = Math.round(ground.t);
      return out;
    });
    ok(look.cop && !look.civ && look.car, 'red over cops and police cars, not over civilians', JSON.stringify(look));
    ok(look.groundT > 25 && look.groundT < 40, 'the crosshair ray ends on the ground when nothing is in the way', String(look.groundT));

    // bullets go where the crosshair points: a cop off to the side, found by the crosshair, is the one that gets hit
    const shot = await S(() => {
      const G = g(); const pl = G.humans.player; const cam = window.__smash.camera; const gs = G.guns;
      G.humans.equip(3); G.input.padActive = false; gs.cool = 0; gs.reloading = null; gs.mag.pistol = 12;
      const cop = G.humans.list.find((h) => h !== pl); cop.active = true; cop.role = 1; cop.state = 0; cop.ko = false; cop.hp = 100; cop.invuln = 0;
      const ang = 0.35; cop.x = pl.x + Math.sin(ang) * 16; cop.z = pl.z + Math.cos(ang) * 16; cop.y = 0.1;
      // a decoy straight ahead of the player, not under the crosshair
      const decoy = G.humans.list.find((h) => h !== pl && h !== cop && h.role === 0); decoy.active = true; decoy.state = 0; decoy.hp = 100; decoy.x = pl.x; decoy.z = pl.z + 9; decoy.y = 0.1;
      cam.position.set(pl.x - 1, 2.2, pl.z - 3); cam.lookAt(cop.x, 1.0, cop.z); cam.updateMatrixWorld(true);
      gs.updateAim();
      const before = cop.hp, decoyBefore = decoy.hp;
      gs.update(0.016, false, true);
      const res = { copHit: cop.hp < before, decoyHit: decoy.hp < decoyBefore, heading: Math.round(pl.heading * 100) / 100 };
      decoy.x += 600; cop.x += 600;
      return res;
    });
    ok(shot.copHit && !shot.decoyHit, 'the shot goes to the crosshair, not straight ahead', JSON.stringify(shot));

    // the helicopter is shot where the crosshair is on it, and rockets lock on
    const heli = await S(() => {
      const G = g(); const pl = G.humans.player; const cam = window.__smash.camera; const gs = G.guns; const h = G.heli;
      h.active = true; h.hp = 100; h.group.visible = true; h.x = pl.x + 25; h.z = pl.z + 10; h.y = 22;
      G.humans.equip(4); gs.cool = 0; gs.reloading = null; gs.mag.smg = 30; gs.reserve.smg = 60;
      cam.position.set(pl.x - 2, 2.2, pl.z - 2); cam.lookAt(h.x, h.y, h.z); cam.updateMatrixWorld(true);
      gs.updateAim();
      const seen = gs.aimPoint.heli;
      for (let i = 0; i < 6; i++) { gs.cool = 0; gs.update(0.016, true, true); }
      const hp = h.hp;
      // aim off the helicopter: bullets pass under it
      cam.lookAt(pl.x + 40, 1.0, pl.z - 20); cam.updateMatrixWorld(true); gs.updateAim();
      const off = gs.aimPoint.heli;
      h.remove();
      return { seen, hp, off };
    });
    ok(heli.seen && heli.hp < 100 && !heli.off, 'bullets wear down the helicopter when the crosshair is on it', JSON.stringify(heli));

    // right mouse zooms with a gun out and kicks with fists
    const kick = [];
    for (const w of [4, 0]) {
      await S((w) => { const G = g(); G.humans.equip(w); G.input.gunOut = w >= 3; }, w);
      await p.mouse.move(400, 240);
      await p.mouse.down({ button: 'right' });
      kick.push(await S(() => g().input.wasPressed('Kick')));
      await p.mouse.up({ button: 'right' });
    }
    ok(kick[0] === false && kick[1] === true, 'right mouse kicks with fists but is the zoom button with a gun', kick.join(','));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
