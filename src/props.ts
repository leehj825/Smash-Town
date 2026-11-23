import * as THREE from 'three';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import type { SmashRef, World } from './world';
import type { Vfx } from './vfx';

type PropType = SmashRef['type'];
interface Placement { x: number; z: number; rot: number; scale: number }

const VALUE: Record<PropType, number> = { hydrant: 2500, lamp: 3000, palm: 1800, bench: 1500, newsstand: 2200, trash: 1200 };
const DEBRIS_COLOR: Record<PropType, number> = { hydrant: 0xe62e2d, lamp: 0x8a8f9c, palm: 0x4cb85a, bench: 0x9b6b3f, newsstand: 0xf4f1e6, trash: 0x7d8696 };
const SLAB = 0.14;

function palmGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const segs = 3;
  const segH = 2.25;
  let px = 0;
  let py = 0;
  for (let s = 0; s < segs; s++) {
    const tilt = 0.06 + s * 0.06;
    const rBot = 0.34 - s * 0.07;
    const rTop = rBot - 0.04;
    b.cylinder(rTop, rBot, segH, 5, px + Math.sin(tilt) * segH * 0.5, py + Math.cos(tilt) * segH * 0.5, 0, 0x8a6a45, 0, 0, -tilt);
    px += Math.sin(tilt) * segH;
    py += Math.cos(tilt) * segH;
  }
  b.cylinder(0.25, 0.2, 0.3, 6, px, py + 0.1, 0, 0x6e5237);
  const fronds = 6;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const color = f % 2 ? 0x3fa34d : 0x4cb85a;
    const cone = new THREE.ConeGeometry(0.55, 3.4, 4, 1);
    cone.scale(1, 1, 0.18);
    cone.translate(0, 1.7, 0);
    const m = new THREE.Matrix4()
      .makeTranslation(px, py + 0.15, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationZ(-1.28 - (f % 3) * 0.08));
    b.add(cone, color, m);
    const tip = new THREE.ConeGeometry(0.34, 1.7, 4, 1);
    tip.scale(1, 1, 0.18);
    tip.translate(0, 0.85, 0);
    const mt = new THREE.Matrix4()
      .makeTranslation(px, py + 0.15, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeTranslation(3.3 * Math.sin(1.28), 3.3 * Math.cos(1.28) - 0.1, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(-2.2));
    b.add(tip, color, mt);
  }
  return b.build();
}

function lampPoleGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.09, 0.15, 7, 6, 0, 3.5, 0, 0x8a8f9c);
  b.cylinder(0.2, 0.2, 0.3, 6, 0, 0.15, 0, 0x6d7280);
  b.cylinder(0.13, 0.17, 0.12, 6, 0, 0.34, 0, 0x5a606c);
  b.cylinder(0.11, 0.11, 0.1, 6, 0, 6.0, 0, 0x5a606c);
  b.box(0.06, 0.06, 0.5, 1.95, 7.05, 0, 0x8a8f9c);
  b.rotatedBox(2.0, 0.1, 0.1, 0.9, 7.05, 0, 0, 0, 0.05, 0x8a8f9c);
  return b.build();
}

function lampHeadGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.9, 0.16, 0.34);
  g.translate(1.95, 6.9, 0);
  return g;
}

function hydrantGeometry(): THREE.BufferGeometry {
  const red = 0xe62e2d;
  const b = new MeshBuilder();
  b.cylinder(0.24, 0.28, 0.62, 6, 0, 0.35, 0, red);
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.05, 0, 0xb02323);
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.62, 0, 0xb02323);
  b.add(new THREE.SphereGeometry(0.24, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), red, new THREE.Matrix4().makeTranslation(0, 0.68, 0));
  b.cylinder(0.07, 0.07, 0.34, 6, 0, 0.42, 0, 0xc72827, 0, 0, Math.PI / 2);
  b.cylinder(0.09, 0.09, 0.06, 6, 0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  b.cylinder(0.09, 0.09, 0.06, 6, -0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  return b.build();
}

function treeGeometry(pine: boolean): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.2, 0.3, 2.4, 5, 0, 1.2, 0, 0x7a5a3a);
  if (pine) {
    for (let k = 0; k < 3; k++) {
      const r = 1.7 - k * 0.45;
      b.add(new THREE.ConeGeometry(r, 2.2, 6), k % 2 ? 0x2f7d46 : 0x2a6f3f, new THREE.Matrix4().makeTranslation(0, 2.6 + k * 1.3, 0));
    }
  } else {
    b.add(new THREE.IcosahedronGeometry(1.7, 0), 0x57b368, new THREE.Matrix4().makeTranslation(0, 3.3, 0));
    b.add(new THREE.IcosahedronGeometry(1.25, 0), 0x6cc57a, new THREE.Matrix4().makeTranslation(0.6, 4.5, 0.2));
  }
  return b.build();
}

function benchGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < 3; i++) b.box(1.8, 0.05, 0.14, 0, 0.5, -0.17 + i * 0.17, i % 2 ? 0x8a5c33 : 0x9b6b3f); // seat slats
  for (let i = 0; i < 3; i++) b.box(1.8, 0.1, 0.05, 0, 0.66 + i * 0.14, -0.25, i % 2 ? 0x8a5c33 : 0x9b6b3f);   // back slats
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.5, 0.5, sx * 0.8, 0.25, 0, 0x4a4e59);
    b.box(0.08, 0.05, 0.5, sx * 0.88, 0.7, 0, 0x4a4e59);      // armrest
    b.box(0.06, 0.45, 0.05, sx * 0.88, 0.5, 0.2, 0x4a4e59);
    b.box(0.1, 0.03, 0.55, sx * 0.8, 0.02, 0, 0x2f323a);       // foot
  }
  return b.build();
}

function newsstandGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(1.6, 0.9, 0.7, 0, 0.45, 0, 0x8a5a33);                // cabinet
  b.rotatedBox(1.7, 0.08, 0.85, 0, 1.22, -0.05, 0.35, 0, 0, 0x5b3a1f); // slanted roof
  for (const sx of [-1, 1]) b.box(0.08, 1.0, 0.08, sx * 0.78, 0.9, -0.3, 0x5b3a1f);
  b.rotatedBox(1.2, 0.05, 0.5, 0, 0.98, 0.08, -0.25, 0, 0, 0xf4f1e6);   // papers
  b.rotatedBox(0.5, 0.04, 0.4, -0.35, 1.03, 0.12, -0.25, 0, 0.1, 0xe2a43a);
  return b.build();
}

function trashGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.3, 0.26, 0.8, 8, 0, 0.4, 0, 0x7d8696);
  for (const y of [0.15, 0.4, 0.65]) b.cylinder(0.31, 0.31, 0.03, 8, 0, y, 0, 0x5a606c);   // bands
  b.box(0.2, 0.02, 0.02, 0.0, 0.58, 0.3, 0x15151a);                                           // flap
  b.cylinder(0.33, 0.33, 0.07, 8, 0, 0.84, 0, 0x4a4e59);
  b.cylinder(0.06, 0.06, 0.08, 6, 0, 0.9, 0, 0x4a4e59);
  return b.build();
}


