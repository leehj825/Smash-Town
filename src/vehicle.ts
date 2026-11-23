import * as THREE from 'three';
import { MeshBuilder, paletteMaterial } from './geo';
import type { I18nKey } from './i18n';

export type VehicleKind =
  | 'sports' | 'supercar' | 'muscle' | 'sedan' | 'taxi' | 'pickup' | 'limo' | 'monster'
  | 'police' | 'interceptor' | 'swat' | 'armored' | 'ambulance' | 'firetruck' | 'motorbike' | 'scooter' | 'bicycle' | 'bus' | 'boat';

export interface VehicleStats {
  maxSpeed: number; // m/s
  accel: number;
  grip: number;
  /** Damage multiplier taken (lower = tougher). */
  dmg: number;
  mass: number;
  name: I18nKey | null;
  price: number;
  color: number;
}

export const STATS: Record<VehicleKind, VehicleStats> = {
  sports:      { maxSpeed: 38, accel: 30, grip: 9,   dmg: 1.0, mass: 1.0, name: 'veh.sports',   price: 0,    color: 0xffd500 },
  sedan:       { maxSpeed: 32, accel: 22, grip: 9,   dmg: 0.9, mass: 1.1, name: 'veh.sedan',    price: 0,    color: 0x3b82f6 },
  taxi:        { maxSpeed: 31, accel: 21, grip: 9,   dmg: 0.9, mass: 1.1, name: 'veh.taxi',     price: 1500, color: 0xffc400 },
  pickup:      { maxSpeed: 30, accel: 20, grip: 8,   dmg: 0.7, mass: 1.5, name: 'veh.pickup',   price: 3000, color: 0x2fb87a },
  muscle:      { maxSpeed: 41, accel: 34, grip: 7.5, dmg: 0.8, mass: 1.3, name: 'veh.muscle',   price: 5000, color: 0xff2a55 },
  supercar:    { maxSpeed: 45, accel: 37, grip: 10.5, dmg: 1.2, mass: 0.9, name: 'veh.supercar', price: 9000, color: 0xff6a00 },
  limo:        { maxSpeed: 34, accel: 23, grip: 8.5, dmg: 0.55, mass: 1.9, name: 'veh.limo',    price: 30000, color: 0x14141f },
  monster:     { maxSpeed: 31, accel: 24, grip: 7,   dmg: 0.35, mass: 3.0, name: 'veh.monster', price: 60000, color: 0xff7a1a },
  police:      { maxSpeed: 36, accel: 28, grip: 9,   dmg: 0.9, mass: 1.2, name: null, price: 0, color: 0x1a1a24 },
  interceptor: { maxSpeed: 42, accel: 34, grip: 10,  dmg: 0.9, mass: 1.1, name: null, price: 0, color: 0x1a1a24 },
  boat:        { maxSpeed: 26, accel: 15, grip: 2.2, dmg: 0.5, mass: 1.6, name: null, price: 0, color: 0xf2f2f2 },
  bus:         { maxSpeed: 20, accel: 12, grip: 7, dmg: 0.3, mass: 3.5, name: null, price: 0, color: 0x2f78d6 },
  scooter:     { maxSpeed: 22, accel: 18, grip: 7, dmg: 0.3, mass: 0.35, name: 'veh.scooter', price: 600, color: 0x2fb87a },
  bicycle:     { maxSpeed: 11, accel: 9, grip: 8, dmg: 0.2, mass: 0.25, name: 'veh.bicycle', price: 150, color: 0xff7a1a },
  motorbike:   { maxSpeed: 46, accel: 40, grip: 7, dmg: 0.4, mass: 0.45, name: 'veh.motorbike', price: 2500, color: 0xe0243c },
  ambulance:   { maxSpeed: 30, accel: 22, grip: 8, dmg: 0.6, mass: 1.8, name: null, price: 0, color: 0xf4f4f4 },
  firetruck:   { maxSpeed: 27, accel: 18, grip: 7, dmg: 0.4, mass: 3.0, name: null, price: 0, color: 0xd62d2d },
  swat:        { maxSpeed: 33, accel: 24, grip: 7.5, dmg: 0.6, mass: 2.2, name: null, price: 0, color: 0x23262f },
  armored:     { maxSpeed: 30, accel: 20, grip: 7,   dmg: 0.35, mass: 3.2, name: null, price: 0, color: 0x3a4658 },
};

export const PLAYER_ROSTER: VehicleKind[] = ['sports', 'sedan', 'taxi', 'bicycle', 'scooter', 'motorbike', 'pickup', 'muscle', 'supercar', 'limo', 'monster'];
export const CIVILIAN_KINDS: VehicleKind[] = ['sedan', 'sedan', 'taxi', 'pickup', 'muscle', 'bus'];
export const CIVILIAN_COLORS = [0xe85a4f, 0x3b82f6, 0x2fb87a, 0xf2a73b, 0x8a5cd6, 0xf4a7b9, 0x66d1c9, 0xeceff4, 0x8d99ae];

interface Spec {
  w: number; len: number; bodyH: number; clr: number;
  hoodLen: number; wedge: boolean; trunkLen: number;
  cabinLen: number; cabinH: number; cabinZ: number; taper: number; cabinColor: number | null;
  wheelR: number; wheelX: number; wheelZ: number;
  spoiler?: boolean; louvers?: boolean; bed?: boolean; sign?: boolean; bar?: boolean;
  police?: boolean; stripe?: number; plating?: boolean;
}

