import * as THREE from 'three';
import type { AudioEngine } from './audio';
import { CarController } from './carController';
import type { Environment } from './environment';

export type WeatherKind = 'clear' | 'rain' | 'fog' | 'storm' | 'snow';
export const WEATHERS: WeatherKind[] = ['clear', 'rain', 'fog', 'storm', 'snow'];

interface Look { dim: number; fog: number; grey: number; rain: number; grip: number; snow: number }
const LOOKS: Record<WeatherKind, Look> = {
  clear: { dim: 0, fog: 0, grey: 0, rain: 0, grip: 1, snow: 0 },
  rain: { dim: 0.5, fog: 0.6, grey: 0.8, rain: 1, grip: 0.86, snow: 0 },
  fog: { dim: 0.25, fog: 2.0, grey: 0.7, rain: 0, grip: 0.95, snow: 0 },
  storm: { dim: 0.8, fog: 1.2, grey: 1, rain: 1.6, grip: 0.76, snow: 0 },
  snow: { dim: 0.25, fog: 1.0, grey: 0.6, rain: 0, grip: 0.74, snow: 1 },
};

const N = 900;

/** Rain, fog and storms: streaks around the camera, dimmer greyer skies, thick fog, thunder, and slipperier roads. */
export class Weather {
  readonly group = new THREE.Group();
  /** Chosen in settings: 'auto' lets the weather change on its own every few minutes. */
  mode: 'auto' | WeatherKind = 'auto';
  kind: WeatherKind = 'clear';
  private cur: Look = { ...LOOKS.clear };
  private lines: THREE.LineSegments;
  private flakes: THREE.Points;
  private flakePos: Float32Array;
  private pos: Float32Array;
  private speeds: Float32Array;
  private timer = 90;
  private lightning = 6;
  private thunderIn = -1;
  private flash = 0;
  indoors = false;
  /** How wet the ground is (rises in the rain, dries slowly): drives the puddles. */
  wet = 0;
  private puddles: THREE.Mesh | null = null;

