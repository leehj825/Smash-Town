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
      G.stars = 4; G.heat = 270; G.police.hunterTimer = 0; G.crimeT = 0;
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
      const near = G.hideouts.homeNear() === 0;
      G.hideouts.buyHome(0);
      const room = G.interiors.rooms.find((r) => r.id === 'home');
      return { homes: G.world.homes.length, near, owned: G.hideouts.ownsHome(0), doors: room.doors.length, cash: G.cash };
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
    // backgrounding the app silences the sound and pauses the game
    await p.keyboard.press('KeyW');
    await S(() => { const G = g(); G.inside = null; G.state = 'play'; G.audio.init && G.audio.init(); });
    const bg = await S(async () => {
      const G = g();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 300));
      const ctxState = G.audio.context ? G.audio.context.state : 'none';
      const paused = !document.getElementById('pause').hidden;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 300));
      return { ctxState, paused, after: G.audio.context ? G.audio.context.state : 'none' };
    });
    ok(bg.paused && (bg.ctxState === 'suspended' || bg.ctxState === 'none'), 'going to the background pauses the game and suspends the sound', JSON.stringify(bg));
    const rivals = await S(() => {
      // debug
      const G = g(); const R = G.race;
      G.stars = 0; G.heat = 0; G.humans.setPlayerActive(false, 0, 0, 0);
      const st = R.starts[1];
      const v = G.spawnVehicle('sports', 0xffd500, st.x, st.z, 0, 'player', true);
      G.driving = v; G.onFoot = false; G.state = 'play'; G.inside = null; R.cooldown = 0;
      for (let i = 0; i < 4; i++) G.update(0.05);
      const dbg = { phase: R.phase, state: G.state, stars: G.stars, cd: R.cooldown, inside: !!G.inside, onFoot: G.onFoot, drv: !!G.driving, sp: G.driving && G.driving.ctrl.speed, d: G.driving && Math.hypot(st.x - G.driving.x, st.z - G.driving.z) };
      console.log('DBG', JSON.stringify(dbg));
      const rivals = R.rivals.length;
      let best = 0, sawArrow = false, maxTrail = 0;
      for (let i = 0; i < 1400; i++) {
        G.update(0.05); v.ctrl.vx = v.ctrl.vz = 0;
        for (const r of R.rivals) best = Math.max(best, r.idx + (r.done ? 100 : 0)); // progress is read while the race runs (it ends on its own)
        if (R.arrow.visible) sawArrow = true;
        maxTrail = Math.max(maxTrail, R.trail.count);
      }
      const prog = [best];
      const riv = (R.rivals.map((r) => ({ sp: Math.round(r.v.ctrl.speed), x: Math.round(r.v.x), z: Math.round(r.v.z), cp: R.cp[r.idx] && [Math.round(R.cp[r.idx].x), Math.round(R.cp[r.idx].z)], thr: r.v.control.throttle, st: r.v.control.steer, hb: r.v.control.handbrake, rt: r.route && r.route.length, ai: r.v.ai, phase: R.phase })));
      const trail = maxTrail, arrow = sawArrow;
      R.stop && R.stop();
      return { riv, rivals, prog, trail, arrow, left: G.vehicles.filter((q) => q.isGigTarget).length };
    });
    ok(rivals.rivals === 2 && Math.max(...rivals.prog) >= 2 && rivals.trail > 5 && rivals.arrow, 'rival racers drive the course on their own while road chevrons and an arrow show the way', JSON.stringify(rivals));
    const deliv = await S(() => {
      const G = g(); const D = G.delivery;
      G.stars = 0; G.heat = 0; G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null; G.inside = null; G.state = 'play';
      D.update(0.05); D.cooldown = 0;
      const spot = D.spot;
      G.humans.player.x = spot.x; G.humans.player.z = spot.z;
      D.update(0.05);
      const started = D.active, n = D.stops.length;
      const cash0 = G.cash;
      let guard = 0;
      while (D.active && guard++ < 10) { const s = D.stops[D.i]; G.humans.player.x = s.x; G.humans.player.z = s.z; D.update(0.05); }
      return { started, n, paid: G.cash - cash0, done: D.completed };
    });
    ok(deliv.started && deliv.n >= 2 && deliv.paid >= 300 && deliv.done === 1, 'a delivery run picks up orders at the donut shop and pays for every drop', JSON.stringify(deliv));
    const robbery = await S(() => {
      const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'donut');
      G.stars = 0; G.heat = 0; G.cash = 0; G.driving = null; G.onFoot = true; G.state = 'play';
      G.guns.buyGun('pistol'); G.humans.guns = G.guns.flags(); G.humans.equip(3);
      G.inside = r; G.humans.setPlayerActive(true, r.counter.x, r.counter.z + 1.8, 0); G.humans.equip(3);
      const can = G.shops.canRob(r);
      G.shops.rob(r);
      const first = G.cash;
      const again = G.shops.canRob(r);
      G.inside = null;
      return { can, first, stars: G.stars, again };
    });
    ok(robbery.can && robbery.first >= 300 && robbery.stars >= 2 && !robbery.again, 'robbing a till with a gun pays out, raises the alarm, and the till stays empty', JSON.stringify(robbery));
    const taxiTypes = await S(() => { const G = g(); const T = G.taxi; return { hasKind: 'kind' in T, hasLegs: 'legs' in T }; });
    ok(taxiTypes.hasKind && taxiTypes.hasLegs, 'taxi passengers come in kinds (rush, VIP, group)', JSON.stringify(taxiTypes));
    const login = await S(() => {
      const G = g();
      G.save.login = undefined;
      const day1 = new Date(2030, 0, 10);
      const a = G.claimLogin(day1);
      const again = G.claimLogin(day1);
      const b = G.claimLogin(new Date(2030, 0, 11));
      const c = G.claimLogin(new Date(2030, 0, 13));
      return { a, again, b, c };
    });
    ok(login.a === 150 && login.again === 0 && login.b === 300 && login.c === 150, 'the daily login bonus grows with a streak and resets after a missed day', JSON.stringify(login));
    const a11y = await S(() => {
      const btn = document.querySelector('.seg.a11y[data-a="bigUi"][data-v="1"]');
      btn.click();
      const big = document.documentElement.classList.contains('big-ui');
      document.querySelector('.seg.a11y[data-a="bigUi"][data-v="0"]').click();
      document.querySelector('.seg.a11y[data-a="colorSafe"][data-v="1"]').click();
      const cb = document.documentElement.classList.contains('cb-safe');
      document.querySelector('.seg.a11y[data-a="colorSafe"][data-v="0"]').click();
      return { big, cb, off: !document.documentElement.classList.contains('big-ui') && !document.documentElement.classList.contains('cb-safe') };
    });
    ok(a11y.big && a11y.cb && a11y.off, 'large text and colour-blind palette switches work', JSON.stringify(a11y));
    const life = await S(() => {
      const G = g();
      const A = G.animals;
      for (let i = 0; i < 20; i++) A.update(0.1);
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null; G.inside = null; G.state = 'play';
      const started = G.festival.start();
      for (let i = 0; i < 40; i++) G.festival.update(0.1);
      const festival = G.festival.active && G.festival.markers().length === 1;
      G.blackout = true; (G).updateLights(); const dark = G.world.windowMaterial.emissiveIntensity;
      G.blackout = false;
      const bus = G.vehicles.length >= 0 && !!G.spawnVehicle('bus', 0x2f78d6, 5, 5, 0, 'parked', true);
      return { dogs: A.dogCount, gulls: A.gullCount, started, festival, dark, bus };
    });
    ok(life.dogs > 5 && life.gulls > 0 && life.started && life.festival && life.dark < 0.1 && life.bus, 'dogs and gulls, a festival with fireworks, a blackout and a city bus exist', JSON.stringify(life));
    const dis = await S(() => {
      const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'home');
      G.stars = 3; G.heat = 170; G.inside = r; G.humans.setPlayerActive(true, r.ox + 5.6, r.oz + 3.0, 0);
      const near = G.shops.wardrobeNear(r);
      const o0 = G.save.outfit ?? 0;
      G.hideouts.wardrobe();
      const out = { near, outfit: G.save.outfit !== o0, heat: Math.round(G.heat) };
      G.inside = null; G.stars = 0; G.heat = 0;
      return out;
    });
    ok(dis.near && dis.outfit && dis.heat < 170, 'the home wardrobe changes clothes and cools the heat (disguise)', JSON.stringify(dis));
    const slots = await S(() => {
      const b = document.querySelectorAll('#slots button');
      return { n: b.length, sel: [...b].findIndex((x) => x.classList.contains('sel')) };
    });
    ok(slots.n === 3 && slots.sel === 0, 'the title screen shows three save slots with slot 1 selected', JSON.stringify(slots));
    const bus = await S(() => {
      const G = g(); const T = G.transit;
      G.stars = 0; G.cash = 100; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play';
      const s0 = T.stops[0];
      G.humans.setPlayerActive(true, s0.sx, s0.sz, 0);
      const at = T.near();
      const ok = T.ride(at);
      return { stops: T.stops.length, at, ok, cash: G.cash };
    });
    ok(bus.stops >= 4 && bus.at === 0 && bus.ok && bus.cash === 95, 'bus shelters form a line you can ride for $5', JSON.stringify(bus));
    await p.waitForFunction(() => !window.__smash.game.fading, null, { timeout: 30000 });
    const arrived = await S(() => { const G = g(); const s1 = G.transit.stops[1]; const p = G.humans.player; return { d: Math.round(Math.hypot(p.x - s1.sx, p.z - s1.sz)) }; });
    ok(arrived.d < 3, 'the bus drops you at the next stop', JSON.stringify(arrived));
    const fish = await S(() => {
      const G = g(); const F = G.fishing;
      G.stars = 0; G.cash = 0; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play';
      const l = G.world.lots.find((q) => q.district === 'water' && !q.river) || G.world.lots.find((q) => q.district === 'water');
      const r = l.rim ?? 0;
      G.humans.setPlayerActive(true, l.x0 + r * 0.5 - 1.5, (l.z0 + l.z1) / 2, 0);
      const near = F.atWater();
      const cast = F.press();
      F.t = 0; F.update(0.05);
      const bite = F.phase === 'bite';
      const reeled = F.press();
      return { near, cast, bite, reeled, cash: G.cash, caught: F.caught };
    });
    ok(fish.near && fish.cast && fish.bite && fish.reeled && fish.cash > 0 && fish.caught === 1, 'fishing: cast, wait for the bite, reel in a fish for cash', JSON.stringify(fish));
    const bowl = await S(() => {
      const G = g(); const r = G.interiors.rooms.find((q) => q.id === 'arcade');
      G.cash = 1000; G.inside = r; G.driving = null; G.onFoot = true; G.state = 'play';
      G.humans.setPlayerActive(true, r.counter.x, r.counter.z + 1.8, 0);
      G.shops.startBowling();
      const started = !!G.shops.bowl && G.cash === 920;
      for (let i = 0; i < 6; i++) G.shops.updateBowling(0.1, r);
      const moving = G.shops.bowl.pos > 0;
      G.shops.bowl.t = 0.3125 / 1.6 * 1.6; G.shops.bowl.t = 0.5 / 1.6 * 1.6; // the marker at the middle
      G.shops.updateBowling(0, r);
      G.shops.startBowling();             // press again: throw
      const done = G.shops.bowl === null;
      G.inside = null;
      return { started, moving, done, cash: G.cash };
    });
    ok(bowl.started && bowl.moving && bowl.done && bowl.cash >= 920, 'arcade bowling: pay, watch the meter, throw', JSON.stringify(bowl));
    await S(() => { document.querySelector('.seg.a11y[data-a="perfHud"][data-v="1"]').click(); });
    await p.waitForTimeout(1500);
    const perf = await S(() => { const e = document.getElementById('perf'); const r = { shown: !e.hidden, text: e.textContent }; document.querySelector('.seg.a11y[data-a="perfHud"][data-v="0"]').click(); return { ...r, hidden: e.hidden }; });
    ok(perf.shown && /fps/.test(perf.text) && /tris/.test(perf.text) && perf.hidden, 'the performance display shows fps, triangles and draw calls and can be switched off', JSON.stringify(perf));
    const evt = await S(() => {
      const G = g(); const B = G.bus;
      let heard = 0;
      const off = B.on('gunshot', () => { heard++; });
      B.emit({ type: 'gunshot', x: 1, z: 1 }); B.emit({ type: 'gunshot', x: 2, z: 2 });
      off();
      B.emit({ type: 'gunshot', x: 3, z: 3 });
      const n0 = G.news.log.length;
      B.emit({ type: 'wantedRaised', stars: 3 });
      return { heard, newsAfter: G.news.log.length - n0, recent: B.recent.length };
    });
    ok(evt.heard === 2 && evt.newsAfter === 1 && evt.recent >= 4, 'the event bus delivers events, stops when you unsubscribe, and the news listens to it', JSON.stringify(evt));
    const boom = await S(() => {
      const G = g(); const H = G.humans; const pl = H.player;
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null; G.inside = null; G.state = 'play';
      G.stars = 0; G.heat = 0; G.news.cooldown = 0;
      const civ = H.list.find((h) => h.active && h.maxHp === 30 && h.state === 1);
      civ.x = pl.x + 8; civ.z = pl.z + 8; civ.fleeing = false;
      const n0 = G.news.log.length;
      G.bus.emit({ type: 'explosion', x: pl.x + 6, z: pl.z + 6, byPlayer: true });
      return { fled: civ.fleeing, heat: G.heat, news: G.news.log.length - n0 };
    });
    ok(boom.fled && boom.heat >= 15 && boom.news === 1, 'an explosion makes the crowd run, counts as a crime if you did it, and makes the news', JSON.stringify(boom));
    const turf = await S(() => {
      const G = g(); const GA = G.gangs; const H = G.humans; const z = GA.zones[0];
      G.stars = 0; G.heat = 0; G.cash = 0; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play';
      z.owner = 'gang'; G.save.turf = [];
      H.setPlayerActive(true, z.x + 60, z.z, 0);
      GA.update(0.1);
      const crew = z.members.length;
      H.player.x = z.x + 10; H.player.z = z.z; GA.update(0.1);
      const provoked = z.members.some((m) => m.hostile);
      const heatBefore = G.heat;
      for (const m of [...z.members]) H.gunHit(H.player, m, 999, 1, 0, true);
      const captured = z.owner === 'player';
      const cash = G.cash;
      GA.incomeT = 0; GA.update(0.1);
      const income = G.cash - cash;
      z.away = 299.95; H.player.x = z.x + 400; H.player.z = z.z + 400; GA.update(0.2);
      const lost = z.owner === 'gang';
      return { crew, provoked, noHeat: G.heat === heatBefore, captured, bonus: cash, income, saved: true, lost, stat: G.progress.stats.turfs };
    });
    ok(turf.crew === 5 && turf.provoked && turf.noHeat && turf.captured && turf.bonus >= 500 && turf.income === 120 && turf.lost && turf.stat >= 1, 'a gang crew turns on you, taking the block pays and is not a crime, and the gang takes it back if you stay away', JSON.stringify(turf));
    const night = await S(() => {
      const G = g(); const H = G.humans;
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null; G.inside = null; G.state = 'play'; G.stars = 0;
      window.__smash.applyTime('noon', true); window.__smash.env.night = 0;
      G.update(0.05); const dayLimit = H.civLimit;
      window.__smash.applyTime('night', true); window.__smash.env.night = 1;
      G.update(0.05); const nightLimit = H.civLimit;
      const clothes = G.interiors.rooms.find((q) => q.id === 'clothes'), gun = G.interiors.rooms.find((q) => q.id === 'gun');
      const res = { dayLimit, nightLimit, clothesClosed: G.shopClosed(clothes), gunOpen: !G.shopClosed(gun) };
      window.__smash.applyTime('noon', true); window.__smash.env.night = 0;
      return res;
    });
    ok(night.nightLimit < night.dayLimit * 0.5 && night.clothesClosed && night.gunOpen, 'at night fewer people are out and some shops close', JSON.stringify(night));
    const medic = await S(() => {
      const G = g(); const P = G.paramedic;
      G.stars = 0; G.cash = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null;
      P.update(0.05); P.cooldown = 0;
      const sp = P.spot;
      G.humans.setPlayerActive(true, sp.x, sp.z, 0);
      P.update(0.05);
      const onDuty = P.onDuty && !!G.driving && G.driving.kind === 'ambulance';
      G.bus.emit({ type: 'civAssaulted', x: G.driving.x + 50, z: G.driving.z });   // a real incident becomes a call
      const calls = P.open;
      let guard = 0;
      while (P.onDuty && guard++ < 30) {
        if (!P.calls.length) P.addCall(G.driving.x + 40, G.driving.z, 'test');
        const c = P.calls[0]; G.driving.ctrl.position.x = c.x; G.driving.ctrl.position.z = c.z; G.driving.ctrl.vx = G.driving.ctrl.vz = 0;
        P.update(0.05);
      }
      return { onDuty, calls, shifts: P.completed, cash: G.cash, rescues: G.progress.stats.rescues };
    });
    ok(medic.onDuty && medic.calls >= 1 && medic.shifts === 1 && medic.cash >= 1500 && medic.rescues === 5, 'paramedic shift: an ambulance waits, real incidents become calls, five patients finish the shift', JSON.stringify(medic));
    const npc = await S(() => {
      const G = g(); const N = G.npcs; const R = G.reputation;
      G.stars = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null;
      N.update(0.1);
      const placed = N.list.filter((q) => q.human).length;
      const minji = N.list.find((q) => q.def.id === 'minji');
      // neutral: she talks but gives nothing; friendly: a free donut; hostile: refuses
      const spot = minji.pos; const area = R.area(spot.x, spot.z);
      G.save.rep = {};
      G.humans.setPlayerActive(true, spot.x + 1.5, spot.z, 0);
      const near = N.nearest(); const prompt = near ? N.prompt(near) : '';
      G.humans.player.hp = 20; G.save.rep[area] = 50; minji.last = -999;
      N.talk(near); const open = N.dialogOpen; N.advance(); N.advance();
      const healed = G.humans.player.hp >= G.humans.player.maxHp;
      G.humans.player.hp = 20; G.save.rep[area] = -60; N.clock = 1000;
      N.talk(N.nearest()); const refused = N.dialog.lines.length === 1 && N.dialog.lines[0][0].startsWith('I have nothing'); N.advance();
      const stayedHurt = G.humans.player.hp === 20;
      // hurting people costs reputation where it happened; helping earns it back
      G.save.rep = {};
      G.bus.emit({ type: 'civAssaulted', x: spot.x, z: spot.z }); G.bus.emit({ type: 'civKilled', x: spot.x, z: spot.z, human: minji.human, byPlayer: true, kids: true });
      const down = R.get(area);
      G.bus.emit({ type: 'helped', x: spot.x, z: spot.z, amount: 10 });
      return { placed, near: !!near, prompt: /Minji|민지/.test(prompt), open, healed, refused, stayedHurt, down, up: R.get(area) };
    });
    ok(npc.placed >= 5 && npc.near && npc.prompt && npc.open && npc.healed && npc.refused && npc.stayedHurt && npc.down === -8 && npc.up === 2, 'named people talk by your reputation (a favour, or a refusal) and reputation moves with what you do', JSON.stringify(npc));
    // savings, houses and race records survive a reload
    await S(() => { const G = g(); G.save.bank = 4321; G.save.homes = [1, 2]; G.save.raceBest = [0, 77.5]; G.flushSave(); });
    await p.reload();
    await p.waitForFunction(() => window.__smash);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(600);
    const kept = await S(() => { const G = g(); return { bank: G.save.bank, homes: G.save.homes, best: G.race.best[1] }; });
    ok(kept.bank === 4321 && kept.homes.length === 2 && kept.best === 77.5, 'savings, houses and race records survive a reload', JSON.stringify(kept));
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
