// Touch layout with a gun out: no button or HUD block overlaps at small phone sizes. node tests/touch.cjs
const { spawn, execSync } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('playwright is not installed'); process.exit(2); }
const PORT = 4188, root = path.resolve(__dirname, '..');
let fails = 0;
const ok = (c, n, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };
(async () => {
  if (!process.env.NO_BUILD) execSync('npm run build', { cwd: root, stdio: 'ignore' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  try {
    for (const [name, vp] of [['844x390', { width: 844, height: 390 }], ['667x375', { width: 667, height: 375 }], ['568x320', { width: 568, height: 320 }]]) {
      const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { localStorage.setItem('smashtown.settings.v1', JSON.stringify({ tutorialDone: true })); window.g = () => window.__smash.game; });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__smash);
      await p.evaluate(() => window.__smash.startGame()); await p.waitForTimeout(800);
      await p.evaluate(() => { const G = g(); G.addCash(50000); for (const id of ['smg', 'rocket']) G.guns.buyGun(id); G.humans.guns = G.guns.flags(); G.enterExit(); });
      await p.waitForTimeout(700);
      const bad = await p.evaluate(() => {
        const G = g(); G.humans.equip(4); G.guns.mag.smg = 3; G.aimOn = true; G.autoAim = true;
        for (let i = 0; i < 5; i++) G.update(1 / 60);
        document.body.classList.add('can-reload');   // the RELOAD button shows when the magazine is not full
        const rect = (e) => e.getBoundingClientRect();
        const items = [];
        for (const e of document.querySelectorAll('#touch button')) if (e.offsetParent !== null && getComputedStyle(e).display !== 'none') items.push([e.id || e.textContent.trim(), rect(e)]);
        for (const id of ['btn-pause', 'btn-map', 'story-pill', 'minimap', 'status', 'ammo']) { const e = document.getElementById(id); if (e && !e.hidden && e.offsetParent !== null) items.push([id, rect(e)]); }
        const out = [];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i][1], c = items[j][1];
          const nested = (items[i][0] === 'status' && items[j][0] === 'ammo') || (items[j][0] === 'status' && items[i][0] === 'ammo');
          if (!nested && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(items[i][0] + '/' + items[j][0]);
        }
        const names = items.map((x) => x[0]);
        const off = items.filter(([, r]) => r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).map((x) => x[0]);
        return { out, off, has: ['btn-reload', 'btn-aim', 'btn-auto'].filter((n) => names.includes(n)) };
      });
      ok(bad.has.length === 3, `reload, aim and auto buttons show with a gun out at ${name}`, bad.has.join(','));
      ok(bad.out.length === 0, `no overlaps at ${name}`, bad.out.join(', '));
      ok(bad.off.length === 0, `nothing off screen at ${name}`, bad.off.join(', '));
      // a face-to-face conversation with two choices: the touch buttons step aside and the panel fits the screen
      const dlg = await p.evaluate(() => {
        const G = g(); G.state = 'play'; G.stars = 0;
        G.dialogue.start({ a: { id: 'a', who: ['Mr. Park', '미스터 박'], text: ["I've only got $20 right now. Give me an hour, I'll earn the rest. A longer line to check the wrapping.", '지금 20달러밖에 없어요.'], choices: [{ label: ["I've only got $20 right now. Give me an hour, I'll earn the rest.", 'a'], next: 'b' }, { label: ['$40 for a roadside motel? That is highway robbery.', 'b'], next: 'b' }] }, b: { id: 'b', who: ['x', 'x'], text: ['y', 'y'] } }, 'a', null);
        const d = document.getElementById('dialog').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#dlg-choices .dlg-choice')].map((e) => e.getBoundingClientRect());
        const touchHidden = getComputedStyle(document.getElementById('touch')).visibility === 'hidden';
        const inside = d.left >= 0 && d.top >= 0 && d.right <= innerWidth + 1 && d.bottom <= innerHeight + 1;
        const out = { n: btns.length, touchHidden, inside, tall: d.height / innerHeight, btnsInside: btns.every((r) => r.top >= d.top - 1 && r.bottom <= d.bottom + 1) };
        G.dialogue.choose(0); G.dialogue.advance();
        return out;
      });
      ok(dlg.n === 2 && dlg.touchHidden && dlg.inside && dlg.btnsInside && dlg.tall < 0.8, `a conversation with choices fits and hides the touch buttons at ${name}`, JSON.stringify(dlg));
      await ctx.close();
    }
  } finally {
    ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
    await b.close(); srv.kill();
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