const DARK = 0x1a1a24;
const SPECS: Record<VehicleKind, Spec> = {
  sports:  { w: 1.9, len: 4.3, bodyH: 0.5, clr: 0.3, hoodLen: 1.6, wedge: true, trunkLen: 1.2, cabinLen: 1.9, cabinH: 0.55, cabinZ: -0.15, taper: 0.72, cabinColor: DARK, wheelR: 0.38, wheelX: 0.95, wheelZ: 1.35, spoiler: true, louvers: true },
  supercar:{ w: 2.0, len: 4.5, bodyH: 0.42, clr: 0.26, hoodLen: 1.9, wedge: true, trunkLen: 1.3, cabinLen: 1.8, cabinH: 0.5, cabinZ: -0.1, taper: 0.62, cabinColor: DARK, wheelR: 0.38, wheelX: 1.0, wheelZ: 1.4, spoiler: true, louvers: true, stripe: 0xffffff },
  muscle:  { w: 1.95, len: 4.8, bodyH: 0.62, clr: 0.3, hoodLen: 1.9, wedge: false, trunkLen: 1.3, cabinLen: 1.7, cabinH: 0.55, cabinZ: -0.25, taper: 0.78, cabinColor: DARK, wheelR: 0.4, wheelX: 0.98, wheelZ: 1.5, stripe: 0x1a1a24 },
  sedan:   { w: 1.85, len: 4.5, bodyH: 0.62, clr: 0.3, hoodLen: 1.3, wedge: false, trunkLen: 1.1, cabinLen: 2.2, cabinH: 0.62, cabinZ: -0.1, taper: 0.8, cabinColor: DARK, wheelR: 0.38, wheelX: 0.93, wheelZ: 1.4 },
  taxi:    { w: 1.85, len: 4.5, bodyH: 0.62, clr: 0.3, hoodLen: 1.3, wedge: false, trunkLen: 1.1, cabinLen: 2.2, cabinH: 0.62, cabinZ: -0.1, taper: 0.8, cabinColor: DARK, wheelR: 0.38, wheelX: 0.93, wheelZ: 1.4, sign: true },
  pickup:  { w: 2.0, len: 5.2, bodyH: 0.7, clr: 0.45, hoodLen: 1.4, wedge: false, trunkLen: 1.9, cabinLen: 1.7, cabinH: 0.65, cabinZ: 0.2, taper: 0.82, cabinColor: DARK, wheelR: 0.5, wheelX: 1.0, wheelZ: 1.6, bed: true },
  limo:    { w: 1.95, len: 6.6, bodyH: 0.66, clr: 0.3, hoodLen: 1.4, wedge: false, trunkLen: 1.3, cabinLen: 3.9, cabinH: 0.62, cabinZ: -0.2, taper: 0.82, cabinColor: DARK, wheelR: 0.4, wheelX: 0.97, wheelZ: 2.1, stripe: 0xc9ccd6 },
  monster: { w: 2.3, len: 5.4, bodyH: 0.85, clr: 1.0, hoodLen: 1.5, wedge: false, trunkLen: 1.8, cabinLen: 1.7, cabinH: 0.7, cabinZ: 0.2, taper: 0.82, cabinColor: DARK, wheelR: 0.95, wheelX: 1.25, wheelZ: 1.7, bed: true, stripe: 0x1a1a24 },
  police:  { w: 1.9, len: 4.7, bodyH: 0.62, clr: 0.3, hoodLen: 1.3, wedge: false, trunkLen: 1.1, cabinLen: 2.2, cabinH: 0.62, cabinZ: -0.1, taper: 0.8, cabinColor: DARK, wheelR: 0.39, wheelX: 0.95, wheelZ: 1.45, bar: true, police: true },
  interceptor: { w: 1.95, len: 4.6, bodyH: 0.5, clr: 0.28, hoodLen: 1.7, wedge: true, trunkLen: 1.2, cabinLen: 1.9, cabinH: 0.52, cabinZ: -0.15, taper: 0.7, cabinColor: DARK, wheelR: 0.39, wheelX: 0.98, wheelZ: 1.4, bar: true, police: true, spoiler: true },
  boat: { w: 2.3, len: 6.0, bodyH: 0.55, clr: 0.12, hoodLen: 1.2, wedge: false, trunkLen: 0.8, cabinLen: 1.6, cabinH: 0.7, cabinZ: -0.3, taper: 0.8, cabinColor: null, wheelR: 0.05, wheelX: 0.05, wheelZ: 0.05 },
  bus: { w: 2.4, len: 9, bodyH: 1.5, clr: 0.45, hoodLen: 0.3, wedge: false, trunkLen: 0.2, cabinLen: 8.2, cabinH: 0.95, cabinZ: -0.2, taper: 0.97, cabinColor: null, wheelR: 0.5, wheelX: 1.1, wheelZ: 3.0 },
  scooter: { w: 0.6, len: 1.6, bodyH: 0.3, clr: 0.2, hoodLen: 0.4, wedge: false, trunkLen: 0.3, cabinLen: 0.5, cabinH: 0.2, cabinZ: 0, taper: 0.8, cabinColor: null, wheelR: 0.2, wheelX: 0.05, wheelZ: 0.6 },
  bicycle: { w: 0.5, len: 1.8, bodyH: 0.3, clr: 0.3, hoodLen: 0.4, wedge: false, trunkLen: 0.3, cabinLen: 0.5, cabinH: 0.2, cabinZ: 0, taper: 0.8, cabinColor: null, wheelR: 0.36, wheelX: 0.04, wheelZ: 0.7 },
  motorbike: { w: 0.7, len: 2.1, bodyH: 0.4, clr: 0.4, hoodLen: 0.5, wedge: false, trunkLen: 0.4, cabinLen: 0.6, cabinH: 0.3, cabinZ: 0, taper: 0.8, cabinColor: null, wheelR: 0.34, wheelX: 0.07, wheelZ: 0.8 },
  ambulance: { w: 2.1, len: 5.4, bodyH: 0.95, clr: 0.42, hoodLen: 1.2, wedge: false, trunkLen: 0.2, cabinLen: 4.0, cabinH: 0.8, cabinZ: -0.55, taper: 0.97, cabinColor: null, wheelR: 0.46, wheelX: 1.02, wheelZ: 1.7, bar: true },
  firetruck: { w: 2.4, len: 7.2, bodyH: 1.1, clr: 0.5, hoodLen: 1.4, wedge: false, trunkLen: 0.3, cabinLen: 3.0, cabinH: 0.8, cabinZ: 1.4, taper: 0.95, cabinColor: null, wheelR: 0.55, wheelX: 1.1, wheelZ: 2.4, bar: true },
  swat:    { w: 2.15, len: 5.4, bodyH: 0.95, clr: 0.45, hoodLen: 1.2, wedge: false, trunkLen: 0.2, cabinLen: 4.0, cabinH: 0.95, cabinZ: -0.55, taper: 0.97, cabinColor: null, wheelR: 0.5, wheelX: 1.05, wheelZ: 1.7, bar: true, plating: true },
  armored: { w: 2.4, len: 5.8, bodyH: 1.25, clr: 0.5, hoodLen: 1.5, wedge: false, trunkLen: 0.3, cabinLen: 3.6, cabinH: 0.6, cabinZ: -0.6, taper: 0.9, cabinColor: null, wheelR: 0.55, wheelX: 1.15, wheelZ: 1.9, bar: true, plating: true },
};

