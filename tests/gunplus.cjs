// Gun content: upgrades, target practice, drive-by. node tests/gunplus.cjs
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
    await S(() => { window.__smash.startGame(); window.__smash.game.skills.off = true; }); // skills off: these tests count dollars and damage exactly
    await p.waitForTimeout(600);
    await S(() => { const G = g(); G.addCash(50000); G.guns.buyGun('smg'); G.humans.guns = G.guns.flags(); G.enterExit(); });
    await p.waitForTimeout(600);

    const upg = await S(() => {
      const G = g(); const gs = G.guns; G.addCash(100000);
      gs.buyGun('pistol');
      const d0 = gs.dmgOf({ id: 'pistol', dmg: 20 }), m0 = gs.maxMag({ id: 'pistol', mag: 12 });
      const cash = G.cash; G.openArmsForTest && 0;
      gs.up.pistol = [2, 2];
      const d1 = gs.dmgOf({ id: 'pistol', dmg: 20 }), m1 = gs.maxMag({ id: 'pistol', mag: 12 });
      G.flushSave && G.flushSave();
      const saved = JSON.stringify(G.save.gunUp || {});
      return { d0, d1, m0, m1, saved };
    });
    ok(upg.d1 > upg.d0 && upg.m1 > upg.m0 && upg.saved.includes('"pistol":[2,2]'), 'upgrades raise damage and magazine, and are saved', JSON.stringify(upg));

    const range = await S(() => {
      const G = g(); const R = G.range; const gs = G.guns; const pl = G.humans.player;
      G.stars = 0; G.humans.equip(3); G.state = 'play'; G.onFoot = true; G.inside = null;
      R.markers(); const sp = R.spot;
      G.humans.setPlayerActive(true, sp.x, sp.z, 0);
      for (let i = 0; i < 3; i++) R.update(0.1);
      const started = R.running && R.targets.length > 0;
      const n = R.targets.length;
      const cash0 = G.cash;
      for (const t of [...R.targets]) R.hit(t);
      return { started, n, done: !R.running, paid: G.cash - cash0 };
    });
    ok(range.started && range.done && range.paid >= 800, 'target practice starts at the Gun Shop and pays out when every target is hit', JSON.stringify(range));

    const drive = await S(() => {
      const G = g(); const gs = G.guns; const pl = G.humans.player;
      const v = G.vehicles.find((q) => q.owned) || G.vehicles[0];
      G.humans.setPlayerActive(true, v.x, v.z, 0); G.enterExit();
      const driving = !!G.driving;
      G.humans.equip(3); gs.cool = 0; gs.reloading = null; gs.mag.pistol = 12;
      const before = gs.mag.pistol;
      G.input.wasPressed = (k) => k === 'Attack';
      G.update(0.05);
      return { driving, shot: before - gs.mag.pistol };
    });
    ok(drive.driving && drive.shot === 1, 'a pistol can be fired from the car', JSON.stringify(drive));
    const bank = await S(() => {
      const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'bank');
      G.stars = 0; G.cash = 5000; G.save.bank = 0;
      G.shops.action(r);
      const dep = { cash: G.cash, bank: G.save.bank };
      G.cash = 0; G.shops.deskAction(r);
      return { dep, after: G.cash, bank: G.save.bank };
    });
    ok(bank.dep.cash === 0 && bank.dep.bank === 5000 && bank.after === 5000 && bank.bank === 0, 'the bank takes deposits and pays them back', JSON.stringify(bank));
    const mach = await S(() => {
      const G = g(); const M = G.machines; const pl = G.humans.player;
      const v = M.list.find((m) => m.kind === 'vending'), a = M.list.find((m) => m.kind === 'atm');
      G.humans.setPlayerActive(true, v.x, v.z + 1.2, 0); G.onFoot = true; G.inside = null; G.state = 'play';
      pl.hp = 50; G.cash = 100; M.use(M.nearest(pl.x, pl.z));
      const soda = { hp: pl.hp, cash: G.cash };
      G.save.bank = 1000; G.cash = 0; M.use(a);
      return { n: M.list.length, soda, atmCash: G.cash, bank: G.save.bank };
    });
    ok(mach.n > 5 && mach.soda.cash === 95 && mach.soda.hp > 50 && mach.atmCash === 490 && mach.bank === 500, 'vending machines heal for $5 and ATMs pay out savings', JSON.stringify(mach));
    const pre = await S(() => {
      const G = g();
      const v = G.vehicles.find((q) => q.owned) || G.vehicles[0];
      const gar = G.world.garages[0];
      v.ctrl.reset(gar.x, gar.z, 0); G.humans.setPlayerActive(false, 0, 0, 0);
      v.ai = 'player'; G.driving = v; G.onFoot = false; G.state = 'play'; G.inside = null;
      G.stars = 3; G.heat = 170; G.crimeT = 0;
      G.hideouts.parkInGarage();
      return { doorOk: !!gar.door };
    });
    await p.waitForFunction(() => window.__smash.game.inside, null, { timeout: 30000 });
    const hide = await S((pre) => {
      const G = g();
      const inside = G.inside.id === 'garage' && G.followable.position.x > 3000; // the camera must follow you into the pocket
      const startStars = G.stars;
      for (let i = 0; i < 400 && G.stars > 0; i++) G.update(0.05);
      return { doorOk: pre.doorOk, inside, startStars, stars: G.stars };
    }, pre);
    ok(hide.doorOk && hide.inside && hide.startStars === 3 && hide.stars === 0, 'a garage building lets you slip in and lie low until the wanted level is gone', JSON.stringify(hide));
    const counter = await S(() => {
      const G = g();
      G.hideouts.openCounter();
      const open = G.state === 'garage' && !!G.driving;
      G.closeGarage();
      return { open, drivingAfter: !!G.driving, state: G.state };
    });
    ok(counter.open && !counter.drivingAfter && counter.state === 'play', 'the garage counter opens the car menu and closes cleanly', JSON.stringify(counter));
    const bay = await S(() => {
      const G = g();
      const room = G.inside;
      const v0 = G.hideouts.garageVehicle;
      const inBay = !!v0 && v0.x > 3000;
      G.hideouts.openCounter();
      G.selectVehicle('sedan');
      G.update(0.05);
      const swapped = G.driving.kind === 'sedan' && G.driving.x > 3000;
      G.closeGarage();
      return { inBay, swapped, kind: G.hideouts.garageVehicle.kind, home: !!G.hideouts.garageHome };
    });
    ok(bay.inBay && bay.swapped && bay.kind === 'sedan', 'your car stands in the garage and changes when the menu swaps it', JSON.stringify(bay));
    await S(() => { const G = g(); const pl = G.humans.player; const r = G.inside; pl.x = r.exit.x; pl.z = r.exit.z; G.leaveBuilding(); });
    await p.waitForFunction(() => !window.__smash.game.inside, null, { timeout: 30000 });
    const back = await S(() => { const G = g(); const v = G.hideouts.garageVehicle; return { x: Math.round(v.x), far: v.x > 3000 }; });
    ok(!back.far, 'the car goes back out on the street when you leave', JSON.stringify(back));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
