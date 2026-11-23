import * as THREE from 'three';
import { Beacon } from './beacon';
import { MeshBuilder, paletteMaterial } from './geo';
import type { BoxCollider, World } from './world';

// Enterable shops. Each room is a small set built far outside the city (a "hidden pocket"); stepping through a door fades out and
// teleports the player there, so street traffic, police and cameras can never interfere. Walls are ordinary box colliders.

export type ShopKind = 'donut' | 'gun' | 'clothes' | 'arcade' | 'motel' | 'bank' | 'garage' | 'home';
export interface Room {
  id: ShopKind;
  en: string; ko: string;
  color: number; css: string;
  /** Door on the street (where the beacon stands). */
  door: { x: number; z: number; h: number };
  /** The bank's vault door (where you crack the safe). */
  vault?: { x: number; z: number };
  /** The garage has several street doors (one per garage building). */
  doors?: { x: number; z: number; h: number }[];
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
  { id: 'donut', en: "Donna's Donuts", ko: '도나스 도넛', color: 0xff8fb8, css: '#ff8fb8', floor: 0xf2e3d0, wall: 0xf7c6d9, frac: -1 },
  { id: 'gun', en: 'Gun Shop', ko: '총기 상점', color: 0xff9a3d, css: '#ff9a3d', floor: 0x4a4a52, wall: 0x6b7280, frac: 0.22 },
  { id: 'clothes', en: 'Clothes Shop', ko: '옷 가게', color: 0xb084ff, css: '#b084ff', floor: 0xd9d2e9, wall: 0x9a85d6, frac: 0.48 },
  { id: 'arcade', en: 'Arcade', ko: '오락실', color: 0x35e0ff, css: '#35e0ff', floor: 0x1d1f33, wall: 0x2c3057, frac: 0.7 },
  { id: 'bank', en: 'Smash Bank', ko: '스매시 뱅크', color: 0xffd23a, css: '#ffd23a', floor: 0xcfd3da, wall: 0x3c4a6b, frac: 0.86 },
  { id: 'garage', en: 'Garage', ko: '차고', color: 0x3dff8a, css: '#3dff8a', floor: 0x3a3d46, wall: 0x56606f, frac: -3 },
  { id: 'home', en: 'Your House', ko: '우리 집', color: 0x6bd1ff, css: '#6bd1ff', floor: 0xb08a5a, wall: 0xe9dcc6, frac: -3 },
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
      const ownable = d.id === 'donut' || d.id === 'motel' || d.id === 'arcade' || d.id === 'bank';
      if (ownable) { b.box(1.9, 0.95, 0.9, ox + 4.6, 0.48, oz - 3.8, 0x3b3f55); b.box(0.7, 0.08, 0.5, ox + 4.6, 1.0, oz - 3.8, 0xffd23a); }
      if (d.id === 'arcade') for (let i = 0; i < 4; i++) b.box(1.0, 2.0, 0.9, ox - 4.5 + i * 3, 1.0, oz + 2.8, [0xff4d6d, 0x35e0ff, 0xffd23a, 0x7dff6a][i]);
      // little extras that make each shop feel lived in (nothing here blocks the way)
      if (d.id === 'donut') {
        for (let i = 0; i < 5; i++) { b.cylinder(0.28, 0.28, 0.08, 10, ox - 2.4 + i * 1.2, 0.72, oz - 1.9, 0xd62d6a); b.cylinder(0.06, 0.06, 0.7, 6, ox - 2.4 + i * 1.2, 0.36, oz - 1.9, 0x8d95a3); }   // stools
        for (let i = 0; i < 6; i++) b.cylinder(0.2, 0.2, 0.08, 10, ox - 1.5 + i * 0.6, 1.26, oz - 3.4, [0xff8fb8, 0xffd23a, 0x8b5a2b, 0xffffff][i % 4]);   // donuts on the counter
        b.box(1.4, 0.5, 0.8, ox - 5.5, 0.25, oz + 3.5, 0xf7c6d9); b.box(1.4, 0.9, 0.2, ox - 5.5, 0.95, oz + 3.1, 0xffffff);                                   // a pink booth
      }
      if (d.id === 'gun') {
        for (let i = 0; i < 5; i++) { b.box(0.7, 0.06, 0.08, ox - 3.6 + i * 1.8, 2.0, oz - D / 2 + 0.3, 0x2a2d35); b.box(0.1, 0.1, 0.5, ox - 3.6 + i * 1.8, 2.12, oz - D / 2 + 0.3, 0x23252b); }  // rifles on the wall
        b.box(1.4, 1.0, 0.7, ox + 4.2, 0.5, oz + 3.2, 0x3b4252); b.box(1.5, 0.08, 0.8, ox + 4.2, 1.04, oz + 3.2, 0x8d95a3);                                   // a glass case
      }
      if (d.id === 'clothes') {
        for (let i = 0; i < 3; i++) { const mx = ox - 3 + i * 3; b.box(0.34, 0.7, 0.2, mx, 1.1, oz - 0.2, [0xd93636, 0x2fb87a, 0xf2a73b][i]); b.box(0.2, 0.22, 0.2, mx, 1.62, oz - 0.2, 0xe9d8c4); b.box(0.06, 0.8, 0.06, mx, 0.4, oz - 0.2, 0x6d7280); b.box(0.5, 0.05, 0.4, mx, 0.03, oz - 0.2, 0x6d7280); }   // mannequins
        b.box(1.0, 2.0, 0.08, ox + 5.5, 1.0, oz - 3.0, 0x9fd6ff);                                                                                              // a mirror
      }
      if (d.id === 'bank') {
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.cylinder(0.05, 0.05, 1.0, 6, ox + sx * 1.6, 0.5, oz + 0.6 + i * 1.3, 0xd8c36a);                // queue posts
        b.box(0.03, 0.03, 2.6, ox - 1.6, 0.95, oz + 1.9, 0xd62d3a); b.box(0.03, 0.03, 2.6, ox + 1.6, 0.95, oz + 1.9, 0xd62d3a);                               // ropes
        b.cylinder(0.35, 0.3, 0.5, 8, ox + 5.8, 0.25, oz + 3.8, 0x8a5a33); b.add(new THREE.IcosahedronGeometry(0.5, 0), 0x3f9a4f, new THREE.Matrix4().makeTranslation(ox + 5.8, 0.9, oz + 3.8)); // a pot plant
      }
      if (d.id === 'home') {
        b.box(2.2, 0.5, 3.0, ox + 4.6, 0.25, oz - 3.0, 0xf4f4f4); b.box(2.2, 0.9, 0.2, ox + 4.6, 0.6, oz - 4.4, 0x8b5a2b); b.box(1.0, 0.18, 0.6, ox + 4.6, 0.6, oz - 3.9, 0xffffff);   // bed
        b.box(3.0, 0.5, 1.1, ox - 3.0, 0.3, oz + 3.6, 0x3b82f6); b.box(3.0, 0.7, 0.3, ox - 3.0, 0.65, oz + 4.1, 0x2c64c0);                           // sofa
        b.box(1.8, 0.9, 0.5, ox - 3.0, 0.45, oz + 1.2, 0x6b4a2e); b.box(1.4, 0.8, 0.1, ox - 3.0, 1.6, oz + 1.0, 0x15151a);                         // TV stand and screen
        b.box(3.4, 0.03, 2.4, ox, 0.03, oz + 0.6, 0xd9534f);                                                                                         // rug
        b.box(0.9, 1.8, 0.5, ox + 5.6, 0.9, oz + 3.6, 0x8b5a2b);                                                                                     // wardrobe
      }
      if (d.id === 'garage') {
        // two car lifts, a tool bench, tyre stacks, oil drums, hazard stripes by the door
        for (const sx of [-1, 1]) { b.box(0.3, 2.4, 0.3, ox + sx * 3.2, 1.2, oz + 1.6, 0xffd23a); b.box(0.3, 2.4, 0.3, ox + sx * 3.2, 1.2, oz + 3.6, 0xffd23a); b.box(0.4, 0.2, 2.5, ox + sx * 3.2, 0.5, oz + 2.6, 0x6d7280); }
        b.box(2.6, 0.9, 0.7, ox - 5.4, 0.45, oz - 4.3, 0x8a5a33); b.box(2.6, 0.1, 0.8, ox - 5.4, 0.95, oz - 4.3, 0xcfc8b8);
        for (let i = 0; i < 4; i++) b.cylinder(0.45, 0.45, 0.28, 10, ox + 5.5, 0.15 + i * 0.3, oz + 3.8, 0x1a1a1f);
        for (let i = 0; i < 3; i++) b.cylinder(0.35, 0.35, 0.9, 8, ox + 5.5 - i * 0.8, 0.45, oz - 4.4, [0x2f6bd6, 0xd62d3a, 0x2fb87a][i]);
        for (let k = 0; k < 8; k++) b.box(0.9, 0.03, 0.4, ox - 3.6 + k * 1.0, 0.03, oz + D / 2 - 0.5, k % 2 ? 0xffd23a : 0x222222);
      }
      if (d.id === 'bank') {
        b.cylinder(1.5, 1.5, 0.4, 20, ox - 4.6, 1.6, oz - D / 2 + 0.25, 0x8d95a3, Math.PI / 2, 0, 0);
        b.cylinder(1.15, 1.15, 0.45, 20, ox - 4.6, 1.6, oz - D / 2 + 0.27, 0x6b7280, Math.PI / 2, 0, 0);
        b.box(1.7, 0.14, 0.5, ox - 4.6, 1.6, oz - D / 2 + 0.35, 0xd8c36a); b.box(0.14, 1.7, 0.5, ox - 4.6, 1.6, oz - D / 2 + 0.35, 0xd8c36a);
        b.cylinder(0.28, 0.28, 0.55, 12, ox - 4.6, 1.6, oz - D / 2 + 0.4, 0xffd23a, Math.PI / 2, 0, 0);
      }
      if (d.id === 'bank') for (let i = 0; i < 3; i++) b.box(1.4, 1.1, 1.4, ox - 4.5 + i * 2, 0.55, oz + 2.8, 0xb7bcc7);
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
        vault: d.id === 'bank' ? { x: ox - 4.6, z: oz - D / 2 + 1.6 } : undefined,
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
      if (d.frac === -3) { r.beacon.visible = false; return; }
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
    for (const room of this.rooms) {
      if (room.doors) { if (room.doors.some((d) => Math.hypot(d.x - x, d.z - z) < r)) return room; continue; }
      if (Math.hypot(room.door.x - x, room.door.z - z) < r) return room;
    }
    return null;
  }
}