/** Body size for the tuning parts (width, length, floor clearance, body height). */
export function bodyOf(kind: VehicleKind): { w: number; len: number; clr: number; bodyH: number } {
  const s = SPECS[kind];
  return { w: s.w, len: s.len, clr: s.clr, bodyH: s.bodyH };
}

export function dimsOf(kind: VehicleKind): { radius: number; offsets: number[]; len: number } {
  const s = SPECS[kind];
  const radius = s.w * 0.5 + 0.1;
  const o = s.len / 2 - radius;
  return { radius, offsets: [-o, 0, o], len: s.len };
}

export interface VehicleModel {
  root: THREE.Group;
  body: THREE.Group;
  chassis: THREE.Mesh;
  frontPivots: THREE.Group[];
  wheelMeshes: THREE.Mesh[];
  wheelRadius: number;
  headMat: THREE.MeshStandardMaterial;
  tailMat: THREE.MeshStandardMaterial;
  headGlow: THREE.Mesh | null;
  blob: THREE.Mesh | null;
  full: boolean;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,244,200,0.95)');
  grad.addColorStop(1, 'rgba(255,244,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.5, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Built {
  chassis: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  barRed: THREE.BufferGeometry | null;
  barBlue: THREE.BufferGeometry | null;
  /** Head + tail lights in one vertex-coloured geometry (used by AI cars). */
  lights: THREE.BufferGeometry;
}

const taperTweak = (taper: number) => (p: THREE.BufferAttribute) => {
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * taper);
      p.setZ(i, p.getZ(i) * taper);
    }
  }
};


/** The rider that sits on a bike, bicycle or scooter while the player is on it: legs, jacket, arms and a helmet, in the player's own clothes. */
export function riderGeometry(kind: VehicleKind, pants: number, shirt: number, skin: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  if (kind === 'motorbike') {
  b.box(0.2, 0.18, 0.36, 0.1, 0.78, -0.4, pants); b.box(0.2, 0.18, 0.36, -0.1, 0.78, -0.4, pants);   // thighs
  b.box(0.16, 0.5, 0.16, 0.1, 0.55, -0.15, pants); b.box(0.16, 0.5, 0.16, -0.1, 0.55, -0.15, pants);  // shins on the pegs
  b.box(0.42, 0.55, 0.26, 0, 1.25, -0.3, shirt);                            // jacket
  for (const sx of [-1, 1]) b.rotatedBox(0.12, 0.12, 0.62, sx * 0.27, 1.2, 0.02, 0.9, 0, 0, shirt); // arms to the bars
  b.box(0.3, 0.3, 0.3, 0, 1.68, -0.22, 0x1e2a5a);                              // helmet
  b.box(0.24, 0.11, 0.05, 0, 1.68, -0.06, 0x9fd6ff);                           // visor
    b.box(0.2, 0.2, 0.06, 0, 1.6, -0.06, skin);   // face under the visor
  } else if (kind === 'bicycle') {
    b.box(0.16, 0.5, 0.16, 0.1, 0.6, -0.1, pants); b.box(0.16, 0.5, 0.16, -0.1, 0.55, -0.02, pants); // legs on the pedals
    b.box(0.18, 0.18, 0.4, 0.1, 1.15, -0.28, pants); b.box(0.18, 0.18, 0.4, -0.1, 1.15, -0.28, pants); // thighs
    b.rotatedBox(0.38, 0.55, 0.24, 0, 1.52, -0.18, 0.3, 0, 0, shirt); // torso leaning forward
    for (const sx of [-1, 1]) b.rotatedBox(0.11, 0.11, 0.6, sx * 0.22, 1.35, 0.3, 0.5, 0, 0, shirt); // arms
    b.box(0.28, 0.26, 0.28, 0, 1.92, -0.02, 0xffd23a);                   // helmet
    b.box(0.2, 0.2, 0.06, 0, 1.88, 0.13, skin);
  } else {
    b.box(0.17, 0.7, 0.17, 0.1, 0.65, 0.0, pants); b.box(0.17, 0.7, 0.17, -0.1, 0.65, -0.1, pants);
    b.box(0.42, 0.6, 0.26, 0, 1.3, -0.05, shirt);
    for (const sx of [-1, 1]) b.rotatedBox(0.11, 0.11, 0.7, sx * 0.24, 1.2, 0.42, 0.25, 0, 0, shirt);
    b.box(0.3, 0.28, 0.3, 0, 1.78, 0.0, 0x1e2a5a);
    b.box(0.2, 0.2, 0.06, 0, 1.74, 0.16, skin);
  }
  return b.build();
}

