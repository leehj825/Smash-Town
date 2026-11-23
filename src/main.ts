import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { applyDom, bi, getLang, onLangChange, setLang, t, type Lang } from './i18n';
import { Input } from './input';
import { buildWorld } from './world';
import { buildProps } from './props';
import { Environment, type TimeOfDay } from './environment';
import { Vfx } from './vfx';
import { CameraRig } from './cameraRig';
import { Hud } from './hud';
import { Game } from './game';
import { BigMap } from './bigmap';
import { Radio, STATIONS } from './radio';
import { Weather, type WeatherKind } from './weather';
import { ControlsPanel, HowToPlay, StatsPanel, type Modal } from './overlays';
import { settings, saveSettings } from './settings';
import { SAVE_KEY, SLOT_KEY, currentSlot, slotSaveKey } from './game';
import { MODE_KEY } from './mode';
import { setupTouch } from './touch';

type Quality = 'high' | 'medium' | 'low';
const QUALITY_KEY = 'smashtown.quality';
const TIME_KEY = 'smashtown.time';
const AUDIO_KEY = 'smashtown.audio';
// ordinary civilian cars (police are never counted here)
const TRAFFIC: Record<Quality, number> = { high: 18, medium: 12, low: 8 };

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

function storedGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storedSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- renderer / scene
function showError(msg: string): void {
  let box = document.getElementById('err');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'err';
    document.body.appendChild(box);
  }
  box.textContent += msg + '\n';
}
window.addEventListener('error', (e) => showError(`Error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`Error: ${String(e.reason)}`));

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer shadow edges

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 1, 900);
const env = new Environment(scene);

const world = buildWorld();
scene.add(world.group);
const vfx = new Vfx();
scene.add(vfx.group);
const props = buildProps(world, vfx);
scene.add(props.group);

const input = new Input();
input.attachCanvas(canvas);
setupTouch(input);
const cameraRig = new CameraRig(camera);
cameraRig.obstacles = world.boxes;
const hud = new Hud(world);
const game = new Game({ scene, world, props, vfx, hud, input, env, cameraRig });
const bigmap = new BigMap(game);
const radio = new Radio(game.audio);
const weather = new Weather(env, game.audio);
scene.add(weather.group);
weather.addPuddles(game.world.segments);
{ const mo = new Date().getMonth(); props.setSeason(mo >= 8 && mo <= 10 ? 'autumn' : mo === 11 || mo <= 1 ? 'winter' : 'normal'); }
game.radioDuck = (v) => radio.setDuck(v);
const controlsPanel = new ControlsPanel();
const howto = new HowToPlay();
const statsPanel = new StatsPanel(game);
const modals: Modal[] = [controlsPanel, howto, statsPanel, bigmap];
const openModal = (): Modal | undefined => modals.find((m) => m.isOpen);

// ---------------------------------------------------------------- post-processing / quality
const composer = new EffectComposer(renderer);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.0);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloom);
composer.addPass(new OutputPass());

let quality: Quality = 'high';
/** On phones the game steps the graphics down by itself when the frame rate stays low (until the player picks a setting by hand). */
let autoQuality = isMobile;
let slowT = 0;
/** Photo mode (H): the HUD hides, the world freezes, you look around freely and Enter saves a picture. */
let photo = false;
let blackoutT = 0;
let photoSave = false;
function setPhoto(on: boolean): void {
  photo = on;
  const hudEl = document.getElementById('hud')!, hint = document.getElementById('photo-hint')!;
  hudEl.style.visibility = on ? 'hidden' : '';
  hint.hidden = !on;
  hint.textContent = bi('PHOTO MODE - move the mouse to look, [Enter] save a picture, [H] exit', '사진 모드 - 마우스로 둘러보기, [Enter] 사진 저장, [H] 종료');
}

function applyQuality(q: Quality): void {
  quality = q;
  storedSet(QUALITY_KEY, q);
  const shadows = q !== 'low';
  renderer.shadowMap.enabled = shadows;
  env.sun.castShadow = shadows;
  env.setShadowMapSize(isMobile ? 512 : 1024);
  bloom.enabled = q === 'high';
  game.useBlob = !shadows;
  game.trafficTarget = TRAFFIC[q];
  props.setVegetation(q === 'high' ? 0.7 : q === 'medium' ? 0.4 : 0.25);
  game.world.detail.visible = q === 'high';
  props.setDecor(q === 'high' ? 2 : q === 'medium' ? 1 : 0);
  game.lights.visible = q !== 'low';
  game.animals.visible = q !== 'low';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 1.25 : 2));
  resize();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
    else if (m) m.needsUpdate = true;
  });
  document.querySelectorAll<HTMLElement>('.quality').forEach((b) => b.classList.toggle('sel', b.dataset.q === q));
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const savedQ = storedGet(QUALITY_KEY);
applyQuality(savedQ === 'high' || savedQ === 'medium' || savedQ === 'low' ? savedQ : isMobile ? 'medium' : 'high');

// ---------------------------------------------------------------- time of day / audio
const clockEl = document.getElementById('clock');
let lastClockBand = '';
function applyTime(t: TimeOfDay, instant = false): void {
  env.setTime(t, instant);
  (game as { clock?: { setBand(t: TimeOfDay): void } } | undefined)?.clock?.setBand(t);
  storedSet(TIME_KEY, t);
  document.querySelectorAll<HTMLElement>('.tod').forEach((b) => b.classList.toggle('sel', b.dataset.t === t));
}
const savedT = storedGet(TIME_KEY);
applyTime(savedT === 'noon' || savedT === 'sunset' || savedT === 'night' ? savedT : 'noon', true);

const RADIO_KEY = 'smashtown.radio2';
type RadioChoice = 'off' | '0' | '1' | '2';
const radioChoice = (): RadioChoice => { const v = storedGet(RADIO_KEY); return v === '0' || v === '1' || v === '2' ? v : v === 'off' ? 'off' : '0'; };
function applyRadio(v: RadioChoice, announce = false): void {
  storedSet(RADIO_KEY, v);
  if (v !== 'off') radio.setStation(Number(v));
  radio.setEnabled(v !== 'off' && game.audio.enabled);
  document.querySelectorAll<HTMLElement>('.radio').forEach((b) => b.classList.toggle('sel', b.dataset.r === v));
  if (announce) hud.toast(v === 'off' ? bi('Radio off', '라디오 끔') : `\u266A ${bi(STATIONS[Number(v)].en, STATIONS[Number(v)].ko)}`, 1800);
}

const WEATHER_KEY = 'smashtown.weather';
function applyWeather(m: 'auto' | WeatherKind): void {
  storedSet(WEATHER_KEY, m);
  weather.setMode(m);
  document.querySelectorAll<HTMLElement>('.weather').forEach((b) => b.classList.toggle('sel', b.dataset.w === m));
}

/** The sandbox phone's switches for the weather and the time of day. */
const WEATHER_CYCLE: WeatherKind[] = ['clear', 'rain', 'fog', 'storm', 'snow'];
game.sandboxHooks = {
  weather: () => {
    const next = WEATHER_CYCLE[(WEATHER_CYCLE.indexOf(weather.kind) + 1) % WEATHER_CYCLE.length];
    applyWeather(next);
    return next;
  },
  time: () => { const t = env.cycleTime(); applyTime(t); return t; },
};

function applyAudio(on: boolean): void {
  game.audio.setEnabled(on);
  radio.setEnabled(on && radioChoice() !== 'off');
  storedSet(AUDIO_KEY, on ? '1' : '0');
  document.querySelectorAll<HTMLElement>('.radio').forEach((b) => b.addEventListener('click', () => applyRadio(b.dataset.r as RadioChoice)));
document.querySelectorAll<HTMLElement>('.weather').forEach((b) => b.addEventListener('click', () => applyWeather(b.dataset.w as 'auto' | WeatherKind)));
document.querySelectorAll<HTMLElement>('.audio').forEach((b) => b.classList.toggle('sel', (b.dataset.a === '1') === on));
}
applyAudio(storedGet(AUDIO_KEY) !== '0');
document.querySelectorAll<HTMLElement>('.radio').forEach((b) => b.classList.toggle('sel', b.dataset.r === radioChoice()));
const savedW = storedGet(WEATHER_KEY);
applyWeather(savedW === 'clear' || savedW === 'rain' || savedW === 'fog' || savedW === 'storm' || savedW === 'snow' ? savedW : 'auto');

document.getElementById('dialog')!.addEventListener('click', () => game.advanceDialog());

// ---------------------------------------------------------------- UI wiring
const titleEl = document.getElementById('title')!;
const pauseEl = document.getElementById('pause')!;
const hudEl = document.getElementById('hud')!;
let state: 'title' | 'playing' | 'paused' = 'title';

/** The three save slots on the title screen: pick one (the page reloads on it) and see how far each one has got. */
function buildSlots(): void {
  const box = document.getElementById('slots');
  if (!box) return;
  const cur = currentSlot();
  box.innerHTML = '';
  for (let n = 1; n <= 3; n++) {
    let info = bi('New game', '새 게임');
    try {
      const raw = localStorage.getItem(slotSaveKey(n));
      if (raw) { const s = JSON.parse(raw); info = `$${Math.floor(Number(s.cash) || 0).toLocaleString('en-US')}`; }
    } catch { /* unreadable slot */ }
    const b = document.createElement('button');
    b.className = n === cur ? 'sel' : '';
    b.innerHTML = `${bi('Slot', '슬롯')} ${n}<small>${info}</small>`;
    b.addEventListener('click', () => {
      if (n === cur) return;
      try { localStorage.setItem(SLOT_KEY, String(n)); } catch { /* ignore */ }
      location.reload();
    });
    box.appendChild(b);
  }
}
document.body.classList.add('mode-' + game.mode);
/** The two ways to play, side by side: the story (saved in a slot) and the free sandbox (everything unlocked, nothing saved). */
function buildModes(): void {
  const box = document.getElementById('modes');
  if (!box) return;
  box.innerHTML = '';
  const defs: [string, string, string][] = [
    ['story', bi('STORY', '스토리'), bi('start with nothing, grow', '맨몸으로 시작해 성장')],
    ['sandbox', bi('FREE SANDBOX', '프리 샌드박스'), bi('everything unlocked, not saved', '모두 해금, 저장 안 됨')],
    ['kids', bi('KIDS PLAY', '어린이 모드'), bi('fists only, everyone runs away', '주먹만, 모두 도망가요')],
  ];
  for (const [id, name, sub] of defs) {
    const b = document.createElement('button');
    const active = game.mode === 'sandbox' ? id === 'sandbox' : game.mode === 'kids' ? id === 'kids' : id === 'story';
    b.className = active ? 'sel' : '';
    b.innerHTML = `${name}<small>${sub}</small>`;
    b.addEventListener('click', () => {
      if (active) return;
      try { localStorage.setItem(MODE_KEY, id); } catch { /* ignore */ }
      location.reload();
    });
    box.appendChild(b);
  }
  const slots = document.getElementById('slots');
  if (slots) slots.style.display = game.mode === 'sandbox' || game.mode === 'kids' ? 'none' : '';
}
buildSlots();
buildModes();
onLangChange(() => { buildSlots(); buildModes(); });

function startGame(): void {
  if (state !== 'title') return;
  // Switch the UI first so a failure in optional systems (audio, pointer lock) can never block starting.
  state = 'playing';
  titleEl.hidden = true;
  hudEl.hidden = false;
  if (!settings.tutorialDone) howto.open();
  if (!navigator.webdriver && game.mode !== 'sandbox' && game.mode !== 'kids') window.setTimeout(() => game.claimLogin(), 1200); // (automated test browsers skip the bonus so cash totals stay exact)
  try {
    game.audio.init(); // needs a user gesture
    applyRadio(radioChoice());
  } catch (err) {
    console.warn('Audio unavailable:', err);
  }
}
/** Leaving the app (home button, another tab, a locked screen) silences it and pauses the game; coming back resumes the sound. */
function onVisibility(): void {
  const hidden = document.hidden;
  game.audio.setBackground(hidden);
  if (hidden && state === 'playing') setPaused(true);
}
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('pagehide', () => { game.audio.setBackground(true); if (state === 'playing') setPaused(true); });
window.addEventListener('pageshow', () => { if (!document.hidden) game.audio.setBackground(false); });

function setPaused(p: boolean): void {
  if (state === 'title') return;
  state = p ? 'paused' : 'playing';
  pauseEl.hidden = !p;
  if (p) {
    input.releaseMouse();
    const e = game.earned;
    hud.setEarnings([[bi('Golden stars', '황금 별'), e.stars], [bi('Side jobs', '부업'), e.gigs], [bi('Story', '스토리'), e.story], [bi('Police & survival', '경찰·생존'), e.police], [bi('Other', '기타'), e.other]]);
  }
}
document.getElementById('btn-play')!.addEventListener('click', startGame);
document.getElementById('btn-pause')!.addEventListener('click', () => setPaused(true));
function toggleMap(): void {
  if (state !== 'playing') return;
  if (bigmap.isOpen) bigmap.close();
  else if (game.state === 'play') { input.releaseMouse(); bigmap.open(); }
}
document.getElementById('btn-map')!.addEventListener('click', toggleMap);
document.getElementById('btn-resume')!.addEventListener('click', () => setPaused(false));
document.querySelectorAll<HTMLElement>('.lang').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang as Lang)));
document.querySelectorAll<HTMLElement>('.quality').forEach((b) => b.addEventListener('click', () => { autoQuality = false; slowT = 0; applyQuality(b.dataset.q as Quality); }));
document.querySelectorAll<HTMLElement>('.tod').forEach((b) => b.addEventListener('click', () => applyTime(b.dataset.t as TimeOfDay)));
document.querySelectorAll<HTMLElement>('.audio').forEach((b) => b.addEventListener('click', () => applyAudio(b.dataset.a === '1')));
const segSync = (cls: string, cur: number) =>
  document.querySelectorAll<HTMLElement>('.seg.' + cls).forEach((b) => b.classList.toggle('sel', Math.abs(Number(b.dataset.v) - cur) < 0.01));
function wireSeg(cls: 'sens' | 'aimSens' | 'fov' | 'shake'): void {
  segSync(cls, settings[cls]);
  document.querySelectorAll<HTMLElement>('.seg.' + cls).forEach((b) => b.addEventListener('click', () => {
    settings[cls] = Number(b.dataset.v); saveSettings(); segSync(cls, settings[cls]);
  }));
}
wireSeg('sens'); wireSeg('aimSens'); wireSeg('fov'); wireSeg('shake');
/** Accessibility switches: large text and a colour-blind palette. */
function applyA11y(): void {
  document.documentElement.classList.toggle('big-ui', settings.bigUi);
  document.documentElement.classList.toggle('cb-safe', settings.colorSafe);
  document.querySelectorAll<HTMLElement>('.seg.a11y').forEach((b) => b.classList.toggle('sel', (b.dataset.v === '1') === !!settings[b.dataset.a as 'bigUi' | 'colorSafe' | 'perfHud']));
  document.getElementById('perf')!.hidden = !settings.perfHud;
}
document.querySelectorAll<HTMLElement>('.seg.a11y').forEach((b) => b.addEventListener('click', () => {
  settings[b.dataset.a as 'bigUi' | 'colorSafe' | 'perfHud'] = b.dataset.v === '1';
  saveSettings(); applyA11y();
}));
applyA11y();
const syncAuto = () => document.querySelectorAll<HTMLElement>('.autoaim').forEach((b) => b.classList.toggle('sel', (b.dataset.a === '1') === game.autoAim));
document.querySelectorAll<HTMLElement>('.autoaim').forEach((b) => b.addEventListener('click', () => { game.setAutoAim(b.dataset.a === '1', false); syncAuto(); }));
syncAuto();
game.onAutoAimChange = syncAuto;
document.getElementById('btn-controls')!.addEventListener('click', () => controlsPanel.open());
document.getElementById('btn-stats')!.addEventListener('click', () => statsPanel.open());
document.getElementById('btn-howto')!.addEventListener('click', () => howto.open());
const newGameBtn = document.getElementById('btn-newgame')!;
let armedTimer = 0;
newGameBtn.addEventListener('click', () => {
  if (!newGameBtn.classList.contains('armed')) {
    newGameBtn.classList.add('armed');
    newGameBtn.textContent = t('ui.settings.newgame_confirm');
    armedTimer = window.setTimeout(() => { newGameBtn.classList.remove('armed'); newGameBtn.textContent = t('ui.settings.newgame'); }, 4000);
    return;
  }
  window.clearTimeout(armedTimer);
  game.noSave = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
});
applyDom();
document.documentElement.lang = getLang();
const syncLangButtons = () =>
  document.querySelectorAll<HTMLElement>('.lang').forEach((b) => b.classList.toggle('sel', b.dataset.lang === getLang()));
syncLangButtons();
onLangChange(syncLangButtons);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'title') startGame();
});
// a trusted gesture (key / click / tap) is what lets the browser start audio; this also covers a gamepad start
window.addEventListener('pointerdown', () => { if (state !== 'title') game.audio.init(); });
window.addEventListener('keydown', () => { if (state !== 'title') game.audio.init(); });
window.addEventListener('gamepadconnected', () => hud.toast(t('ui.toast.pad'), 2200));

// ---------------------------------------------------------------- main loop
const timer = new THREE.Timer();

/** The performance box: frame rate (averaged over half a second), worst frame, triangles and draw calls of the whole frame. */
const perfEl = document.getElementById('perf')!;
let perfAcc = 0, perfFrames = 0, perfWorst = 0, perfLast = performance.now();
renderer.info.autoReset = false; // the composer renders several passes per frame: count them all and reset once per frame
function updatePerf(): void {
  const now = performance.now();
  const ms = now - perfLast;
  perfLast = now;
  perfAcc += ms; perfFrames++; perfWorst = Math.max(perfWorst, ms);
  if (perfAcc >= 500) {
    if (settings.perfHud) {
      const i = renderer.info.render;
      perfEl.textContent = `${Math.round((perfFrames * 1000) / perfAcc)} fps  worst ${Math.round(perfWorst)} ms\n${Math.round(i.triangles / 1000)}k tris  ${i.calls} calls  ${quality}`;
    }
    perfAcc = 0; perfFrames = 0; perfWorst = 0;
  }
  renderer.info.reset();
}

function frame(): void {
  requestAnimationFrame(frame);
  try {
    tick();
    updatePerf();
  } catch (err) {
    showError(`Frame error: ${(err as Error).message}`);
  }
}

/** Gamepad menu navigation: D-pad moves the highlight between the buttons of the open overlay, A presses, B/Start go back. */
let navIndex = -1;
function menuNav(): void {
  const garageEl = document.getElementById('garage')!;
  const overlay = openModal()?.el ?? (!titleEl.hidden ? titleEl : !pauseEl.hidden ? pauseEl : !garageEl.hidden ? garageEl : null);
  if (!overlay) { navIndex = -1; return; }
  const btns = Array.from(overlay.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  if (!btns.length) return;
  const focusAt = (i: number) => {
    navIndex = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('pad-focus', k === navIndex));
    btns[navIndex].focus({ preventScroll: true });
  };
  if (input.wasPressed('PadDown') || input.wasPressed('PadRight')) focusAt(navIndex + 1);
  if (input.wasPressed('PadUp') || input.wasPressed('PadLeft')) focusAt(navIndex < 0 ? 0 : navIndex - 1);
  if (input.wasPressed('PadA')) {
    const target = navIndex >= 0 && btns[navIndex] ? btns[navIndex] : btns[0];
    target.click();
  }
}

function tick(): void {
  timer.update();
  const rawDt = timer.getDelta();
  let dt = Math.min(rawDt, 0.05);

  // gamepad: tell it what the buttons mean right now, then read it
  input.menu = state !== 'playing' || game.state !== 'play' || !!openModal();
  input.mode = game.onFoot ? 'foot' : 'car';
  input.pollGamepad(Math.min(rawDt, 0.1));
  if (input.padActive && state !== 'title') game.audio.ensureRunning();
  menuNav();
  if (state === 'title' && input.wasPressed('Enter')) startGame();

  const modal = openModal();
  if (photo) {
    if (input.wasPressed('KeyH') || input.wasPressed('Escape')) setPhoto(false);
    if (input.wasPressed('Enter')) photoSave = true;
    const lk = input.takeLook();
    cameraRig.applyLook(lk.x, lk.y);
    dt = 0;
  } else if (modal) {
    if (!controlsPanel.isCapturing) {
      if (input.wasPressed('Escape') || (modal === bigmap && (input.wasPressed('KeyP') || input.wasPressed('KeyM'))) || (modal === howto && (input.wasPressed('Enter') || input.wasPressed('Space')))) modal.close();
    }
    dt = 0;
    if (modal === bigmap) bigmap.draw(rawDt);
  } else if (state === 'playing') {
    if (input.wasPressed('KeyM')) toggleMap();
    else if (game.state !== 'garage' && game.state !== 'dialog' && (input.wasPressed('Escape') || input.wasPressed('KeyP'))) setPaused(true);
    if (input.wasPressed('KeyT')) applyTime(env.cycleTime());
    if (input.wasPressed('KeyH') && !game.inside && game.state === 'play') setPhoto(true);
    if (input.wasPressed('KeyN')) { const order: RadioChoice[] = ['off', '0', '1', '2']; applyRadio(order[(order.indexOf(radioChoice()) + 1) % order.length], true); }
  } else if (state === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) setPaused(false);
    dt = 0;
  } else {
    dt = 0; // title screen: freeze the sim, still render
  }

  if (game.hitStop > 0) {
    game.hitStop -= dt;
    dt = 0;
  }
  dt *= game.timeScale;

  if (autoQuality && state === 'playing' && !modal && rawDt > 0 && rawDt < 1) {
    slowT = rawDt > 1 / 24 ? slowT + rawDt : Math.max(0, slowT - rawDt * 2);
    if (slowT > 6 && quality !== 'low') {
      slowT = 0;
      const next: Quality = quality === 'high' ? 'medium' : 'low';
      applyQuality(next);
      hud.toast(bi(`Graphics lowered to ${next} to keep the game smooth`, `부드럽게 하려고 화질을 ${next === 'medium' ? '중간' : '낮음'}으로 낮췄어요`), 3000);
    }
  }

  if (state === 'playing' && dt > 0) {
    // sub-step for stable collisions
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) game.update(dt / steps);
    vfx.update(dt);
    if (clockEl) {
      const t = (game.mode === 'sandbox' ? 'SANDBOX ' : game.mode === 'kids' ? 'KIDS ' : '') + game.clock.text();
      if (t !== clockEl.textContent) clockEl.textContent = t;
      const b = game.clock.band;
      if (b !== lastClockBand) { lastClockBand = b; document.querySelectorAll<HTMLElement>('.tod').forEach((el) => el.classList.toggle('sel', el.dataset.t === b)); }
    }
  }

  cameraRig.update(state === 'title' ? 0.016 : dt || 0.0001, game.followable);
  // a storm can knock the power out for half a minute
  if (weather.kind === 'storm' && !game.blackout && state === 'playing' && Math.random() < dt / 100) {
    game.blackout = true; blackoutT = 25 + Math.random() * 20;
    game.bus.emit({ type: 'blackout' });
  }
  if (game.blackout) { blackoutT -= dt; if (blackoutT <= 0 || weather.kind !== 'storm') game.blackout = false; }
  weather.indoors = !!game.inside;
  game.humans.raining = weather.rainAmount > 0.3 && !game.inside;
  weather.update(Math.max(dt, 0.001), camera);
  env.update(Math.max(dt, 0.016), game.followable.position, camera);
  composer.render();
  if (photoSave) {
    photoSave = false;
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `smash-town-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      hud.toast(bi('Picture saved', '사진을 저장했어요'), 1500);
    });
  }
  input.endFrame();
}
frame();

// Debug handle for tests and tinkering from the console.
(window as unknown as { __smash: unknown }).__smash = {
  game, env, hud, renderer, scene, camera, applyQuality, applyTime, startGame, bigmap, radio, statsPanel, weather, composer, get quality() { return quality; },
};
