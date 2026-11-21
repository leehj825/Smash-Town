import * as THREE from 'three';
import { MeshBuilder, paletteMaterial } from './geo';
import type { World } from './world';

export type PickupType = 'health' | 'armor' | 'cash' | 'burger';
interface Pickup { type: PickupType; x: number; z: number; active: boolean; timer: number; value: number; temp: boolean }

const RESPAWN: Record<PickupType, number> = { health: 70, armor: 120, cash: 45, burger: 25 };
const COUNT: Record<PickupType, number> = { health: 8, armor: 4, cash: 14, burger: 6 };
const COLOR: Record<PickupType, string> = { health: '#ff5f7a', armor: '#4da3ff', cash: '#3dff8a', burger: '#ffb23d' };

function shape(type: PickupType): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const m = new THREE.Matrix4();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => b.add(new THREE.BoxGeometry(w, h, d), c, m.makeTranslation(x, y, z));
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, c: number) => b.add(new THREE.CylinderGeometry(rt, rb, h, 10), c, m.makeTranslation(x, y, z));
  if (type === 'health') { box(0.9, 0.7, 0.55, 0, 0, 0, 0xf4f4f4); box(0.55, 0.18, 0.58, 0, 0, 0, 0xe0243c); box(0.18, 0.55, 0.58, 0, 0, 0, 0xe0243c); }
  else if (type === 'armor') { cyl(0.55, 0.38, 0.9, 0, 0, 0, 0x3b82f6); cyl(0.3, 0.2, 0.95, 0, 0, 0, 0xb8dcff); }
  else if (type === 'cash') { box(0.9, 0.22, 0.5, 0, -0.12, 0, 0x2fb87a); box(0.9, 0.22, 0.5, 0, 0.12, 0, 0x3dff8a); box(0.25, 0.5, 0.52, 0, 0, 0, 0xf2e6a0); }
  else { cyl(0.55, 0.55, 0.16, 0, -0.35, 0, 0xd9a05b); cyl(0.5, 0.5, 0.12, 0, -0.18, 0, 0x6b8f3a); cyl(0.52, 0.52, 0.2, 0, 0, 0, 0x7a3b1d); cyl(0.55, 0.5, 0.2, 0, 0.22, 0, 0xe8b46b); }
  return b.build();
}

/** Street pickups on the sidewalk: health packs, armor, cash and burger stands (burgers cost $15 and heal fully). One instanced mesh per type. */
export class Pickups {
  readonly group = new THREE.Group();
  private list: Pickup[] = [];
  private meshes = new Map<PickupType, THREE.InstancedMesh>();
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private world: World, rng: () => number) {
    const types: PickupType[] = ['health', 'armor', 'cash', 'burger'];
    for (const type of types) {
      for (let i = 0; i < COUNT[type]; i++) {
        const pt = this.place(rng);
        if (pt) this.list.push({ type, x: pt.x, z: pt.z, active: true, timer: 0, value: type === 'cash' ? 150 + Math.floor(rng() * 4) * 50 : 0, temp: false });
      }
    }
    for (const type of types) {
      const n = this.list.filter((q) => q.type === type).length + 6; // spare slots for police drops
      const mesh = new THREE.InstancedMesh(shape(type), paletteMaterial(), Math.max(1, n));
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(type, mesh);
      this.group.add(mesh);
    }
  }

  /** A sidewalk spot beside a random road, outside every building. */
  private place(rng: () => number): { x: number; z: number } | null {
    const segs = this.world.segments;
    for (let tries = 0; tries < 60; tries++) {
      const sg = segs[Math.floor(rng() * segs.length)];
      if (sg.hw < 5.5) continue;
      const along = (rng() - 0.5) * sg.len * 0.8;
      const side = rng() < 0.5 ? -1 : 1;
      const off = sg.hw + 1.5;
      const x = sg.x + sg.dx * along + -sg.dz * side * off;
      const z = sg.z + sg.dz * along + sg.dx * side * off;
      if (this.world.boxes.some((b) => x > b.minX - 1.2 && x < b.maxX + 1.2 && z > b.minZ - 1.2 && z < b.maxZ + 1.2)) continue;
      if (x < this.world.bounds.minX + 5 || x > this.world.bounds.maxX - 5 || z < this.world.bounds.minZ + 5 || z > this.world.bounds.maxZ - 5) continue;
      return { x, z };
    }
    return null;
  }

  /** Active pickups (for minimap blips). */
  forEach(fn: (type: PickupType, x: number, z: number) => void): void {
    for (const p of this.list) if (p.active) fn(p.type, p.x, p.z);
  }
  static color(type: PickupType): string { return COLOR[type]; }

  /** A police drop at a spot (cash or a health pack). Expires after 25 s; the pool of spare slots caps how many exist. */
  drop(x: number, z: number, type: PickupType, value = 120): void {
    const cap = this.list.filter((q) => q.temp && q.active).length;
    if (cap >= 6) return;
    this.list.push({ type, x, z, active: true, timer: 25, value, temp: true });
  }

  /** Returns the pickup the player touched, if any. `r` is the pickup radius. */
  update(dt: number, fx: number, fz: number, r: number, canTake: (type: PickupType) => boolean, take: (type: PickupType, value: number) => void): void {
    this.t += dt;
    const idx = new Map<PickupType, number>();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.temp) { p.timer -= dt; if (p.timer <= 0) { this.list.splice(i, 1); continue; } }
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) p.active = true;
        continue;
      }
      if (Math.abs(p.x - fx) < r && Math.abs(p.z - fz) < r && Math.hypot(p.x - fx, p.z - fz) < r && canTake(p.type)) {
        take(p.type, p.value);
        if (p.temp) { this.list.splice(i, 1); continue; }
        p.active = false; p.timer = RESPAWN[p.type];
      }
    }
    for (const p of this.list) {
      if (!p.active) continue;
      const mesh = this.meshes.get(p.type)!;
      const n = idx.get(p.type) ?? 0;
      if (n >= mesh.instanceMatrix.count) continue;
      this.q.setFromEuler(this.e.set(0, this.t * 2 + p.x, 0));
      this.p.set(p.x, 1.0 + Math.sin(this.t * 3 + p.z) * 0.15, p.z);
      mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
      idx.set(p.type, n + 1);
    }
    for (const [type, mesh] of this.meshes) { mesh.count = idx.get(type) ?? 0; mesh.instanceMatrix.needsUpdate = true; }
  }
}