/** A motorbike (no rider; see riderGeometry): frame, tank, seat, forks, bars, lamp, exhaust, and a blocky rider in a helmet and jacket. */
function buildBike(color: number, bakeWheels: boolean): Built {
  const s = SPECS.motorbike;
  const b = new MeshBuilder();
  const metal = 0x8d95a3, dark = 0x1c1c22;
  b.box(0.2, 0.22, 1.0, 0, 0.62, 0.05, dark);                                  // engine block
  b.box(0.3, 0.26, 0.55, 0, 0.9, 0.3, color);                                  // tank
  b.box(0.28, 0.1, 0.7, 0, 0.82, -0.4, 0x2a2d35);                              // seat
  b.box(0.3, 0.12, 0.3, 0, 0.9, -0.82, color);                                 // tail
  b.box(0.12, 0.7, 0.12, 0, 0.7, 0.88, metal);                                 // fork
  b.box(0.62, 0.06, 0.06, 0, 1.08, 0.82, dark);                                // bars
  for (const sx of [-1, 1]) { b.box(0.06, 0.06, 0.16, sx * 0.31, 1.08, 0.82, dark); b.box(0.04, 0.18, 0.1, sx * 0.1, 0.55, -0.2, metal); }
  b.cylinder(0.05, 0.05, 0.7, 7, 0.16, 0.42, -0.55, metal, Math.PI / 2, 0, 0); // exhaust
  b.box(0.1, 0.26, 0.9, 0, 0.47, -0.5, 0x2a2d35);                              // swing arm hint
  if (bakeWheels) for (const z of [0.85, -0.85]) {
    b.cylinder(s.wheelR, s.wheelR, 0.16, 10, 0, s.wheelR, z, 0x1a1a1f, 0, 0, Math.PI / 2);
    b.cylinder(s.wheelR * 0.55, s.wheelR * 0.55, 0.18, 8, 0, s.wheelR, z, 0xc9ccd6, 0, 0, Math.PI / 2);
  }
  const hb = new MeshBuilder(); hb.box(0.2, 0.18, 0.1, 0, 0.98, 0.98, 0xffffff);
  const tb = new MeshBuilder(); tb.box(0.16, 0.07, 0.05, 0, 0.88, -1.0, 0xffffff);
  const lb = new MeshBuilder(); lb.box(0.2, 0.18, 0.1, 0, 0.98, 0.98, 0xfff3c4); lb.box(0.16, 0.07, 0.05, 0, 0.88, -1.0, 0xff2a3a);
  return { chassis: b.build(), head: hb.build(), tail: tb.build(), barRed: null, barBlue: null, lights: lb.build() };
}

/** A pedal bicycle or a kick scooter (no rider; see riderGeometry). */
function buildLight(kind: 'bicycle' | 'scooter', color: number, bakeWheels: boolean): Built {
  const s = SPECS[kind];
  const b = new MeshBuilder();
  const metal = 0x8d95a3, dark = 0x1c1c22;
  if (kind === 'bicycle') {
    b.box(0.05, 0.05, 0.85, 0, 0.8, 0.05, color);                       // top tube
    b.rotatedBox(0.05, 0.05, 0.9, 0, 0.6, 0.1, -0.7, 0, 0, color);       // down tube
    b.box(0.05, 0.55, 0.05, 0, 0.82, -0.38, color);                      // seat tube
    b.box(0.05, 0.62, 0.05, 0, 0.7, 0.66, metal);                        // fork
    b.box(0.5, 0.04, 0.04, 0, 1.03, 0.62, dark);                         // bars
    b.box(0.14, 0.05, 0.3, 0, 1.12, -0.4, dark);                         // saddle
    b.box(0.18, 0.04, 0.1, 0.12, 0.3, 0.0, dark); b.box(0.18, 0.04, 0.1, -0.12, 0.3, 0.04, dark); // pedals
  } else {
    b.box(0.3, 0.08, 0.9, 0, 0.28, 0, color);                            // deck
    b.rotatedBox(0.06, 0.06, 0.95, 0, 0.7, 0.55, -1.15, 0, 0, metal);     // steering column
    b.box(0.5, 0.05, 0.05, 0, 1.12, 0.78, dark);                         // bars
    b.box(0.2, 0.06, 0.3, 0, 0.35, -0.5, dark);                          // rear fender
  }
  if (bakeWheels) for (const z of [s.wheelZ, -s.wheelZ]) {
    b.cylinder(s.wheelR, s.wheelR, 0.08, 10, 0, s.wheelR, z, 0x1a1a1f, 0, 0, Math.PI / 2);
    b.cylinder(s.wheelR * 0.5, s.wheelR * 0.5, 0.1, 8, 0, s.wheelR, z, 0xc9ccd6, 0, 0, Math.PI / 2);
  }
  const hb = new MeshBuilder(); hb.box(0.1, 0.1, 0.06, 0, 1.0, s.len / 2 - 0.1, 0xffffff);
  const tb = new MeshBuilder(); tb.box(0.08, 0.06, 0.04, 0, 0.6, -s.len / 2 + 0.1, 0xffffff);
  const lb = new MeshBuilder(); lb.box(0.1, 0.1, 0.06, 0, 1.0, s.len / 2 - 0.1, 0xfff3c4); lb.box(0.08, 0.06, 0.04, 0, 0.6, -s.len / 2 + 0.1, 0xff2a3a);
  return { chassis: b.build(), head: hb.build(), tail: tb.build(), barRed: null, barBlue: null, lights: lb.build() };
}

