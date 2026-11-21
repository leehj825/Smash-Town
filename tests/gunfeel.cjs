// Gun feel: muzzle flash, brass cases, bullet marks, a sagging flat tyre. node tests/gunfeel.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4186, root = path.resolve(__dirname, '..');
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
    await S(() => { const G = g(); G.addCash(50000); G.guns.buyGun('smg'); G.humans.guns = G.guns.flags(); G.enterExit(); });
    await p.waitForTimeout(600);

    const feel = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns; const sp = G.world.spawn;
      const fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
      G.humans.setPlayerActive(true, sp.x, sp.z, sp.heading); G.onFoot = true; G.state = 'play';
      for (const v of G.vehicles) if (Math.hypot(v.x - sp.x, v.z - sp.z) < 60) v.ctrl.position.x += 900;
      G.humans.equip(3); gs.cool = 0; gs.reloading = null; gs.mag.pistol = 12; G.input.padActive = false;
      // a wall 8 m ahead, across the line of fire
      const mid = [pl.x + fx * 8, pl.z + fz * 8];
      const wall = { minX: mid[0] - 3, maxX: mid[0] + 3, minZ: mid[1] - 3, maxZ: mid[1] + 3, h: 12 };
      G.world.boxes.push(wall);
      let casings = 0; const orig = G.vfx.emitDebris.bind(G.vfx); G.vfx.emitDebris = (...a) => { if (a[5] === 0xe0b84a) casings++; orig(...a); };
      G.cameraRig.footYaw = sp.heading;
      const marksBefore = gs.marks.filter((m) => m.mesh.visible).length;
      // aim the shot at the wall: the camera ray, from the player's back, through the wall centre
      const cam = window.__smash.camera; cam.position.set(pl.x - fx * 3, 1.6, pl.z - fz * 3); cam.lookAt(mid[0], 1.4, mid[1]); cam.updateMatrixWorld(true);
      G.aimOn = true; gs.updateAim();
      gs.update(0.016, false, true);
      const out = { flash: gs.flashMesh.visible, casings, marks: gs.marks.filter((m) => m.mesh.visible).length - marksBefore };
      G.world.boxes.splice(G.world.boxes.indexOf(wall), 1);
      G.aimOn = false;
      return out;
    });
    ok(feel.flash && feel.casings === 1 && feel.marks === 1, 'a shot shows a muzzle flash, throws a brass case and marks the wall', JSON.stringify(feel));

    const tire = await S(() => {
      const G = g(); const v = G.lastDriven || G.vehicles.find((q) => q.owned);
      const w = v.ctrl.model.wheelMeshes[v.id % 4];
      const before = w.scale.y;
      v.popTire(); const popped = w.scale.y; v.fixTire(); const fixed = w.scale.y;
      return { ratio: Math.round((popped / before) * 100) / 100, back: Math.abs(fixed - before) < 1e-6, flat: v.flat };
    });
    ok(tire.ratio === 0.55 && tire.back && tire.flat === false, 'a shot-out tyre sags, and a repair rounds it again', JSON.stringify(tire));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
