import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';

export type District = 'beach' | 'oldtown' | 'downtown' | 'harbor' | 'suburb' | 'park' | 'plaza' | 'water' | 'forest';

/** A 2D footprint the player and cars cannot enter. `h` (when known) is the building's height, so a shot or the camera can pass over a low roof. */
export interface BoxCollider { minX: number; maxX: number; minZ: number; maxZ: number; h?: number }
export interface SmashRef { type: 'hydrant' | 'lamp' | 'palm' | 'bench' | 'newsstand' | 'trash'; index: number; value: number }
export interface CircleCollider { x: number; z: number; r: number; smash?: SmashRef; dead?: boolean }
/** Climbable wedge (no longer placed in the city; kept so the physics code stays generic). */
export interface Ramp { x: number; z: number; dx: number; dz: number; len: number; width: number; h: number }
export interface Spot { x: number; z: number; y?: number }
/** A building the player can climb: ladder on one face, flat roof at height `h`. */
export interface Roof { box: BoxCollider; minX: number; maxX: number; minZ: number; maxZ: number; h: number; ladder: { x: number; z: number; nx: number; nz: number } }

export interface Lot {
  i: number; j: number;
  x0: number; x1: number; z0: number; z1: number;
  district: District;
  /** Water lots: sand rim width around the water. */
  rim?: number;
  /** Part of the river that runs through the city (flat water under the bridges, no sand rim). */
  river?: boolean;
}

/**
 * The road network: vertical lines at xs[i] and horizontal lines at zs[j] with individual spacing and half widths
 * (alleys, streets, avenues, a highway). Some segments are removed (pedestrian streets, superblocks, dead ends).
 */
export interface RoadNet {
  nx: number; nz: number;
  xs: number[]; zs: number[];
  hwX: number[]; hwZ: number[];
  /** segH[j][i]: the road along line j between xs[i] and xs[i+1] exists. */
  segH: boolean[][];
  /** segV[i][j]: the road along line i between zs[j] and zs[j+1] exists. */
  segV: boolean[][];
}
/** A drivable road segment (midpoint, unit direction, length, half width). */
export interface RoadSegment { x: number; z: number; dx: number; dz: number; len: number; hw: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Landmarks {
  garages: Spot[];
  gigs: { rampage: Spot; delivery: Spot; hijack: Spot; brawl: Spot };
  checkpoints: Spot[];
  hijackSpots: { x: number; z: number; h: number }[];
  /** Story locations (all on drivable roads) and the mayor's limo (curb spot with heading). */
  story: { donna: Spot; motel: Spot; hall: Spot; gate: Spot; crates: Spot[]; limo: { x: number; z: number; h: number } };
  /** Golden stars to find while exploring. */
  collectibles: Spot[];
}

export interface World {
  group: THREE.Group;
  lots: Lot[];
  boxes: BoxCollider[];
  circles: CircleCollider[];
  ramps: Ramp[];
  garages: Spot[];
  landmarks: Landmarks;
  roofs: Roof[];
  segments: RoadSegment[];
  bounds: Bounds;
  width: number;
  depth: number;
  windowMaterial: THREE.MeshStandardMaterial;
  signMaterial: THREE.MeshStandardMaterial;
  spawn: { x: number; z: number; heading: number };
  /** Top-down image of the city for the minimap: `scale` pixels per metre, `pad` metres of margin on every side. */
  minimap: { canvas: HTMLCanvasElement; scale: number; pad: number };
}

/** The live road network (set by buildWorld; the traffic AI reads it). */
export let net: RoadNet = { nx: 0, nz: 0, xs: [], zs: [], hwX: [], hwZ: [], segH: [], segV: [] };

const HOUSE_COLORS = [0xf2e3c6, 0xe8c9b0, 0xc9dbe8, 0xd4e8c9, 0xf0d2d2, 0xf7e9a8];
const ROOF_COLORS = [0xb5543a, 0x7a5a45, 0x4a5a7a, 0x8c3b3b];

const PASTELS = [0xf4a7b9, 0xa8d8b9, 0xf7e3af, 0xa9d3f5, 0xd8c2f0, 0xf9c9a0, 0xb9e6e0];
const AWNINGS = [0x2f7fd1, 0xe85a4f, 0x2fb87a, 0xf2a73b, 0x8a5cd6];
const CONTAINER_COLORS = [0xd9534f, 0x2e86c1, 0xf39c12, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x16a085];

function windowTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 256;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const wall = mk();
  const glow = mk();
  const wg = wall.getContext('2d')!;
  const gg = glow.getContext('2d')!;
  wg.fillStyle = '#ffffff';
  wg.fillRect(0, 0, S, S);
  gg.fillStyle = '#000000';
  gg.fillRect(0, 0, S, S);
  // 2x2 window bays per tile; the tile border stays plain wall.
  const lit = [true, false, true, true];
  for (let n = 0; n < 4; n++) {
    const cx = (n % 2) * 128;
    const cy = Math.floor(n / 2) * 128;
    wg.fillStyle = '#5e6d86';
    wg.fillRect(cx + 26, cy + 24, 76, 80);
    wg.fillStyle = '#9fb4d4';
    wg.fillRect(cx + 26, cy + 24, 76, 22);
    wg.fillStyle = '#e9ecf2';
    wg.fillRect(cx + 62, cy + 24, 4, 80);
    if (lit[n]) {
      gg.fillStyle = '#ffd98a';
      gg.fillRect(cx + 28, cy + 28, 72, 72);
    }
  }
  const map = new THREE.CanvasTexture(wall);
  const emissive = new THREE.CanvasTexture(glow);
  for (const t of [map, emissive]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, emissive };
}

const SIGN_TEXTS = ['24h MOTEL', 'DONUTS', 'PIZZA', 'CAFE', 'BAR', 'ARCADE', 'BOOKS', 'SUSHI'];
const SIGN_COLORS = [['#2a2f7a', '#ffd34d'], ['#ff7eb6', '#ffffff'], ['#c0392b', '#fff3c4'], ['#1f7a5a', '#ffffff'], ['#3a2a5a', '#7fe0ff'], ['#101a40', '#ff4d9a'], ['#7a4a1f', '#ffe9b0'], ['#e8f4ff', '#d62828']];