// ---- richer versions of the smashable props, and purely decorative street furniture
function bushGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const [x, y, z, r, c] of [[0, 0.45, 0, 0.6, 0x3f9a4f], [0.5, 0.35, 0.2, 0.42, 0x4cae5c], [-0.45, 0.35, -0.1, 0.45, 0x388c47], [0.1, 0.55, -0.3, 0.38, 0x57b868]] as const) {
    b.add(new THREE.IcosahedronGeometry(r, 0), c, new THREE.Matrix4().makeTranslation(x, y, z));
  }
  for (const [x, z, c] of [[0.2, 0.5, 0xff6b8b], [-0.3, 0.4, 0xffd23a], [0.55, 0.0, 0xffffff]] as const) b.box(0.1, 0.1, 0.1, x, 0.75, z, c);
  return b.build();
}
function flowerGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const cols = [0xff5d73, 0xffd23a, 0xc86bff, 0xffffff, 0xff8f3a];
  for (let i = 0; i < 3; i++) {
    const a = i * 1.3, r = 0.1 + (i % 3) * 0.12, h = 0.2 + (i % 2) * 0.12;
    b.box(0.025, h, 0.025, Math.cos(a) * r, h / 2, Math.sin(a) * r, 0x2f8f3f);
    b.box(0.12, 0.05, 0.12, Math.cos(a) * r, h + 0.02, Math.sin(a) * r, cols[i % cols.length]);
    b.box(0.05, 0.06, 0.05, Math.cos(a) * r, h + 0.05, Math.sin(a) * r, 0xffe27a);
  }
  return b.build();
}
function grassGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < 6; i++) { const a = i * 1.05; b.rotatedBox(0.05, 0.45 + (i % 3) * 0.12, 0.03, Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08, Math.sin(a) * 0.3, a, Math.cos(a) * 0.3, i % 2 ? 0x3f9a3f : 0x2f8a3a); }
  return b.build();
}
function barrierGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const sx of [-0.8, 0.8]) b.box(0.08, 0.9, 0.5, sx, 0.45, 0, 0x4a4e59);
  for (let i = 0; i < 6; i++) { b.box(0.28, 0.2, 0.06, -0.7 + i * 0.28, 0.82, 0.02, i % 2 ? 0xffffff : 0xff6a1a); b.box(0.28, 0.2, 0.06, -0.7 + i * 0.28, 0.5, 0.02, i % 2 ? 0xff6a1a : 0xffffff); }
  b.box(0.14, 0.14, 0.14, 0, 1.0, 0, 0xffb300);
  return b.build();
}
function dumpsterGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(2.2, 1.0, 1.2, 0, 0.6, 0, 0x2f6b46); b.box(2.3, 0.1, 1.3, 0, 1.15, 0, 0x244f35);
  for (const sx of [-0.9, 0.9]) b.box(0.15, 0.2, 1.25, sx, 0.15, 0, 0x1a1a1f);
  b.box(2.24, 0.12, 0.04, 0, 0.9, 0.62, 0xe6c84a);
  return b.build();
}
function craneGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(1.4, 0.6, 1.4, 0, 0.3, 0, 0x6d7280);
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) b.box(0.14, 16, 0.14, sx, 8.6, sz, 0xffb300);
  for (let y = 1.5; y < 16; y += 2.2) { b.box(1.0, 0.1, 0.1, 0, y, 0.45, 0xffb300); b.box(1.0, 0.1, 0.1, 0, y, -0.45, 0xffb300); b.box(0.1, 0.1, 1.0, 0.45, y, 0, 0xffb300); b.box(0.1, 0.1, 1.0, -0.45, y, 0, 0xffb300); }
  b.box(1.4, 1.2, 1.6, 0, 16.7, 0.1, 0xeeeeee);
  b.box(0.3, 0.3, 17, 0, 17.4, -4.5, 0xffb300);          // jib
  b.box(0.3, 0.3, 6, 0, 17.4, 4.5, 0xffb300);            // counter-jib
  b.box(1.6, 1.6, 1.6, 0, 16.7, 6.5, 0x6d7280);          // counterweight
  b.box(0.04, 5, 0.04, 0, 14.5, -9.5, 0x15151a);          // cable
  b.box(0.7, 0.4, 0.7, 0, 11.8, -9.5, 0xff6a1a);          // hook block
  return b.build();
}
function planterGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(1.1, 0.6, 1.1, 0, 0.3, 0, 0xb9b4a8);
  b.box(1.2, 0.08, 1.2, 0, 0.62, 0, 0x8a857a);
  b.box(0.95, 0.12, 0.95, 0, 0.62, 0, 0x4a3a2a);
  for (const [x, z, y, r, c] of [[0, 0, 0.95, 0.4, 0x3f9a4f], [0.25, 0.2, 0.8, 0.25, 0x57b868], [-0.25, -0.15, 0.85, 0.28, 0x388c47]] as const) b.add(new THREE.IcosahedronGeometry(r, 0), c, new THREE.Matrix4().makeTranslation(x, y, z));
  for (const [x, z, c] of [[0.2, -0.25, 0xff5d73], [-0.3, 0.25, 0xffd23a]] as const) b.box(0.12, 0.12, 0.12, x, 1.2, z, c);
  return b.build();
}
function mailboxGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.12, 0.55, 0.12, 0, 0.28, 0, 0x4a4e59);
  b.box(0.55, 0.62, 0.45, 0, 0.88, 0, 0x2e5fa8);
  b.cylinder(0.225, 0.225, 0.55, 8, 0, 1.19, 0, 0x2e5fa8, 0, 0, Math.PI / 2);
  b.box(0.35, 0.05, 0.02, 0, 1.0, 0.23, 0x15151a);
  b.box(0.2, 0.2, 0.02, 0, 0.7, 0.23, 0xf0f0f0);
  return b.build();
}
function bollardGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.12, 0.14, 0.8, 8, 0, 0.4, 0, 0x6d7280);
  b.cylinder(0.125, 0.125, 0.1, 8, 0, 0.62, 0, 0xffd23a);
  b.add(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x6d7280, new THREE.Matrix4().makeTranslation(0, 0.8, 0));
  return b.build();
}
function bikeRackGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < 4; i++) {
    const x = -0.9 + i * 0.6;
    b.box(0.05, 0.7, 0.05, x - 0.15, 0.35, 0, 0x8d95a3); b.box(0.05, 0.7, 0.05, x + 0.15, 0.35, 0, 0x8d95a3); b.box(0.35, 0.05, 0.05, x, 0.72, 0, 0x8d95a3);
  }
  // one bike locked to it
  b.cylinder(0.3, 0.3, 0.05, 10, -0.3, 0.32, 0.3, 0x15151a, Math.PI / 2, 0, 0); b.cylinder(0.3, 0.3, 0.05, 10, 0.4, 0.32, 0.3, 0x15151a, Math.PI / 2, 0, 0);
  b.box(0.8, 0.05, 0.05, 0.05, 0.62, 0.3, 0xd9534f); b.box(0.05, 0.4, 0.05, -0.3, 0.5, 0.3, 0xd9534f); b.box(0.35, 0.05, 0.05, -0.3, 0.8, 0.3, 0x15151a);
  return b.build();
}
function busStopGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(3.2, 0.12, 1.6, 0, 2.55, 0, 0x3c4a6b);
  for (const sx of [-1.5, 1.5]) b.box(0.1, 2.5, 0.1, sx, 1.25, -0.7, 0x6d7280);
  b.box(3.0, 1.8, 0.06, 0, 1.5, -0.74, 0x9fd6ff);
  b.box(3.0, 0.1, 0.06, 0, 0.58, -0.74, 0x3c4a6b);
  b.box(2.2, 0.08, 0.45, 0, 0.6, -0.35, 0x9b6b3f);
  for (const sx of [-0.9, 0.9]) b.box(0.06, 0.55, 0.4, sx, 0.3, -0.35, 0x4a4e59);
  b.box(0.12, 3.2, 0.12, 1.9, 1.6, 0.3, 0x6d7280); b.box(0.5, 0.5, 0.06, 1.9, 3.0, 0.3, 0x35a8ff); b.box(0.28, 0.28, 0.07, 1.9, 3.0, 0.3, 0xffffff);
  return b.build();
}
function trafficConeGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.4, 0.04, 0.4, 0, 0.02, 0, 0x2a2a30);
  b.add(new THREE.ConeGeometry(0.15, 0.6, 8), 0xff7a1a, new THREE.Matrix4().makeTranslation(0, 0.34, 0));
  b.cylinder(0.1, 0.12, 0.08, 8, 0, 0.3, 0, 0xffffff);
  return b.build();
}
function streetSignGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.05, 0.05, 3.2, 6, 0, 1.6, 0, 0x6d7280);
  b.box(0.9, 0.22, 0.04, 0, 3.0, 0.05, 0x1f7a4a); b.box(0.9, 0.22, 0.04, 0, 2.7, -0.05, 0x1f7a4a);
  b.box(0.7, 0.05, 0.05, 0, 3.0, 0.08, 0xffffff); b.box(0.7, 0.05, 0.05, 0, 2.7, -0.08, 0xffffff);
  return b.build();
}
function lampPostDetail(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.35, 0.35, 0.35, 0, 0.55, 0, 0x6d7280);
  b.cylinder(0.14, 0.2, 0.5, 6, 0, 0.8, 0, 0x6d7280);
  b.box(0.25, 0.4, 0.04, 0.0, 5.0, 0.12, 0xffd23a);   // banner
  b.box(0.04, 0.04, 0.4, 0, 5.22, 0.12, 0x6d7280);
  return b.build();
}