  constructor(private env: Environment, private audio: AudioEngine) {
    this.pos = new Float32Array(N * 6);
    this.speeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 30, z = (Math.random() - 0.5) * 80;
      this.set(i, x, y, z);
      this.speeds[i] = 24 + Math.random() * 12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4d2ea, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.group.add(this.lines);
    this.flakePos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) { this.flakePos[i * 3] = (Math.random() - 0.5) * 70; this.flakePos[i * 3 + 1] = Math.random() * 25; this.flakePos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.flakePos, 3));
    this.flakes = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
    this.group.add(this.flakes);
  }

  private set(i: number, x: number, y: number, z: number): void {
    const o = i * 6;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.pos[o + 3] = x - 0.12; this.pos[o + 4] = y - 1.1; this.pos[o + 5] = z - 0.05;
  }

  /** Scatter shallow puddles along the roads; they show up when it rains and fade as the ground dries. */
  addPuddles(segments: { x: number; z: number; dx: number; dz: number; len: number; hw: number }[]): void {
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x23324a, roughness: 0.05, metalness: 0.85, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const list: { x: number; z: number; sx: number; sz: number }[] = [];
    for (const s of segments) {
      const n = Math.max(1, Math.round(s.len / 24));
      for (let k = 0; k < n; k++) {
        const along = (Math.random() - 0.5) * s.len * 0.9, side = (Math.random() - 0.5) * s.hw * 1.7;
        list.push({ x: s.x + s.dx * along - s.dz * side, z: s.z + s.dz * along + s.dx * side, sx: 0.7 + Math.random() * 1.4, sz: 0.5 + Math.random() * 0.9 });
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    list.forEach((p, i) => { d.position.set(p.x, 0.05, p.z); d.rotation.set(0, Math.random() * 3, 0); d.scale.set(p.sx, 1, p.sz); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
    mesh.frustumCulled = false; mesh.visible = false;
    this.puddles = mesh;
    this.group.add(mesh);
  }

  setMode(m: 'auto' | WeatherKind): void {
    this.mode = m;
    if (m !== 'auto') this.kind = m;
    else this.timer = 20;
  }

  /** Slipperiness for the car physics right now (1 = dry). */
  get grip(): number { return this.cur.grip; }
  get rainAmount(): number { return this.cur.rain; }

  update(dt: number, camera: THREE.Camera): void {
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 150 + Math.random() * 150;
        const r = Math.random();
        this.kind = r < 0.45 ? 'clear' : r < 0.68 ? 'rain' : r < 0.78 ? 'fog' : r < 0.88 ? 'storm' : 'snow';
      }
    }
    const t = LOOKS[this.kind];
    const k = 1 - Math.exp(-dt * 0.7);
    const c = this.cur;
    c.dim += (t.dim - c.dim) * k; c.fog += (t.fog - c.fog) * k; c.grey += (t.grey - c.grey) * k;
    c.rain += (t.rain - c.rain) * k; c.grip += (t.grip - c.grip) * k; c.snow += (t.snow - c.snow) * k;

    // lightning and thunder in storms
    this.flash *= Math.exp(-dt * 7);
    if (this.kind === 'storm') {
      this.lightning -= dt;
      if (this.lightning <= 0) { this.lightning = 5 + Math.random() * 8; this.flash = 1; this.thunderIn = 0.4 + Math.random() * 1.4; }
    }
    if (this.thunderIn >= 0) { this.thunderIn -= dt; if (this.thunderIn < 0) this.audio.thunder(); }

    this.wet = Math.max(0, Math.min(1, this.wet + (c.rain > 0.3 ? dt * 0.05 * c.rain : -dt * 0.012)));
    if (this.puddles) {
      this.puddles.visible = this.wet > 0.03;
      (this.puddles.material as THREE.MeshStandardMaterial).opacity = Math.min(0.8, this.wet * 0.9);
    }
    this.env.setWeather(c.dim, c.fog, c.grey, this.flash);
    CarController.gripMul = c.grip;
    this.audio.setRain(this.indoors ? 0 : Math.min(1, c.rain));

    const snowing = c.snow > 0.03 && !this.indoors;
    this.flakes.visible = snowing;
    if (snowing) {
      (this.flakes.material as THREE.PointsMaterial).opacity = Math.min(0.9, c.snow);
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const t = performance.now() / 1000;
      for (let i = 0; i < 700; i++) {
        const o = i * 3;
        let y = this.flakePos[o + 1] - (1.6 + (i % 5) * 0.35) * dt;
        let x = this.flakePos[o] + Math.sin(t * 0.8 + i) * 0.4 * dt, z = this.flakePos[o + 2] + Math.cos(t * 0.6 + i * 1.7) * 0.4 * dt;
        if (y < cy - 5 || Math.abs(x - cx) > 36 || Math.abs(z - cz) > 36) { x = cx + (Math.random() - 0.5) * 70; z = cz + (Math.random() - 0.5) * 70; y = cy + 4 + Math.random() * 20; }
        this.flakePos[o] = x; this.flakePos[o + 1] = y; this.flakePos[o + 2] = z;
      }
      (this.flakes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    const show = c.rain > 0.03 && !this.indoors;
    this.lines.visible = show;
    if (!show) return;
    (this.lines.material as THREE.LineBasicMaterial).opacity = Math.min(0.5, 0.18 + c.rain * 0.18);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const sp = 0.7 + c.rain * 0.3;
    for (let i = 0; i < N; i++) {
      const o = i * 6;
      let y = this.pos[o + 1] - this.speeds[i] * sp * dt;
      let x = this.pos[o], z = this.pos[o + 2];
      // keep the cloud of streaks wrapped around the camera
      if (y < cy - 4 || Math.abs(x - cx) > 42 || Math.abs(z - cz) > 42) {
        x = cx + (Math.random() - 0.5) * 80; z = cz + (Math.random() - 0.5) * 80; y = cy + 6 + Math.random() * 24;
      }
      this.set(i, x, y, z);
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