/** One 2x4 atlas holding every shop signboard (a single draw call). Cell (c, r) -> uv rect. */
function signAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1b22';
  g.fillRect(0, 0, 1024, 512);
  SIGN_TEXTS.forEach((text, i) => {
    const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 128;
    const [bg, fg] = SIGN_COLORS[i];
    g.fillStyle = bg; g.fillRect(cx + 6, cy + 6, 500, 116);
    g.lineWidth = 8; g.strokeStyle = fg; g.strokeRect(cx + 14, cy + 14, 484, 100);
    g.font = '900 64px Montserrat, "Noto Sans KR", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, cx + 256, cy + 68, 450);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Procedural asphalt with lane markings. Texture u = across the road, v = along it. */
function roadTexture(avenue: boolean): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4e59';
  g.fillRect(0, 0, W, H);
  for (let n = 0; n < 1400; n++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  g.fillStyle = '#f2c230';
  g.fillRect(W / 2 - 8, 0, 4, H);
  g.fillRect(W / 2 + 4, 0, 4, H);
  g.fillStyle = '#ffffff';
  g.fillRect(8, 0, 4, H); // edge lines
  g.fillRect(W - 12, 0, 4, H);
  if (avenue) {
    for (const x of [W * 0.27, W * 0.73]) g.fillRect(x - 2, 0, 4, H * 0.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function asphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4e59';
  g.fillRect(0, 0, 64, 64);
  for (let n = 0; n < 200; n++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Axis-aligned flat quad batch (roads segments, crosswalk stripes). */
class QuadBatch {
  pos: number[] = [];
  uv: number[] = [];
  /** u spans 0..1 across `across`; v is distance along / tileLen. */
  add(x0: number, x1: number, z0: number, z1: number, y: number, alongX: boolean, tileLen: number): void {
    const lenV = ((alongX ? x1 - x0 : z1 - z0)) / tileLen;
    // two triangles, facing up (+Y)
    const v = [
      [x0, z0], [x0, z1], [x1, z1],
      [x0, z0], [x1, z1], [x1, z0],
    ];
    for (const [x, z] of v) {
      this.pos.push(x, y, z);
      const fx = (x - x0) / (x1 - x0 || 1);
      const fz = (z - z0) / (z1 - z0 || 1);
      if (alongX) this.uv.push(fz, fx * lenV);
      else this.uv.push(fx, fz * lenV);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

export function buildWorld(): World {
  const rng = makeRng(20240601);
  const rand = (a: number, b: number) => a + (b - a) * rng();
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

  const group = new THREE.Group();
  const boxes: BoxCollider[] = [];
  const circles: CircleCollider[] = [];

  // ================================================================ road network
  const NX = 12;
  const NZ = 11;
  // half widths per line: 4.2 alley, 6.5 street, 8-9 avenue, 11 coastal highway
  const hwX = [6.5, 6.5, 4.2, 6.5, 9, 6.5, 6.5, 6.5, 9, 6.5, 4.2, 6.5, 8];
  const hwZ = [6.5, 6.5, 4.2, 6.5, 9, 6.5, 6.5, 9, 6.5, 4.2, 6.5, 11];
  const xs: number[] = [0];
  const zs: number[] = [0];
  for (let i = 0; i < NX; i++) xs.push(xs[i] + Math.max(hwX[i] + hwX[i + 1] + 22, rand(36, 66)));
  for (let j = 0; j < NZ; j++) zs.push(zs[j] + Math.max(hwZ[j] + hwZ[j + 1] + 22, rand(36, 66)));
  const W = xs[NX];
  const D = zs[NZ];
  const SLAB_H = 0.14;

  // ---- districts per cell
  const cellX = (i: number) => (xs[i] + xs[i + 1]) / 2;
  const cellZ = (j: number) => (zs[j] + zs[j + 1]) / 2;
  const districtOf = (i: number, j: number): District => {
    if (j === NZ - 1) return 'beach';
    if (i >= NX - 3) return 'harbor';
    if (i <= 3 && j >= 3) return 'oldtown';
    if (j <= 2 && i <= 7) return 'suburb';
    return 'downtown';
  };
  const cell: District[][] = [];
  for (let i = 0; i < NX; i++) { cell.push([]); for (let j = 0; j < NZ; j++) cell[i].push(districtOf(i, j)); }

  // merged areas: one big lot with no roads inside (harbor basin, forest corners that break up the square outline)
  interface Group { i0: number; i1: number; j0: number; j1: number; district: 'water' | 'forest' }
  const groups: Group[] = [
    { i0: NX - 3, i1: NX - 1, j0: NZ - 3, j1: NZ - 2, district: 'water' },  // harbor basin
    { i0: 0, i1: 1, j0: 0, j1: 1, district: 'forest' },                      // north-west woods
    { i0: NX - 2, i1: NX - 1, j0: 0, j1: 1, district: 'forest' },            // north-east woods
  ];
  const cellGroup: number[][] = Array.from({ length: NX }, () => Array<number>(NZ).fill(-1));
  groups.forEach((g, gi) => {
    for (let i = g.i0; i <= g.i1; i++) for (let j = g.j0; j <= g.j1; j++) { cellGroup[i][j] = gi; cell[i][j] = g.district; }
  });
  const inCells = (i: number, j: number) => i >= 0 && i < NX && j >= 0 && j < NZ;
  const grp = (i: number, j: number) => (inCells(i, j) ? cellGroup[i][j] : -1);
  const sameGroup = (i0: number, j0: number, i1: number, j1: number) => grp(i0, j0) >= 0 && grp(i0, j0) === grp(i1, j1);

  // a river runs north-south through the city; horizontal roads cross it on bridges
  const riverI = 6;
  for (let j = 0; j < NZ; j++) if (cellGroup[riverI][j] < 0) cell[riverI][j] = 'water';
  const isRiver = (i: number, j: number) => inCells(i, j) && i === riverI && cellGroup[i][j] < 0;

  const nearestCell = (tx: number, tz: number, allowed: District[]): [number, number] => {
    let best: [number, number] = [0, 0], bd = Infinity;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      if (!allowed.includes(cell[i][j]) || i === riverI) continue;
      const d = Math.hypot(cellX(i) - tx, cellZ(j) - tz);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    return best;
  };
  const [plazaI, plazaJ] = nearestCell(W * 0.5, D * 0.45, ['downtown']);
  const [lakeI, lakeJ] = nearestCell(W * 0.3, D * 0.1, ['suburb']);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const dcur = cell[i][j];
    if (dcur === 'beach' || dcur === 'harbor' || dcur === 'water' || dcur === 'forest') continue;
    if (i === plazaI && j === plazaJ) cell[i][j] = 'plaza';
    else if (i === lakeI && j === lakeJ) cell[i][j] = 'water';
    else if (rng() < 0.11) cell[i][j] = 'park';
  }

  // ---- which road segments exist
  const segH: boolean[][] = Array.from({ length: NZ + 1 }, () => Array<boolean>(NX).fill(true));
  const segV: boolean[][] = Array.from({ length: NX + 1 }, () => Array<boolean>(NZ).fill(true));
  for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) if (sameGroup(i, j - 1, i, j)) segH[j][i] = false;
  for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) if (sameGroup(i - 1, j, i, j)) segV[i][j] = false;
  // the ring road is dropped around the forest corners so the outline is not a square
  groups.forEach((g) => {
    if (g.district !== 'forest') return;
    for (let i = g.i0; i <= g.i1; i++) { if (g.j0 === 0) segH[0][i] = false; }
    for (let j = g.j0; j <= g.j1; j++) { if (g.i0 === 0) segV[0][j] = false; if (g.i1 === NX - 1) segV[NX][j] = false; }
  });

  const drivable = (hw: number) => hw >= 5.5;
  /** Are all nodes that have a drivable arm reachable from the central avenue crossing? */
  const connected = (): boolean => {
    const arms = (i: number, j: number): [number, number][] => {
      const r: [number, number][] = [];
      if (i < NX && segH[j][i] && drivable(hwZ[j])) r.push([i + 1, j]);
      if (i > 0 && segH[j][i - 1] && drivable(hwZ[j])) r.push([i - 1, j]);
      if (j < NZ && segV[i][j] && drivable(hwX[i])) r.push([i, j + 1]);
      if (j > 0 && segV[i][j - 1] && drivable(hwX[i])) r.push([i, j - 1]);
      return r;
    };
    let total = 0;
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) if (arms(i, j).length) total++;
    const seen = new Set<number>();
    const stack: [number, number][] = [[4, 4]];
    seen.add(4 * 100 + 4);
    while (stack.length) {
      const [i, j] = stack.pop()!;
      for (const [a, b] of arms(i, j)) {
        const k = a * 100 + b;
        if (!seen.has(k)) { seen.add(k); stack.push([a, b]); }
      }
    }
    return seen.size === total;
  };
  if (!connected()) console.warn('road network: base network is not connected');
  // remove ~20 % of the ordinary interior segments (pedestrian streets, superblocks, dead ends) without splitting the city;
  // bridges over the river and roads next to merged areas are kept
  for (let j = 1; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (hwZ[j] >= 9 || grp(i, j - 1) >= 0 || grp(i, j) >= 0 || isRiver(i, j - 1) || isRiver(i, j)) continue;
    if (rng() < 0.2) { segH[j][i] = false; if (!connected()) segH[j][i] = true; }
  }
  for (let i = 1; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (hwX[i] >= 9 || grp(i - 1, j) >= 0 || grp(i, j) >= 0) continue;
    if (rng() < 0.2) { segV[i][j] = false; if (!connected()) segV[i][j] = true; }
  }
  net = { nx: NX, nz: NZ, xs, zs, hwX, hwZ, segH, segV };

  const bounds: Bounds = { minX: -12, maxX: W + 12, minZ: -12, maxZ: D + 34 };

  // ================================================================ ground, sea, backdrop
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xa9b894, roughness: 1 }),
  );
  ground.position.set(W / 2, 0, D / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 700, 44).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xedd9a3, roughness: 1 }),
  );
  sand.position.set(W / 2, 0.01, D + 32);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 900).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2aa7d8, roughness: 0.35, metalness: 0.1 }),
  );
  ocean.position.set(W / 2, -0.05, D + 54 + 450);
  group.add(ocean);

  // low-poly mountain ring on the north, west and east horizons
  {
    const mb = new MeshBuilder();
    const peak = (x: number, z: number) => {
      const h = rand(55, 150);
      const r = h * rand(0.7, 1.1);
      const tone = pick([0x6f8f86, 0x7a9a8a, 0x83a08f, 0x6b8794, 0x8aa59a]);
      mb.cylinder(0, r, h, 5, x, h / 2, z, tone, 0, rand(0, 3), 0);
      if (h > 105) mb.cylinder(0, r * 0.28, h * 0.28, 5, x, h * 0.88, z, 0xf2f6f8, 0, 0, 0);
    };
    for (let n = 0; n < 34; n++) peak(rand(-420, W + 420), rand(-430, -170));       // north
    for (let n = 0; n < 18; n++) peak(rand(-430, -170), rand(-150, D));            // west
    for (let n = 0; n < 18; n++) peak(rand(W + 170, W + 430), rand(-150, D));      // east
    const mm = new THREE.Mesh(mb.build(), paletteMaterial());
    group.add(mm);
  }

  // ================================================================ lots
  const lots: Lot[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      if (grp(i, j) >= 0) continue;
      const river = isRiver(i, j);
      lots.push({
        i, j,
        x0: xs[i] + hwX[i], x1: xs[i + 1] - hwX[i + 1],
        z0: zs[j] + hwZ[j], z1: zs[j + 1] - hwZ[j + 1],
        district: cell[i][j],
        rim: cell[i][j] === 'water' ? (river ? 0 : 2) : undefined,
        river: river || undefined,
      });
    }
  }
  groups.forEach((g) => {
    lots.push({
      i: g.i0, j: g.j0,
      x0: xs[g.i0] + hwX[g.i0], x1: xs[g.i1 + 1] - hwX[g.i1 + 1],
      z0: zs[g.j0] + hwZ[g.j0], z1: zs[g.j1 + 1] - hwZ[g.j1 + 1],
      district: g.district, rim: g.district === 'water' ? 0 : undefined,
    });
  });

  // chunked meshes so the far parts of the larger city can be frustum-culled
  const CH = 200;
  const slabChunks = new Map<string, MeshBuilder>();
  const bldChunks = new Map<string, MeshBuilder>();
  const chunkOf = (m: Map<string, MeshBuilder>, x: number, z: number): MeshBuilder => {
    const k = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
    let b = m.get(k);
    if (!b) { b = new MeshBuilder(); m.set(k, b); }
    return b;
  };

  // ================================================================ roads
  const street = new QuadBatch();
  const avenue = new QuadBatch();
  const junction = new QuadBatch(); // junction squares and alleys (plain asphalt)
  const crosswalk = new QuadBatch();
  const ROAD_Y = 0.03;
  const PAVED = 0xd2cbb9;
  const segments: RoadSegment[] = [];
  const surroundedByGroup = (i: number, j: number) => grp(i - 1, j - 1) >= 0 && grp(i - 1, j - 1) === grp(i, j - 1) && grp(i, j - 1) === grp(i - 1, j) && grp(i - 1, j) === grp(i, j);

  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const cx = xs[i], cz = zs[j];
      const east = i < NX && segH[j][i];
      const west = i > 0 && segH[j][i - 1];
      const south = j < NZ && segV[i][j];
      const north = j > 0 && segV[i][j - 1];
      const degree = +east + +west + +south + +north;
      if (degree > 0) {
        junction.add(cx - hwX[i], cx + hwX[i], cz - hwZ[j], cz + hwZ[j], ROAD_Y, false, 8);
      } else if (!surroundedByGroup(i, j)) {
        chunkOf(slabChunks, cx, cz).box(hwX[i] * 2, SLAB_H, hwZ[j] * 2, cx, SLAB_H / 2, cz, PAVED);
      }
      // crosswalks on the arms of real intersections
      if (degree >= 3) {
        const stripes = (alongX: boolean, sign: number) => {
          const half = alongX ? hwZ[j] : hwX[i];
          if (half < 5.5) return;
          const n = Math.floor((half * 2) / 1.6);
          for (let s = 0; s < n; s++) {
            const off = -half + 0.9 + s * 1.6;
            if (alongX) {
              const px = cx + sign * (hwX[i] + 1.6);
              crosswalk.add(px - 0.9, px + 0.9, cz + off - 0.45, cz + off + 0.45, ROAD_Y + 0.012, true, 1);
            } else {
              const pz = cz + sign * (hwZ[j] + 1.6);
              crosswalk.add(cx + off - 0.45, cx + off + 0.45, pz - 0.9, pz + 0.9, ROAD_Y + 0.012, false, 1);
            }
          }
        };
        if (east) stripes(true, 1);
        if (west) stripes(true, -1);
        if (south) stripes(false, 1);
        if (north) stripes(false, -1);
      }
    }
  }
  const batchFor = (hw: number) => (hw >= 9 ? avenue : hw <= 4.5 ? junction : street);
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x0 = xs[i] + hwX[i], x1 = xs[i + 1] - hwX[i + 1];
      const hw = hwZ[j];
      if (segH[j][i]) {
        batchFor(hw).add(x0, x1, zs[j] - hw, zs[j] + hw, ROAD_Y, true, 8);
        if (drivable(hw)) segments.push({ x: (xs[i] + xs[i + 1]) / 2, z: zs[j], dx: 1, dz: 0, len: xs[i + 1] - xs[i], hw });
        if (isRiver(i, j - 1) || isRiver(i, j)) {
          // bridge over the river: low railings along both edges that also keep cars on the deck
          for (const side of [-1, 1]) {
            const rz = zs[j] + side * (hw - 0.15);
            chunkOf(slabChunks, (x0 + x1) / 2, rz).box(x1 - x0, 0.9, 0.3, (x0 + x1) / 2, 0.45, rz, 0xb9b3a3);
            boxes.push({ minX: x0, maxX: x1, minZ: rz - 0.15, maxZ: rz + 0.15 });
          }
        }
        if (hw >= 11) chunkOf(slabChunks, (x0 + x1) / 2, zs[j]).box(x1 - x0, 0.25, 1.4, (x0 + x1) / 2, 0.125, zs[j], 0x8aa073); // highway median
      } else if (!sameGroup(i, j - 1, i, j)) {
        chunkOf(slabChunks, (x0 + x1) / 2, zs[j]).box(x1 - x0, SLAB_H, hw * 2, (x0 + x1) / 2, SLAB_H / 2, zs[j], PAVED); // pedestrian street
      }
    }
  }
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const z0 = zs[j] + hwZ[j], z1 = zs[j + 1] - hwZ[j + 1];
      const hw = hwX[i];
      if (segV[i][j]) {
        batchFor(hw).add(xs[i] - hw, xs[i] + hw, z0, z1, ROAD_Y, false, 8);
        if (drivable(hw)) segments.push({ x: xs[i], z: (zs[j] + zs[j + 1]) / 2, dx: 0, dz: 1, len: zs[j + 1] - zs[j], hw });
      } else if (!sameGroup(i - 1, j, i, j)) {
        chunkOf(slabChunks, xs[i], (z0 + z1) / 2).box(hw * 2, SLAB_H, z1 - z0, xs[i], SLAB_H / 2, (z0 + z1) / 2, PAVED);
      }
    }
  }
  const roadMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  for (const [batch, mat] of [
    [street, roadMat(roadTexture(false))],
    [avenue, roadMat(roadTexture(true))],
    [junction, roadMat(asphaltTexture())],
  ] as const) {
    const m = new THREE.Mesh(batch.geometry(), mat);
    m.receiveShadow = true;
    group.add(m);
  }
  const cwMesh = new THREE.Mesh(crosswalk.geometry(), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 }));
  cwMesh.receiveShadow = true;
  group.add(cwMesh);

  // ================================================================ sidewalk slabs (per district colour)
  const slabColor: Record<District, number> = {
    beach: 0xe9d6a0, harbor: 0xa7a7a4, oldtown: 0xd9d4c7, downtown: 0xd9d4c7,
    suburb: 0x9ccf86, park: 0x8fc77a, plaza: 0xd2cbb9, water: 0xe9d6a0, forest: 0x5f9a58,
  };
  const waterB = new MeshBuilder();
  for (const lot of lots) {
    const lx = (lot.x0 + lot.x1) / 2, lz = (lot.z0 + lot.z1) / 2;
    if (!lot.river) chunkOf(slabChunks, lx, lz).box(lot.x1 - lot.x0, SLAB_H, lot.z1 - lot.z0, lx, SLAB_H / 2, lz, slabColor[lot.district]);
    if (lot.district === 'park') {
      // crossing footpaths
      const sb = chunkOf(slabChunks, lx, lz);
      sb.box(lot.x1 - lot.x0, 0.02, 2.4, lx, SLAB_H + 0.01, lz, 0xe3d8bc);
      sb.box(2.4, 0.02, lot.z1 - lot.z0, lx, SLAB_H + 0.01, lz, 0xe3d8bc);
    }
    if (lot.district === 'water') {
      const r = lot.rim ?? 0;
      if (lot.river) waterB.box(lot.x1 - lot.x0, 0.05, lot.z1 - lot.z0, lx, 0.0, lz, 0x2a9fd0);
      else waterB.box(lot.x1 - lot.x0 - r * 2, 0.05, lot.z1 - lot.z0 - r * 2, lx, SLAB_H + 0.03, lz, 0x2aa7d8);
      boxes.push({ minX: lot.x0 + r * 0.5, maxX: lot.x1 - r * 0.5, minZ: lot.z0 + r * 0.5, maxZ: lot.z1 - r * 0.5 }); // no driving into the water
    }
  }
  const waterMesh = new THREE.Mesh(waterB.build(), paletteMaterial({ roughness: 0.3, metalness: 0.1 }));
  waterMesh.receiveShadow = true;
  group.add(waterMesh);
  for (const sb of slabChunks.values()) {
    const m = new THREE.Mesh(sb.build(), paletteMaterial());
    m.receiveShadow = true;
    group.add(m);
  }

  // ================================================================ buildings
  const tex = windowTextures();
  const windowMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.85,
    map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
  });
  let bld = new MeshBuilder();
  const TILE_W = 8;
  const TILE_H = 7;
  const WALL_UV = 0.02;

  /** A building box. Side faces get a window grid; top/bottom use plain wall color. */
  const building = (w: number, h: number, d: number, x: number, y0: number, z: number, color: number, windows = true) => {
    const g = bld.box(w, h, d, x, y0 + h / 2, z, color);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let n = 0; n < uv.count; n++) {
      const ny = nrm.getY(n);
      if (!windows || Math.abs(ny) > 0.5) uv.setXY(n, WALL_UV, WALL_UV);
      else {
        const faceW = Math.abs(nrm.getX(n)) > 0.5 ? d : w;
        uv.setXY(n, uv.getX(n) * (faceW / TILE_W), uv.getY(n) * (h / TILE_H));
      }
    }
    return g;
  };
  const plain = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) =>
    building(w, h, d, x, y - h / 2, z, color, false);
  /** A plain-coloured cylinder (UVs parked on the wall texel so the window texture doesn't show). */
  const plainCyl = (rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number) => {
    const g = bld.cylinder(rTop, rBot, h, 16, x, y, z, color);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, WALL_UV, WALL_UV);
  };
  const addBoxCollider = (x: number, z: number, w: number, d: number): BoxCollider => {
    const bx = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    boxes.push(bx);
    return bx;
  };

  const signs: { x: number; z: number; dirX: number; dirZ: number; w: number; idx: number }[] = [];
  let signCount = 0;
  const addSign = (x: number, z: number, dirX: number, dirZ: number, w: number) => {
    if (signCount >= 18) return;
    signs.push({ x, z, dirX, dirZ, w: Math.min(5.6, w * 0.7), idx: signCount % SIGN_TEXTS.length });
    signCount++;
  };

  const awning = (cx: number, cz: number, dirX: number, dirZ: number, len: number) => {
    const color = pick(AWNINGS);
    const strips = 6;
    const sl = len / strips;
    for (let s = 0; s < strips; s++) {
      const off = -len / 2 + sl * (s + 0.5);
      const c = s % 2 === 0 ? color : 0xffffff;
      if (dirZ !== 0) bld.rotatedBox(sl, 0.12, 2.2, cx + off, 3.7, cz + dirZ * 1.0, dirZ * 0.38, 0, 0, c);
      else bld.rotatedBox(2.2, 0.12, sl, cx + dirX * 1.0, 3.7, cz + off, 0, 0, -dirX * 0.38, c);
    }
  };
  const roofExtras = (x: number, z: number, w: number, d: number, h: number) => {
    plain(w + 0.5, 0.55, d + 0.5, x, h + 0.55, z, 0xece6d8); // parapet trim
    if (rng() < 0.8) plain(1.8, 1.0, 1.4, x + rand(-w / 3, w / 3), h + 1.05, z + rand(-d / 3, d / 3), 0x9aa0ad); // AC unit
  };
  /** A suburban house with a pitched roof (a box whose top edge is collapsed into a ridge). */
  const house = (x: number, z: number, w: number, d: number, dirZ: number) => {
    const h = rand(3.6, 4.6);
    building(w, h, d, x, 0, z, pick(HOUSE_COLORS));
    const rh = rand(2.2, 3.0);
    bld.box(w + 0.8, rh, d + 0.8, x, h + rh / 2, z, pick(ROOF_COLORS), (p) => {
      for (let n = 0; n < p.count; n++) if (p.getY(n) > 0) p.setX(n, 0);
    });
    plain(1.1, 2.1, 0.2, x + rand(-w / 4, w / 4), 2.1, z + dirZ * (d / 2 + 0.05), 0x6b4a2e); // front door
    plain(0.5, 2.6, 0.5, x + w / 2 - 1, h + 3.1, z, 0xb08968);                                  // chimney
    addBoxCollider(x, z, w, d).h = h + rh + 1;
  };

  const roofCands: { box: BoxCollider; h: number; x: number; z: number; w: number; d: number; nx: number; nz: number; off: number }[] = [];
  const downtownCx = W * 0.5, downtownCz = D * 0.4;
  for (const lot of lots) {
    const lx = (lot.x0 + lot.x1) / 2, lz = (lot.z0 + lot.z1) / 2;
    bld = chunkOf(bldChunks, lx, lz);
    const inset = 3;
    const fx0 = lot.x0 + inset, fx1 = lot.x1 - inset, fz0 = lot.z0 + inset, fz1 = lot.z1 - inset;
    const fw = fx1 - fx0, fd = fz1 - fz0;
    const cx = (fx0 + fx1) / 2, cz = (fz0 + fz1) / 2;

    switch (lot.district) {
      case 'downtown': {
        const dist = Math.hypot(lx - downtownCx, lz - downtownCz) / (W * 0.5);
        const heightScale = Math.max(0.42, 1.4 - dist * 1.5);
        const split = fw > 24 && rng() < 0.3;
        const towers = split
          ? [{ x: fx0 + fw * 0.25, z: cz, w: fw * 0.46, d: fd }, { x: fx0 + fw * 0.75, z: cz, w: fw * 0.46, d: fd }]
          : [{ x: cx, z: cz, w: fw, d: fd }];
        for (const t of towers) {
          const color = pick(PASTELS);
          let y = 0;
          const h1 = rand(14, 26) * heightScale;
          building(t.w, h1, t.d, t.x, y, t.z, color);
          const towerBox = addBoxCollider(t.x, t.z, t.w, t.d);
          y += h1;
          const h2 = rand(12, 34) * heightScale;
          building(t.w * 0.8, h2, t.d * 0.8, t.x, y, t.z, color);
          y += h2;
          if (heightScale > 0.8 && rng() < 0.75) {
            const h3 = rand(10, 26) * heightScale;
            building(t.w * 0.55, h3, t.d * 0.55, t.x, y, t.z, color);
            y += h3;
          }
          plain(t.w * 0.3, 2.2, t.d * 0.3, t.x, y + 2.2, t.z, 0x9aa0ad);
          towerBox.h = y + 4.4;
        }
        break;
      }
      case 'oldtown': {
        const alongX = fw >= fd;
        const n = fw * fd > 700 ? 2 : 1;
        for (let s = 0; s < n; s++) {
          const gap = 0.6;
          const w = alongX ? (fw - gap * (n - 1)) / n : fw;
          const d = alongX ? fd : (fd - gap * (n - 1)) / n;
          const x = alongX ? fx0 + w / 2 + s * (w + gap) : cx;
          const z = alongX ? cz : fz0 + d / 2 + s * (d + gap);
          const h = rand(7, 11);
          building(w, h, d, x, 0, z, pick(PASTELS));
          const colBox = addBoxCollider(x, z, w, d);
          colBox.h = h + 1.2;
          roofExtras(x, z, w, d, h);
          if (alongX) {
            const dirZ = rng() < 0.5 ? -1 : 1;
            roofCands.push({ box: colBox, h, x, z, w, d, nx: 0, nz: dirZ, off: w * 0.36 });
            awning(x, z + dirZ * d / 2, 0, dirZ, w * 0.82);
            addSign(x, z + dirZ * d / 2, 0, dirZ, w);
          } else {
            const dirX = rng() < 0.5 ? -1 : 1;
            roofCands.push({ box: colBox, h, x, z, w, d, nx: dirX, nz: 0, off: d * 0.36 });
            awning(x + dirX * w / 2, z, dirX, 0, d * 0.82);
            addSign(x + dirX * w / 2, z, dirX, 0, d);
          }
        }
        break;
      }
      case 'harbor': {
        if (rng() < 0.4) {
          const h = rand(9, 13);
          building(fw, h, fd, cx, 0, cz, pick([0xc9ced8, 0xe2c48f, 0xa9bdd1]), false);
          bld.box(fw + 0.6, 2.2, fd * 0.55, cx, h + 1.1, cz, 0x7d8696, (p) => {
            for (let n = 0; n < p.count; n++) if (p.getY(n) > 0) p.setX(n, p.getX(n) * 0.55);
          });
          addBoxCollider(cx, cz, fw, fd).h = h + 2.2;
        } else {
          const cw = 6, ch = 2.4, cd = 2.6, gap = 1.6;
          const nx = Math.max(1, Math.floor((fw + gap) / (cw + gap)));
          const nz = Math.max(1, Math.floor((fd + gap) / (cd + gap)));
          const totalW = nx * cw + (nx - 1) * gap;
          const totalD = nz * cd + (nz - 1) * gap;
          for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
            const stack = 1 + Math.floor(rng() * 3);
            const px = cx - totalW / 2 + cw / 2 + ix * (cw + gap);
            const pz = cz - totalD / 2 + cd / 2 + iz * (cd + gap);
            for (let s = 0; s < stack; s++) {
              bld.box(cw, ch, cd, px, ch / 2 + s * ch, pz, pick(CONTAINER_COLORS));
              bld.box(cw + 0.05, 0.12, cd + 0.05, px, ch * (s + 1) - 0.06, pz, 0x555a66);
            }
            addBoxCollider(px, pz, cw, cd).h = ch * 2;
          }
        }
        break;
      }
      case 'suburb': {
        // one or two houses with gardens, front doors toward the nearer horizontal road
        const dirZ = lz < D * 0.5 ? 1 : -1;
        const count = fw > 28 ? 2 : 1;
        for (let s = 0; s < count; s++) {
          const w = Math.min(11, fw / count - 3), d = Math.min(9, fd - 6);
          if (w < 6 || d < 5) continue;
          const x = count === 1 ? cx + rand(-2, 2) : fx0 + (fw / count) * (s + 0.5);
          house(x, cz + rand(-2, 2), w, d, dirZ);
        }
        break;
      }
      case 'plaza': {
        // a stone square with a fountain in the middle
        plainCyl(4.6, 4.8, 0.7, lx, 0.35 + SLAB_H, lz, 0xcfc8b8);
        plainCyl(4.0, 4.0, 0.5, lx, 0.62 + SLAB_H, lz, 0x5ec4ff);
        plainCyl(0.55, 0.7, 2.4, lx, 1.2 + SLAB_H, lz, 0xcfc8b8);
        plainCyl(1.5, 1.2, 0.35, lx, 2.5 + SLAB_H, lz, 0xcfc8b8);
        plainCyl(0.18, 0.5, 1.4, lx, 3.2 + SLAB_H, lz, 0xb6e6ff);
        circles.push({ x: lx, z: lz, r: 4.9 });
        break;
      }
      case 'beach': {
        if (rng() < 0.55) {
          const w = fw * rand(0.5, 0.75);
          const d = fd * 0.4;
          const x = cx + rand(-2, 2);
          const z = lot.z0 + inset + d / 2 + 0.5;
          const h = rand(4, 6);
          building(w, h, d, x, 0, z, pick(PASTELS));
          addBoxCollider(x, z, w, d).h = h + 1.2;
          roofExtras(x, z, w, d, h);
          awning(x, z + d / 2, 0, 1, w * 0.8);
        }
        break;
      }
      case 'water': {
        if (lot.rim === 0 && !lot.river) {
          // harbor basin: a few moored boats
          for (let n = 0; n < 5; n++) {
            const bx = rand(lot.x0 + 12, lot.x1 - 12), bz = rand(lot.z0 + 10, lot.z1 - 10);
            building(7, 1.3, 2.6, bx, 0, bz, pick([0xd9534f, 0x2e86c1, 0xf2f2f2, 0xf39c12]), false);
            building(2.6, 1.4, 2.2, bx - 0.8, 1.3, bz, 0xffffff, false);
          }
        }
        break;
      }
      default:
        break; // parks: only trees, benches and paths
    }
  }
  // ================================================================ climbable roofs: up to 10 old-town buildings get a ladder
  const roofs: Roof[] = [];
  {
    const order = roofCands.map((c, i) => ({ c, k: rng(), i })).sort((a, b) => a.k - b.k).map((q) => q.c);
    for (const c of order) {
      if (roofs.length >= 10) break;
      const fx = c.x + c.nx * c.w / 2, fz = c.z + c.nz * c.d / 2;
      const lx = c.nz !== 0 ? c.x + c.off : fx, lz = c.nz !== 0 ? fz : c.z + c.off;
      if (roofs.some((r) => Math.hypot(r.ladder.x - lx, r.ladder.z - lz) < 70)) continue;
      const bx = lx + c.nx * 0.55, bz = lz + c.nz * 0.55;
      // the ladder foot must be on open ground (not inside another building)
      if (boxes.some((b) => b !== c.box && bx > b.minX - 0.4 && bx < b.maxX + 0.4 && bz > b.minZ - 0.4 && bz < b.maxZ + 0.4)) continue;
      const lb = chunkOf(bldChunks, lx, lz);
      const across = c.nz !== 0 ? 1 : 0; // rails spread along x when the face runs along x
      for (const s of [-0.3, 0.3]) lb.box(across ? 0.07 : 0.07, c.h + 0.9, across ? 0.07 : 0.07, lx + (across ? s : 0) + c.nx * 0.12, (c.h + 0.9) / 2, lz + (across ? 0 : s) + c.nz * 0.12, 0xd8b44a);
      for (let y = 0.4; y < c.h + 0.6; y += 0.5) lb.box(across ? 0.62 : 0.06, 0.06, across ? 0.06 : 0.62, lx + c.nx * 0.12, y, lz + c.nz * 0.12, 0xc9a23c);
      roofs.push({ box: c.box, minX: c.box.minX, maxX: c.box.maxX, minZ: c.box.minZ, maxZ: c.box.maxZ, h: c.h, ladder: { x: bx, z: bz, nx: c.nx, nz: c.nz } });
    }
  }
  for (const bb of bldChunks.values()) {
    const m = new THREE.Mesh(bb.build(), windowMaterial);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const ramps: Ramp[] = []; // no jump ramps: the city has no stunt wedges on its roads

  // ================================================================ shop signboards
  const signMaterial = new THREE.MeshStandardMaterial({
    map: signAtlas(), flatShading: true, roughness: 0.7, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.15,
  });
  signMaterial.emissiveMap = signMaterial.map;
  {
    const geos: THREE.BufferGeometry[] = [];
    for (const sg of signs) {
      const along = sg.dirZ !== 0;
      const g = new THREE.BoxGeometry(along ? sg.w : 0.3, 1.5, along ? 0.3 : sg.w);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const front = along ? (sg.dirZ > 0 ? 4 : 5) : (sg.dirX > 0 ? 0 : 1);
      const col = sg.idx % 2, row = Math.floor(sg.idx / 2);
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          if (f === front) uv.setXY(i, col * 0.5 + uv.getX(i) * 0.5, 1 - row * 0.25 - 0.25 + uv.getY(i) * 0.25);
          else uv.setXY(i, 0.5 * col + 0.003, 1 - row * 0.25 - 0.01);
        }
      }
      g.translate(sg.x + sg.dirX * 0.2, 5.6, sg.z + sg.dirZ * 0.2);
      geos.push(g);
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, signMaterial);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }

  // ================================================================ landmarks (garages, gigs, spawn) on real roads
  const pickSeg = (tx: number, tz: number, avoid: Spot[] = [], avoidDist = 60, minLen = 34): RoadSegment => {
    let best = segments[0], bd = Infinity;
    for (const s of segments) {
      if (s.len < minLen) continue;
      if (avoid.some((a) => Math.hypot(a.x - s.x, a.z - s.z) < avoidDist)) continue;
      const d = Math.hypot(s.x - tx, s.z - tz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  const garages: Spot[] = [];
  for (const [u, v] of [[0.14, 0.62], [0.9, 0.4], [0.5, 0.42], [0.28, 0.16], [0.45, 0.9]] as const) {
    const s = pickSeg(W * u, D * v, garages, 70);
    garages.push({ x: s.x, z: s.z });
  }
  const used: Spot[] = [...garages];
  const gigSpot = (u: number, v: number): Spot => { const s = pickSeg(W * u, D * v, used, 45); const p = { x: s.x, z: s.z }; used.push(p); return p; };
  const gigs = { rampage: gigSpot(0.1, 0.75), delivery: gigSpot(0.62, 0.1), hijack: gigSpot(0.82, 0.7), brawl: gigSpot(0.38, 0.55) };
  const checkpoints: Spot[] = [gigSpot(0.72, 0.2), gigSpot(0.2, 0.82), gigSpot(0.7, 0.78)];
  const curb = (u: number, v: number): { x: number; z: number; h: number } => {
    const s = pickSeg(W * u, D * v, used, 40);
    used.push({ x: s.x, z: s.z });
    const off = s.hw - 2.2;
    return { x: s.x + -s.dz * off, z: s.z + s.dx * off, h: Math.atan2(s.dx, s.dz) };
  };
  const hijackSpots = [curb(0.45, 0.3), curb(0.12, 0.45), curb(0.78, 0.35)];
  // story locations: Donna's donut shop and the 24h motel (Old Town), City Hall by the plaza, the harbor gate and three crates
  const plazaLot = lots.find((l) => l.district === 'plaza');
  const hallSeg = plazaLot ? pickSeg((plazaLot.x0 + plazaLot.x1) / 2, plazaLot.z1 + 6, [], 0, 30) : pickSeg(W * 0.5, D * 0.45, [], 0, 30);
  const hall: Spot = { x: hallSeg.x, z: hallSeg.z };
  used.push(hall);
  const story = {
    donna: gigSpot(0.18, 0.72),
    motel: gigSpot(0.07, 0.5),
    hall,
    gate: gigSpot(0.86, 0.16),
    crates: [gigSpot(0.9, 0.42), gigSpot(0.8, 0.28), gigSpot(0.93, 0.6)],
    limo: curb(0.6, 0.27),
  };
  // golden stars scattered along the drivable roads
  const collectibles: Spot[] = [];
  for (let tries = 0; tries < 400 && collectibles.length < 12; tries++) {
    const s = segments[Math.floor(rng() * segments.length)];
    if (s.len < 34) continue;
    const t = rand(-s.len * 0.3, s.len * 0.3), lat = rand(-s.hw * 0.6, s.hw * 0.6);
    const p = { x: s.x + s.dx * t + -s.dz * lat, z: s.z + s.dz * t + s.dx * lat };
    if (used.some((u) => Math.hypot(u.x - p.x, u.z - p.z) < 30) || collectibles.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 60)) continue;
    collectibles.push(p);
  }
  // rooftop stars: four of the golden stars sit on climbable roofs
  for (const r of roofs.slice(0, 4)) collectibles.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, y: r.h });
  const landmarks: Landmarks = { garages, gigs, checkpoints, hijackSpots, story, collectibles };

  const sp = pickSeg(W * 0.5, D * 0.58, [], 0, 60);
  const lane = Math.min(3.3, sp.hw * 0.52);
  const spawn = { x: sp.x + -sp.dz * lane, z: sp.z + sp.dx * lane, heading: Math.atan2(sp.dx, sp.dz) };

  // ================================================================ minimap image
  const MM = 2; // px per metre
  const PAD = 60;
  const mm = document.createElement('canvas');
  mm.width = Math.ceil((W + PAD * 2) * MM);
  mm.height = Math.ceil((D + PAD * 2) * MM);
  const mg = mm.getContext('2d')!;
  mg.fillStyle = '#2d3b4a';
  mg.fillRect(0, 0, mm.width, mm.height);
  mg.translate(PAD * MM, PAD * MM);
  mg.fillStyle = '#1f6f8f';
  mg.fillRect(-PAD * MM, (D + 40) * MM, mm.width, 80 * MM);
  mg.fillStyle = '#c8b983';
  mg.fillRect(-PAD * MM, (D + 8) * MM, mm.width, 32 * MM);
  const mapColor: Record<District, string> = {
    beach: '#cdbb86', oldtown: '#a7826f', downtown: '#7f8da1', harbor: '#7c7f7a',
    suburb: '#8fb27a', park: '#6fae5c', plaza: '#c9c2b0', water: '#1f8fc0', forest: '#4f8f4a',
  };
  for (const lot of lots) {
    mg.fillStyle = mapColor[lot.district];
    mg.fillRect(lot.x0 * MM, lot.z0 * MM, (lot.x1 - lot.x0) * MM, (lot.z1 - lot.z0) * MM);
  }
  mg.fillStyle = '#b9b3a3'; // pedestrian streets where a road segment was removed
  for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) {
    if (!segH[j][i] && !sameGroup(i, j - 1, i, j)) mg.fillRect((xs[i] + hwX[i]) * MM, (zs[j] - hwZ[j]) * MM, (xs[i + 1] - hwX[i + 1] - xs[i] - hwX[i]) * MM, hwZ[j] * 2 * MM);
  }
  for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) {
    if (!segV[i][j] && !sameGroup(i - 1, j, i, j)) mg.fillRect((xs[i] - hwX[i]) * MM, (zs[j] + hwZ[j]) * MM, hwX[i] * 2 * MM, (zs[j + 1] - hwZ[j + 1] - zs[j] - hwZ[j]) * MM);
  }
  mg.fillStyle = '#9aa3b5';
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const hasArm = (i < NX && segH[j][i]) || (i > 0 && segH[j][i - 1]) || (j < NZ && segV[i][j]) || (j > 0 && segV[i][j - 1]);
    if (hasArm) mg.fillRect((xs[i] - hwX[i]) * MM, (zs[j] - hwZ[j]) * MM, hwX[i] * 2 * MM, hwZ[j] * 2 * MM);
  }
  for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) {
    if (segH[j][i]) mg.fillRect((xs[i] + hwX[i]) * MM, (zs[j] - hwZ[j]) * MM, (xs[i + 1] - hwX[i + 1] - xs[i] - hwX[i]) * MM, hwZ[j] * 2 * MM);
  }
  for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) {
    if (segV[i][j]) mg.fillRect((xs[i] - hwX[i]) * MM, (zs[j] + hwZ[j]) * MM, hwX[i] * 2 * MM, (zs[j + 1] - hwZ[j + 1] - zs[j] - hwZ[j]) * MM);
  }

  return {
    group, lots, boxes, circles, ramps, garages, landmarks, roofs, segments, bounds, width: W, depth: D,
    windowMaterial, signMaterial, spawn, minimap: { canvas: mm, scale: MM, pad: PAD },
  };
}
