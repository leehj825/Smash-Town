import * as THREE from 'three';
import { Beacon } from './beacon';
import { MeshBuilder, paletteMaterial } from './geo';
import type { BoxCollider, World } from './world';

// Enterable shops. Each room is a small set built far outside the city (a "hidden pocket"); stepping through a door fades out and
// teleports the player there, so street traffic, police and cameras can never interfere. Walls are ordinary box colliders.

export type ShopKind = 'donut' | 'gun' | 'clothes' | 'arcade' | 'motel';
export interface Room {
  id: ShopKind;
  en: string; ko: string;
  color: number; css: string;
  /** Door on the street (where the beacon stands). */
  door: { x: number; z: number; h: number };
  /** Room centre in the pocket and its counter / exit positions. */
  ox: number; oz: number;
  counter: { x: number; z: number };
  exit: { x: number; z: number };
  /** The ledger desk where you buy or collect income from this shop (donut, motel, arcade only). */
  desk?: { x: number; z: number };
  light: THREE.PointLight;
  beacon: Beacon;
}

const DEFS: { id: ShopKind; en: string; ko: string; color: number; css: string; floor: number; wall: number; frac: number }[] = [
  { id: 'donut', en: "Donna's Donuts", ko: '도나의 도넛', color: 0xff8fb8, css: '#ff8fb8', floor: 0xf2e3d0, wall: 0xf7c6d9, frac: -1 },
  { id: 'gun', en: 'Gun Shop', ko: '총기 상점', color: 0xff9a3d, css: '#ff9a3d', floor: 0x4a4a52, wall: 0x6b7280, frac: 0.22 },
  { id: 'clothes', en: 'Clothes Shop', ko: '옷 가게', color: 0xb084ff, css: '#b084ff', floor: 0xd9d2e9, wall: 0x9a85d6, frac: 0.48 },
  { id: 'arcade', en: 'Arcade', ko: '오락실', color: 0x35e0ff, css: '#35e0ff', floor: 0x1d1f33, wall: 0x2c3057, frac: 0.7 },
  { id: 'motel', en: '24h Motel', ko: '24시 모텔', color: 0x7dff6a, css: '#7dff6a', floor: 0xcdb99a, wall: 0xd9c9a8, frac: -2 },
];

export class Interiors {
  readonly group = new THREE.Group();
  readonly rooms: Room[] = [];

  constructor(world: World, scene: THREE.Scene) {
    scene.add(this.group);
    const mat = paletteMaterial();
    DEFS.forEach((d, k) => {
      const ox = 3000 + k * 80, oz = 3000;
      const b = new MeshBuilder();
      const W = 14, D = 10, H = 3.6, T = 0.6;
      b.box(W + 4, 0.2, D + 4, ox, -0.1, oz, d.floor);
      // walls (open top so the camera can look in)
      b.box(W + T * 2, H, T, ox, H / 2, oz - D / 2 - T / 2, d.wall);
      b.box(W + T * 2, H, T, ox, H / 2, oz + D / 2 + T / 2, d.wall);
      b.box(T, H, D, ox - W / 2 - T / 2, H / 2, oz, d.wall);
      b.box(T, H, D, ox + W / 2 + T / 2, H / 2, oz, d.wall);
      // counter and a colourful sign above it
      b.box(6, 1.1, 1.1, ox, 0.55, oz - 3.4, 0x8b5a2b);
      b.box(6.2, 0.12, 1.3, ox, 1.16, oz - 3.4, 0xe9d8b4);
      b.box(5, 0.9, 0.12, ox, 3.0, oz - D / 2 + 0.1, d.color);
      // shelves along the side walls with coloured goods
      for (const sx of [-1, 1]) {
        b.box(0.6, 2.0, 7, ox + sx * (W / 2 - 0.5), 1.0, oz + 0.2, 0x6b4a2e);
        for (let i = 0; i < 7; i++) b.box(0.4, 0.4, 0.7, ox + sx * (W / 2 - 0.6), 1.25 + (i % 2) * 0.55, oz - 2.8 + i, [d.color, 0xffffff, 0xffd23a][i % 3]);
      }
      // a rug at the door and a themed machine
      b.box(3, 0.04, 1.6, ox, 0.03, oz + D / 2 - 1.2, 0x884444);
      const ownable = d.id === 'donut' || d.id === 'motel' || d.id === 'arcade';
      if (ownable) { b.box(1.9, 0.95, 0.9, ox + 4.6, 0.48, oz - 3.8, 0x3b3f55); b.box(0.7, 0.08, 0.5, ox + 4.6, 1.0, oz - 3.8, 0xffd23a); }
      if (d.id === 'arcade') for (let i = 0; i < 4; i++) b.box(1.0, 2.0, 0.9, ox - 4.5 + i * 3, 1.0, oz + 2.8, [0xff4d6d, 0x35e0ff, 0xffd23a, 0x7dff6a][i]);
      if (d.id === 'motel') b.box(2.2, 0.7, 3.4, ox + 4.5, 0.35, oz + 2, 0xf4f4f4);
      if (d.id === 'clothes') for (let i = 0; i < 4; i++) b.box(0.7, 1.8, 0.5, ox - 4.5 + i * 3, 0.9, oz + 2.8, [0xd93636, 0x3b82f6, 0x2fb87a, 0xf2a73b][i]);
      const mesh = new THREE.Mesh(b.build(), mat);
      this.group.add(mesh);
      const light = new THREE.PointLight(0xffe2b8, 1.4, 22);
      light.position.set(ox, 3.2, oz);
      this.group.add(light);
      // wall colliders (in the shared list so ordinary movement code collides with them)
      const wall = (minX: number, maxX: number, minZ: number, maxZ: number): BoxCollider => { const c = { minX, maxX, minZ, maxZ }; world.boxes.push(c); return c; };
      wall(ox - W / 2 - T, ox + W / 2 + T, oz - D / 2 - T, oz - D / 2);
      wall(ox - W / 2 - T, ox + W / 2 + T, oz + D / 2, oz + D / 2 + T);
      wall(ox - W / 2 - T, ox - W / 2, oz - D / 2, oz + D / 2);
      wall(ox + W / 2, ox + W / 2 + T, oz - D / 2, oz + D / 2);
      wall(ox - 3, ox + 3, oz - 3.95, oz - 2.85); // counter
      if (ownable) wall(ox + 3.6, ox + 5.6, oz - 4.25, oz - 3.35); // desk
      const beacon = new Beacon(d.color, 3.2);
      this.group.add(beacon.group);
      this.rooms.push({
        id: d.id, en: d.en, ko: d.ko, color: d.color, css: d.css, door: { x: 0, z: 0, h: 0 },
        ox, oz, counter: { x: ox, z: oz - 3.4 }, exit: { x: ox, z: oz + D / 2 - 0.9 }, desk: ownable ? { x: ox + 4.6, z: oz - 2.6 } : undefined, light, beacon,
      });
    });
    this.placeDoors(world);
  }