/** A speedboat: a pointed hull with a deck, a windscreen and cabin, a rail and an outboard motor. */
function buildBoat(color: number): Built {
  const b = new MeshBuilder();
  const white = 0xf4f4f4, dark = 0x23323f;
  // hull: wide at the back, pinched to a point at the bow
  b.box(2.3, 0.55, 3.6, 0, 0.4, -0.7, white, (p) => { /* the slab itself */ void p; });
  b.box(2.3, 0.5, 2.0, 0, 0.4, 1.6, color, (p) => { for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setX(i, p.getX(i) * 0.12); });
  b.box(2.34, 0.12, 5.4, 0, 0.18, 0.0, 0x2a3a6b);                                  // keel stripe
  b.box(1.9, 0.06, 3.0, 0, 0.7, -0.6, 0x8a6a45);                                    // teak deck
  b.box(1.5, 0.7, 1.5, 0, 1.0, -0.3, white);                                        // cabin
  b.box(1.4, 0.4, 0.06, 0, 1.15, 0.47, dark);                                       // windscreen
  for (const sx of [-1, 1]) b.box(0.06, 0.34, 0.9, sx * 0.76, 1.15, -0.3, dark);   // side windows
  b.box(1.6, 0.06, 1.6, 0, 1.38, -0.3, color);                                      // cabin roof
  for (const sx of [-1, 1]) { b.box(0.04, 0.4, 3.0, sx * 1.1, 0.9, -0.7, 0xc9ccd6); b.box(0.04, 0.04, 3.0, sx * 1.1, 1.1, -0.7, 0xc9ccd6); } // rails
  b.box(0.35, 0.6, 0.3, 0, 0.75, -2.55, 0x23262f); b.box(0.12, 0.7, 0.12, 0, 0.3, -2.7, 0x6d7280);                // outboard motor
  b.box(0.1, 0.5, 0.1, 0, 1.0, 1.5, 0xd62d3a);                                      // a little flag pole
  const hb = new MeshBuilder(); hb.box(0.4, 0.14, 0.06, 0, 0.75, 2.2, 0xffffff);
  const tb = new MeshBuilder(); tb.box(0.4, 0.1, 0.06, 0, 0.8, -2.45, 0xffffff);
  const lb = new MeshBuilder(); lb.box(0.4, 0.14, 0.06, 0, 0.75, 2.2, 0xfff3c4); lb.box(0.4, 0.1, 0.06, 0, 0.8, -2.45, 0xff2a3a);
  return { chassis: b.build(), head: hb.build(), tail: tb.build(), barRed: null, barBlue: null, lights: lb.build() };
}

