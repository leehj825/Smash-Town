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
    await S(() => { g().humans.equip(4); g().aimOn = false; g().autoAim = false; }); await frames(3);
    ok(!(await shown()), 'a gun out does not show the crosshair until aiming is switched on');
    await S(() => g().input.tap('AimToggle')); await frames(3);
    ok(await shown() && (await S(() => g().aimOn)), 'the AIM button switches aiming on (a toggle)');
    await S(() => g().input.tap('AimToggle')); await frames(3);
    ok(!(await shown()), 'pressing it again switches aiming off');
    await S(() => { window.__tog = []; const set = g().input.pressed; if (!set.__spy2) { const add = set.add.bind(set); set.add = (c) => { if (c === 'AimToggle') window.__tog.push(c); return add(c); }; set.__spy2 = true; } });
    await p.mouse.move(400, 240); await p.mouse.down({ button: 'right' }); await p.mouse.up({ button: 'right' });
    ok((await S(() => window.__tog.length)) === 1, 'right click is the aim toggle with a gun out');
    await frames(3);
    await S(() => { if (!g().aimOn) g().input.tap('AimToggle'); }); await frames(3);
    await p.keyboard.press('KeyX'); await p.waitForTimeout(200);
    ok(!(await S(() => g().aimOn)), 'X switches aiming off as well');
    await S(() => { g().aimOn = true; }); await frames(3);
    ok(await shown(), 'crosshair with a gun in hand and aiming on');

    // zoom: right mouse, the AIM button or the left trigger tighten the camera
    const fov = await S(() => {
      const G = g(); const cam = window.__smash.camera; const out = {};
      G.aimOn = true; for (let i = 0; i < 90; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.aim = cam.fov;
      G.aimOn = false; for (let i = 0; i < 90; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.zoom = cam.fov;
      G.humans.equip(0); for (let i = 0; i < 120; i++) { G.update(1 / 60); G.cameraRig.update(1 / 60, G.followable); } out.fists = cam.fov;
      G.humans.equip(4);
      return out;
    });
    ok(fov.aim < fov.zoom - 3 && Math.abs(fov.zoom - fov.fists) < 1.5, 'the camera tightens only while aiming is on; off, it is the ordinary camera', JSON.stringify(fov));

    // the body keeps facing where the camera points, even when walking sideways
    const face = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); G.aimOn = true; G.cameraRig.footYaw = 1.2; pl.heading = 0;
      for (let i = 0; i < 40; i++) { pl.mvx = 3; pl.mvz = 0; G.update(1 / 60); }
      return Math.round(pl.heading * 10) / 10;
    });
    ok(face === 1.2, 'the body faces the camera direction', String(face));
    // aiming off: you walk and run normally, the body turns with the movement
    const normal = await S(() => {
      const G = g(); const pl = G.humans.player; G.aimOn = false; G.autoAim = false; G.cameraRig.footYaw = 0; pl.heading = 0; pl.aimT = 0;
      G.input.setStick(-1, 0); // the stick pushed to the left of the screen (camera along +z): the world +x direction
      for (let i = 0; i < 40; i++) G.update(1 / 60);
      G.input.setStick(0, 0);
      return { heading: Math.round(pl.heading * 10) / 10, clip: pl.anim.clipName };
    });
    ok(Math.abs(normal.heading - 1.6) < 0.15 && normal.clip === 'proRunF', 'with aiming off the body turns with the movement and runs forward', JSON.stringify(normal));
    await S(() => { g().aimOn = true; });
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

    // bullets go where the crosshair points: a cop beside the road, found by the crosshair, is the one that gets hit
    const shot = await S(() => {
      const G = g(); const pl = G.humans.player; const cam = window.__smash.camera; const gs = G.guns; const sp = G.world.spawn;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading), rx = Math.cos(sp.heading), rz = -Math.sin(sp.heading);
      G.humans.setPlayerActive(true, sp.x, sp.z, sp.heading); G.onFoot = true;
      for (const v of G.vehicles) if (Math.hypot(v.x - sp.x, v.z - sp.z) < 70) v.ctrl.position.x += 900; // nothing parked around the shooter
      G.humans.equip(3); G.input.padActive = false; gs.cool = 0; gs.reloading = null; gs.mag.pistol = 12;
      const at = (f, r) => [pl.x + fx * f + rx * r, pl.z + fz * f + rz * r];
      const cop = G.humans.list.find((h) => h !== pl); cop.active = true; cop.role = 1; cop.state = 0; cop.ko = false; cop.hp = 100; cop.invuln = 0; cop.y = 0.1;
      [cop.x, cop.z] = at(16, 2);
      // a decoy straight ahead of the player, not under the crosshair
      const decoy = G.humans.list.find((h) => h !== pl && h !== cop && h.role === 0); decoy.active = true; decoy.state = 0; decoy.hp = 100; decoy.y = 0.1;
      [decoy.x, decoy.z] = at(9, 0);
      const c = at(-3, -0.8);
      cam.position.set(c[0], 2.2, c[1]); cam.lookAt(cop.x, 1.0, cop.z); cam.updateMatrixWorld(true);
      gs.updateAim();
      const before = cop.hp, decoyBefore = decoy.hp;
      const seen = gs.aimPoint.hostile;
      gs.update(0.016, false, true);
      const res = { seen, copHit: cop.hp < before, decoyHit: decoy.hp < decoyBefore };
      decoy.x += 600; cop.x += 600;
      return res;
    });
    ok(shot.seen && shot.copHit && !shot.decoyHit, 'the shot goes to the crosshair, not straight ahead', JSON.stringify(shot));

    // the helicopter is shot where the crosshair is on it, and rockets lock on
    const heli = await S(() => {
      const G = g(); const pl = G.humans.player; const cam = window.__smash.camera; const gs = G.guns; const h = G.heli; const sp = G.world.spawn;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
      G.humans.setPlayerActive(true, sp.x, sp.z, sp.heading);
      for (const v of G.vehicles) if (Math.hypot(v.x - sp.x, v.z - sp.z) < 70) v.ctrl.position.x += 900;
      h.active = true; h.hp = 100; h.group.visible = true; h.x = pl.x + fx * 22; h.z = pl.z + fz * 22; h.y = 20;
      G.humans.equip(4); gs.cool = 0; gs.reloading = null; gs.mag.smg = 30; gs.reserve.smg = 60;
      cam.position.set(pl.x - fx * 2, 2.2, pl.z - fz * 2); cam.lookAt(h.x, h.y, h.z); cam.updateMatrixWorld(true);
      gs.updateAim();
      const seen = gs.aimPoint.heli;
      for (let i = 0; i < 6; i++) { gs.cool = 0; gs.update(0.016, true, true); }
      const hp = h.hp;
      // aim off the helicopter: bullets pass under it
      cam.lookAt(pl.x + fx * 40, 1.0, pl.z + fz * 40); cam.updateMatrixWorld(true); gs.updateAim();
      const off = gs.aimPoint.heli;
      h.remove();
      return { seen, hp, off };
    });
    ok(heli.seen && heli.hp < 100 && !heli.off, 'bullets wear down the helicopter when the crosshair is on it', JSON.stringify(heli));

    // auto-aim: locks on to the closest hostile in range, behind you too
    const autoRes = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns; const sp = G.world.spawn;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading), rx = Math.cos(sp.heading), rz = -Math.sin(sp.heading);
      G.humans.setPlayerActive(true, sp.x, sp.z, sp.heading); G.onFoot = true;
      for (const v of G.vehicles) if (Math.hypot(v.x - sp.x, v.z - sp.z) < 90) v.ctrl.position.x += 900;
      G.humans.equip(3); G.aimOn = false; G.autoAim = true; G.input.padActive = false;
      gs.cool = 0; gs.reloading = null; gs.mag.pistol = 12; pl.hp = pl.maxHp;
      const cops = G.humans.list.filter((h) => h !== pl).slice(0, 3);
      for (const c of cops) { c.active = true; c.role = 1; c.state = 0; c.ko = false; c.leaving = false; c.hp = 100; c.invuln = 0; c.y = 0.1; }
      const put = (c, f, r) => { c.x = pl.x + fx * f + rx * r; c.z = pl.z + fz * f + rz * r; };
      put(cops[0], -10, 0.5); put(cops[1], 22, 0); put(cops[2], 70, 0);   // behind and close, ahead and further, far away
      const out = {};
      G.cameraRig.footYaw = sp.heading; pl.heading = sp.heading;
      for (let i = 0; i < 60; i++) G.update(1 / 60);
      const ap = gs.aimPoint;
      out.locked = !!ap && ap.auto === true;
      out.closest = !!ap && Math.hypot(ap.x - cops[0].x, ap.z - cops[0].z) < 1;
      let d = Math.abs(Math.atan2(Math.sin(pl.heading - (sp.heading + Math.PI)), Math.cos(pl.heading - (sp.heading + Math.PI))));
      out.turned = Math.round(d * 100) / 100;
      const before = cops[0].hp; const farBefore = cops[1].hp;
      gs.update(0.016, false, true);
      out.hit = cops[0].hp < before; out.otherHit = cops[1].hp < farBefore;
      // out of range: only the far cop is left, 70 m away
      put(cops[0], 400, 0); put(cops[1], 400, 3);
      for (let i = 0; i < 5; i++) G.update(1 / 60);
      out.none = G.guns.aimPoint === null;
      // manual aim wins over auto-aim
      G.aimOn = true; put(cops[0], -10, 0.5);
      for (let i = 0; i < 5; i++) G.update(1 / 60);
      out.manualWins = !G.guns.aimPoint || !G.guns.aimPoint.auto;
      G.aimOn = false; G.autoAim = false;
      for (const c of cops) c.x += 700;
      return out;
    });
    ok(autoRes.locked && autoRes.closest && autoRes.turned < 0.2, 'auto-aim picks the closest hostile, even behind you, and turns to face it', JSON.stringify(autoRes));
    ok(autoRes.hit && !autoRes.otherHit, 'a shot with auto-aim goes to the locked target', JSON.stringify(autoRes));
    ok(autoRes.none && autoRes.manualWins, 'no target out of range; manual aiming takes priority', JSON.stringify(autoRes));
    // right mouse zooms with a gun out and kicks with fists
    const kick = [];
    for (const w of [4, 0]) {
      await S((w) => { const G = g(); G.humans.equip(w); window.__kicks = 0; const set = G.input.pressed; if (!set.__spy) { const add = set.add.bind(set); set.add = (c) => { if (c === 'Kick') window.__kicks++; return add(c); }; set.__spy = true; } }, w);
      await p.waitForTimeout(150);
      await p.mouse.move(400, 240);
      await p.mouse.down({ button: 'right' });
      await p.mouse.up({ button: 'right' });
      kick.push(await S(() => window.__kicks));
    }
    ok(kick[0] === 0 && kick[1] === 1, 'right mouse kicks with fists but is the zoom button with a gun', kick.join(','));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