  /** A door spot on the pavement beside a road, outside every building, near the given point. */
  private sidewalk(world: World, x: number, z: number): { x: number; z: number; h: number } {
    let best = world.segments[0], bd = Infinity;
    for (const s of world.segments) {
      if (s.hw < 5.5) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return this.curbOf(world, best, x, z);
  }
  private curbOf(world: World, s: World['segments'][number], x: number, z: number): { x: number; z: number; h: number } {
    const along = Math.max(-s.len * 0.4, Math.min(s.len * 0.4, (x - s.x) * s.dx + (z - s.z) * s.dz));
    for (const side of [1, -1]) {
      for (const extra of [1.6, 2.4, 3.2]) {
        const px = s.x + s.dx * along + -s.dz * side * (s.hw + extra);
        const pz = s.z + s.dz * along + s.dx * side * (s.hw + extra);
        if (!world.boxes.some((b) => px > b.minX - 0.6 && px < b.maxX + 0.6 && pz > b.minZ - 0.6 && pz < b.maxZ + 0.6)) return { x: px, z: pz, h: Math.atan2(side * s.dx, side * s.dz) };
      }
    }
    return { x: s.x + -s.dz * (s.hw + 1.6), z: s.z + s.dx * (s.hw + 1.6), h: 0 };
  }

  private placeDoors(world: World): void {
    const st = world.landmarks.story;
    const used: { x: number; z: number }[] = [];
    const segs = world.segments.filter((s) => s.hw >= 6 && s.len >= 34);
    this.rooms.forEach((r, k) => {
      const d = DEFS[k];
      let spot: { x: number; z: number; h: number };
      if (d.frac === -1) spot = this.sidewalk(world, st.donna.x, st.donna.z);
      else if (d.frac === -2) spot = this.sidewalk(world, st.motel.x, st.motel.z);
      else {
        spot = this.curbOf(world, segs[Math.floor(segs.length * d.frac)], 0, 0);
        for (let tries = 1; tries < 40 && used.some((u) => Math.hypot(u.x - spot.x, u.z - spot.z) < 70); tries++) spot = this.curbOf(world, segs[(Math.floor(segs.length * d.frac) + tries * 7) % segs.length], 0, 0);
      }
      used.push(spot);
      r.door = spot;
      r.beacon.setPosition(spot.x, spot.z);
      r.beacon.visible = true;
    });
  }

  update(dt: number): void { for (const r of this.rooms) r.beacon.update(dt); }
  roomAt(x: number, z: number, r: number): Room | null {
    for (const room of this.rooms) if (Math.hypot(room.door.x - x, room.door.z - z) < r) return room;
    return null;
  }
}
