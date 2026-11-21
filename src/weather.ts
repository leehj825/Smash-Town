import * as THREE from 'three';
import type { AudioEngine } from './audio';
import { CarController } from './carController';
import type { Environment } from './environment';

export type WeatherKind = 'clear' | 'rain' | 'fog' | 'storm';
export const WEATHERS: WeatherKind[] = ['clear', 'rain', 'fog', 'storm'];

interface Look { dim: number; fog: number; grey: number; rain: number; grip: number }
const LOOKS: Record<WeatherKind, Look> = {
  clear: { dim: 0, fog: 0, grey: 0, rain: 0, grip: 1 },
  rain: { dim: 0.5, fog: 0.6, grey: 0.8, rain: 1, grip: 0.86 },
  fog: { dim: 0.25, fog: 2.0, grey: 0.7, rain: 0, grip: 0.95 },
  storm: { dim: 0.8, fog: 1.2, grey: 1, rain: 1.6, grip: 0.76 },
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
  private pos: Float32Array;
  private speeds: Float32Array;
  private timer = 90;
  private lightning = 6;
  private thunderIn = -1;
  private flash = 0;
  indoors = false;

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
  }

  private set(i: number, x: number, y: number, z: number): void {
    const o = i * 6;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
    this.pos[o + 3] = x - 0.12; this.pos[o + 4] = y - 1.1; this.pos[o + 5] = z - 0.05;
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
        this.kind = r < 0.5 ? 'clear' : r < 0.75 ? 'rain' : r < 0.85 ? 'fog' : 'storm';
      }
    }
    const t = LOOKS[this.kind];
    const k = 1 - Math.exp(-dt * 0.7);
    const c = this.cur;
    c.dim += (t.dim - c.dim) * k; c.fog += (t.fog - c.fog) * k; c.grey += (t.grey - c.grey) * k;
    c.rain += (t.rain - c.rain) * k; c.grip += (t.grip - c.grip) * k;

    // lightning and thunder in storms
    this.flash *= Math.exp(-dt * 7);
    if (this.kind === 'storm') {
      this.lightning -= dt;
      if (this.lightning <= 0) { this.lightning = 5 + Math.random() * 8; this.flash = 1; this.thunderIn = 0.4 + Math.random() * 1.4; }
    }
    if (this.thunderIn >= 0) { this.thunderIn -= dt; if (this.thunderIn < 0) this.audio.thunder(); }

    this.env.setWeather(c.dim, c.fog, c.grey, this.flash);
    CarController.gripMul = c.grip;
    this.audio.setRain(this.indoors ? 0 : Math.min(1, c.rain));

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
