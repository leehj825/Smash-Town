import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { applyDom, getLang, onLangChange, setLang, t, type Lang } from './i18n';
import { Input } from './input';
import { buildWorld } from './world';
import { buildProps } from './props';
import { Environment, type TimeOfDay } from './environment';
import { Vfx } from './vfx';
import { CameraRig } from './cameraRig';
import { Hud } from './hud';
import { Game } from './game';
import { BigMap } from './bigmap';
import { setupTouch } from './touch';

type Quality = 'high' | 'medium' | 'low';
const QUALITY_KEY = 'smashtown.quality';
const TIME_KEY = 'smashtown.time';
const AUDIO_KEY = 'smashtown.audio';
const KIDS_KEY = 'smashtown.kids';
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
renderer.shadowMap.type = THREE.PCFShadowMap; // soft-filtered PCF in current three.js

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

// ---------------------------------------------------------------- post-processing / quality
const composer = new EffectComposer(renderer);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.0);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloom);
composer.addPass(new OutputPass());

let quality: Quality = 'high';
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
function applyTime(t: TimeOfDay, instant = false): void {
  env.setTime(t, instant);
  storedSet(TIME_KEY, t);
  document.querySelectorAll<HTMLElement>('.tod').forEach((b) => b.classList.toggle('sel', b.dataset.t === t));
}
const savedT = storedGet(TIME_KEY);
applyTime(savedT === 'noon' || savedT === 'sunset' || savedT === 'night' ? savedT : 'noon', true);

function applyAudio(on: boolean): void {
  game.audio.setEnabled(on);
  storedSet(AUDIO_KEY, on ? '1' : '0');
  document.querySelectorAll<HTMLElement>('.audio').forEach((b) => b.classList.toggle('sel', (b.dataset.a === '1') === on));
}
applyAudio(storedGet(AUDIO_KEY) !== '0');

/** Kids Play (default ON): nobody dies - defeated cops and the player are only knocked out. */
function applyKids(on: boolean): void {
  game.humans.kids = on;
  storedSet(KIDS_KEY, on ? '1' : '0');
  document.getElementById('dialog')!.addEventListener('click', () => game.story.advanceDialog());
document.querySelectorAll<HTMLElement>('.kids').forEach((b) => b.classList.toggle('sel', (b.dataset.k === '1') === on));
}
applyKids(storedGet(KIDS_KEY) !== '0');

// ---------------------------------------------------------------- UI wiring
const titleEl = document.getElementById('title')!;
const pauseEl = document.getElementById('pause')!;
const hudEl = document.getElementById('hud')!;
let state: 'title' | 'playing' | 'paused' = 'title';

function startGame(): void {
  if (state !== 'title') return;
  // Switch the UI first so a failure in optional systems (audio, pointer lock) can never block starting.
  state = 'playing';
  titleEl.hidden = true;
  hudEl.hidden = false;
  try {
    game.audio.init(); // needs a user gesture
  } catch (err) {
    console.warn('Audio unavailable:', err);
  }
}
function setPaused(p: boolean): void {
  if (state === 'title') return;
  state = p ? 'paused' : 'playing';
  pauseEl.hidden = !p;
  if (p) input.releaseMouse();
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
document.querySelectorAll<HTMLElement>('.quality').forEach((b) => b.addEventListener('click', () => applyQuality(b.dataset.q as Quality)));
document.querySelectorAll<HTMLElement>('.tod').forEach((b) => b.addEventListener('click', () => applyTime(b.dataset.t as TimeOfDay)));
document.querySelectorAll<HTMLElement>('.audio').forEach((b) => b.addEventListener('click', () => applyAudio(b.dataset.a === '1')));
document.querySelectorAll<HTMLElement>('.kids').forEach((b) => b.addEventListener('click', () => applyKids(b.dataset.k === '1')));
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

function frame(): void {
  requestAnimationFrame(frame);
  try {
    tick();
  } catch (err) {
    showError(`Frame error: ${(err as Error).message}`);
  }
}

/** Gamepad menu navigation: D-pad moves the highlight between the buttons of the open overlay, A presses, B/Start go back. */
let navIndex = -1;
function menuNav(): void {
  const garageEl = document.getElementById('garage')!;
  const overlay = !titleEl.hidden ? titleEl : !pauseEl.hidden ? pauseEl : !garageEl.hidden ? garageEl : bigmap.isOpen ? bigmap.el : null;
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
  input.menu = state !== 'playing' || game.state !== 'play' || bigmap.isOpen;
  input.mode = game.onFoot ? 'foot' : 'car';
  input.pollGamepad(Math.min(rawDt, 0.1));
  if (input.padActive && state !== 'title') game.audio.ensureRunning();
  menuNav();
  if (state === 'title' && input.wasPressed('Enter')) startGame();

  if (state === 'playing' && bigmap.isOpen) {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP') || input.wasPressed('KeyM')) bigmap.close();
    dt = 0;
    bigmap.draw(rawDt);
  } else if (state === 'playing') {
    if (input.wasPressed('KeyM')) toggleMap();
    else if (game.state !== 'garage' && game.state !== 'dialog' && (input.wasPressed('Escape') || input.wasPressed('KeyP'))) setPaused(true);
    if (input.wasPressed('KeyT')) applyTime(env.cycleTime());
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

  if (state === 'playing' && dt > 0) {
    // sub-step for stable collisions
    const steps = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < steps; i++) game.update(dt / steps);
    vfx.update(dt);
  }

  cameraRig.update(state === 'title' ? 0.016 : dt || 0.0001, game.followable);
  env.update(Math.max(dt, 0.016), game.followable.position, camera);
  composer.render();
  input.endFrame();
}
frame();

// Debug handle for tests and tinkering from the console.
(window as unknown as { __smash: unknown }).__smash = {
  game, env, hud, renderer, scene, camera, applyQuality, applyTime, startGame, bigmap, get quality() { return quality; },
};