function buildGeometry(kind: VehicleKind, color: number, bakeWheels: boolean): Built {
  if (kind === 'boat') return buildBoat(color);
  if (kind === 'motorbike') return buildBike(color, bakeWheels);
  if (kind === 'bicycle' || kind === 'scooter') return buildLight(kind, color, bakeWheels);
  const s = SPECS[kind];
  const b = new MeshBuilder();
  const body = s.police ? DARK : kind === 'ambulance' ? 0xf4f4f4 : kind === 'firetruck' ? 0xd62d2d : kind === 'swat' ? 0x23262f : kind === 'armored' ? 0x3a4658 : color;
  const top = s.clr + s.bodyH;
  b.box(s.w, s.bodyH, s.len, 0, s.clr + s.bodyH / 2, 0, body);
  // hood
  b.box(s.w - 0.06, 0.3, s.hoodLen, 0, top + 0.15, s.len / 2 - s.hoodLen / 2, body, s.wedge
    ? (p) => { for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0 && p.getY(i) > 0) p.setY(i, p.getY(i) - 0.26); }
    : undefined);
  // trunk / bed
  const tz = -s.len / 2 + s.trunkLen / 2;
  if (s.bed) {
    b.box(s.w - 0.06, 0.1, s.trunkLen, 0, top + 0.05, tz, DARK);
    for (const sx of [-1, 1]) b.box(0.1, 0.5, s.trunkLen, sx * (s.w / 2 - 0.08), top + 0.3, tz, body);
    b.box(s.w - 0.06, 0.5, 0.1, 0, top + 0.3, -s.len / 2 + 0.05, body);
    b.box(s.w - 0.06, 0.6, 0.1, 0, top + 0.35, -s.len / 2 + s.trunkLen, body);
  } else if (s.trunkLen > 0.25) {
    b.box(s.w - 0.06, 0.28, s.trunkLen, 0, top + 0.14, tz, body);
  }
  // cabin
  const cabinCol = s.cabinColor ?? body;
  const cabinTop = top + s.cabinH;
  b.box(s.w * 0.86, s.cabinH, s.cabinLen, 0, top + s.cabinH / 2, s.cabinZ, cabinCol, taperTweak(s.taper));
  b.box(s.w * 0.86 * s.taper * 0.9, 0.05, s.cabinLen * s.taper * 0.9, 0, cabinTop + 0.02, s.cabinZ, body);
  if (s.police) {
    // white door panels
    b.box(s.w + 0.03, s.bodyH * 0.5, s.cabinLen + 0.8, 0, s.clr + s.bodyH * 0.52, s.cabinZ, 0xffffff);
    b.box(0.35, 0.12, 0.7, 0, s.clr + s.bodyH + 0.02, -s.len / 2 + 0.6, 0xffffff);
    b.box(s.w - 0.3, 0.35, 0.22, 0, s.clr + 0.32, s.len / 2 + 0.1, DARK); // push bumper
  }
  if (kind === 'ambulance') {
    const RED = 0xe0243c;
    for (const sx of [-1, 1]) {
      b.box(0.03, 0.14, s.len * 0.8, sx * (s.w / 2 + 0.015), s.clr + s.bodyH * 0.35, -0.1, RED);
      b.box(0.03, 0.5, 0.14, sx * (s.w / 2 + 0.02), s.clr + s.bodyH * 0.72, s.cabinZ - 0.4, RED);       // cross
      b.box(0.03, 0.14, 0.5, sx * (s.w / 2 + 0.02), s.clr + s.bodyH * 0.72, s.cabinZ - 0.4, RED);
    }
    b.box(0.5, 0.04, 0.14, 0, top + s.cabinH + 0.04, s.cabinZ, RED); b.box(0.14, 0.04, 0.5, 0, top + s.cabinH + 0.04, s.cabinZ, RED); // roof cross
    b.box(s.w * 0.8, 0.5, 0.04, 0, s.clr + s.bodyH * 0.65, -s.len / 2 - 0.02, 0xdde2ea);                   // rear doors
    b.box(0.04, 0.46, 0.04, 0, s.clr + s.bodyH * 0.65, -s.len / 2 - 0.04, 0x8a8f99);
  }
  if (kind === 'firetruck') {
    for (const sx of [-1, 1]) {
      b.box(0.03, 0.12, s.len * 0.85, sx * (s.w / 2 + 0.015), s.clr + s.bodyH * 0.55, 0, 0xffe14d);
      b.box(0.5, 0.7, 1.6, sx * (s.w / 2 - 0.1), s.clr + s.bodyH * 0.25, -1.6, 0x9aa3b0);   // equipment lockers
    }
    for (const sx of [-0.5, 0.5]) b.box(0.08, 0.1, s.len * 0.7, sx, top + 0.2, -0.9, 0xcfd6df); // ladder rails
    for (let k = 0; k < 8; k++) b.box(1.0, 0.05, 0.06, 0, top + 0.2, -3.0 + k * 0.7, 0xcfd6df);  // ladder rungs
    b.box(0.5, 0.3, 0.5, 0, top + 0.35, -2.2, 0x4a505c);                                         // hose reel
  }
  if (kind === 'bus') {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 7; k++) b.box(0.04, 0.55, 0.85, sx * (s.w / 2 + 0.02), s.clr + s.bodyH * 0.62, -3.3 + k * 1.15, 0x23323f);  // windows
      b.box(0.04, 0.14, s.len * 0.9, sx * (s.w / 2 + 0.025), s.clr + 0.35, 0, 0xf2f2f2);                                                  // white stripe
      b.box(0.04, 1.0, 1.0, sx * (s.w / 2 + 0.025), s.clr + s.bodyH * 0.5, 3.4, 0x23323f);                                                // front door
    }
    b.box(s.w - 0.2, 0.55, 0.05, 0, s.clr + s.bodyH * 0.7, s.len / 2 + 0.02, 0x23323f);                                                  // windscreen
    b.box(0.9, 0.18, 0.05, 0, top + 0.1, s.len / 2 + 0.03, 0xffd23a);                                                                       // destination sign
  }
  if (s.plating) {
    for (const sx of [-1, 1]) b.box(0.08, s.bodyH * 0.7, s.len * 0.7, sx * (s.w / 2 + 0.02), s.clr + s.bodyH * 0.55, -0.2, 0x5b6678);
    b.box(s.w - 0.2, 0.5, 0.2, 0, s.clr + 0.35, s.len / 2 + 0.1, 0x5b6678);
  }
  if (s.stripe !== undefined) {
    b.box(0.34, 0.02, s.hoodLen - 0.1, 0, top + 0.32, s.len / 2 - s.hoodLen / 2, s.stripe);
    b.box(0.34, 0.02, s.trunkLen - 0.1, 0, top + 0.29, tz, s.stripe);
  }
  if (s.louvers) for (let i = 0; i < 4; i++) b.box(s.w * 0.62, 0.04, 0.1, 0, top + 0.17, -s.len / 2 + 0.9 - i * 0.2 + 0.4, DARK);
  if (s.spoiler) {
    for (const sx of [-1, 1]) b.box(0.08, 0.35, 0.3, sx * s.w * 0.37, top + 0.3, -s.len / 2 + 0.25, DARK);
    b.box(s.w, 0.07, 0.5, 0, top + 0.5, -s.len / 2 + 0.2, body);
  }
  if (s.sign) b.box(0.7, 0.2, 0.3, 0, cabinTop + 0.15, s.cabinZ, 0xffe14d);
  if (s.bar) {
    b.box(s.w * 0.6, 0.1, 0.4, 0, cabinTop + 0.07, s.cabinZ, DARK);
  }
  // wheel arches, door seams and handles, side mirrors, a grille and number plates
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box(0.04, s.wheelR * 1.3, s.wheelR * 2.4, sx * (s.w / 2 + 0.012), s.clr + s.wheelR * 1.0, sz * s.wheelZ, 0x15151a);
    const dx = sx * (s.w / 2 + 0.014);
    for (const k of [0.5, -0.02]) b.box(0.02, s.bodyH * 0.75, 0.03, dx, s.clr + s.bodyH * 0.5, s.cabinZ + s.cabinLen * k, 0x1c1c22);
    b.box(0.03, 0.04, 0.2, dx + sx * 0.01, s.clr + s.bodyH * 0.72, s.cabinZ + s.cabinLen * 0.42, 0xaeb4c0);
    b.box(0.22, 0.12, 0.14, sx * (s.w * 0.43 + 0.16), top + 0.14, s.cabinZ + s.cabinLen / 2 - 0.1, body);
    b.box(0.03, 0.08, 0.1, sx * (s.w * 0.43 + 0.1), top + 0.14, s.cabinZ + s.cabinLen / 2 - 0.1, 0x1c1c22);
  }
  b.box(s.w * 0.5, 0.14, 0.04, 0, s.clr + s.bodyH * 0.5, s.len / 2 + 0.01, 0x1a1a1f);
  for (let g = 0; g < 4; g++) b.box(s.w * 0.5, 0.012, 0.045, 0, s.clr + s.bodyH * 0.5 - 0.045 + g * 0.03, s.len / 2 + 0.012, 0x6b7280);
  for (const zz of [s.len / 2 + 0.14, -s.len / 2 - 0.14]) { b.box(0.52, 0.13, 0.03, 0, s.clr + 0.13, zz, 0xf2f2f2); b.box(0.38, 0.045, 0.035, 0, s.clr + 0.13, zz + Math.sign(zz) * 0.002, 0x2a2f45); }
  // bumpers / exhausts
  b.box(s.w + 0.05, 0.22, 0.25, 0, s.clr + 0.1, s.len / 2, DARK);
  b.box(s.w + 0.05, 0.22, 0.25, 0, s.clr + 0.1, -s.len / 2, DARK);
  b.cylinder(0.09, 0.09, 0.3, 8, s.w * 0.26, s.clr + 0.1, -s.len / 2 - 0.1, 0x9aa0ad, Math.PI / 2, 0, 0);
  b.cylinder(0.09, 0.09, 0.3, 8, -s.w * 0.26, s.clr + 0.1, -s.len / 2 - 0.1, 0x9aa0ad, Math.PI / 2, 0, 0);
  if (bakeWheels) {
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      b.cylinder(s.wheelR, s.wheelR, 0.32, 8, x * s.wheelX, s.wheelR, z * s.wheelZ, 0x1a1a1f, 0, 0, Math.PI / 2);
      b.cylinder(s.wheelR * 0.55, s.wheelR * 0.55, 0.34, 6, x * s.wheelX, s.wheelR, z * s.wheelZ, 0xc9ccd6, 0, 0, Math.PI / 2);
      for (let k = 0; k < 5; k++) b.rotatedBox(0.36, s.wheelR * 0.12, s.wheelR * 1.0, x * s.wheelX + x * 0.01, s.wheelR, z * s.wheelZ, k * Math.PI / 5, 0, 0, 0x6b7280);
      b.cylinder(s.wheelR * 0.16, s.wheelR * 0.16, 0.37, 6, x * s.wheelX, s.wheelR, z * s.wheelZ, 0x2a2d35, 0, 0, Math.PI / 2);
    }
  }

  // lights (separate geometries so they can glow)
  const hy = s.clr + s.bodyH * 0.65;
  const hb = new MeshBuilder();
  for (const sx of [-1, 1]) hb.box(0.55, 0.13, 0.06, sx * (s.w / 2 - 0.38), hy, s.len / 2 + 0.14, 0xffffff);
  const tb = new MeshBuilder();
  tb.box(s.w * 0.82, 0.1, 0.06, 0, s.clr + s.bodyH * 0.78, -s.len / 2 - 0.14, 0xffffff);

  let barRed: THREE.BufferGeometry | null = null;
  let barBlue: THREE.BufferGeometry | null = null;
  if (s.bar) {
    const rb = new MeshBuilder();
    rb.box(s.w * 0.27, 0.16, 0.34, s.w * 0.17, cabinTop + 0.2, s.cabinZ, 0xffffff);
    barRed = rb.build();
    const bb = new MeshBuilder();
    bb.box(s.w * 0.27, 0.16, 0.34, -s.w * 0.17, cabinTop + 0.2, s.cabinZ, 0xffffff);
    barBlue = bb.build();
  }
  const lb = new MeshBuilder();
  for (const sx of [-1, 1]) lb.box(0.55, 0.13, 0.06, sx * (s.w / 2 - 0.38), hy, s.len / 2 + 0.14, 0xfff3c4);
  lb.box(s.w * 0.82, 0.1, 0.06, 0, s.clr + s.bodyH * 0.78, -s.len / 2 - 0.14, 0xff2a3a);
  return { chassis: b.build(), head: hb.build(), tail: tb.build(), barRed, barBlue, lights: lb.build() };
}

