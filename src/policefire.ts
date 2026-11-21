import * as THREE from 'three';
import type { Game } from './game';
import { St } from './combat';
import { Role } from './humans';
import type { GameVehicle } from './vehicles';

interface Tracer { mesh: THREE.Mesh; life: number }

/**
 * The police shoot back. From 2 stars some foot cops stand off at about 10 m and fire; from 3 stars the police cars fire at your car;
 * at 5 stars the helicopter rakes you with its searchlight on. Every shooter needs a clear line (buildings block shots), misses a lot,
 * and the damage is small: your armor goes first, a car takes light damage, and Kids Play still only knocks you out.
 */
export class PoliceFire {
  readonly group = new THREE.Group();
  private tracers: Tracer[] = [];
  private cds = new Map<unknown, number>();
  private sound = 0;

  constructor(private game: Game) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a4d, transparent: true, opacity: 0.9, fog: false });
    const geo = new THREE.BoxGeometry(0.04, 0.04, 1);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    game.scene.add(this.group);
  }

  /** No building between the two points (flat test against the tall footprints). */
  private clear(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz) || 1e-6;
    for (const b of this.game.world.boxes) {
      if ((b.h ?? 25) < 2.5) continue;
      if (b.maxX < Math.min(x0, x1) - 0.5 || b.minX > Math.max(x0, x1) + 0.5 || b.maxZ < Math.min(z0, z1) - 0.5 || b.minZ > Math.max(z0, z1) + 0.5) continue;
      let t0 = 0, t1 = 1, ok = true;
      for (const [o, d, lo, hi] of [[x0, dx, b.minX, b.maxX], [z0, dz, b.minZ, b.maxZ]] as const) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 * L > 0.3) return false;
    }
    return true;
  }

  private tracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const t = this.tracers.find((q) => q.life <= 0);
    if (!t) return;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz);
    t.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    t.mesh.scale.set(1, 1, Math.max(0.5, L));
    t.mesh.lookAt(x1, y1, z1);
    t.mesh.visible = true;
    t.life = 0.09;
  }

  private shoot(who: unknown, x: number, y: number, z: number, dist: number, kind: 'cop' | 'car' | 'heli', cd: number): void {
    const G = this.game;
    const foot = G.onFoot;
    const tx = G.focusX, tz = G.focusZ, ty = foot ? 1.0 : 0.8;
    this.cds.set(who, cd * (0.8 + Math.random() * 0.5));
    let p = Math.min(0.45, Math.max(0.1, 0.5 - dist * 0.012));
    if (!foot && G.driving && Math.abs(G.driving.ctrl.speed) > 15) p *= 0.6; // hard to hit a fast car
    if (foot && G.humans.player.speed > 6) p *= 0.7;
    const hit = Math.random() < p;
    const sx = hit ? tx : tx + (Math.random() - 0.5) * 4, sz = hit ? tz : tz + (Math.random() - 0.5) * 4;
    this.tracer(x, y, z, sx, ty, sz);
    if (this.sound <= 0 && dist < 40) { G.audio.gun('pistol'); this.sound = 0.15; }
    if (!hit) return;
    if (foot) G.humans.hurtPlayer(kind === 'heli' ? 5 : 6);
    else if (G.driving) {
      G.driving.ctrl.damage(kind === 'car' ? 0.014 : kind === 'heli' ? 0.01 : 0.012);
      G.vfx.emitSparks(tx, 0.9, tz, 3);
      G.cameraRig.shake(0.08);
    }
  }

  update(dt: number): void {
    const G = this.game;
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    this.sound -= dt;
    if (G.state !== 'play' || G.inside || G.stars < 2 || G.humans.player.hp <= 0) return;
    for (const [k, v] of this.cds) { if (v > 0) this.cds.set(k, v - dt); }
    const px = G.focusX, pz = G.focusZ;
    const ready = (k: unknown) => (this.cds.get(k) ?? 0.4 + Math.random() * 0.8) <= 0;
    // foot cops: the ones marked as shooters, standing off at a distance
    if (G.onFoot) {
      for (const h of G.humans.list) {
        if (!h.active || h.role !== Role.Cop || !h.shooter || h.ko || h.riot || h.leaving) continue;
        if (h.state === St.Down || h.state === St.Dead || h.state === St.Attack || h.state === St.Hit) continue;
        const d = Math.hypot(h.x - px, h.z - pz);
        if (d < 3 || d > 26) continue;
        if (!this.cds.has(h)) this.cds.set(h, 0.4 + Math.random() * 0.9);
        if (!ready(h)) continue;
        if (!this.clear(h.x, h.z, px, pz)) { this.cds.set(h, 0.5); continue; }
        this.shoot(h, h.x, 1.2, h.z, d, 'cop', 1.7);
      }
    }
    // police cars, from 3 stars: at most three fire at once, the closest first
    if (G.stars >= 3) {
      const cars: { v: GameVehicle; d: number }[] = [];
      for (const v of G.vehicles) {
        if (!v.isPolice || v.ai !== 'police' || v.ctrl.wrecked) continue;
        const d = Math.hypot(v.x - px, v.z - pz);
        if (d > 5 && d < 32) cars.push({ v, d });
      }
      cars.sort((a, b) => a.d - b.d);
      for (const { v, d } of cars.slice(0, 3)) {
        if (!this.cds.has(v)) this.cds.set(v, 0.6 + Math.random() * 1.2);
        if (!ready(v)) continue;
        if (!this.clear(v.x, v.z, px, pz)) { this.cds.set(v, 0.6); continue; }
        this.shoot(v, v.x, 1.1, v.z, d, 'car', 1.9);
      }
    }
    // the helicopter
    const hc = G.heli;
    if (hc.active) {
      const d = hc.distTo(px, pz);
      if (d < 50) {
        if (!this.cds.has(hc)) this.cds.set(hc, 1);
        if (ready(hc)) this.shoot(hc, hc.x, hc.y - 1, hc.z, d, 'heli', 0.9);
      }
    }
  }
}
