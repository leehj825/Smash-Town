// Phase 4 test: riot cops, helicopter, spike strips. node tests/police.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4195, root = path.resolve(__dirname, '..');
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
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => { window.__smash.startGame(); window.__smash.game.skills.off = true; }); // skills off: these tests count dollars and damage exactly
    await p.waitForTimeout(600);

    // spike strips come with the roadblock at 4 stars and shred the tyres
    const sp = await S(() => {
      const G = g(); G.stars = 4; G.heat = 270;
      G.spawnRoadblock();
      const rb = G.roadblocks[0];
      const s = rb && rb.strip;
      if (!s) return { strip: false };
      const d = G.driving; const base = d.ctrl.stats.maxSpeed;
      d.ctrl.position.x = s.x; d.ctrl.position.z = s.z;
      G.police.checkSpikes();
      return { strip: true, flat: d.flat, ratio: Math.round((d.ctrl.stats.maxSpeed / base) * 100) / 100, used: s.used };
    });
    ok(sp.strip && sp.flat && sp.ratio === 0.55 && sp.used, 'spike strip appears at 4 stars and shreds tyres', JSON.stringify(sp));
    // repair fixes tyres
    await S(() => { g().cash = 5000; g().openGarage(); });
    await p.click('#g-repair');
    const fixed = await S(() => ({ flat: g().driving.flat, v: g().driving.ctrl.stats.maxSpeed }));
    ok(fixed.flat === false && fixed.v > 30, 'garage repair fixes shredded tyres', JSON.stringify(fixed));
    await S(() => { g().closeGarage(); for (const rb of [...g().roadblocks]) g().removeRoadblock(rb); g().stars = 0; g().heat = 0; });

    // helicopter at 5 stars; a rocket aimed at it brings it down
    const hc = await S(() => {
      const G = g(); G.stars = 5; G.heat = 400; G.heli.cooldown = 0;
      G.updateHeli(6);
      return { active: G.heli.active, unseenZero: true };
    });
    ok(hc.active, 'helicopter arrives at 5 stars');
    await S(() => { g().enterExit(); });
    await p.waitForTimeout(700);
    const rk = await S(() => {
      const G = g(); const pl = G.humans.player; const gs = G.guns; const h = G.heli;
      gs.buyGun('rocket'); G.humans.guns = gs.flags(); G.humans.equip(6); gs.mag.rocket = 1; gs.cool = 0; gs.reloading = null;
      const f = new window.__smash.camera.position.constructor(); window.__smash.camera.getWorldDirection(f);
      const L = Math.hypot(f.x, f.z);
      h.x = pl.x + (f.x / L) * 40; h.z = pl.z + (f.z / L) * 40; h.ang = 0;
      const cash0 = G.cashAmount;
      gs.update(0.016, false, true);
      const homing = gs.rockets[0] && gs.rockets[0].homing;
      // keep the helicopter in place while the rocket flies
      for (let i = 0; i < 120 && h.active; i++) { h.x = pl.x + (f.x / L) * 40; h.z = pl.z + (f.z / L) * 40; gs.tick(0.05); }
      return { homing, down: !h.active, cashGain: G.cashAmount - cash0, cooldown: h.cooldown };
    });
    ok(rk.homing && rk.down && rk.cashGain >= 1500 && rk.cooldown > 30, 'a rocket brings the helicopter down for $1,500', JSON.stringify(rk));
    await S(() => { g().stars = 0; g().heat = 0; g().updateHeli(1); });

    // riot cops: shields soak frontal hits, blasts ignore them
    const riot = await S(() => {
      const G = g(); const pl = G.humans.player;
      G.stars = 4; G.heat = 270;
      G.humans.update(0.016, { input: G.idleInput, camYaw: 0, vehicles: G.vehicles, wantCops: 4, wantRiot: 2, playerActive: true, playerCarX: pl.x, playerCarZ: pl.z, playerCarSpeed: 0, policeCars: [], time: G.time });
      const cops = G.humans.list.filter((h) => h.active && h.role === 1);
      const riots = cops.filter((h) => h.riot);
      const r = riots[0];
      if (!r) return { cops: cops.length, riots: 0 };
      r.state = 0; r.ko = false; r.invuln = 0; r.hp = r.maxHp;
      r.x = pl.x + 3; r.z = pl.z; r.heading = Math.atan2(-1, 0); // facing the player
      const hp0 = r.hp;
      G.humans.gunHit(pl, r, 50, 1, 0, false);
      const front = hp0 - r.hp;
      r.invuln = 0; r.state = 0; r.hp = r.maxHp; r.heading = Math.atan2(1, 0); // back turned
      G.humans.gunHit(pl, r, 50, 1, 0, false);
      const back = r.maxHp - r.hp;
      r.invuln = 0; r.state = 0; r.hp = r.maxHp; r.heading = Math.atan2(-1, 0);
      G.humans.ignoreShield = true; G.humans.gunHit(pl, r, 50, 1, 0, false); G.humans.ignoreShield = false;
      const blast = r.maxHp - r.hp;
      return { cops: cops.length, riots: riots.length, front, back, blast };
    });
    ok(riot.riots >= 1 && riot.front <= 11 && riot.back >= 45 && riot.blast >= 45, 'riot cops: shield blocks front hits only, blasts pierce', JSON.stringify(riot));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
