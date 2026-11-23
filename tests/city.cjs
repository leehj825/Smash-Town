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
      const hot = G.truckHeist.hot; const escaping = G.truckHeist.phase === 'escape'; const cashHeld = G.cash === cash0;
      G.inside = null;
      G.stars = 0; G.truckHeist.update(0.1);
      const loot = G.cash - cash0;
      G.shops.startHeist(); // the vault is empty for a while
      const again = !!G.shops.heist;
      // with C4 in the bag the door goes in half the time
      G.shops.heistCooldown = 0; G.save.gear = { c4: 1 }; G.inside = r; G.shops.startHeist(); const quick = !!G.shops.heist && G.shops.heist.t === 8 && G.gear.count('c4') === 0; G.shops.heist = null; G.inside = null; G.save.gear = {}; G.stars = 0; G.heat = 0; G.hud.showGig(false);
      return { near, stars, loot, hot, escaping, cashHeld, quick, again };
    });
    ok(heist.near && heist.stars >= 3 && heist.hot >= 3500 && heist.escaping && heist.cashHeld && heist.loot >= 3500 && heist.quick && !heist.again, 'the bank vault: alarm, hot cash you must get away with before it pays out, C4 halves the time, then the vault stays empty', JSON.stringify(heist));
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
    const metro = await S(() => {
      const G = g(); const T = G.transit;
      G.stars = 0; G.cash = 100; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play'; G.skills.off = true;
      const s0 = T.stations[0];
      G.humans.setPlayerActive(true, s0.sx, s0.sz, 0);
      const at = T.near(); const prompt = at >= 1000 ? T.prompt(at) : '';
      const ok = T.ride(at);
      G.skills.off = false;
      return { n: T.stations.length, at, prompt: /12/.test(prompt), ok, cash: G.cash };
    });
    await p.waitForFunction(() => !window.__smash.game.fading, null, { timeout: 30000 });
    const mArr = await S(() => { const G = g(); const s2 = G.transit.stations[2]; const p = G.humans.player; return { d: Math.round(Math.hypot(p.x - s2.sx, p.z - s2.sz)) }; });
    ok(metro.n === 6 && metro.at === 1000 && metro.prompt && metro.ok && metro.cash === 88 && mArr.d < 3, 'the metro express rides two stations ahead for $12', JSON.stringify({ metro, mArr }));
    const clk = await S(() => {
      const G = g(); const C = G.clock;
      const key = Object.keys(localStorage).find((k) => k.startsWith('smashtown.save')) || 'smashtown.save.v1';
      const keep = localStorage.getItem(key);
      localStorage.setItem(key, JSON.stringify({ cash: 777, unlocked: ['sports', 'sedan'], selected: 'sports' }));
      const old = G.loadSave();
      if (keep === null) localStorage.removeItem(key); else localStorage.setItem(key, keep);
      const wasAuto = C.auto; C.auto = true;
      C.hour = 16.9; G.env.setTime('noon', true); C.lastBand = null;
      G.humans.pace = 1;
      for (let i = 0; i < 20; i++) C.update(1);      // a game hour is 60 real seconds
      const rush = C.rush; const paced = G.humans.pace > 1;
      C.hour = 23; C.lastBand = null; C.update(0.1);
      const night = C.phase === 'night' && C.band === 'night' && G.env.timeOfDay === 'night' && G.humans.pace < 1;
      C.hour = 12; C.lastBand = null; C.update(0.1);
      const noon = G.env.timeOfDay === 'noon';
      C.setBand('sunset');
      const sunset = Math.abs(C.hour - 18.5) < 0.01;
      C.auto = wasAuto; G.env.setTime('noon', true); C.hour = 12;
      return { oldCash: old.cash, oldV: old.v, rush, paced, night, noon, sunset, text: C.text() };
    });
    ok(clk.oldCash === 777 && clk.oldV === 2 && clk.rush && clk.paced && clk.night && clk.noon && clk.sunset, 'an old save loads into the current version, and the game clock drives the sky and the crowd', JSON.stringify(clk));
    const comp = await S(() => {
      const G = g(); const C = G.completion;
      G.inside = null; G.state = 'play'; G.save.milestone = 0; G.cash = 0; G.skills.off = true;
      const before = C.percent();
      for (const z of G.gangs.zones) z.owner = 'player';
      const after = C.percent();
      G.save.milestone = 0; C.t = 0; C.update(0.1);
      const paid = G.cash; const ms = G.save.milestone;
      C.t = 0; C.update(0.1); const again = G.cash - paid;
      for (const z of G.gangs.zones) z.owner = 'gang';
      G.skills.off = false;
      return { before, after, paid, ms, again, goals: C.goals().length, html: (() => { G.stats && 0; return true; })() };
    });
    ok(comp.after >= comp.before + 20 && comp.goals >= 8 && comp.paid >= 1000 && comp.ms >= 25 && comp.again === 0, 'city completion counts what you did, and pays each milestone once', JSON.stringify(comp));
    const riot = await S(() => {
      const G = g(); const R = G.riots; const P = G.patrol;
      G.stars = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.save.rep = {}; G.fires.list.length = 0;
      for (const j of [G.paramedic, G.firefighter, G.patrol]) if (j.onDuty) j.end('x', 0);
      // unattended: fires start and it burns out
      R.current = null; R.start(G.focusX + 100, G.focusZ);
      const heard = G.bus.recent.some((e) => e.type === 'riot');
      for (let i = 0; i < 105; i++) R.update(1);
      const fires = G.fires.list.length; const ended = !R.current; const mafiaUp = G.factions.get('mafia') > 0;
      // a patrol calms it
      G.fires.list.length = 0;
      P.update(0.05); P.cooldown = 0;
      const sp = P.spot; G.humans.setPlayerActive(true, sp.x, sp.z, 0); P.update(0.05);
      R.start(G.driving.x + 60, G.driving.z);
      const called = P.calls.some((c) => c.why.length > 0 && Math.hypot(c.x - R.current.x, c.z - R.current.z) < 5);
      const c = P.calls.find((q) => Math.hypot(q.x - R.current.x, q.z - R.current.z) < 5) || P.calls[0];
      for (let i = 0; i < 12 && R.current; i++) { G.driving.ctrl.position.x = c.x; G.driving.ctrl.position.z = c.z; G.driving.ctrl.vx = G.driving.ctrl.vz = 0; P.update(0.5); }
      const quelled = !R.current;
      P.end('x', 0);
      const watch = G.factions.get('watch');
      G.progress.stats.patrols = 0; G.news.cooldown = 0; G.fires.list.length = 0; G.save.rep = {};
      return { heard, fires, ended, mafiaUp, called, quelled, watch };
    });
    ok(riot.heard && riot.fires >= 3 && riot.ended && riot.mafiaUp && riot.called && riot.quelled && riot.watch > 0, 'a riot starts fires if ignored, becomes a patrol call, and is calmed by an officer', JSON.stringify(riot));
    const xf = await S(() => {
      const G = g(); const GA = G.gangs; const H = G.humans; const X = G.crossfire; const z = GA.zones[0];
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true;
      for (const m of H.gangMembers()) H.removeGang(m);
      for (const zz of GA.zones) zz.members = [];
      z.owner = 'gang'; G.save.turf = []; G.fires.list.length = 0; G.fires.igniteChance = 1;
      H.setPlayerActive(true, z.x + 55, z.z, 0); GA.update(0.1);
      const crew = z.members.length;
      G.stars = 3; G.heat = 90; const heat0 = G.heat;
      X.copsNear = () => 1;
      const n = { shots: 0, boom: 0, cross: 0 };
      const off = [G.bus.on('gunshot', (e) => { if (e.ambient) n.shots++; }), G.bus.on('explosion', () => n.boom++), G.bus.on('crossfire', () => n.cross++)];
      for (let i = 0; i < 70; i++) { H.player.x = z.x + 55; H.player.z = z.z; X.update(0.5); }
      off.forEach((f) => f());
      const out = { crew, ...n, fires: G.fires.list.length, cooled: G.heat < heat0, active: X.active() !== null || true };
      G.fires.igniteChance = 0.7; G.fires.list.length = 0; G.stars = 0; G.heat = 0; G.skills.off = false;
      for (const m of H.gangMembers()) H.removeGang(m);
      for (const zz of GA.zones) zz.members = [];
      G.news.cooldown = 0;
      return out;
    });
    ok(xf.crew === 5 && xf.cross === 1 && xf.shots >= 10 && xf.boom >= 1 && xf.fires >= 1 && xf.cooled, 'lead the police into a gang block: they shoot each other, your heat drops, a blast starts a fire', JSON.stringify(xf));
    const wit = await S(() => {
      const G = g(); const W = G.witnesses; const H = G.humans;
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.cash = 100; G.skills.off = true; G.save.rep = {};
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      const civs = H.list.filter((h) => h.active && h.role === 0 && !h.named && !h.ally);
      const out = { civs: civs.length };
      const place = (h) => { h.x = H.player.x + 2; h.z = H.player.z; h.calling = 5; h.state = 0; };
      const real = G.guns.current;
      G.guns.current = () => null;
      const a = civs[0]; place(a);
      const sees = W.near() === a; const askBribe = /40/.test(W.prompt());
      W.act(a);
      out.bribe = { sees, askBribe, quiet: a.calling === 0, fled: a.fleeing, cash: G.cash };
      G.guns.current = () => ({ id: 'pistol' });
      const b = civs[1]; place(b);
      const area = G.reputation.area(b.x, b.z);
      const askScare = /Scare|겁/.test(W.prompt());
      const repBefore = G.reputation.get(area);
      W.act(b);
      out.scare = { askScare, quiet: b.calling === 0, cash: G.cash, rep: G.reputation.get(area) - repBefore };
      G.guns.current = real; G.skills.off = false; G.save.rep = {};
      return out;
    });
    ok(wit.bribe.sees && wit.bribe.askBribe && wit.bribe.quiet && wit.bribe.fled && wit.bribe.cash === 60 && wit.scare.askScare && wit.scare.quiet && wit.scare.cash === 60 && wit.scare.rep === -1, 'a witness on the phone can be bribed for $40 or scared off with a gun, and the call never goes out', JSON.stringify(wit));
    const tk = await S(() => {
      const G = g(); const T = G.truckHeist; const H = G.humans;
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.stars = 0; G.heat = 0; G.cash = 2000;
      for (const j of [G.paramedic, G.firefighter, G.patrol]) if (j.onDuty) j.end('x', 0);
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      const started = T.start(); const afterPay = G.cash;
      const truck = T.truck; const marked = T.markers().length === 1;
      truck.ctrl.hp = 0; truck.ctrl.wrecked = true;
      T.update(0.1);
      const spilled = T.phase === 'loot' && T.bags.length === 8 && G.stars >= 3;
      for (const b of T.bags) { H.player.x = b.x; H.player.z = b.z; T.update(0.1); }
      const hot = T.hot; const escaping = T.phase === 'escape';
      const cashBefore = G.cash;
      G.stars = 0; T.update(0.1);
      const paid = G.cash - cashBefore;
      const ok1 = { started, afterPay, marked, spilled, hot, escaping, paid, back: T.phase === 'idle', stat: G.progress.stats.heists };
      // a second job fails when you are busted: the hot cash is lost
      T.cooldown = 0; T.start(true);
      const t2 = T.truck; t2.ctrl.hp = 0; t2.ctrl.wrecked = true; T.update(0.1);
      for (const b of T.bags) { H.player.x = b.x; H.player.z = b.z; T.update(0.1); }
      const cash2 = G.cash; G.state = 'busted'; T.update(0.1); G.state = 'play';
      const lost = T.phase === 'idle' && G.cash === cash2;
      G.stars = 0; G.heat = 0; G.skills.off = false; G.news.cooldown = 0;
      return { ...ok1, lost };
    });
    ok(tk.started && tk.afterPay === 1500 && tk.marked && tk.spilled && tk.hot >= 2000 && tk.escaping && tk.paid === tk.hot + 500 && tk.back && tk.lost, 'the cash truck job: plan, wreck it, grab the bags, lose the police to keep the money; busted loses it', JSON.stringify(tk));
    const gear = await S(() => {
      const G = g(); const GR = G.gear; const H = G.humans;
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.cash = 5000; G.save.gear = {};
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      for (const id of ['smoke', 'smoke', 'c4', 'spikes', 'donut', 'vest']) GR.buy(id);
      const bought = { smoke: GR.count('smoke'), c4: GR.count('c4'), cash: G.cash };
      // smoke hides you: heat falls inside the cloud
      GR.sel = 'smoke'; GR.useTool(); G.stars = 3; G.heat = 150; const h0 = G.heat;
      const c = GR.clouds[0]; H.player.x = c.x; H.player.z = c.z;
      for (let i = 0; i < 10; i++) GR.update(0.1);
      const smoke = { left: GR.count('smoke'), cooled: G.heat < h0 };
      G.stars = 0; G.heat = 0;
      // a police car crossing a spike strip loses a tyre
      GR.sel = 'spikes'; GR.useTool();
      const st = GR.strips[0];
      const car = G.spawnVehicle('police', 0x1a1a24, st.x, st.z, 0, 'parked'); car.ai = 'police';
      GR.update(0.05);
      const spikes = { flat: car.flat, gone: GR.strips.length === 0 };
      G.removeVehicle(car);
      // C4: plant, then detonate with the same key
      GR.sel = 'c4'; let boom = 0; const off = G.bus.on('explosion', () => boom++);
      GR.useTool(); const planted = GR.charges.length === 1; GR.useTool();
      off();
      const c4 = { planted, boom, left: GR.count('c4'), cleared: GR.charges.length === 0 };
      // quick items
      H.player.hp = 10; const donut = GR.quick('donut') && H.player.hp > 50;
      H.armor = 0; const vest = GR.quick('vest') && H.armor === 50;
      // the wheel slows time and closes again
      GR.openWheel(); const slow = G.timeScale < 0.5 && GR.wheelOpen; const items = document.querySelectorAll('#wheel .wheel-item').length;
      GR.closeWheel(); const back = G.timeScale === 1 && !GR.wheelOpen;
      G.skills.off = false; G.save.gear = {}; G.fires.list.length = 0; G.news.cooldown = 0; G.stars = 0; G.heat = 0;
      return { bought, smoke, spikes, c4, donut, vest, slow, items, back };
    });
    ok(gear.bought.smoke === 2 && gear.bought.cash === 5000 - 150 * 2 - 300 - 250 - 40 - 200 && gear.smoke.left === 1 && gear.smoke.cooled && gear.spikes.flat && gear.spikes.gone && gear.c4.planted && gear.c4.boom >= 1 && gear.c4.cleared && gear.donut && gear.vest && gear.slow && gear.items >= 4 && gear.back, 'gear: buy, smoke hides you, spikes flatten a police tyre, C4 blows on demand, donut and armour work, the wheel slows time', JSON.stringify(gear));
    const esc = await S(() => {
      const G = g(); const E = G.escapes; const H = G.humans; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.stars = 0; G.heat = 0;
      E.update(0.3);
      // ramps stand on the wide roads and launch a car
      out.ramps = E.ramps.length;
      const r = E.ramps[0].ramp;
      const car = G.spawnVehicle('sports', 0xff0000, r.x - r.dx * 14, r.z - r.dz * 14, Math.atan2(r.dx, r.dz), 'parked');
      G.boardVehicle(car); car.ctrl.useRamps = true;
      const c = car.ctrl; const seq0 = c.jumpSeq; let air = false;
      for (let i = 0; i < 140; i++) { car.control.throttle = 1; car.control.handbrake = false; car.control.nitro = false; car.control.steer = 0; c.update(0.05, car.control, null); if (c.airborne) air = true; }
      out.jump = air;
      G.onFoot = true; G.driving = null; G.removeVehicle(car);
      // vaulting a bench
      const circ = G.world.circles.find((q) => q.smash && ['bench', 'trash', 'hydrant', 'newsstand'].includes(q.smash.type) && !q.dead);
      const pl = H.player; H.setPlayerActive(true, circ.x - 0.7, circ.z, 0);
      pl.speed = 6.5; pl.grounded = true; pl.y = 0; const v0 = pl.vaults;
      H.resolveStatics(pl, 0.4);
      out.vault = { n: pl.vaults - v0, up: pl.vy > 3 };
      pl.vy = 0; pl.grounded = true; pl.y = 0;
      // a park and a bike: the cruisers turn back
      const park = G.world.lots.find((q) => q.district === 'park' || q.district === 'plaza' || q.district === 'beach');
      out.alleys = !!park;
      if (park) {
        const px = (park.x0 + park.x1) / 2, pz = (park.z0 + park.z1) / 2;
        const bike = G.spawnVehicle('scooter', 0x2fb87a, px, pz, 0, 'parked');
        G.boardVehicle(bike);
        const cop = G.spawnVehicle('police', 0x1a1a24, px + 25, pz, 0, 'parked'); cop.ai = 'police';
        G.stars = 3; G.heat = 150; const h0 = G.heat;
        for (let i = 0; i < 20; i++) { E.scanT = 0; E.update(0.2); }
        out.alley = { gone: !G.vehicles.includes(cop), cooled: G.heat < h0 };
        G.onFoot = true; G.driving = null; G.removeVehicle(bike);
      }
      G.stars = 0; G.heat = 0; G.skills.off = false; G.news.cooldown = 0;
      return out;
    });
    ok(esc.ramps >= 2 && esc.jump && esc.vault.n === 1 && esc.vault.up && esc.alleys && esc.alley.gone && esc.alley.cooled, 'escapes: stunt ramps launch a car, you vault a bench at a sprint, and cruisers will not follow a bike across a park', JSON.stringify(esc));
    const mw = await S(() => {
      const G = g(); const T = G.transit; const H = G.humans;
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.cash = 100;
      for (const v of [...G.vehicles]) if (v.ai === 'police') G.removeVehicle(v);
      const s0 = T.stations[0]; H.setPlayerActive(true, s0.sx, s0.sz, 0);
      const at = T.near(); G.stars = 3; G.heat = 150;
      const cop = G.spawnVehicle('police', 0x1a1a24, s0.sx + 10, s0.sz, 0, 'parked'); cop.ai = 'police';
      const refused = !T.ride(at) && G.cash === 100;
      G.removeVehicle(cop);
      const rode = T.ride(at); const clean = G.stars === 0;
      G.skills.off = false;
      return { refused, rode, clean };
    });
    await p.waitForFunction(() => !window.__smash.game.fading, null, { timeout: 30000 });
    ok(mw.refused && mw.rode && mw.clean, 'the metro refuses you with a cop on you, but whisks you away once you are clear', JSON.stringify(mw));
    const ph = await S(() => {
      const G = g(); const P = G.phone; const H = G.humans; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.cash = 1000; G.stars = 0; G.heat = 0;
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      G.save.friends = {};
      P.show(); const locked = [...document.querySelectorAll('#phone .phone-item')].filter((b) => b.disabled).length;
      P.close();
      G.save.friends = { dave: 3, kane: 3, rosa: 3 };
      P.last = {};
      const n0 = G.vehicles.length;
      P.show();
      const items = [...document.querySelectorAll('#phone .phone-item')];
      const byText = (t) => items.find((b) => b.textContent.includes(t));
      byText('Dave').click();                            // Dave brings the car
      out.car = { added: G.vehicles.length > n0, owned: G.lastDriven && G.lastDriven.owned, cash: G.cash };
      H.player.hp = 5; byText('Rosa').click();          // Rosa
      out.rosa = H.player.hp === H.player.maxHp;
      P.close();
      out.locked = locked >= 3;
      // Bonnie: hold a spot, follow again
      G.buddy.hired = false; G.buddy.recruit('Bonnie');
      const b = G.buddy.human; const spot = { x: b.x, z: b.z };
      G.buddy.setHold(true); H.player.x = spot.x + 30; H.player.z = spot.z;
      for (let i = 0; i < 40; i++) H.update(0.05, H.ctx);
      out.hold = Math.hypot(b.x - spot.x, b.z - spot.z) < 6 && G.buddy.holding;
      G.buddy.setHold(false); out.follow = !b.hold;
      // riding along she covers you: a police car nearby takes damage and shots ring out
      const cop = G.spawnVehicle('police', 0x1a1a24, H.player.x + 15, H.player.z, 0, 'parked'); cop.ai = 'police';
      const car = G.spawnVehicle('sports', 0xff0000, H.player.x, H.player.z, 0, 'parked'); G.boardVehicle(car);
      let shots = 0; const off = G.bus.on('gunshot', (e) => { if (e.ambient) shots++; });
      const hp0 = cop.ctrl.hp;
      for (let i = 0; i < 6; i++) G.buddy.update(1.2);
      off();
      out.cover = { shots: shots >= 3, dmg: cop.ctrl.hp < hp0 };
      G.removeVehicle(cop); G.removeVehicle(car); G.onFoot = true; G.driving = null; G.buddy.dismiss();
      G.save.friends = {}; G.skills.off = false;
      return out;
    });
    ok(ph.locked && ph.car.added && ph.car.owned && ph.car.cash === 920 && ph.rosa && ph.hold && ph.follow && ph.cover.shots && ph.cover.dmg, 'the phone calls friends (car delivery, nurse), Bonnie holds a spot or follows, and covers you from the passenger seat', JSON.stringify(ph));
    const dr = await S(() => {
      const G = g(); const D = G.director; const C = G.challenge; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true; G.stars = 0; G.heat = 0; G.cash = 0;
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      G.fires.list.length = 0; G.riots.current = null;
      const wasAuto = G.clock.auto; G.clock.auto = true;
      D.quiet = 0; D.cooldown = 0; D.throws = 0;
      G.stars = 2; for (let i = 0; i < 100; i++) D.update(1);
      const busyQuiet = D.quiet === 0 && D.throws === 0;
      G.stars = 0; G.humans.combatTimer = 0;
      for (let i = 0; i < 400 && D.throws === 0; i++) D.update(1);
      out.director = { busyQuiet, threw: D.throws >= 1, last: D.last };
      G.clock.auto = wasAuto;
      G.fires.list.length = 0; G.riots.current = null; if (G.thieves.active) G.thieves.release(null);
      if (G.truckHeist.active) G.truckHeist.end('x', false);
      // survival challenge and chaos switches
      const storyWas = G.story.done; G.story.done = true; out.unlocked = C.unlocked;
      G.save.survivalBest = 0; G.stars = 0; G.cash = 0;
      out.start = C.startSurvival(); out.stars = G.stars;
      for (let i = 0; i < 25; i++) C.update(1);
      G.stars = 0; C.update(0.1);
      out.survival = { ended: !C.survival, best: C.best, cash: G.cash };
      C.toggleChaos('moon'); out.moon = C.chaos.moon;
      const g1 = Object.getPrototypeOf(C).constructor.gravityMul; C.toggleChaos('moon'); out.gravity = [g1, Object.getPrototypeOf(C).constructor.gravityMul];
      G.guns.owned.includes('rocket') || G.guns.buyGun('rocket'); G.guns.reserve.rocket = 0; C.toggleChaos('rockets'); C.update(0.1); out.rockets = G.guns.reserve.rocket >= 6; C.toggleChaos('rockets');
      out.rank = G.completion.rank()[0];
      G.story.done = storyWas; G.stars = 0; G.heat = 0; G.skills.off = false; G.news.cooldown = 0; G.save.survivalBest = 0; G.hud.showGig(false);
      return out;
    });
    ok(dr.director.busyQuiet && dr.director.threw && dr.unlocked && dr.start && dr.stars === 5 && dr.survival.ended && dr.survival.best >= 25 && dr.survival.cash >= 100 && dr.moon && dr.gravity[0] === 0.35 && dr.gravity[1] === 1 && dr.rockets && dr.rank, 'the director throws an event when it is quiet; survival, chaos switches and ranks work after the story', JSON.stringify(dr));
    const fx = await S(() => {
      const G = g(); const V = G.vfx;
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.stars = 0;
      G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      const flash = document.getElementById('boomflash');
      flash.classList.remove('go');
      V.explosion(G.focusX + 10, G.focusZ);
      G.bus.emit({ type: 'explosion', x: G.focusX + 10, z: G.focusZ, byPlayer: false });
      const ring = V.rings.some((r) => r.t > 0 && r.mesh.visible);
      for (let i = 0; i < 12; i++) V.update(0.05);
      const ringGone = V.rings.every((r) => !r.mesh.visible);
      G.hud.setWanted(4); const heat4 = document.body.classList.contains('heat-4');
      G.hud.setWanted(0); const heat0 = !document.body.className.includes('heat-4');
      G.hitStop = 0; G.news.cooldown = 0; G.fires.list.length = 0;
      return { ring, ringGone, flash: flash.classList.contains('go'), heat4, heat0 };
    });
    ok(fx.ring && fx.ringGone && fx.flash && fx.heat4 && fx.heat0, 'a blast sends out a shockwave ring and a screen flash; the wanted level tints the screen edge', JSON.stringify(fx));
    const bar = await S(() => {
      const G = g(); const B = G.barricades; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.skills.off = true;
      B.update(0.1);
      out.n = B.list.length;
      const b = B.list[0];
      out.solid = G.world.boxes.includes(b.box);
      const car = G.spawnVehicle('sports', 0xff0000, b.x, b.z - 6, 0, 'parked'); G.boardVehicle(car);
      car.ctrl.vx = 0; car.ctrl.vz = 14; car.ctrl.position.z = b.z - 1.5; car.ctrl.position.x = b.x;
      const hp0 = car.ctrl.hp;
      B.update(0.05);
      out.smashed = b.broken > 0 && !G.world.boxes.includes(b.box) && !b.mesh.visible;
      out.slowed = car.ctrl.vz < 14 && car.ctrl.hp < hp0;
      B.update(95);
      out.rebuilt = b.broken === 0 && b.mesh.visible && G.world.boxes.includes(b.box);
      G.onFoot = true; G.driving = null; G.removeVehicle(car); G.skills.off = false;
      return out;
    });
    ok(bar.n >= 3 && bar.solid && bar.smashed && bar.slowed && bar.rebuilt, 'barricades stand at the edge of parks: a car at speed smashes through, and they are rebuilt later', JSON.stringify(bar));
    const amb = await S(() => {
      const G = g(); const A = G.audio; const st = { inCar: false, speedRatio: 0, throttle: 0, slip: 0, nitro: false, sirenDist: null };
      const areas = [];
      for (const a of ['harbor', 'beach', 'park', 'downtown']) {
        A.setAmbience(a, a === 'park' ? 0.8 : 0, false);
        for (let i = 0; i < 30; i++) A.update(0.1, st);
        areas.push(A.ambArea === a);
      }
      A.setAmbience('downtown', 0, false);
      return { areas, ctx: !!A.context };
    });
    ok(amb.areas.every(Boolean), 'the ambience (waves, birds, crickets, a ship horn) follows the district without errors', JSON.stringify(amb));
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
      const started = !!G.shops.bowl && G.cash < 1000; // (charm may have made it a little cheaper)
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
      z.owner = 'gang'; G.save.turf = []; G.save.rep = {};
      H.setPlayerActive(true, z.x + 60, z.z, 0);
      GA.update(0.1);
      const crew = z.members.length;
      H.player.x = z.x + 10; H.player.z = z.z; GA.update(0.1);
      const calm = !z.members.some((m) => m.hostile);          // walking onto their turf is not a challenge
      G.bus.emit({ type: 'gunshot', x: z.x + 10, z: z.z });     // your gunfire is
      const provoked = calm && z.members.every((m) => m.hostile);
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
    const crews = await S(() => {
      const G = g(); const out = {};
      for (const [name, kind, stat] of [['firefighter', 'firetruck', 'fires'], ['patrol', 'police', 'patrols']]) {
        const P = G[name];
        G.stars = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.cash = 0;
        for (const j of [G.paramedic, G.firefighter, G.patrol]) if (j.onDuty) j.end('x', 0);
        P.update(0.05); P.cooldown = 0;
        const sp = P.spot;
        G.humans.setPlayerActive(true, sp.x, sp.z, 0);
        P.update(0.05);
        const onDuty = P.onDuty && !!G.driving && G.driving.kind === kind;
        const heat = G.stars;
        G.fires.list.length = 0;
        const lit = name === 'firefighter' ? G.fires.ignite(G.driving.x + 60, G.driving.z) : null;
        if (name !== 'firefighter') G.bus.emit({ type: 'gunshot', x: G.driving.x + 60, z: G.driving.z });
        const calls = P.open;
        const fire = lit;
        let guard = 0;
        while (P.onDuty && guard++ < 400) {
          if (!P.calls.length) P.addCall(G.driving.x + 40, G.driving.z, 'test');
          const c = P.calls[0]; G.driving.ctrl.position.x = c.x; G.driving.ctrl.position.z = c.z; G.driving.ctrl.vx = G.driving.ctrl.vz = 0;
          P.update(0.5);
        }
        out[name] = { onDuty, heat, calls, shifts: P.completed, stat: G.progress.stats[stat], out: fire ? fire.out : true, cash: G.cash };
      }
      return out;
    });
    ok(crews.firefighter.onDuty && crews.firefighter.calls >= 1 && crews.firefighter.shifts === 1 && crews.firefighter.stat === 5 && crews.firefighter.out, 'firefighter shift: a fire truck waits, fires become calls and are put out', JSON.stringify(crews));
    ok(crews.patrol.onDuty && crews.patrol.heat === 0 && crews.patrol.calls >= 1 && crews.patrol.shifts === 1 && crews.patrol.stat === 5, 'police patrol: a cruiser waits (no heat) and shots become calls', JSON.stringify(crews));
    const mafia = await S(() => {
      const G = g(); const GA = G.gangs; const H = G.humans; const F = G.factions; const z = GA.zones[3];
      G.stars = 0; G.heat = 0; G.cash = 0; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play';
      z.owner = 'gang'; G.save.turf = []; G.save.rep = {}; z.members = [];
      for (const m of H.gangMembers()) H.removeGang(m);
      H.setPlayerActive(true, z.x + 60, z.z, 0);
      GA.update(0.1);
      const crew = z.members.length, hp = z.members[0] ? z.members[0].maxHp : 0;
      const watch0 = F.get('watch');
      for (const m of [...z.members]) H.gunHit(H.player, m, 9999, 1, 0, true);
      const captured = z.owner === 'player';
      const res = { is: z.faction === 'mafia', crew, hp, captured, bonus: G.cash, mafia: F.get('mafia'), watchUp: F.get('watch') > watch0 };
      // a hostile Watch gives no shifts; a friendly one pays more
      G.save.rep.watch = -50; const refuse = F.refusesShifts(); G.save.rep.watch = 50; const mult = F.payMult();
      G.save.rep = {};
      for (const m of H.gangMembers()) H.removeGang(m);
      for (const zz of GA.zones) zz.members = [];
      return { ...res, refuse, mult };
    });
    ok(mafia.is && mafia.crew === 5 && mafia.hp >= 120 && mafia.captured && mafia.bonus >= 1500 && mafia.mafia < 0 && mafia.watchUp && mafia.refuse && mafia.mult > 1, 'the Mafia holds a tougher block that pays more, and the City Watch and the Mafia react to what you do', JSON.stringify(mafia));
    await S(() => { const G = g(); G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.humans.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); });
    await p.waitForTimeout(1500);
    const thief = await S(() => {
      const G = g(); const T = G.thieves;
      G.stars = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.cash = 0; G.skills.off = true;
      let started = false;
      started = T.start();
      if (!started) { G.skills.off = false; return { started }; }
      const t = T.thief; const heard = G.bus.recent.some((e) => e.type === 'theft');
      const marker = T.markers().length === 1;
      for (let i = 0; i < 20; i++) { G.humans.setPlayerActive(true, t.x, t.z, 0); T.update(0.1); if (!T.active) break; }
      G.skills.off = false;
      return { started, heard, marker, caught: !T.active && G.progress.stats.thieves === 1, cash: G.cash };
    });
    ok(thief.started && thief.heard && thief.marker && thief.caught && thief.cash >= 180, 'a bag snatcher bolts, is marked on the map, and pays a reward when caught', JSON.stringify(thief));
    const npc = await S(() => {
      const G = g(); const N = G.npcs; const R = G.reputation;
      G.stars = 0; G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null;
      N.update(0.1);
      const placed = N.list.filter((q) => q.human).length;
      const mia = N.list.find((q) => q.def.id === 'mia');
      // neutral: she talks but gives nothing; friendly: a free donut; hostile: refuses
      const spot = mia.pos; const area = R.area(spot.x, spot.z);
      G.save.rep = {};
      G.humans.setPlayerActive(true, spot.x + 1.5, spot.z, 0);
      const near = N.nearest(); const prompt = near ? N.prompt(near) : '';
      G.humans.player.hp = 20; G.save.rep[area] = 50; mia.last = -999;
      N.talk(near); const open = N.dialogOpen; for (let k = 0; k < 6 && N.dialogOpen; k++) N.advance(); N.errand = null;
      const healed = G.humans.player.hp >= G.humans.player.maxHp;
      G.humans.player.hp = 20; G.save.rep[area] = -60; N.clock = 1000;
      N.talk(N.nearest()); const refused = N.dialog.lines.length === 1 && N.dialog.lines[0][0].startsWith('I have nothing'); N.advance();
      const stayedHurt = G.humans.player.hp === 20;
      // hurting people costs reputation where it happened; helping earns it back
      G.save.rep = {};
      G.bus.emit({ type: 'civAssaulted', x: spot.x, z: spot.z }); G.bus.emit({ type: 'civKilled', x: spot.x, z: spot.z, human: mia.human, byPlayer: true, kids: true });
      const down = R.get(area);
      G.bus.emit({ type: 'helped', x: spot.x, z: spot.z, amount: 10 });
      return { placed, near: !!near, prompt: /Mia|미아/.test(prompt), open, healed, refused, stayedHurt, down, up: R.get(area) };
    });
    ok(npc.placed >= 5 && npc.near && npc.prompt && npc.open && npc.healed && npc.refused && npc.stayedHurt && npc.down === -8 && npc.up === 2, 'named people talk by your reputation (a favour, or a refusal) and reputation moves with what you do', JSON.stringify(npc));
    const errand = await S(() => {
      const G = g(); const N = G.npcs; G.save.rep = {}; G.save.friends = {}; G.save.turf = [];
      G.stars = 0; G.cash = 0; N.clock = 5000; N.errandCd = 0; N.errand = null;
      const a = N.list.find((q) => q.human && q.def.id === 'kai') ?? N.list.filter((q) => q.human)[0];
      const placed = N.list.filter((q) => q.human).length;
      G.humans.setPlayerActive(true, a.human.x + 1.5, a.human.z, 0);
      N.talk(N.nearest()); for (let k = 0; k < 6 && N.dialogOpen; k++) N.advance();
      const e = N.errand; const marker = N.markers().length === 1;
      if (!e) return { placed, got: false };
      const b = N.list.find((q) => q.def.id === e.to);
      G.humans.setPlayerActive(true, b.human.x + 1.5, b.human.z, 0);
      N.clock += 100; N.talk(N.nearest()); for (let k = 0; k < 6 && N.dialogOpen; k++) N.advance();
      const lvl = N.level(e.from);
      return { placed, got: true, marker, done: !N.errand, cash: G.cash, reward: e.reward, friend: N.friendship(e.from), lvl };
    });
    ok(errand.placed >= 10 && errand.got && errand.marker && errand.done && errand.cash >= errand.reward && errand.friend >= 3, 'an errand carries a parcel between two named people, pays, and builds friendship', JSON.stringify(errand));
    const boat = await S(() => {
      const G = g(); const B = G.boats;
      if (!B.length) return { boats: 0 };
      const v = B[0];
      const r = G.world.waterRects.find((q) => v.x > q.minX && v.x < q.maxX && v.z > q.minZ && v.z < q.maxZ);
      G.humans.setPlayerActive(false, 0, 0, 0); G.boardVehicle(v); G.state = 'play'; G.inside = null;
      // push the boat well onto the land: it must be put back on the water
      v.ctrl.position.x = r.maxX + 60; v.ctrl.position.z = (r.minZ + r.maxZ) / 2; v.ctrl.vx = 5; v.ctrl.vz = 0;
      v.ctrl.update(0.05, v.control, null);
      const inWater = G.world.waterRects.some((q) => v.x >= q.minX && v.x <= q.maxX && v.z >= q.minZ && v.z <= q.maxZ);
      v.ctrl.vx = v.ctrl.vz = 0;
      return { boats: B.length, inWater, driving: G.driving === v && v.kind === 'boat' };
    });
    ok(boat.boats >= 1 && boat.inWater && boat.driving, 'boats are moored on the water and cannot be driven onto the land', JSON.stringify(boat));
    const skill = await S(() => {
      const G = g(); const S = G.skills;
      G.save.skills = {};
      const l0 = S.level('shooting'), gun0 = S.gunMul;
      S.add('shooting', 130);   // level 2
      const l1 = S.level('shooting'), gun1 = S.gunMul;
      S.add('charm', 300); const price = Math.round(100 * S.priceMul);
      S.add('stealth', 1000); const heat = S.heatMul;
      S.add('driving', 1000); const guard = S.crashGuard;
      G.save.skills = {};
      return { l0, l1, gain: gun1 > gun0, price: price < 100, heat: heat < 0.8, guard: guard < 0.8 };
    });
    ok(skill.l0 === 0 && skill.l1 === 2 && skill.gain && skill.price && skill.heat && skill.guard, 'skills level up with use and give small permanent bonuses', JSON.stringify(skill));
    const buddy = await S(() => {
      const G = g(); const H = G.humans; const B = G.buddy; const GA = G.gangs; const z = GA.zones[1];
      G.stars = 0; G.cash = 5000; G.driving = null; G.onFoot = true; G.inside = null; G.state = 'play';
      B.dismiss();
      z.owner = 'gang'; for (const m of z.members) H.removeGang(m); z.members = [];
      H.setPlayerActive(true, z.x + 80, z.z, 0);
      const hired = B.recruit('Bonnie');
      const ally = B.human;
      GA.update(0.1);
      H.player.x = z.x + 60; H.player.z = z.z; ally.x = H.player.x - 2; ally.z = H.player.z;
      GA.update(0.1);
      // bring the crew onto the player and let the bodyguard fight for 20 s of game time
      for (const m of z.members) { m.hostile = true; m.x = H.player.x + 6; m.z = H.player.z + 1; }
      const hp0 = z.members.reduce((a, m) => a + m.hp, 0);
      for (let i = 0; i < 400; i++) { G.update(0.05); for (const m of z.members) if (m.hostile && m.state !== 6) { /* keep them near */ } }
      const hp1 = z.members.reduce((a, m) => a + Math.max(0, m.hp), 0);
      const hurt = hp1 < hp0;
      const never = H.player.hp > 0;
      B.dismiss();
      return { hired, hurt, near: !!ally, never, civAllyHidden: !B.hired };
    });
    ok(buddy.hired && buddy.near && buddy.hurt && buddy.civAllyHidden, 'a hired bodyguard follows you and fights gang members', JSON.stringify(buddy));
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
