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
    await S(() => window.__smash.startGame());
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
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