const geoCache = new Map<string, Built>();
const charredMat = paletteMaterial({ roughness: 1 });
charredMat.color.setHex(0x2a2a2e);

/** Procedural vehicles: merged chassis + (for the player's car) 4 independently animated wheels. */
export class VehicleFactory {
  // Shared glowing materials: AI vehicles share these so night lighting costs nothing extra.
  static sharedHead = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xfff3c4, emissiveIntensity: 0.6, flatShading: true });
  static sharedTail = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff1030, emissiveIntensity: 1.0, flatShading: true });
  static sirenRed = new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0xff0033, emissiveIntensity: 0.2, flatShading: true });
  static sirenBlue = new THREE.MeshStandardMaterial({ color: 0x0066ff, emissive: 0x0066ff, emissiveIntensity: 0.2, flatShading: true });
  static charred = charredMat;
  /** Unlit vertex-coloured material for the lights of AI cars (they stay bright at night). */
  private static lightsBasic = new THREE.MeshBasicMaterial({ vertexColors: true });
  private static paletteMat = paletteMaterial();
  private static wheelGeo: THREE.BufferGeometry | null = null;
  private static glowTex: THREE.CanvasTexture | null = null;
  private static blobTex: THREE.CanvasTexture | null = null;

  private static wheelGeometry(): THREE.BufferGeometry {
    if (!this.wheelGeo) {
      const b = new MeshBuilder();
      b.cylinder(1, 1, 0.32, 10, 0, 0, 0, 0x1a1a1f, 0, 0, Math.PI / 2);
      b.cylinder(0.58, 0.58, 0.34, 8, 0, 0, 0, 0xc9ccd6, 0, 0, Math.PI / 2);
      for (let k = 0; k < 5; k++) b.rotatedBox(0.36, 0.12, 1.0, 0, 0, 0, k * Math.PI / 5, 0, 0, 0x6b7280);
      b.cylinder(0.16, 0.16, 0.37, 6, 0, 0, 0, 0x2a2d35, 0, 0, Math.PI / 2);
      this.wheelGeo = b.build();
    }
    return this.wheelGeo;
  }

  /** `full` = separate animated wheels, per-car light materials, headlight glow and blob shadow. */
  static create(kind: VehicleKind, color?: number, full = false): VehicleModel {
    const col = color ?? STATS[kind].color;
    const s = SPECS[kind];
    const key = `${kind}:${col}:${full ? 'f' : 'a'}`;
    let built = geoCache.get(key);
    if (!built) {
      built = buildGeometry(kind, col, !full);
      geoCache.set(key, built);
    }
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const chassis = new THREE.Mesh(built.chassis, this.paletteMat);
    chassis.castShadow = full;
    chassis.receiveShadow = full;
    body.add(chassis);

    let headMat = this.sharedHead;
    let tailMat = this.sharedTail;
    if (full) {
      headMat = this.sharedHead.clone();
      tailMat = this.sharedTail.clone();
      body.add(new THREE.Mesh(built.head, headMat));
      body.add(new THREE.Mesh(built.tail, tailMat));
    } else {
      body.add(new THREE.Mesh(built.lights, this.lightsBasic)); // one draw call for both lights
    }
    if (built.barRed) body.add(new THREE.Mesh(built.barRed, this.sirenRed));
    if (built.barBlue) body.add(new THREE.Mesh(built.barBlue, this.sirenBlue));

    const frontPivots: THREE.Group[] = [];
    const wheelMeshes: THREE.Mesh[] = [];
    let headGlow: THREE.Mesh | null = null;
    let blob: THREE.Mesh | null = null;

    if (full) {
      const wg = this.wheelGeometry();
      const wm = this.paletteMat;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * s.wheelX, s.wheelR, sz * s.wheelZ);
        const wheel = new THREE.Mesh(wg, wm);
        wheel.scale.setScalar(s.wheelR);
        wheel.castShadow = true;
        pivot.add(wheel);
        body.add(pivot);
        wheelMeshes.push(wheel);
        if (sz > 0) frontPivots.push(pivot);
      }
      if (!this.glowTex) this.glowTex = glowTexture();
      const glowGeo = new THREE.PlaneGeometry(5.5, 14);
      glowGeo.rotateX(-Math.PI / 2);
      glowGeo.translate(0, 0, s.len / 2 + 7);
      headGlow = new THREE.Mesh(
        glowGeo,
        new THREE.MeshBasicMaterial({
          map: this.glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      headGlow.position.y = 0.07;
      headGlow.visible = false;
      root.add(headGlow);

      if (!this.blobTex) this.blobTex = blobTexture();
      const blobGeo = new THREE.PlaneGeometry(s.w * 2.2, s.len * 1.4);
      blobGeo.rotateX(-Math.PI / 2);
      blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }));
      blob.position.y = 0.06;
      blob.visible = false;
      root.add(blob);
    }
    return { root, body, chassis, frontPivots, wheelMeshes, wheelRadius: s.wheelR, headMat, tailMat, headGlow, blob, full };
  }

  static dispose(model: VehicleModel): void {
    model.root.removeFromParent();
    if (model.full) {
      model.headMat.dispose();
      model.tailMat.dispose();
      model.headGlow?.geometry.dispose();
      model.blob?.geometry.dispose();
    }
  }
}
