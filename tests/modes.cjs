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
    ok(r.mode === 'story' && r.sel === 0 && r.cash === 20 && r.foot && r.cars === 0 && r.guns === 0 && !r.bat && r.stage === 1 && r.rank === 'Newcomer', 'a new story starts at stage 1 with $20, on foot, with no car, gun or bat', JSON.stringify(r));
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
      G.story.ch = 3; out.stage2 = G.progression.stage(); out.pistolOk = G.progression.allows(2) && !G.progression.allows(3);
      G.story.ch = 5; out.stage3 = G.progression.stage();
      G.story.ch = 7; out.stage4 = G.progression.stage();
      G.story.ch = 2; out.back = G.progression.stage() === 1;
      // the pistol costs money and its ammunition runs out; the first cars cost too
      out.price = G.garageModel().arms.gate.pistol === 2;
      out.cars = G.garageModel().unlocked.size === 0;
      // gear is gated too
      G.save.gear = {}; out.vestLocked = !G.gear.buy('vest') && G.gear.count('vest') === 0;
      G.story.ch = 3; out.vestOpen = G.gear.buy('vest') && G.gear.count('vest') === 1;
      out.smokeLocked = !G.gear.buy('smoke');
      // big jobs wait for their stage
      G.story.ch = 2;
      let kinds = new Set(); for (let i = 0; i < 40; i++) { G.director.last = ''; G.fires.list.length = 0; G.riots.current = null; if (G.thieves.active) G.thieves.release(null); const picked = (() => { const before = G.director.throws; G.director.throwOne(); return G.director.last; })(); kinds.add(picked); if (G.truckHeist.active) G.truckHeist.end('x', false); }
      out.noTruck = !kinds.has('truck');
      G.fires.list.length = 0; G.riots.current = null; if (G.thieves.active) G.thieves.release(null);
      out.bank = (() => { const r = G.interiors.rooms.find((q) => q.id === 'bank'); G.inside = r; G.shops.startHeist(); const started = !!G.shops.heist; G.inside = null; G.shops.heist = null; return !started; })();
      G.story.ch = 0; G.story.step = 0; G.skills.off = false; G.stars = 0; G.heat = 0; G.save.gear = {};
      return out;
    });
    ok(r.stage1 === 1 && r.refused && r.stage2 === 2 && r.pistolOk && r.stage3 === 3 && r.stage4 === 4 && r.back && r.price && r.cars && r.vestLocked && r.vestOpen && r.smokeLocked && r.noTruck && r.bank, 'the gun shop and the big jobs open by stage: story chapters and gang blocks raise it', JSON.stringify(r));
    // until the opening is over the side jobs stay dark; stealing a car is a small crime that adds the car to your garage
    r = await p.evaluate(() => {
      const G = g(); const H = G.humans; const S = G.story; const out = {};
      G.inside = null; G.state = 'play'; G.skills.off = true; G.stars = 0; G.heat = 0; G.save.unlocked.length = 0;
      S.ch = 0; S.step = 0; G.dialogue.active = false; G.setDialogOpen(false);
      out.closed = G.sideOpen === false;
      G.update(0.05);
      out.dark = G.gigs.markers.every((m) => !m.beacon.visible) && !G.delivery.markers().length === false;
      out.noPad = G.delivery.markers().length === 1 && !G.pickup; // (the pad marker list exists but nothing is shown on the street)
      out.blips = true;
      // achievement and daily-challenge money waits for the open world, and is small there
      const cash1 = G.cash; G.progress.add('smashes', 100); G.progress.add('deliveries', 1);
      out.held = G.cash === cash1 && G.progress.daily.done.length === 0;
      S.ch = 2; out.open = G.sideOpen === true;
      G.progress.add('smashes', 1);
      const got = G.cash - cash1; out.small = got > 0 && got <= 500;
      S.ch = 0;
      // carjacking a driver: a small heat (under one star), and the kind joins the garage for free
      G.dialogue.active = false; G.hud.hideDialog(); G.state = 'play'; S.monoStarted = true;
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0); G.onFoot = true; G.driving = null;
      for (const q of [...G.vehicles]) if (Math.hypot(q.x - H.player.x, q.z - H.player.z) < 12) G.removeVehicle(q);
      const v = G.spawnVehicle('sedan', 0x333333, H.player.x + 1.5, H.player.z, 0, 'parked'); v.ai = 'traffic';
      G.heat = 0; G.enterExit();
      out.jack = G.driving === v && G.heat > 0 && G.heat < 30 && G.stars === 0;
      out.kept = G.save.unlocked.includes('sedan');
      G.removeVehicle(v); G.driving = null; G.onFoot = true; G.heat = 0; G.skills.off = false;
      return out;
    });
    ok(r.closed && r.dark && r.held && r.open && r.small && r.jack && r.kept, 'the side jobs stay dark until the opening is over; a carjacking is a small crime and the car joins your garage', JSON.stringify(r));
    await ctx.close();

    // the opening, face to face: arrival, Mr. Park (a choice), Donna (a donut), a job with a fight and Bonnie on the way, a first ride
    ({ p, ctx } = await open('?mode=story'));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const D = G.dialogue; const H = G.humans; const out = {};
      G.inside = null; G.skills.off = true;
      const adv = () => { for (let i = 0; i < 8 && D.active && !(D.node && D.node.choices); i++) D.advance(); };
      // scene 1: the arrival speaks by itself
      S.update(0.1);
      out.arrival = D.active && D.node.id === 'a1' && G.state === 'dialog';
      adv(); G.state = 'play';
      out.toPark = !D.active && S.stepKind() === 'talk' && S.questNpc() === 'park';
      // scene 2: Mr. Park, face to face, with a choice
      const park = G.npcs.humanOf('park');
      out.parkThere = !!park;
      H.setPlayerActive(true, park.x + 2.2, park.z, 0);
      G.npcs.talk(G.npcs.nearest());
      for (let i = 0; i < 30; i++) D.update(0.05);
      const a2 = Math.atan2(park.x - H.player.x, park.z - H.player.z);
      const dh = (x) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
      out.facing = dh(H.player.heading - a2) < 0.2 && dh(park.heading - (a2 + Math.PI)) < 0.2 && !!G.cameraRig.dialogFocus;
      const heat0 = G.heat; G.addHeat(80); out.calm = G.heat === heat0 && H.player.invuln > 0;
      adv();                                   // p1 -> p2, which has two choices
      out.choices = !!D.node.choices && D.node.choices.length === 2 && document.querySelectorAll('#dlg-choices .dlg-choice').length === 2;
      const area = G.reputation.area(H.player.x, H.player.z); const rep0 = G.reputation.get(area);
      D.choose(0); out.rep = G.reputation.get(area) - rep0 === 3;
      adv(); G.state = 'play';
      out.toDonna = !D.active && S.stepKind() === 'talk' && S.questNpc() === 'donna' && !G.cameraRig.dialogFocus;
      // scene 3: Donna gives a donut
      const donna = G.npcs.humanOf('donna');
      H.setPlayerActive(true, donna.x + 2.2, donna.z, 0);
      G.npcs.talk(G.npcs.nearest());
      adv(); G.state = 'play';
      out.donut = G.gear.count('donut') === 1 && S.stepKind() === 'deliver';
      return out;
    });
    ok(r.arrival && r.toPark && r.parkThere && r.facing && r.calm && r.choices && r.rep && r.toDonna && r.donut, 'the opening: a spoken arrival, then face to face with Mr. Park (a choice, standing +3) and Donna (a donut)', JSON.stringify(r));
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const D = G.dialogue; const H = G.humans; const out = {};
      G.state = 'play'; G.stars = 0; G.heat = 0;
      const adv = () => { for (let i = 0; i < 8 && D.active && !(D.node && D.node.choices); i++) D.advance(); };
      // scene 4: the job has two orders, and the second leg is blocked by the Bigsby thugs
      S.update(0.1);
      out.limits = G.delivery.stopsLimit === 2 && G.delivery.payScale < 1;
      G.delivery.cooldown = 0; G.delivery.update(0.05); const sp = G.delivery.spot; H.setPlayerActive(true, sp.x, sp.z, 0);
      G.delivery.update(0.1);
      out.two = G.delivery.active && G.delivery.stops.length === 2;
      out.short = G.delivery.stops.every((q) => Math.hypot(q.x - sp.x, q.z - sp.z) < 170);
      const s0 = G.delivery.stops[0]; H.setPlayerActive(true, s0.x, s0.z, 0); G.delivery.update(0.1);
      out.leg2 = G.delivery.leg === 1;
      const s1 = G.delivery.stops[1]; H.setPlayerActive(true, s1.x + 30, s1.z, 0); S.update(0.1);
      out.thugs = S.thugs.length === 2 && S.ambush === 'staged' && S.blocksDelivery();
      G.cash = 0;
      H.setPlayerActive(true, S.thugs[0].x + 5, S.thugs[0].z, 0); S.update(0.1);
      out.taunt = D.active && D.node.id === 't1' && S.ambush === 'talk';
      adv(); G.state = 'play';
      out.fight = S.ambush === 'fight' && S.thugs.every((h) => h.hostile);
      // the drop cannot be reached while they stand there
      H.setPlayerActive(true, s1.x, s1.z, 0); G.delivery.update(0.1);
      out.held = G.delivery.leg === 1 && G.cash === 0;
      // win the fight: the bat lies in the street
      for (const h of S.thugs) h.ko = true; S.update(0.1);
      out.bat = S.ambush === 'bonnie' && H.pickups.some((k) => k.kind === 'bat' && k.active) && !H.batOwned;
      return out;
    });
    ok(r.limits && r.two && r.short && r.leg2 && r.thugs && r.taunt && r.fight && r.held && r.bat, 'the job: two orders, thugs block the second drop, they taunt you, you fight, and a bat is left in the street', JSON.stringify(r));
    // Bonnie walks up
    await p.evaluate(() => { const G = g(); G.state = 'play'; for (let i = 0; i < 400 && !G.dialogue.active; i++) G.update(0.05); });
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const D = G.dialogue; const H = G.humans; const out = {};
      const b = G.npcs.humanOf('bonnie');
      out.bonnie = D.active && D.node.id === 'b1' && Math.hypot(b.x - H.player.x, b.z - H.player.z) < 3.2;
      const adv = () => { for (let i = 0; i < 8 && D.active && !(D.node && D.node.choices); i++) D.advance(); };
      adv(); out.choices = !!D.node.choices;
      D.choose(1); out.friend = G.save.friends.bonnie === 1;
      adv();
      return out;
    });
    await p.waitForFunction(() => !window.__smash.game.fading, null, { timeout: 30000 });
    r.back = await p.evaluate(() => { const G = g(); const b = G.npcs.humanOf('bonnie'); const h = G.npcs.homeOf('bonnie'); return Math.hypot(b.x - h.x, b.z - h.z) < 1.5 && G.story.ambush === 'done'; });
    ok(r.bonnie && r.choices && r.friend && r.back, 'Bonnie walks up after the fight, offers a choice, and goes back to the gun shop', JSON.stringify(r));
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const H = G.humans; const out = {};
      G.state = 'play';
      // pick up the bat, finish the delivery, then get a ride
      const bat = S.batAt; H.setPlayerActive(true, bat.x, bat.z, 0); G.update(0.1);
      out.bat = H.batOwned && H.player.weapon === 1;
      const s1 = G.delivery.stops[1]; if (s1) { H.setPlayerActive(true, s1.x, s1.z, 0); } G.stars = 0; G.heat = 0;
      for (let i = 0; i < 5; i++) { G.delivery.update(0.1); S.update(0.1); }
      out.delivered = G.delivery.completed >= 1 && G.delivery.stopsLimit === 3 && G.delivery.payScale === 1;
      out.paid = G.cash > 0 && G.cash < 600;
      // sirens: somebody called the police about the fight; lose them
      const D = G.dialogue;
      for (let i = 0; i < 4 && !(D.active && D.node.id === 'z0'); i++) S.update(0.1);
      out.sirens = (D.active && D.node.id === 'z1') || S.stepKind() === 'escape';
      for (let i = 0; i < 6 && D.active; i++) D.advance(); G.state = 'play';
      S.update(0.1); out.escape = S.stepKind() === 'escape' && (G.stars === 1 || S.escapeT > 0);
      G.clearWanted(); S.update(5); out.escaped = S.stepKind() === 'ride';
      const cash0 = G.cash; const v = G.spawnVehicle('scooter', 0x2fb87a, H.player.x + 2, H.player.z, 0, 'parked'); G.boardVehicle(v); S.update(0.1);
      out.done = S.ch === 1 && S.step === 0 && G.cash - cash0 === 100;
      out.next = S.stepKind() === 'monologue';
      G.removeVehicle(v); G.driving = null; G.onFoot = true; G.skills.off = false;
      return out;
    });
    ok(r.bat && r.delivered && r.paid && r.sirens && r.escape && r.escaped && r.done && r.next, 'pick up the bat, finish the delivery for modest pay, escape the sirens, get a ride, and the next chapter begins', JSON.stringify(r));
    await ctx.close();

    // chapter two, "Smash and Grab": a phone call, a brawl at Donna's, a chase on foot, thanks (and a call from a stranger)
    ({ p, ctx } = await open('?mode=story'));
    await p.evaluate(() => window.__smash.startGame());
    await p.waitForTimeout(800);
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const D = G.dialogue; const H = G.humans; const out = {};
      G.inside = null; G.skills.off = true; G.stars = 0; G.heat = 0;
      D.active = false; G.hud.hideDialog(); G.setDialogOpen(false); S.monoStarted = false; // (the arrival speaks by itself at the start: set it aside)
      S.ch = 1; S.step = 0; S.prog = 0; G.state = 'play';
      const adv = () => { for (let i = 0; i < 8 && D.active && !(D.node && D.node.choices); i++) D.advance(); };
      S.update(0.1); out.call = D.active && D.node.id === 'c1';
      adv(); G.state = 'play'; S.update(0.1);
      out.run = S.stepKind() === 'goto';
      const donna = G.world.landmarks.story.donna; H.setPlayerActive(true, donna.x, donna.z, 0); S.update(0.1);
      out.brawl = S.stepKind() === 'brawl';
      S.update(0.1); out.three = S.thugs.length === 3 && S.brawl === 'staged';
      H.setPlayerActive(true, S.thugs[0].x + 6, S.thugs[0].z, 0); S.update(0.1);
      out.taunt = D.active && D.node.id === 's1' && S.brawl === 'talk';
      adv(); G.state = 'play';
      out.fight = S.brawl === 'fight' && S.thugs.every((h) => h.hostile);
      for (const h of S.thugs) h.ko = true; S.update(0.1);
      out.cashbox = S.stepKind() === 'monologue';
      S.update(0.1); out.shout = D.active && D.node.id === 'x1';
      adv(); G.state = 'play'; S.update(0.1);
      out.runner = S.stepKind() === 'runner';
      // a passer-by is the thief: put one near Donna's door and let the chase begin
      const civ = H.list.find((h) => h.active && h.role === 0 && !h.named && !h.ally && !h.gang);
      const home = G.npcs.homeOf('donna'); civ.x = home.x + 9; civ.z = home.z; civ.state = 0;
      S.update(1); out.chase = G.thieves.active && H.thiefSpeed < 8.2;
      const tm = G.thieves.markers()[0]; H.setPlayerActive(true, tm.x, tm.z, 0); G.thieves.update(0.1); S.update(0.1);
      out.caught = !G.thieves.active && S.stepKind() === 'talk' && S.questNpc() === 'donna';
      // thanks
      const dn = G.npcs.humanOf('donna'); H.setPlayerActive(true, dn.x + 2.2, dn.z, 0);
      const cash0 = G.cash; G.npcs.talk(G.npcs.nearest());
      adv(); out.choice = !!D.node.choices; D.choose(0); adv(); G.state = 'play';
      out.reward = S.ch === 2 && G.cash - cash0 === 150;
      // then a call from a stranger
      S.update(0.1); out.teaser = D.active && D.node.who[0] === 'Unknown number';
      adv(); G.state = 'play';
      G.skills.off = false;
      return out;
    });
    ok(r.call && r.run && r.brawl && r.three && r.taunt && r.fight && r.cashbox && r.shout && r.runner && r.chase && r.caught && r.choice && r.reward && r.teaser, 'Smash and Grab: a call, a brawl at the shop, a chase on foot, thanks, and a stranger rings', JSON.stringify(r));
    // texts that come because of what you did, and a smaller economy
    r = await p.evaluate(() => {
      const G = g(); const D = G.dialogue; const out = {};
      G.state = 'play'; G.stars = 0; G.skills.off = true; D.active = false;
      out.scaled = G.scaled(300, 0.17) === 51 && G.scaled(1000, 0.3) === 300;
      G.save.beats = []; G.story.ch = 2; G.cash = 1500; G.beats.t = 0; G.beats.update(0.1);
      out.beat = D.active && D.node.who[0].startsWith('Mr. Park') && G.save.beats.includes('cash1000');
      for (let i = 0; i < 4 && D.active; i++) D.advance(); G.state = 'play';
      G.beats.t = 0; G.beats.update(0.1);
      out.once = !D.active || D.node.who[0].startsWith('Mr. Park') === false;
      G.skills.off = false; G.cash = 0;
      return out;
    });
    ok(r.scaled && r.beat && r.once, 'the story mode pays a fraction for found money, and a text arrives once when you have saved up', JSON.stringify(r));
    // the seven ideas: new plates, a slow-motion beat, street voices, a price on your head, radio rumours, and an ending you choose
    r = await p.evaluate(() => {
      const G = g(); const S = G.story; const D = G.dialogue; const H = G.humans; const out = {};
      G.state = 'play'; G.stars = 0; G.heat = 0; G.skills.off = true; D.active = false; G.hud.hideDialog(); G.inside = null;
      // 1. a stolen car becomes yours for $200
      H.setPlayerActive(true, G.world.spawn.x, G.world.spawn.z, 0);
      const v = G.spawnVehicle('taxi', 0xffc400, H.player.x + 2, H.player.z, 0, 'parked'); G.boardVehicle(v);
      G.cash = 500; v.owned = false;
      G.openGarage('garage');
      const btn = document.getElementById('g-register');
      out.offer = !!btn;
      if (btn) btn.click();
      out.owned = v.owned === true && G.cash === 300;
      G.closeGarage(); G.removeVehicle(v); G.driving = null; G.onFoot = true; G.state = 'play';
      // 2. a short slow-motion beat
      G.slowMo(1); out.slow = G.slowUntil > performance.now();
      // 4. a friendly street speaks
      const said = []; const sp = G.popups.spawn.bind(G.popups); G.popups.spawn = (x, y, z, text, c) => { said.push(text); return sp(x, y, z, text, c); };
      const area = G.reputation.area(H.player.x, H.player.z); (G.save.rep ??= {})[area] = 60;
      const civ = H.list.find((h) => h.active && h.role === 0 && !h.named && !h.ally && !h.gang);
      civ.x = H.player.x + 3; civ.z = H.player.z; civ.state = 1; civ.fleeing = false; civ.thief = false;
      S.ch = 3; G.voices.t = 0; G.voices.update(0.1);
      out.voice = said.some((t) => /Thanks|hero|lucky|고마|영웅|운이/.test(t));
      G.popups.spawn = sp; G.save.rep = {};
      // 5. a price on your head: hunters come from two stars
      S.ch = 5; G.stars = 2; G.heat = 100; G.police.hunter = null; G.police.hunterTimer = 0; G.police.manage(0.1);
      out.hunter = !!G.police.hunter;
      for (const q of [...G.vehicles]) if (q.ai === 'police') G.removeVehicle(q); G.police.hunter = null; G.stars = 0; G.heat = 0;
      S.ch = 2; G.police.hunterTimer = 0; G.stars = 2; G.police.manage(0.1); out.noHunterYet = !G.police.hunter; G.stars = 0; G.heat = 0;
      for (const q of [...G.vehicles]) if (q.ai === 'police') G.removeVehicle(q);
      // 6. radio rumours about G
      G.news.log.length = 0; S.ch = 5; G.beats.rumorT = 0; G.beats.t = 0; G.beats.update(0.1);
      out.rumor = G.news.log.some((e) => e.kind === 'rumor');
      // 7. the ending: three choices, one remembered
      S.dialog = null; D.active = false; G.hud.hideDialog(); G.setDialogOpen(false); G.state = 'play'; S.pendingTeaser = null;
      S.done = false; S.ch = 9; S.step = 0; G.watch = 0;
      const w0 = G.factions.get('watch');
      S.completeChapter(S.chapter); S.update(0.1);
      out.endStart = D.active && D.node.id === 'e1';
      for (let i = 0; i < 3 && D.active && !(D.node && D.node.choices); i++) D.advance();
      out.endChoices = !!D.node.choices && D.node.choices.length === 3;
      D.choose(0);
      out.endLaw = G.save.ending === 'law' && G.factions.get('watch') > w0;
      for (let i = 0; i < 4 && D.active; i++) D.advance(); G.state = 'play';
      out.endDone = !D.active && S.done === true;
      G.save.ending = undefined; G.skills.off = false; G.cash = 0;
      return out;
    });
    ok(r.offer && r.owned && r.slow && r.voice && r.hunter && r.noHunterYet && r.rumor && r.endStart && r.endChoices && r.endLaw && r.endDone, 'new plates, a slow-motion beat, street voices, a price on your head, radio rumours, and an ending you choose', JSON.stringify(r));
    // the next five: story pill steps, police radio, first-time tips, visible car upgrades, difficulty
    r = await p.evaluate(async () => {
      const G = g(); const H = G.hud; const out = {};
      G.state = 'play'; G.stars = 0; G.heat = 0; G.inside = null; G.dialogue.active = false; G.hud.hideDialog();
      // 1. tap the objective pill to see today's steps
      document.getElementById('story-pill').hidden = false;
      document.getElementById('story-pill').click();
      out.open = H.storyOpen === true;
      H.setStoryList([{ text: 'a', state: 'done' }, { text: 'b', state: 'now' }, { text: 'c', state: 'todo' }]);
      out.list = document.getElementById('story-list').children.length === 3 && !document.getElementById('story-list').hidden;
      document.getElementById('story-pill').click();
      H.setStoryList([{ text: 'a', state: 'now' }]);
      out.closed = document.getElementById('story-list').hidden === true;
      // 2. police radio
      G.stars = 2; G.heat = 100; G.copCars.length = 0; G.radioT = 0; G.radioSeen = '';
      const line = G.radioLine(0.1);
      out.radio = /Lost visual|Suspect|시야|용의자/.test(line);
      G.copCars.push({ x: G.humans.player.x + 10, z: G.humans.player.z }); G.radioT = 0;
      out.radioSeen = /in sight|확인/.test(G.radioLine(0.1));
      G.stars = 0; G.heat = 0; G.copCars.length = 0;
      // 3. first-time tips: once, only when calm
      G.save.tips = []; G.tips.t = 0;
      const toasts = []; const tt = H.toast.bind(H); H.toast = (m, ms) => { toasts.push(m); return tt(m, ms); };
      G.stars = 2; G.tips.update(0.1); out.tipWaits = toasts.length === 0; G.stars = 0;
      G.humans.player.hp = G.humans.player.maxHp;
      const sp = G.sideOpen; Object.defineProperty(G, 'sideOpen', { get: () => true, configurable: true });
      G.tips.t = 0; G.tips.update(0.1); G.tips.t = 0; G.tips.update(0.1);
      out.tipOnce = toasts.length === 1 && G.save.tips.includes('pill');
      delete G.sideOpen; H.toast = tt;
      // 4. upgrades show on the car (exhaust from the first upgrade on)
      const v = G.spawnVehicle('sedan', 0x3366cc, G.humans.player.x + 4, G.humans.player.z, 0, 'parked');
      const cnt = () => { let n = 0; v.ctrl.model.root.traverse((o) => { if (o.isMesh) n++; }); return n; };
      v.setMods(0); const n0 = cnt(); v.setMods(1); const n1 = cnt(); v.setMods(12); const n12 = cnt();
      out.mods = n1 === n0 + 1 && n12 === n1;
      G.removeVehicle(v);
      // 5. difficulty is one multiplier on found cash and on heat
      const mode = G.mode; const d0 = G.difficulty;
      G.difficulty = 0; const easy = G.scaled(100, 1); G.difficulty = 2; const hard = G.scaled(100, 1); G.difficulty = d0;
      out.diff = mode !== 'story' || (easy === 125 && hard === 80);
      return out;
    });
    ok(r.open && r.list && r.closed && r.radio && r.radioSeen && r.tipWaits && r.tipOnce && r.mods && r.diff, 'story pill steps, police radio, first-time tips, visible car upgrades and difficulty', JSON.stringify(r));
    // batch one: a disguise while wanted, glovebox cash, a welcome back, and shopkeepers who remember you
    r = await p.evaluate(async () => {
      const G = g(); const H = G.humans; const out = {};
      G.state = 'play'; G.stars = 0; G.heat = 0; G.inside = null; G.dialogue.active = false; G.hud.hideDialog(); G.skills.off = true;
      const room = G.interiors.rooms.find((r) => r.id === 'clothes');
      // 1. disguise: needs nobody close, halves the heat, then a cooldown
      G.cash = 1000; G.stars = 3; G.heat = 300;
      for (const v of [...G.vehicles]) if (v.ai === 'police') G.removeVehicle(v);
      const o0 = G.save.outfit ?? 0;
      G.shops.action(room);
      out.changed = (G.save.outfit ?? 0) !== o0 && G.cash === 900;
      out.halved = G.heat <= 150;
      const c1 = G.cash; G.heat = 300; G.shops.action(room);
      out.cooldown = G.cash === c1 && G.heat === 300;
      G.shops.disguiseUntil = 0;
      const pv = G.spawnVehicle('police', 0xffffff, G.focusX + 5, G.focusZ, 0, 'police');
      const c2 = G.cash; G.shops.action(room);
      out.seen = G.cash === c2;
      G.removeVehicle(pv); G.stars = 0; G.heat = 0; G.shops.disguiseUntil = 0;
      // 2. glovebox cash: small, once per car, none before the story opens
      const orig = Math.random; Math.random = () => 0.01;
      G.lootAt = 0; G.cash = 0;
      const car = G.spawnVehicle('sedan', 0x3366cc, H.player.x + 2, H.player.z, 0, 'parked');
      G.glovebox(car);
      out.loot = G.cash >= 1 && G.cash <= 25;
      const c3 = G.cash; G.glovebox(car); out.once = G.cash === c3;
      Math.random = orig; G.removeVehicle(car);
      // 3. welcome back: a toast for a saved story, nothing at the very start
      const ts = []; const tt = G.hud.toast.bind(G.hud); G.hud.toast = (m, ms) => { ts.push(m); return tt(m, ms); };
      G.story.done = false; G.story.ch = 0; G.story.step = 0; G.welcomeBack(); out.fresh = ts.length === 0;
      G.story.ch = 4; G.story.step = 1; G.welcomeBack(); out.back = ts.length === 1 && /Welcome back|다시 오셨/.test(ts[0]);
      G.hud.toast = tt; G.story.ch = 5; G.story.step = 0;
      // 4. a robbed shopkeeper shouts, a friendly one waves
      const said = []; const sp = G.popups.spawn.bind(G.popups); G.popups.spawn = (x, y, z, text, c) => { said.push(text); return sp(x, y, z, text, c); };
      const donut = G.interiors.rooms.find((r) => r.id === 'donut');
      H.setPlayerActive(true, donut.door.x + 2, donut.door.z, 0); G.onFoot = true; G.driving = null;
      G.shops.robbed.donut = performance.now() / 1000 + 100; G.voices.shopT = 0; G.voices.shopSaid = {};
      G.voices.update(0.1);
      out.shout = said.some((x) => /come back|오지 마/.test(x));
      said.length = 0; G.shops.robbed.donut = 0; G.voices.shopT = 0; G.voices.shopSaid = {};
      G.mood.saved = true; G.voices.update(0.1);
      out.wave = said.some((x) => /welcome|어서 와요/.test(x));
      G.mood.saved = false; G.popups.spawn = sp; G.skills.off = false; G.cash = 0;
      return out;
    });
    ok(r.changed && r.halved && r.cooldown && r.seen && r.loot && r.once && r.fresh && r.back && r.shout && r.wave, 'a disguise while wanted, glovebox cash, a welcome back, and shopkeepers who remember you', JSON.stringify(r));
    // batch two: friend stories, Donna's card, Bonnie's gear, clues about G, and a rival crew
    r = await p.evaluate(async () => {
      const G = g(); const H = G.humans; const D = G.dialogue; const out = {};
      G.state = 'play'; G.stars = 0; G.heat = 0; G.inside = null; D.active = false; G.hud.hideDialog(); G.skills.off = true;
      G.story.done = false; G.story.ch = 5; G.story.step = 0;
      G.save.friends = { donna: 3, kane: 9 }; G.save.fstory = {}; G.save.clues = []; G.save.stamps = 0; G.save.buddyGear = 0;
      const rec = (id) => G.npcs.list.find((n) => n.def.id === id);
      // 1. a friend's story is told face to face, in order, once; the main story and errands come first
      const qn = G.story.questNpc; G.story.questNpc = () => 'donna';
      out.gated = G.friendStories.next('donna') === null;
      G.story.questNpc = qn;
      const donna = rec('donna'); donna.human = donna.human ?? H.spawnNamed(H.player.x + 2, H.player.z, 0, { shirt: 0, pants: 0, skin: 0xf1c27d, hair: 0, shoe: 0, cap: false });
      G.npcs.talk({ def: donna.def, human: donna.human });
      out.started = D.active && D.node.id === 'a';
      for (let i = 0; i < 4 && D.active; i++) D.advance();
      G.state = 'play'; D.active = false;
      out.stage1 = G.save.fstory.donna === 1;
      out.waits = G.friendStories.next('donna') === null; // she needs 8 chats for the next chapter
      G.save.friends.donna = 8;
      out.stage2Ready = !!G.friendStories.next('donna');
      // kane's second chapter gives a clue
      G.save.fstory.kane = 1;
      const k = G.friendStories.next('kane'); out.kaneNext = !!k;
      D.start(k.script, k.start, null, k.done);
      for (let i = 0; i < 4 && D.active; i++) D.advance();
      G.state = 'play'; D.active = false;
      out.clue = G.save.clues.includes('kane') && G.save.fstory.kane === 2;
      // 2. Donna's card: nothing until she shows it, then four stamps earn donuts
      G.save.fstory.donna = 1; G.stampCard(); out.noCard = (G.save.stamps ?? 0) === 0;
      G.save.fstory.donna = 2; const d0 = G.gear.count('donut');
      for (let i = 0; i < 3; i++) G.stampCard();
      out.stamps = G.save.stamps === 3;
      G.stampCard(); out.box = G.gear.count('donut') > d0 && G.save.stamps === 0;
      // 3. Bonnie's gear: two levels, +25% each, no more
      out.power0 = G.buddyPower === 1;
      G.buddyGearUp(); G.buddyGearUp(); out.capped = G.buddyGearUp() === false && G.buddyPower === 1.5;
      // 4. a clue counts once, and what you found changes the ending's first line
      G.save.clues = []; G.addClue('a'); G.addClue('a'); out.once = G.save.clues.length === 1;
      G.addClue('b'); G.addClue('c');
      G.story.done = false; G.story.ch = 9; G.story.step = 0;
      G.story.completeChapter(G.story.chapter); G.story.update(0.1);
      out.endClues = D.active && D.node.id === 'e0';
      for (let i = 0; i < 6 && D.active; i++) D.advance();
      G.state = 'play'; D.active = false; G.save.ending = undefined; G.story.done = true; G.hud.hideDialog();
      // 5. a rival crew: only with two blocks, a warning, and the block is lost if nobody comes
      G.story.done = false; G.story.ch = 5;
      const Z = G.gangs.zones; const keep = Z.map((z) => z.owner);
      Z[0].owner = 'player'; Z[1].owner = 'player'; Z[2].owner = 'gang'; if (Z[3]) Z[3].owner = 'gang';
      G.gangs.rival = null; G.gangs.rivalCd = 0; G.stars = 0;
      Z[1].owner = 'gang'; G.gangs.update(0.1); out.oneBlock = G.gangs.rival === null; Z[1].owner = 'player';
      G.gangs.rivalCd = 0; G.gangs.update(0.1);
      out.rival = !!G.gangs.rival;
      const idx = G.gangs.rival.i; G.gangs.rival.t = 0;
      G.gangs.update(0.1);
      out.lost = Z[idx].owner === 'gang' && G.gangs.rival === null;
      Z.forEach((z, i) => { z.owner = keep[i]; });
      G.save.turf = Z.map((z, i) => (z.owner === 'player' ? i : -1)).filter((i) => i >= 0);
      G.story.done = true; G.skills.off = false;
      return out;
    });
    ok(r.gated && r.started && r.stage1 && r.waits && r.stage2Ready && r.kaneNext && r.clue && r.noCard && r.stamps && r.box && r.power0 && r.capped && r.once && r.endClues && r.oneBlock && r.rival && r.lost, 'friend stories, a loyalty card, Bonnie gear, clues about G and a rival crew', JSON.stringify(r));
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
    ok(r.ch === 4 && r.step === 1 && r.cash === 777 && r.car && r.stage === 2, 'an older story save keeps its place (shifted past the intro), its cash and its car', JSON.stringify(r));
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
      // no pedestrians, no gangs, and a car goes through people without a touch
      G.update(0.05);
      out.empty = H.civLimit === 0;
      const some = H.list.find((h) => h.active && h.role === 0 && !h.named && !h.ally);
      some.x = H.player.x + 8; some.z = H.player.z; some.state = 0;
      out.noRunOver = H.hitByVehicle(some.x, some.z, 2, 12, 0) === null && some.state === 0;
      const gz = G.gangs.zones[0]; H.setPlayerActive(true, gz.x + 40, gz.z, 0); G.gangs.update(0.1);
      out.noGangs = gz.members.length === 0 && G.gangs.markers().length === 0;
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
    ok(r.civ.hit && r.civ.up && r.civ.hp && r.civ.fled && !r.civ.dead && r.cop.leaving && r.cop.hp && r.cop.noDown && r.empty && r.noRunOver && r.noGangs && r.safe && r.swap.changed && r.swap.near && r.swap.gone && r.swap.driving && r.tough && r.escape, 'Kids Play: no pedestrians or gangs, cars never touch people, hits make cops run, you cannot be hurt, U swaps the car, and the police lose you quickly', JSON.stringify(r));
    await ctx.close();
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