interface Flyer { mesh: THREE.Mesh; vx: number; vy: number; vz: number; ax: number; az: number; ttl: number }

export interface Props {
  group: THREE.Group;
  lampHeadMaterial: THREE.MeshStandardMaterial;
  /** Smash a prop: hides its instance, launches a tumbling copy, bursts debris, starts hydrant geysers. Returns damage value. */
  smash(ref: SmashRef, x: number, z: number, vx: number, vz: number): number;
  update(dt: number): void;
  setVegetation(f: number): void;
  /** Autumn and winter tints for the leafy trees. */
  setSeason(s: 'normal' | 'autumn' | 'winter'): void;
  /** 0 = day, 1 = night: the pools of light under the street lamps. */
  setNight(n: number): void;
  /** 0 = none, 1 = street furniture, 2 = also flowers and grass tufts. */
  setDecor(level: number): void;
  /** Where the bus shelters stand (they are the stops of the bus line). */
  busStops(): { x: number; z: number }[];
}

export function buildProps(world: World, vfx: Vfx): Props {
  const rng = makeRng(777);
  const lists: Record<PropType, Placement[]> = { palm: [], lamp: [], hydrant: [], bench: [], newsstand: [], trash: [] };
  const EDGE = 1.4;
  const trees: Placement[] = [];
  const pines: Placement[] = [];

  for (const lot of world.lots) {
    const { x0, x1, z0, z1, district } = lot;
    if (district === 'water') continue;
    const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
    if (district !== 'forest' && (district !== 'beach' || lot.i % 2 === 0)) {
      const corners = [
        [x0 + EDGE, z0 + EDGE, -1], [x1 - EDGE, z0 + EDGE, -1],
        [x0 + EDGE, z1 - EDGE, 1], [x1 - EDGE, z1 - EDGE, 1],
      ] as const;
      const used = district === 'park' || district === 'suburb' ? corners.slice(0, 2) : corners;
      for (const [x, z, dz] of used) lists.lamp.push({ x, z, rot: Math.atan2(-dz, 0), scale: 1 });
    }
    // trees: dense in parks, along the gardens of the suburb, in the corners of the plaza
    if (district === 'park') {
      const n = 10 + Math.floor(rng() * 7);
      for (let k = 0; k < n; k++) {
        const x = x0 + 3 + rng() * (x1 - x0 - 6), z = z0 + 3 + rng() * (z1 - z0 - 6);
        if (Math.abs(x - lx) < 2.8 || Math.abs(z - lz) < 2.8) continue; // keep the footpaths clear
        (rng() < 0.4 ? pines : trees).push({ x, z, rot: rng() * 6.28, scale: 0.8 + rng() * 0.6 });
      }
    } else if (district === 'suburb') {
      const n = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const side = k % 2 === 0;
        const x = x0 + 3 + rng() * (x1 - x0 - 6), z = side ? z0 + 2.2 : z1 - 2.2;
        (rng() < 0.3 ? pines : trees).push({ x, z, rot: rng() * 6.28, scale: 0.8 + rng() * 0.5 });
      }
    } else if (district === 'forest') {
      const n = Math.floor(((x1 - x0) * (z1 - z0)) / 110);
      for (let k = 0; k < n; k++) {
        const x = x0 + 2 + rng() * (x1 - x0 - 4), z = z0 + 2 + rng() * (z1 - z0 - 4);
        (rng() < 0.65 ? pines : trees).push({ x, z, rot: rng() * 6.28, scale: 0.8 + rng() * 0.7 });
      }
      continue;
    } else if (district === 'plaza') {
      for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]] as const) trees.push({ x, z, rot: rng() * 6.28, scale: 1 });
    }
    const palmSpacing = district === 'beach' ? 8 : district === 'oldtown' ? 12 : district === 'downtown' ? 18 : 0;
    if (palmSpacing > 0) {
      for (const zEdge of [z0 + EDGE, z1 - EDGE]) {
        for (let x = x0 + 5 + rng() * 2; x < x1 - 4; x += palmSpacing + rng() * 3) {
          lists.palm.push({ x, z: zEdge, rot: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.4 });
        }
      }
      if (district === 'beach') {
        for (let n = 0; n < 3; n++) {
          lists.palm.push({ x: x0 + 4 + rng() * (x1 - x0 - 8), z: z1 - 8 - rng() * 3, rot: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.5 });
        }
      }
    }
    const hCount = district === 'oldtown' ? 3 : district === 'harbor' || district === 'park' || district === 'plaza' ? 0 : district === 'beach' || district === 'suburb' ? 1 : 2;
    for (let n = 0; n < hCount; n++) {
      const top = rng() < 0.5;
      lists.hydrant.push({ x: x0 + 4 + rng() * (x1 - x0 - 8), z: top ? z0 + EDGE + 0.4 : z1 - EDGE - 0.4, rot: rng() * Math.PI * 2, scale: 1 });
    }
    // benches along the road-facing edges (packed in Old Town for combos)
    if (district === 'park') {
      for (let n = 0; n < 3; n++) lists.bench.push({ x: lx + (n - 1) * 8, z: lz + 2.6, rot: 0, scale: 1 });
    } else if (district === 'plaza') {
      for (const [x, z, rot] of [[lx - 7.5, lz, Math.PI / 2], [lx + 7.5, lz, -Math.PI / 2], [lx, lz - 7.5, 0], [lx, lz + 7.5, Math.PI]] as const) lists.bench.push({ x, z, rot, scale: 1 });
    }
    const bCount = district === 'park' || district === 'plaza' || district === 'suburb' ? 0 : district === 'oldtown' ? 3 : district === 'harbor' ? 0 : 1;
    for (let n = 0; n < bCount; n++) {
      const top = n % 2 === 0;
      lists.bench.push({
        x: x0 + 5 + rng() * (x1 - x0 - 10),
        z: top ? z0 + EDGE + 0.2 : z1 - EDGE - 0.2,
        rot: top ? 0 : Math.PI, scale: 1,
      });
    }

    // Old Town newsstands against the shop fronts; trash cans along every district's sidewalks
    if (district === 'oldtown') {
      const top = rng() < 0.5;
      lists.newsstand.push({ x: x0 + 5 + rng() * (x1 - x0 - 10), z: top ? z0 + EDGE + 0.6 : z1 - EDGE - 0.6, rot: top ? 0 : Math.PI, scale: 1 });
    }
    const tCount = district === 'oldtown' ? 2 : district === 'harbor' ? 0 : 1;
    for (let n = 0; n < tCount; n++) {
      const top = rng() < 0.5;
      lists.trash.push({ x: x0 + 3 + rng() * (x1 - x0 - 6), z: top ? z0 + EDGE + 0.1 : z1 - EDGE - 0.1, rot: rng() * 6.28, scale: 1 });
    }
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const geos: Record<PropType, THREE.BufferGeometry> = {
    palm: palmGeometry(), lamp: lampPoleGeometry(), hydrant: hydrantGeometry(), bench: benchGeometry(),
    newsstand: newsstandGeometry(), trash: trashGeometry(),
  };
  const mat = paletteMaterial();
  const meshes = {} as Record<PropType, THREE.InstancedMesh>;

  const instance = (geo: THREE.BufferGeometry, material: THREE.Material, list: Placement[], shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, SLAB, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  (Object.keys(lists) as PropType[]).forEach((k) => { meshes[k] = instance(geos[k], mat, lists[k], true); });
  const treeMesh = instance(treeGeometry(false), mat, trees, true);
  const pineMesh = instance(treeGeometry(true), mat, pines, true);
  const veg = [treeMesh, pineMesh].map((m) => ({ m, orig: Float32Array.from(m.instanceMatrix.array as Float32Array) }));
  for (const p of trees) world.circles.push({ x: p.x, z: p.z, r: 0.55 });
  for (const p of pines) world.circles.push({ x: p.x, z: p.z, r: 0.55 });
  const lampHeadMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffe2a0, emissiveIntensity: 0.2, flatShading: true });
  const lampHeads = instance(lampHeadGeometry(), lampHeadMaterial, lists.lamp, false);


  // ---- decorative street furniture (its own random stream so the smashable props keep their places)
  const drng = makeRng(4242);
  const decor: Record<'barrier' | 'dumpster' | 'crane' | 'bush' | 'flower' | 'grass' | 'planter' | 'mailbox' | 'bollard' | 'bikerack' | 'busstop' | 'cone' | 'sign' | 'lampdetail', Placement[]> = { barrier: [], dumpster: [], crane: [], bush: [], flower: [], grass: [], planter: [], mailbox: [], bollard: [], bikerack: [], busstop: [], cone: [], sign: [], lampdetail: [] };
  for (const lot of world.lots) {
    const { x0, x1, z0, z1, district } = lot;
    if (district === 'water' || district === 'forest') continue;
    const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
    const edgeZ = (top: boolean, off: number) => (top ? z0 + EDGE + off : z1 - EDGE - off);
    const rotOf = (top: boolean) => (top ? 0 : Math.PI);
    const along = () => x0 + 5 + drng() * (x1 - x0 - 10);
    if (district === 'park' || district === 'plaza' || district === 'suburb') {
      const n = district === 'suburb' ? 4 : 8;
      for (let k = 0; k < n; k++) {
        const x = x0 + 3 + drng() * (x1 - x0 - 6), z = z0 + 3 + drng() * (z1 - z0 - 6);
        if (district === 'park' && (Math.abs(x - lx) < 2.8 || Math.abs(z - lz) < 2.8)) continue;
        if (district === 'plaza' && Math.hypot(x - lx, z - lz) < 6) continue;
        decor.bush.push({ x, z, rot: drng() * 6.28, scale: 0.8 + drng() * 0.6 });
      }
    }
    if (district === 'park' || district === 'plaza' || district === 'suburb' || district === 'beach') {
      for (let k = 0; k < 9; k++) {
        const x = x0 + 2 + drng() * (x1 - x0 - 4), z = z0 + 2 + drng() * (z1 - z0 - 4);
        if (district === 'park' && (Math.abs(x - lx) < 2.8 || Math.abs(z - lz) < 2.8)) continue;
        if (district === 'plaza' && Math.hypot(x - lx, z - lz) < 6) continue;
        (k % 3 === 0 ? decor.flower : decor.grass).push({ x, z, rot: drng() * 6.28, scale: 0.8 + drng() * 0.8 });
      }
    }
    if (district === 'downtown' || district === 'oldtown' || district === 'plaza') {
      for (let n = 0; n < 2; n++) { const top = n === 0; decor.planter.push({ x: along(), z: edgeZ(top, 0.4), rot: 0, scale: 1 }); }
      decor.mailbox.push({ x: along(), z: edgeZ(drng() < 0.5, 0.5), rot: 0, scale: 1 });
      const top = drng() < 0.5; const bx = along();
      for (let k = 0; k < 4; k++) decor.bollard.push({ x: bx + k * 1.4, z: edgeZ(top, 0.1), rot: 0, scale: 1 });
      decor.bikerack.push({ x: along(), z: edgeZ(!top, 0.5), rot: rotOf(!top), scale: 1 });
      decor.sign.push({ x: x0 + EDGE, z: z0 + EDGE, rot: 0, scale: 1 });
      if (drng() < 0.5) decor.busstop.push({ x: along(), z: edgeZ(drng() < 0.5, 1.0), rot: 0, scale: 1 });
    }
    // road works on the pavement: barriers, cones and a skip in a few downtown and old-town lots
    if ((district === 'downtown' || district === 'oldtown') && drng() < 0.22) {
      const top = drng() < 0.5, wx = along();
      for (let k = 0; k < 3; k++) decor.barrier.push({ x: wx + k * 1.7, z: edgeZ(top, 0.2), rot: 0, scale: 1 });
      decor.dumpster.push({ x: wx + 5.2, z: edgeZ(top, 0.9), rot: 0, scale: 1 });
      for (let k = 0; k < 3; k++) decor.cone.push({ x: wx - 1.2 - k * 1.1, z: edgeZ(top, 0.3), rot: drng() * 6.28, scale: 1 });
    }
    if (district === 'harbor' && drng() < 0.5) decor.crane.push({ x: x0 + 10 + drng() * (x1 - x0 - 20), z: lz, rot: drng() * 6.28, scale: 1 });
    if (district === 'harbor') for (let k = 0; k < 5; k++) decor.cone.push({ x: x0 + 6 + drng() * (x1 - x0 - 12), z: edgeZ(drng() < 0.5, 0.4), rot: drng() * 6.28, scale: 1 });
    if (district === 'downtown' || district === 'oldtown') for (let k = 0; k < 2; k++) decor.cone.push({ x: along(), z: edgeZ(drng() < 0.5, 0.2), rot: drng() * 6.28, scale: 1 });
    if (district === 'downtown' || district === 'oldtown' || district === 'plaza' || district === 'park') decor.lampdetail.push({ x: x0 + EDGE, z: z0 + EDGE, rot: 0, scale: 1 });
  }
  const decorMeshes: THREE.InstancedMesh[] = [];
  const decorKinds: string[] = [];
  const dgeo = { barrier: barrierGeometry(), dumpster: dumpsterGeometry(), crane: craneGeometry(), bush: bushGeometry(), flower: flowerGeometry(), grass: grassGeometry(), planter: planterGeometry(), mailbox: mailboxGeometry(), bollard: bollardGeometry(), bikerack: bikeRackGeometry(), busstop: busStopGeometry(), cone: trafficConeGeometry(), sign: streetSignGeometry(), lampdetail: lampPostDetail() };
  for (const k of Object.keys(decor) as (keyof typeof decor)[]) {
    if (decor[k].length) { decorMeshes.push(instance(dgeo[k], mat, decor[k], k !== 'bush' && k !== 'cone' && k !== 'flower' && k !== 'grass')); decorKinds.push(k); }
  }
  const dradius: Partial<Record<keyof typeof decor, number>> = { barrier: 1.0, dumpster: 1.3, crane: 1.0, planter: 0.7, mailbox: 0.35, bollard: 0.2, bikerack: 1.0, busstop: 1.4, sign: 0.15 };
  for (const k of Object.keys(dradius) as (keyof typeof decor)[]) for (const p of decor[k]) world.circles.push({ x: p.x, z: p.z, r: dradius[k]! });

  // ---- lamp light pools on the ground (additive, only visible at night)
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,226,160,0.9)'); gr.addColorStop(0.5, 'rgba(255,214,140,0.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const poolGeo = new THREE.PlaneGeometry(9, 9); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lists.lamp.length);
  lists.lamp.forEach((p, i) => { dummy.position.set(p.x + Math.cos(p.rot) * 1.95, SLAB + 0.05, p.z - Math.sin(p.rot) * 1.95); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix); });
  pools.frustumCulled = false; pools.visible = false;
  group.add(pools);

  const setSeason = (s: 'normal' | 'autumn' | 'winter') => {
    const c = new THREE.Color();
    for (let i = 0; i < trees.length; i++) {
      if (s === 'normal') c.setRGB(1, 1, 1);
      else if (s === 'winter') c.setRGB(2.6, 1.45, 2.4);
      else { const k = (i * 37) % 3; if (k === 0) c.setRGB(2.6, 1.0, 0.4); else if (k === 1) c.setRGB(3.0, 0.6, 0.4); else c.setRGB(2.2, 1.3, 0.5); }
      treeMesh.setColorAt(i, c);
    }
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
  };

  const radius: Record<PropType, number> = { palm: 0.5, lamp: 0.3, hydrant: 0.35, bench: 0.9, newsstand: 0.85, trash: 0.4 };
  (Object.keys(lists) as PropType[]).forEach((k) => {
    lists[k].forEach((p, index) => {
      world.circles.push({ x: p.x, z: p.z, r: radius[k], smash: { type: k, index, value: VALUE[k] } });
    });
  });

  // ---- tumbling copies (pooled) ----
  const flyers: Record<PropType, Flyer[]> = { palm: [], lamp: [], hydrant: [], bench: [], newsstand: [], trash: [] };
  (Object.keys(flyers) as PropType[]).forEach((k) => {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(geos[k], mat);
      mesh.castShadow = true;
      mesh.visible = false;
      group.add(mesh);
      flyers[k].push({ mesh, vx: 0, vy: 0, vz: 0, ax: 0, az: 0, ttl: 0 });
    }
  });
  const geysers: { x: number; z: number; t: number; acc: number }[] = [];

  function smash(ref: SmashRef, x: number, z: number, vx: number, vz: number): number {
    const p = lists[ref.type][ref.index];
    meshes[ref.type].setMatrixAt(ref.index, zero);
    meshes[ref.type].instanceMatrix.needsUpdate = true;
    if (ref.type === 'lamp') {
      lampHeads.setMatrixAt(ref.index, zero);
      lampHeads.instanceMatrix.needsUpdate = true;
    }
    const f = flyers[ref.type].find((q) => q.ttl <= 0);
    if (f) {
      f.mesh.visible = true;
      f.mesh.position.set(x, SLAB, z);
      f.mesh.rotation.set(0, p.rot, 0);
      f.mesh.scale.setScalar(p.scale);
      f.vx = vx * 0.9 + (Math.random() - 0.5) * 2;
      f.vz = vz * 0.9 + (Math.random() - 0.5) * 2;
      f.vy = 4 + Math.random() * 4;
      f.ax = (Math.random() - 0.5) * 6 + (vz > 0 ? 3 : -3);
      f.az = (Math.random() - 0.5) * 6 - (vx > 0 ? 3 : -3);
      f.ttl = 3;
    }
    vfx.emitDebris(x, 0.6, z, vx, vz, DEBRIS_COLOR[ref.type], ref.type === 'palm' ? 6 : 10);
    if (ref.type === 'lamp') vfx.emitSparks(x, 3, z, 10);
    if (ref.type === 'hydrant') geysers.push({ x, z, t: 5, acc: 0 });
    if (ref.type === 'newsstand') vfx.emitDebris(x, 1, z, vx, vz, 0xffffff, 10); // scattered paper sheets
    if (ref.type === 'trash') vfx.emitDebris(x, 0.9, z, vx, vz, 0xb9b39a, 8);
    return ref.value;
  }

  function update(dt: number): void {
    for (const k of Object.keys(flyers) as PropType[]) {
      for (const f of flyers[k]) {
        if (f.ttl <= 0) continue;
        f.ttl -= dt;
        if (f.ttl <= 0) { f.mesh.visible = false; continue; }
        f.vy -= 24 * dt;
        const m = f.mesh;
        m.position.x += f.vx * dt;
        m.position.y += f.vy * dt;
        m.position.z += f.vz * dt;
        m.rotation.x += f.ax * dt;
        m.rotation.z += f.az * dt;
        if (m.position.y < SLAB) {
          m.position.y = SLAB;
          f.vy *= -0.3;
          f.vx *= 0.75; f.vz *= 0.75; f.ax *= 0.6; f.az *= 0.6;
        }
        if (f.ttl < 0.5) m.scale.multiplyScalar(0.9);
      }
    }
    for (let i = geysers.length - 1; i >= 0; i--) {
      const g = geysers[i];
      g.t -= dt;
      if (g.t <= 0) { geysers.splice(i, 1); continue; }
      g.acc += dt * 45;
      const fade = Math.min(1, g.t / 1.2);
      while (g.acc >= 1) {
        g.acc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.6 * fade;
        vfx.emitWater(g.x, 0.5, g.z, Math.cos(a) * r, (6 + Math.random() * 4) * (0.5 + 0.5 * fade), Math.sin(a) * r);
      }
    }
  }

  /** Thins out trees and pines for slower devices: `f` is the share kept (1 = all). Spread evenly, not cut off district by district. */
  function setVegetation(f: number): void {
    for (const { m, orig } of veg) {
      const total = orig.length / 16;
      const arr = m.instanceMatrix.array as Float32Array;
      let n = 0;
      // the kept instances are packed to the front and only those are drawn (a zero-size instance would still cost its vertices)
      for (let i = 0; i < total; i++) {
        if ((i * 0.6180339887) % 1 >= f) continue;
        for (let k = 0; k < 16; k++) arr[n * 16 + k] = orig[i * 16 + k];
        n++;
      }
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  return { group, lampHeadMaterial, smash, update, setVegetation, setSeason, setNight: (n: number) => { pools.visible = n > 0.05; poolMat.opacity = Math.min(0.75, n * 0.8); }, busStops: () => decor.busstop.map((p) => ({ x: p.x, z: p.z })), setDecor: (level: number) => { decorMeshes.forEach((m, i) => { m.visible = decorKinds[i] === 'flower' || decorKinds[i] === 'grass' ? level >= 2 : level >= 1; }); } };
}
