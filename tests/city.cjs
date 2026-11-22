// City systems: traffic lights, news, taxi, bounty hunter... node tests/city.cjs
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
    const ctx = await b.newContext({ viewport: { width: 800, height: 480 } });
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(800);

    const lights = await S(() => {
      const G = g(); const L = G.lights;
      const heads = L.heads.length;
      const seen = new Set();
      for (let i = 0; i < 40; i++) { L.update(0.5); seen.add(L.heads[0].axisZ ? 'z' : 'x'); }
      return { heads, junctions: heads / 4 };
    });
    ok(lights.heads > 100, 'junctions have traffic light heads', JSON.stringify(lights));
    const news = await S(() => {
      const G = g(); G.news.report('murder', true);
      const el = document.getElementById('news');
      return { shown: el.classList.contains('show'), text: el.textContent, n: G.news.log.length };
    });
    ok(news.shown && /BREAKING NEWS|속보/.test(news.text) && news.n === 1, 'a breaking-news banner reports what you did', JSON.stringify(news));
    const taxi = await S(() => {
      const G = g(); const T = G.taxi; const sp = G.world.spawn;
      G.humans.setPlayerActive(false, 0, 0, 0);
      const v = G.spawnVehicle('taxi', 0xffc400, sp.x, sp.z, sp.heading, 'player', true);
      G.driving = v; G.onFoot = false; G.state = 'play'; G.inside = null; G.stars = 0;
      for (let i = 0; i < 160 && !T.active; i++) T.update(0.05);
      const started = T.active;
      v.ctrl.position.x = T.from.x; v.ctrl.position.z = T.from.z; v.ctrl.vx = v.ctrl.vz = 0;
      T.update(0.05);
      const riding = T.phase === 'ride';
      const cash0 = G.cash;
      v.ctrl.position.x = T.to.x; v.ctrl.position.z = T.to.z; v.ctrl.vx = v.ctrl.vz = 0;
      T.update(0.05);
      return { started, riding, paid: G.cash - cash0, fares: T.completed };
    });
    ok(taxi.started && taxi.riding && taxi.paid >= 40 && taxi.fares === 1, 'a taxi gets a fare, picks them up and is paid at the destination', JSON.stringify(taxi));
    const hunt = await S(() => {
      const G = g(); G.taxi.cancel && G.taxi.cancel();
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null; G.state = 'play';
      G.stars = 4; G.heat = 270; G.hunterTimer = 0; G.crimeT = 0;
      for (let i = 0; i < 20 && !G.hunter; i++) G.update(0.05);
      const spawned = !!G.hunter;
      const cash0 = G.cash;
      if (G.hunter) G.hunter.ctrl.hp = 0;
      for (let i = 0; i < 10; i++) G.update(0.05);
      return { spawned, gained: G.cash - cash0, cleared: !G.hunter };
    });
    ok(hunt.spawned && hunt.gained >= 1500 && hunt.cleared, 'a bounty hunter joins a four-star chase and pays a bounty when wrecked', JSON.stringify(hunt));
    const race = await S(() => {
      const G = g(); const R = G.race;
      G.stars = 0; G.heat = 0; G.humans.setPlayerActive(false, 0, 0, 0);
      const st = R.starts[0];
      const v = G.spawnVehicle('sports', 0xffd500, st.x, st.z, 0, 'player', true);
      G.driving = v; G.onFoot = false; G.state = 'play'; G.inside = null; R.cooldown = 0;
      R.update(0.05);
      const counting = R.phase === 'count';
      for (let i = 0; i < 80; i++) R.update(0.05);
      const running = R.phase === 'run';
      const cash0 = G.cash;
      let n = 0;
      while (R.phase === 'run' && n++ < 20) { const c = R.cp[R.idx]; v.ctrl.position.x = c.x; v.ctrl.position.z = c.z; R.update(0.05); }
      return { counting, running, paid: G.cash - cash0, done: R.completed, best: Object.keys(R.best).length };
    });
    ok(race.counting && race.running && race.paid >= 600 && race.done === 1 && race.best === 1, 'a street race counts down, runs through checkpoints and pays the winner', JSON.stringify(race));
    const heist = await S(() => {
      const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'bank');
      G.stars = 0; G.heat = 0; G.driving = null; G.onFoot = true; G.state = 'play';
      G.inside = r; G.humans.setPlayerActive(true, r.vault.x, r.vault.z + 1.4, 0);
      const near = G.shops.vaultNear(r);
      G.shops.startHeist();
      const stars = G.stars;
      const cash0 = G.cash;
      for (let i = 0; i < 400 && G.shops.heist; i++) G.shops.updateHeist(0.05, r);
      const loot = G.cash - cash0;
      G.shops.startHeist(); // the vault is empty for a while
      G.inside = null;
      return { near, stars, loot, again: !!G.shops.heist };
    });
    ok(heist.near && heist.stars >= 3 && heist.loot >= 3500 && !heist.again, 'cracking the bank vault sets off the alarm, pays out, then the vault stays empty', JSON.stringify(heist));
    const homeBuy = await S(() => {
      const G = g(); const h = G.world.homes[0];
      G.stars = 0; G.cash = 30000; G.save.homes = []; G.inside = null; G.driving = null; G.onFoot = true; G.state = 'play';
      G.humans.setPlayerActive(true, h.x, h.z, 0);
      const near = G.homeNear() === 0;
      G.buyHome(0);
      const room = G.interiors.rooms.find((r) => r.id === 'home');
      return { homes: G.world.homes.length, near, owned: G.ownsHome(0), doors: room.doors.length, cash: G.cash };
    });
    ok(homeBuy.homes >= 3 && homeBuy.near && homeBuy.owned && homeBuy.doors === 1 && homeBuy.cash === 10000, 'houses are for sale and the one you buy gets a door you can enter', JSON.stringify(homeBuy));
    const mods = await S(() => {
      const G = g(); const v = G.vehicles.find((q) => q.kind === 'sports') || G.spawnVehicle('sports', 0xffd500, 0, 0, 0, 'parked', true);
      v.setMods(0); const none = !v.modMesh;
      v.setMods(10); const full = !!v.modMesh;
      return { none, full };
    });
    ok(mods.none && mods.full, 'upgrades add visible tuning parts to the car', JSON.stringify(mods));
    await S(() => { const G = g(); G.inside = null; G.state = 'play'; G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; });
    await p.keyboard.press('KeyH');
    await p.waitForTimeout(400);
    const photo = await S(() => ({ hint: !document.getElementById('photo-hint').hidden, hud: document.getElementById('hud').style.visibility }));
    ok(photo.hint && photo.hud === 'hidden', 'H opens photo mode and hides the HUD', JSON.stringify(photo));
    await p.keyboard.press('KeyH');
    await p.waitForTimeout(400);
    const photo2 = await S(() => ({ hint: !document.getElementById('photo-hint').hidden }));
    ok(!photo2.hint, 'H again leaves photo mode', JSON.stringify(photo2));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
