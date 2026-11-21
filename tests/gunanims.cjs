// Gun animation test: which clip plays for each gun, heading, knock-out falls, recoil and reload kicks. node tests/gunanims.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4190, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 640, height: 480 } });
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(600);
    await S(() => { const G = g(); G.addCash(50000); for (const id of ['smg', 'shotgun', 'rocket', 'paint']) G.guns.buyGun(id); G.humans.guns = G.guns.flags(); G.enterExit(); });
    await p.waitForTimeout(700);
    // plays a weapon with the given movement for a few frames and reports the clip
    const clip = (a) => S((a) => {
      const G = g(); const pl = G.humans.player;
      // with a gun out the body always faces where the camera points: point the camera along +z
      G.humans.equip(a.w); pl.heading = 0; pl.aimYaw = 0; pl.aimT = a.aim ? 99 : 0; G.cameraRig.footYaw = 0;
      pl.vx = pl.vz = 0; G.state = 'play';
      for (let i = 0; i < 12; i++) { pl.mvx = a.mx || 0; pl.mvz = a.mz || 0; G.update(1 / 60); }
      return pl.anim.clipName;
    }, a);

    const idle = [await clip({ w: 3 }), await clip({ w: 4 }), await clip({ w: 4, aim: true }), await clip({ w: 6, aim: true }), await clip({ w: 6 }), await clip({ w: 7 })];
    // a gun that is out is always raised (the crosshair is up), so long guns idle in their aim pose
    ok(idle.join(',') === 'pistolIdle,proIdleAim,proIdleAim,rifleAimIdle,rifleAimIdle,pistolIdle', 'idle clip by gun: handgun grip, shouldered long gun, launcher on the shoulder', idle.join(','));
    const dirs = [];
    for (const [mx, mz] of [[0, 4.8], [0, -4.8], [4.8, 0], [-4.8, 0], [3.4, 3.4], [-3.4, -3.4]]) dirs.push(await clip({ w: 4, aim: true, mx, mz }));
    ok(dirs.join(',') === 'proRunF,proRunB,proRunL,proRunR,proRunFL,proRunBR', 'long guns: eight-way run relative to the aim', dirs.join(','));
    ok((await clip({ w: 5, aim: true, mz: 8.2 })) === 'proSprintF', 'sprinting uses the sprint set');
    const pist = [];
    for (const [mx, mz] of [[0, 4.8], [0, -4.8], [4.8, 0], [-4.8, 0], [0, 2.5]]) pist.push(await clip({ w: 3, aim: true, mx, mz }));
    ok(pist.join(',') === 'pistolRun,pistolRunB,pistolStrafeL,pistolStrafeR,pistolWalk', 'pistol: run, backpedal, strafes, walk', pist.join(','));

    // facing: a raised gun turns the body to the aim while you move sideways
    const face = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); pl.heading = 0; G.cameraRig.footYaw = 1;
      for (let i = 0; i < 40; i++) { pl.mvx = 0; pl.mvz = 4.8; G.update(1 / 60); }
      return { heading: Math.round(pl.heading * 10) / 10, blend: Math.round(pl.aimBlend * 10) / 10 };
    });
    ok(face.heading === 1 && face.blend === 1, 'the body faces the camera and the raised-arm layer is on while moving', JSON.stringify(face));

    // jump
    const jump = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); pl.aimT = 0; pl.mvx = pl.mvz = 0;
      pl.vy = 7.5; pl.grounded = false; pl.airT = 0; pl.y = 1;
      G.update(1 / 60); const a = pl.anim.clipName;
      for (let i = 0; i < 20; i++) { if (pl.grounded) break; pl.vy = 3; pl.y = 2; pl.grounded = false; G.update(1 / 60); }
      return [a, pl.anim.clipName];
    });
    ok(jump[0] === 'proJumpUp' && jump[1] === 'proJumpLoop', 'jump: take-off then the air loop', jump.join(','));

    // knock-out falls follow the direction of the hit
    const falls = await S(() => {
      const G = g(); const pl = G.humans.player; const out = [];
      const t = G.humans.list.find((h) => h !== pl);
      for (const [name, heading] of [['front', Math.atan2(-1, 0)], ['back', Math.atan2(1, 0)], ['side', Math.atan2(0, 1)]]) {
        t.active = true; t.state = 0; t.ko = false; t.invuln = 0; t.hp = 100; t.x = pl.x + 5; t.z = pl.z; t.heading = heading;
        G.humans.gunHit(pl, t, 60, 1, 0, true);
        out.push(name + ':' + t.fallClip);
      }
      t.fallClip = ''; t.invuln = 0; t.state = 0; t.hp = 100;
      G.humans.gunHit(pl, t, 5, 1, 0, false);   // a small hit is no knock-down: no special fall
      out.push('small:' + t.fallClip);
      return out;
    });
    ok(falls.join(',') === 'front:proDieFront,back:proDieBack,side:proDieRight,small:', 'falls by hit direction', falls.join(','));
    const playing = await S(() => {
      const G = g(); const pl = G.humans.player; const t = G.humans.list.find((h) => h !== pl);
      t.active = true; t.state = 0; t.invuln = 0; t.hp = 100; t.x = pl.x + 5; t.z = pl.z; t.heading = Math.atan2(-1, 0);
      G.humans.gunHit(pl, t, 60, 1, 0, true);
      for (let i = 0; i < 5; i++) G.update(1 / 60);
      return t.anim.clipName;
    });
    ok(playing === 'proDieFront', 'the fall clip is the one that plays', playing);

    // shot kick and reload dip
    const kick = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); G.guns.mag.smg = 30; G.guns.cool = 0; G.guns.reloading = null;
      G.guns.update(1 / 60, true, true); // an SMG fires while the button is held
      const shot = { recoil: pl.recoil > 0.9, aim: pl.aimT > 1.4 };
      G.guns.mag.smg = 5; G.guns.reload(); G.guns.update(0.5, false, false); G.guns.update(0.1, false, false);
      return { ...shot, reload: pl.reloadU > 0.1 };
    });
    ok(kick.recoil && kick.aim && kick.reload, 'a shot kicks and raises the gun; reloading starts the reload clip', JSON.stringify(kick));

    // the rifle reload clip drives the arms of long guns; handguns keep the short dip
    const rel = await S(() => {
      const G = g(); const pl = G.humans.player; const out = {};
      for (const [name, w] of [['smg', 4], ['pistol', 3]]) {
        G.humans.equip(w); G.guns.cool = 0; G.guns.reloading = null; G.guns.mag[name] = 1; G.guns.reserve[name] = 50;
        G.guns.reload(); G.guns.update(0.01, false, false); G.guns.update(0.3, false, false);
        G.update(1 / 60);
        out[name] = { u: Math.round(pl.reloadU * 100) / 100, k: Math.round(pl.reloadK * 100) / 100 };
        G.guns.reloading = null; pl.reloadU = -1; pl.reloadK = 0;
      }
      return out;
    });
    ok(rel.smg.u > 0.05 && rel.smg.u < 0.5 && rel.smg.k === 0 && rel.pistol.u === -1 && rel.pistol.k > 0.3, 'long guns use the reload clip, handguns the dip', JSON.stringify(rel));

    // a gun in hand: the flinch when hit
    const hit = await S(() => {
      const G = g(); const pl = G.humans.player; G.humans.equip(4); pl.invuln = 0;
      pl.state = 5; pl.stateDur = pl.stateT = 0.28; pl.speed = 0;
      G.update(1 / 60);
      const withGun = pl.anim.clipName;
      G.humans.equip(0); pl.state = 5; pl.stateDur = pl.stateT = 0.28; G.update(1 / 60);
      return [withGun, pl.anim.clipName];
    });
    ok(hit[0] === 'rifleHit' && hit[1] !== 'rifleHit', 'hit with a gun: the rifle flinch; with fists: the ordinary one', hit.join(','));
    await S(() => { g().humans.player.state = 0; });

    // grenades: the throw clip plays, the grenade leaves the hand part-way in, and it blows up
    const gren = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns;
      gs.buyGun('grenade'); G.humans.guns = gs.flags(); G.humans.equip(8);
      gs.cool = 0; gs.reloading = null; gs.mag.grenade = 1; gs.reserve.grenade = 3;
      let blasts = 0; const orig = G.vfx.explosion.bind(G.vfx); G.vfx.explosion = (x, z) => { blasts++; orig(x, z); };
      // open road, nothing within reach of the hand
      const sp = G.world.spawn; G.humans.setPlayerActive(true, sp.x, sp.z, 0); pl.aimT = 0;
      for (const h of G.humans.list) if (h !== pl) { h.x += 500; }
      let releasedAt = -1, clock = 0; const rel = gs.release.bind(gs); gs.release = (dx, dz) => { releasedAt = Math.round(clock * 100) / 100; rel(dx, dz); };
      G.state = 'play';
      gs.update(1 / 60, false, true);
      const thrown = { throwT: pl.throwT > 1.3, pending: !!gs.pendingThrow, mag: gs.mag.grenade };
      G.update(1 / 60);
      const clip = pl.anim.clipName;
      for (let i = 0; i < 200; i++) { gs.tick(0.02); clock += 0.02; if (releasedAt >= 0 && !gs.grenades.length) break; }
      return { ...thrown, clip, released: releasedAt, blasts, left: gs.grenades.length };
    });
    ok(gren.throwT && gren.pending && gren.mag === 0 && gren.clip === 'rifleGrenade', 'a grenade throw starts the throw clip', JSON.stringify(gren));
    ok(gren.released > 0.7 && gren.released < 1.1 && gren.blasts === 1 && gren.left === 0, 'the grenade leaves the hand at the release frame and explodes once', JSON.stringify(gren));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
