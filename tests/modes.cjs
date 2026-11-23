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
    ok(r.modes.length === 2, 'the title screen offers the story and the free sandbox', JSON.stringify(r));
    await ctx.close();

    // story mode, chosen by hand (its starting state arrives in the next step; for now it matches classic)
    ({ p, ctx } = await open('?mode=story'));
    r = await p.evaluate(() => ({ mode: g().mode, sel: [...document.querySelectorAll('#modes button')].findIndex((x) => x.classList.contains('sel')) }));
    ok(r.mode === 'story' && r.sel === 0, '?mode=story selects the story button', JSON.stringify(r));
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
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
