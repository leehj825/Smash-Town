// Economy / garage test: node tests/economy.cjs   (needs playwright + a built dist; builds unless NO_BUILD=1)
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4198, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };

(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { window.g = () => window.__smash.game; if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`);
    await p.waitForFunction(() => window.__smash);
    const S = (fn, a) => p.evaluate(fn, a);
    await S(() => window.__smash.startGame());
    await p.waitForTimeout(600);
    await S(() => { window.g = () => window.__smash.game; });
    ok((await S(() => g().cashAmount)) === 2000, 'fresh game starts with $2,000');

    // income: smashing a prop pays and is tallied
    const paid = await S(() => { const G = g(); const c = G.world.circles.find((q) => q.smash && !q.dead); const before = G.cashAmount; G.smashProp(c, 0, 0, 20, true); return { gain: G.cashAmount - before, props: G.earned.props }; });
    ok(paid.gain > 0 && paid.props === paid.gain, 'smashing pays and is tallied', JSON.stringify(paid));
    await S(() => g().addCash(100000, 'other'));

    // garage: tune-up
    await S(() => g().openGarage());
    await p.waitForTimeout(200);
    const base = await S(() => g().driving.ctrl.stats.maxSpeed);
    await p.click('.gtab[data-tab="tune"]');
    const c0 = await S(() => g().cashAmount);
    await p.click('button.up[data-i="0"]');
    const after = await S(() => ({ cash: g().cashAmount, v: g().driving.ctrl.stats.maxSpeed }));
    ok(c0 - after.cash === 1500, 'engine level 1 costs $1,500', String(c0 - after.cash));
    ok(Math.abs(after.v / base - 1.04) < 0.001, 'engine level 1 raises top speed 4%');
    // paint + neon
    await p.click('.gtab[data-tab="look"]');
    const c1 = await S(() => g().cashAmount);
    await p.click('.swatch.paint:nth-child(3)');
    const painted = await S(() => ({ cash: g().cashAmount, color: g().driving.color, kind: g().driving.kind }));
    ok(c1 - painted.cash === 200 && painted.color !== 0, 'paint costs $200 and recolours the car', JSON.stringify(painted));
    const kids0 = await S(() => g().driving.ctrl.model.root.children.length);
    await p.click('.swatch.neon:nth-child(2)');
    const kids1 = await S(() => g().driving.ctrl.model.root.children.length);
    ok(kids1 === kids0 + 1, 'neon underglow adds a glow plane');
    // body training
    await p.click('.gtab[data-tab="body"]');
    await p.click('button.bup[data-i="0"]');
    ok((await S(() => g().humans.player.maxHp)) === 120, 'toughness training raises max HP to 120');
    // trophy car
    await p.click('.gtab[data-tab="cars"]');
    const cars = await S(() => [...document.querySelectorAll('.vbtn')].map((b) => b.dataset.k + ':' + b.textContent.trim()));
    ok(cars.some((c) => c.startsWith('limo:')) && cars.some((c) => c.startsWith('monster:')), 'trophy cars are listed', cars.slice(-2).join(' | '));
    await p.click('.vbtn[data-k="limo"]');
    ok((await S(() => g().driving.kind)) === 'limo', 'buying the limo puts you in it');
    await p.click('.vbtn[data-k="monster"]');
    ok((await S(() => g().driving.kind)) === 'monster', 'buying the monster truck works');

    // respray clears heat when no police are near
    await S(() => { const G = g(); for (const v of G.vehicles.filter((q) => q.isPolice)) { v.ctrl.position.x = 9999; v.ctrl.position.z = 9999; } G.addHeat(120); });
    await S(() => { g().closeGarage(); g().openGarage(); });
    const rs = await S(() => ({ stars: g().stars, btn: document.getElementById('g-respray').textContent.trim(), dis: document.getElementById('g-respray').disabled }));
    ok(rs.stars >= 2 && !rs.dis, 'respray enabled while wanted', JSON.stringify(rs));
    const cash2 = await S(() => g().cashAmount);
    await p.click('#g-respray');
    const rs2 = await S(() => ({ stars: g().stars, cash: g().cashAmount }));
    ok(rs2.stars === 0 && cash2 - rs2.cash >= 500, 'respray clears all stars for $500+', JSON.stringify(rs2));
    await S(() => g().closeGarage());

    // fines: floor under $500, otherwise a share
    const f = await S(() => {
      const G = g(); const out = {}; G.bustRoll = 0.9;
      G.cash = 300; G.busted(); out.low = 300 - G.cashAmount;
      G.state = 'play'; G.cash = 5000; G.busted(); out.mid = 5000 - G.cashAmount;
      G.state = 'play'; G.bustRoll = null; return out;
    });
    ok(f.low === 0 && f.mid === 500, 'bail is $0 under $500 and 10% above', JSON.stringify(f));

    // wreck -> always respawn with a free car
    await S(() => { const G = g(); G.cash = 0; G.driving.ctrl.hp = 0; });
    await p.waitForTimeout(1500);
    // the 2.8 s wreck timer is slow under software GL, so skip ahead once the wreck screen shows
    for (let i = 0; i < 60; i++) {
      const st = await S(() => { const G = g(); if (G.state === 'wrecked') G.stateTimer = Math.min(G.stateTimer, 0.05); return [G.state, !!G.driving, !!(G.driving && G.driving.ctrl.wrecked)]; });
      if (i > 2 && (st[0] === 'play' || st[0] === 'garage') && st[1] && !st[2]) break;
      await p.waitForTimeout(500);
    }
    ok(await S(() => !!g().driving && !g().driving.ctrl.wrecked && (g().state === 'play' || g().state === 'garage')), 'after a wreck with $0 you still get a car');
    await S(() => { if (g().state === 'garage') g().closeGarage(); });

    // persistence
    await S(() => g().addCash(1)); await p.waitForTimeout(3500);
    await p.reload(); await p.waitForFunction(() => window.__smash);
    await S(() => window.__smash.startGame()); await p.waitForTimeout(500);
    const kept = await S(() => { const G = window.__smash.game; return { sel: G.save.selected, body: G.save.body, cars: Object.keys(G.save.cars || {}) }; });
    ok(kept.body && kept.body.health === 1 && kept.cars.length >= 1, 'upgrades survive a reload', JSON.stringify(kept));
    await ctx.close();
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
