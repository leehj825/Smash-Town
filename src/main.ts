import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { applyDom, getLang, onLangChange, setLang, type Lang } from './i18n';
import { Input } from './input';
import { buildWorld } from './world';
import { buildProps } from './props';
import { VehicleFactory } from './vehicle';
import { CarController } from './carController';
import { Environment, type TimeOfDay } from './environment';
import { Vfx } from './vfx';
import { CameraRig } from './cameraRig';
import { Hud } from './hud';

type Quality = 'high' | 'medium' | 'low';
const QUALITY_KEY = 'smashtown.quality';
const TIME_KEY = 'smashtown.time';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

function storedGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storedSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- renderer / scene
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
const props = buildProps(world);
scene.add(props.group);

const vfx = new Vfx();
scene.add(vfx.group);

const model = VehicleFactory.createSportsCar(0xffd500);
scene.add(model.root);

const input = new Input();
const cameraRig = new CameraRig(camera);
const hud = new Hud(world);

let hitStop = 0;
const car = new CarController(model, world, {
  onImpact(strength) {
    cameraRig.shake(Math.min(1, strength / 22));
    if (strength > 9) hitStop = Math.max(hitStop, 0.03);
  },
});
const respawn = () => {
  car.reset(world.spawn.x, world.spawn.z, world.spawn.heading);
  cameraRig.snap();
};
respawn();

// ---------------------------------------------------------------- post-processing / quality
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.0);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(outputPass);

let quality: Quality = 'high';
function applyQuality(q: Quality): void {
  quality = q;
  storedSet(QUALITY_KEY, q);
  const shadows = q !== 'low';
  renderer.shadowMap.enabled = shadows;
  env.sun.castShadow = shadows;
  env.setShadowMapSize(isMobile ? 512 : 1024);
  bloom.enabled = q === 'high';
  model.blob.visible = !shadows;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 1.25 : 2));
  resize();
  // Materials must recompile when shadows toggle.
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

// ---------------------------------------------------------------- time of day
function applyTime(t: TimeOfDay, instant = false): void {
  env.setTime(t, instant);
  storedSet(TIME_KEY, t);
  document.querySelectorAll<HTMLElement>('.tod').forEach((b) => b.classList.toggle('sel', b.dataset.t === t));
}
const savedT = storedGet(TIME_KEY);
applyTime(savedT === 'noon' || savedT === 'sunset' || savedT === 'night' ? savedT : 'noon', true);

// ---------------------------------------------------------------- UI wiring
const titleEl = document.getElementById('title')!;
const pauseEl = document.getElementById('pause')!;
const hudEl = document.getElementById('hud')!;
let state: 'title' | 'playing' | 'paused' = 'title';

function startGame(): void {
  state = 'playing';
  titleEl.hidden = true;
  hudEl.hidden = false;
}
function setPaused(p: boolean): void {
  if (state === 'title') return;
  state = p ? 'paused' : 'playing';
  pauseEl.hidden = !p;
}
document.getElementById('btn-play')!.addEventListener('click', startGame);
document.getElementById('btn-pause')!.addEventListener('click', () => setPaused(true));
document.getElementById('btn-resume')!.addEventListener('click', () => setPaused(false));
document.querySelectorAll<HTMLElement>('.lang').forEach((b) =>
  b.addEventListener('click', () => setLang(b.dataset.lang as Lang)),
);
document.querySelectorAll<HTMLElement>('.quality').forEach((b) =>
  b.addEventListener('click', () => applyQuality(b.dataset.q as Quality)),
);
document.querySelectorAll<HTMLElement>('.tod').forEach((b) =>
  b.addEventListener('click', () => applyTime(b.dataset.t as TimeOfDay)),
);
applyDom();
document.documentElement.lang = getLang();
const syncLangButtons = () =>
  document.querySelectorAll<HTMLElement>('.lang').forEach((b) => b.classList.toggle('sel', b.dataset.lang === getLang()));
syncLangButtons();
onLangChange(syncLangButtons);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'title') startGame();
});

// ---------------------------------------------------------------- main loop
const timer = new THREE.Timer();
const focus = new THREE.Vector3();
const spawnSkid = (x: number, z: number, h: number) => vfx.addSkid(x, z, h);
const spawnDust = (x: number, z: number, vx: number, vz: number, n: number) => vfx.emitDust(x, 0.2, z, vx, vz, n);

function frame(): void {
  requestAnimationFrame(frame);
  timer.update();
  let dt = Math.min(timer.getDelta(), 0.05);

  if (state === 'playing') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) setPaused(true);
    if (input.wasPressed('KeyT')) {
      const next = env.cycleTime();
      applyTime(next);
    }
    if (input.wasPressed('KeyR')) respawn();
  } else if (state === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) setPaused(false);
    dt = 0;
  } else {
    dt = dt * 0.0; // title screen: freeze the sim, still render
  }

  if (hitStop > 0) {
    hitStop -= dt;
    dt = 0;
  }

  if (dt > 0) {
    // sub-step for stable collisions
    const steps = Math.ceil(dt / (1 / 60));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) car.update(h, input, spawnSkid, spawnDust);
    vfx.update(dt);
  }

  cameraRig.update(state === 'title' ? 0.016 : dt || 0.0001, car);

  // night-driven emissives
  const n = env.night;
  world.windowMaterial.emissiveIntensity = n * 1.1;
  props.lampHeadMaterial.emissiveIntensity = 0.15 + n * 3.2;
  model.headMat.emissiveIntensity = 0.6 + n * 2.6;
  model.headGlow.visible = n > 0.05;
  (model.headGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, n * 0.6);

  focus.copy(car.position);
  env.update(Math.max(dt, 0.016), focus, camera);

  hud.update(car);
  composer.render();
  input.endFrame();
}
frame();

// Debug handle for tests and tinkering from the console.
(window as unknown as { __smash: unknown }).__smash = { car, env, hud, applyQuality, applyTime, startGame, get quality() { return quality; } };
