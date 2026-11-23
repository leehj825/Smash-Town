// Game modes: classic keeps the old start, sandbox is rich, unlocked and never saved. node tests/modes.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4196, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const open = async (query) => {
    const ctx = await b.newContext({ viewport: { width: 800, height: 480 } });
    await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/${query}`);
    await p.waitForFunction(() => window.__smash);
    return { p, ctx };
  };
  try {
    // automated browsers get the classic start by default, so the other tests keep their numbers
    let { p, ctx } = await open('');
    let r = await p.evaluate(() => { const G = g(); return { mode: G.mode, cash: G.cash, unlocked: G.save.unlocked.length, noSave: G.noSave }; });
    ok(r.mode === 'classic' && r.cash === 2000 && r.unlocked === 2 && !r.noSave, 'an automated browser starts in classic mode with $2,000 and two cars', JSON.stringify(r));
    r = await p.evaluate(() => ({ modes: [...document.querySelectorAll('#modes button')].map((x) => x.textContent), sel: [...document.querySelectorAll('#modes button')].findIndex((x) => x.classList.contains('sel')) }));
    ok(r.modes.length === 3, 'the title screen offers the story, the free sandbox and Kids Play', JSON.stringify(r));
    await ctx.close();

    // a new story: $50, on foot, bare hands, nothing to drive
    ({ p, ctx } = await open('?mode=story'));
    r = await p.evaluate(() => {
      const G = g(); const out = { mode: G.mode, cash: G.cash, foot: G.onFoot && !G.driving, cars: G.save.unlocked.length, guns: G.guns.owned.length, bat: G.humans.batOwned };
      out.sel = [...document.querySelectorAll('#modes button')].findIndex((x) => x.classList.contains('sel'));
      out.stage = G.progression.stage(); out.rank = G.completion.rank()[0];
      out.pistolFinite = !window.__smash.game.guns.has('pistol') && G.guns.owned.length === 0;
      return out;
    });
    ok(r.mode === 'story' && r.sel === 0 && r.cash === 50 && r.foot && r.cars === 0 && r.guns === 0 && !r.bat && r.stage === 1 && r.rank === 'Newcomer', 'a new story starts at stage 1 with $50, on foot, with no car, gun or bat', JSON.stringify(r));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g(); const out = {}; const H = G.humans;
      G.inside = null; G.state = 'play'; G.skills.off = true; G.cash = 10000;
      // the gun shop sells by stage, and says no politely
      out.stage1 = G.progression.stage();
      // buying a pistol at stage 1 is refused (onBuyGun is wired through the garage panel; call the same gate)
      const need = (id) => ({ pistol: 2, smg: 3, rocket: 4 })[id];
      out.refused = !G.progression.allows(need('pistol')) && !G.progression.allows(need('smg')) && !G.progression.allows(need('rocket'));
      G.story.ch = 2; out.stage2 = G.progression.stage(); out.pistolOk = G.progression.allows(2) && !G.progression.allows(3);
      G.story.ch = 4; out.stage3 = G.progression.stage();
      G.story.ch = 6; out.stage4 = G.progression.stage();
      G.story.ch = 1; out.back = G.progression.stage() === 1;
      // the pistol costs money and its ammunition runs out; the first cars cost too
      out.price = G.garageModel().arms.gate.pistol === 2;
      out.cars = G.garageModel().unlocked.size === 0;
      // gear is gated too
      G.save.gear = {}; out.vestLocked = !G.gear.buy('vest') && G.gear.count('vest') === 0;
      G.story.ch = 2; out.vestOpen = G.gear.buy('vest') && G.gear.count('vest') === 1;
      out.smokeLocked = !G.gear.buy('smoke');
      // big jobs wait for their stage
      G.story.ch = 1;
      let kinds = new Set(); for (let i = 0; i < 40; i++) { G.director.last = ''; G.fires.list.length = 0; G.riots.current = null; if (G.thieves.active) G.thieves.release(null); const picked = (() => { const before = G.director.throws; G.director.throwOne(); return G.director.last; })(); kinds.add(picked); if (G.truckHeist.active) G.truckHeist.end('x', false); }
      out.noTruck = !kinds.has('truck');
      G.fires.list.length = 0; G.riots.current = null; if (G.thieves.active) G.thieves.release(null);
      out.bank = (() => { const r = G.interiors.rooms.find((q) => q.id === 'bank'); G.inside = r; G.shops.startHeist(); const started = !!G.shops.heist; G.inside = null; G.shops.heist = null; return !started; })();
      G.story.ch = 0; G.story.step = 0; G.skills.off = false; G.stars = 0; G.heat = 0; G.save.gear = {};
      return out;
    });
    ok(r.stage1 === 1 && r.refused && r.stage2 === 2 && r.pistolOk && r.stage3 === 3 && r.stage4 === 4 && r.back && r.price && r.cars && r.vestLocked && r.vestOpen && r.smokeLocked && r.noTruck && r.bank, 'the gun shop and the big jobs open by stage: story chapters and gang blocks raise it', JSON.stringify(r));
    await ctx.close();

    // the opening: Donna's job, two deliveries, a fight for the bat, a first ride
    ({ p, ctx } = await open('?mode=story'));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const out = {}; const H = G.humans;
      G.inside = null; G.state = 'play'; G.skills.off = true;
      const talk = () => { for (let i = 0; i < 8 && S.dialogOpen; i++) S.advanceDialog(); };
      const donna = G.world.landmarks.story.donna;
      out.start = S.ch === 0 && S.step === 0 && S.stepKind() === 'goto';
      H.setPlayerActive(true, donna.x, donna.z, 0); S.update(0.1); S.update(0.1);
      out.dialog = S.stepKind() === 'dialog'; S.update(0.1); out.open = S.dialogOpen; talk(); S.update(0.1);
      out.deliver = S.stepKind() === 'deliver';
      G.delivery.count += 2; S.update(0.1); S.update(0.1);
      out.talk2 = S.stepKind() === 'dialog'; S.update(0.1); talk(); S.update(0.1);
      out.fight = S.stepKind() === 'fight'; S.update(0.1);
      out.thugs = S.thugs.length === 2;
      for (const h of S.thugs) h.ko = true; S.update(0.1);
      out.bat = H.batOwned && H.player.weapon === 1;
      out.ride = S.stepKind() === 'ride';
      const cash0 = G.cash; const v = G.spawnVehicle('scooter', 0x2fb87a, H.player.x + 2, H.player.z, 0, 'parked'); G.boardVehicle(v); S.update(0.1);
      out.done = S.ch === 1 && S.step === 0 && G.cash - cash0 === 150 && G.gear.count('donut') === 1;
      out.next = S.stepKind() === 'goto';
      G.removeVehicle(v); G.driving = null; G.onFoot = true; G.skills.off = false;
      return out;
    });
    ok(r.start && r.dialog && r.open && r.deliver && r.talk2 && r.fight && r.thugs && r.bat && r.ride && r.done && r.next, 'the opening: Donna job, two deliveries, a fight that wins the bat, a first ride, then the story proper', JSON.stringify(r));
    await ctx.close();

    // a story saved before the intro existed skips it (chapters move up one place)
    ({ p, ctx } = await (async () => {
      const c = await b.newContext({ viewport: { width: 800, height: 480 } });
      await c.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); localStorage.setItem('smashtown.save.v1', JSON.stringify({ cash: 777, unlocked: ['sports'], selected: 'sports', story: { ch: 2, step: 1, prog: 0 } })); window.g = () => window.__smash.game; });
      const pg = await c.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
      await pg.goto(`http://localhost:${PORT}/?mode=story`); await pg.waitForFunction(() => window.__smash);
      return { p: pg, ctx: c };
    })());
    r = await p.evaluate(() => { const G = g(); return { ch: G.story.ch, step: G.story.step, cash: G.cash, car: !!G.driving, stage: G.progression.stage() }; });
    ok(r.ch === 3 && r.step === 1 && r.cash === 777 && r.car && r.stage === 2, 'an older story save keeps its place (shifted past the intro), its cash and its car', JSON.stringify(r));
    await ctx.close();

    // the sandbox
    ({ p, ctx } = await open('?mode=sandbox'));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g();
      const out = { mode: G.mode, cash: G.cash, cars: G.save.unlocked.length, guns: G.guns.owned.length, noSave: G.noSave, storyOff: G.story.done };
      out.sel = [...document.querySelectorAll('#modes button')].findIndex((x) => x.classList.contains('sel'));
      out.clock = /SANDBOX/.test(document.getElementById('clock').textContent);
      // nothing is written
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('smashtown.save'));
      G.save.cash = 1; G.flushSave();
      out.saved = Object.keys(localStorage).filter((k) => k.startsWith('smashtown.save')).length > keys.length;
      // ammunition and tools never run out
      G.guns.reserve.rocket = 0; G.sandbox.update();
      out.ammo = G.guns.reserve.rocket >= 99 && G.gear.count('c4') >= 9;
      return out;
    });
    ok(r.mode === 'sandbox' && r.cash === 999999 && r.cars >= 10 && r.guns === 6 && r.noSave && r.storyOff && r.sel === 1 && !r.saved && r.ammo, 'the sandbox: $999,999, every car and gun, no story, nothing saved, endless ammo', JSON.stringify(r));
    r = await p.evaluate(() => {
      const G = g(); const S = G.sandbox; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null;
      // wanted level: set, hold, clear
      S.setStars(3); out.three = G.stars === 3;
      S.setStars(0); out.zero = G.stars === 0;
      S.cycleStars(); out.one = G.stars === 1;
      S.toggleFreeze(); S.frozen = 4; G.clearWanted(); S.update(); out.held = G.stars === 4;
      S.frozen = null; G.clearWanted();
      // god mode
      S.toggleGod(); G.humans.player.hp = 3; S.update(); out.god = G.humans.player.hp === G.humans.player.maxHp; S.toggleGod();
      // a car from the roster
      const n0 = G.vehicles.length; const kind = S.spawnCar(); out.car = G.vehicles.length === n0 + 1 && !!kind;
      // the phone lists the sandbox entries
      G.phone.show(); out.phone = [...document.querySelectorAll('#phone .phone-item')].filter((b) => /Sandbox|샌드박스/.test(b.textContent)).length >= 5; G.phone.close();
      // weather and time hooks
      const w = G.sandboxHooks.weather(); const t0 = G.env.timeOfDay; G.sandboxHooks.time(); out.hooks = !!w && G.env.timeOfDay !== t0;
      G.clearWanted();
      return out;
    });
    ok(r.three && r.zero && r.one && r.held && r.god && r.car && r.phone && r.hooks, 'the sandbox panel sets, holds and clears the wanted level, grants god mode, spawns cars, changes weather and time', JSON.stringify(r));
    await ctx.close();
    // Kids Play: its own mode, fists only, everyone runs away, easy escapes, quick car swaps
    ({ p, ctx } = await open('?mode=kids'));
    r = await p.evaluate(() => {
      const G = g(); const out = { mode: G.mode, gentle: G.humans.gentle, guns: G.guns.owned.length, bat: G.humans.batOwned, noSave: G.noSave, cars: G.save.unlocked.length, stage: G.progression.stage() };
      out.sel = [...document.querySelectorAll('#modes button')].findIndex((x) => x.classList.contains('sel'));
      out.buttons = document.querySelectorAll('#modes button').length;
      out.noToggle = !document.querySelector('.kids-row') && !document.querySelector('button.kids');
      return out;
    });
    ok(r.mode === 'kids' && r.gentle && r.guns === 0 && !r.bat && r.noSave && r.cars >= 10 && r.stage === 1 && r.sel === 2 && r.buttons === 3 && r.noToggle, 'Kids Play is a mode of its own: no weapons, nothing saved, and the old option is gone from the settings', JSON.stringify(r));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g(); const H = G.humans; const out = {};
      G.inside = null; G.state = 'play'; G.onFoot = true; G.driving = null; G.stars = 0; G.heat = 0;
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      // a person you hit runs away instead of falling
      const civ = H.list.find((h) => h.active && h.role === 0 && !h.named && !h.ally);
      civ.x = H.player.x + 1.5; civ.z = H.player.z; civ.state = 0; civ.hp = 20; civ.fleeing = false;
      const hit = H.gunHit(H.player, civ, 999, 1, 0, true);
      out.civ = { hit, up: civ.state !== 6 && civ.state !== 7 && civ.state !== 8, hp: civ.hp === 20, fled: civ.fleeing, dead: civ.hp <= 0 };
      // a cop runs off too, and nobody is credited with a knock-out
      H.spawnCop(0);
      const cop = H.list.find((h) => h.active && h.role === 1 && !h.gang);
      const downs = H.copsDefeated;
      cop.x = H.player.x + 1.5; cop.z = H.player.z; cop.hp = 30; cop.state = 0;
      H.gunHit(H.player, cop, 999, 1, 0, true);
      out.cop = { leaving: cop.leaving, hp: cop.hp === 30, noDown: H.copsDefeated === downs };
      // the player cannot be hurt
      H.player.hp = H.player.maxHp; const hurt = H.gunHit(cop, H.player, 50, 1, 0, true);
      out.safe = hurt === false && H.player.hp === H.player.maxHp;
      // swapping the car on the spot (U): a different kind, same place, old one gone
      G.boardVehicle(G.spawnVehicle('sedan', 0x3b82f6, H.player.x, H.player.z, 0, 'parked'));
      const old = G.driving; const x0 = old.x, z0 = old.z;
      const kind = G.kidsMode.nextCar(1);
      out.swap = { changed: G.driving !== old && G.driving.kind === kind, near: Math.hypot(G.driving.x - x0, G.driving.z - z0) < 1, gone: !G.vehicles.includes(old), driving: !G.onFoot };
      // the car cannot be wrecked
      G.driving.ctrl.hp = 0.01; G.kidsMode.update(); out.tough = G.driving.ctrl.hp === 1;
      // getting away is easy: nobody near, and within seconds the stars are gone
      for (const v of [...G.vehicles]) if (v.ai === 'police') G.removeVehicle(v);
      for (const h of H.list) if (h.role === 1 && h.active) { h.active = false; }
      G.stars = 3; G.heat = 200; G.minHeat = 170; G.crimeT = 10;
      for (let i = 0; i < 40 && G.stars > 0; i++) G.updateWanted(0.5);
      out.escape = G.stars === 0;
      return out;
    });
    ok(r.civ.hit && r.civ.up && r.civ.hp && r.civ.fled && !r.civ.dead && r.cop.leaving && r.cop.hp && r.cop.noDown && r.safe && r.swap.changed && r.swap.near && r.swap.gone && r.swap.driving && r.tough && r.escape, 'Kids Play: hits make people and cops run, you cannot be hurt, U swaps the car, and the police lose you quickly', JSON.stringify(r));
    await ctx.close();
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
