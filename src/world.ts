import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';

export const CELL = 40;
export const GRID = 8;
export const WORLD_SIZE = CELL * GRID; // 320 m
export const BOUNDS = { minX: -10, maxX: WORLD_SIZE + 10, minZ: -10, maxZ: WORLD_SIZE + 32 };

export type District = 'beach' | 'oldtown' | 'downtown' | 'harbor';

export interface BoxCollider { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SmashRef { type: 'hydrant' | 'lamp' | 'palm' | 'bench' | 'newsstand' | 'trash'; index: number; value: number }
export interface CircleCollider { x: number; z: number; r: number; smash?: SmashRef; dead?: boolean }
/** Climbable wedge. (dx,dz) is the uphill direction; (x,z) is the center. */
export interface Ramp { x: number; z: number; dx: number; dz: number; len: number; width: number; h: number }
export interface Spot { x: number; z: number }

export interface Lot {
  i: number; j: number;
  x0: number; x1: number; z0: number; z1: number;
  district: District;
}

export interface World {
  group: THREE.Group;
  lots: Lot[];
  boxes: BoxCollider[];
  circles: CircleCollider[];
  ramps: Ramp[];
  garages: Spot[];
  windowMaterial: THREE.MeshStandardMaterial;
  signMaterial: THREE.MeshStandardMaterial;
  spawn: { x: number; z: number; heading: number };
  /** Draws a top-down image of the city for the minimap. */
  minimapCanvas: HTMLCanvasElement;
}

/** Half road width of grid line i (the central avenue is wider). */
export const roadHalfWidth = (i: number): number => (i === 4 ? 9 : 6.5);

export function districtOf(i: number, j: number): District {
  if (j === GRID - 1) return 'beach';
  if (i >= 6) return 'harbor';
  if (i <= 2) return 'oldtown';
  return 'downtown';
}

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

  // ---------- ground ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb9b3a3, roughness: 1 }),
  );
  ground.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE + 400, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xedd9a3, roughness: 1 }),
  );
  sand.position.set(WORLD_SIZE / 2, 0.01, WORLD_SIZE + 26);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 600).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2aa7d8, roughness: 0.35, metalness: 0.1 }),
  );
  ocean.position.set(WORLD_SIZE / 2, -0.05, WORLD_SIZE + 46 + 300);
  group.add(ocean);

  // ---------- lots ----------
  const lots: Lot[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      lots.push({
        i, j,
        x0: i * CELL + roadHalfWidth(i),
        x1: (i + 1) * CELL - roadHalfWidth(i + 1),
        z0: j * CELL + roadHalfWidth(j),
        z1: (j + 1) * CELL - roadHalfWidth(j + 1),
        district: districtOf(i, j),
      });
    }
  }

  // ---------- roads ----------
  const street = new QuadBatch();
  const avenue = new QuadBatch();
  const junction = new QuadBatch();
  const crosswalk = new QuadBatch();
  const ROAD_Y = 0.03;

  for (let a = 0; a <= GRID; a++) {
    for (let b = 0; b <= GRID; b++) {
      const hwA = roadHalfWidth(a); // along x at z = a*CELL  (a = row line)
      const hwB = roadHalfWidth(b); // along z at x = b*CELL  (b = column line)
      // intersection square at (x = b*CELL, z = a*CELL)
      const cx = b * CELL;
      const cz = a * CELL;
      junction.add(cx - hwB, cx + hwB, cz - hwA, cz + hwA, ROAD_Y, false, 8);
      // crosswalk stripes on each arm
      const addStripes = (alongX: boolean, sign: number) => {
        const stripes = Math.floor((alongX ? hwA : hwB) * 2 / 1.6);
        for (let s = 0; s < stripes; s++) {
          const off = -(alongX ? hwA : hwB) + 0.9 + s * 1.6;
          if (alongX) {
            const px = cx + sign * (hwB + 1.6);
            crosswalk.add(px - 0.9, px + 0.9, cz + off - 0.45, cz + off + 0.45, ROAD_Y + 0.012, true, 1);
          } else {
            const pz = cz + sign * (hwA + 1.6);
            crosswalk.add(cx + off - 0.45, cx + off + 0.45, pz - 0.9, pz + 0.9, ROAD_Y + 0.012, false, 1);
          }
        }
      };
      // arms exist only where the road continues
      if (b > 0) addStripes(true, -1);
      if (b < GRID) addStripes(true, 1);
      if (a > 0) addStripes(false, -1);
      if (a < GRID) addStripes(false, 1);
      // road segment to the next intersection (east / south)
      if (b < GRID) {
        const x0 = b * CELL + roadHalfWidth(b);
        const x1 = (b + 1) * CELL - roadHalfWidth(b + 1);
        const batch = a === 4 ? avenue : street;
        batch.add(x0, x1, cz - hwA, cz + hwA, ROAD_Y, true, 8);
      }
      if (a < GRID) {
        const z0 = a * CELL + roadHalfWidth(a);
        const z1 = (a + 1) * CELL - roadHalfWidth(a + 1);
        (b === 4 ? avenue : street).add(cx - hwB, cx + hwB, z0, z1, ROAD_Y, false, 8);
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
  const cwMesh = new THREE.Mesh(
    crosswalk.geometry(),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 }),
  );
  cwMesh.receiveShadow = true;
  group.add(cwMesh);

  // ---------- sidewalk slabs ----------
  const slabs = new MeshBuilder();
  const SLAB_H = 0.14;
  for (const lot of lots) {
    const color = lot.district === 'beach' ? 0xe9d6a0 : lot.district === 'harbor' ? 0xa7a7a4 : 0xd9d4c7;
    slabs.box(lot.x1 - lot.x0, SLAB_H, lot.z1 - lot.z0, (lot.x0 + lot.x1) / 2, SLAB_H / 2, (lot.z0 + lot.z1) / 2, color);
  }
  const slabMesh = new THREE.Mesh(slabs.build(), paletteMaterial());
  slabMesh.receiveShadow = true;
  group.add(slabMesh);

  // ---------- buildings ----------
  const tex = windowTextures();
  const windowMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    map: tex.map,
    emissiveMap: tex.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
  });
  const bld = new MeshBuilder();
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
      if (!windows || Math.abs(ny) > 0.5) {
        uv.setXY(n, WALL_UV, WALL_UV);
      } else {
        const faceW = Math.abs(nrm.getX(n)) > 0.5 ? d : w;
        uv.setXY(n, uv.getX(n) * (faceW / TILE_W), uv.getY(n) * (h / TILE_H));
      }
    }
    return g;
  };
  const plain = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) =>
    building(w, h, d, x, y - h / 2, z, color, false);

  const addBoxCollider = (x: number, z: number, w: number, d: number) =>
    boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  const signs: { x: number; z: number; dirX: number; dirZ: number; w: number; idx: number }[] = [];
  let signCount = 0;
  const addSign = (x: number, z: number, dirX: number, dirZ: number, w: number) => {
    if (signCount >= 14) return;
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
      if (dirZ !== 0) {
        bld.rotatedBox(sl, 0.12, 2.2, cx + off, 3.7, cz + dirZ * 1.0, dirZ * 0.38, 0, 0, c);
      } else {
        bld.rotatedBox(2.2, 0.12, sl, cx + dirX * 1.0, 3.7, cz + off, 0, 0, -dirX * 0.38, c);
      }
    }
  };

  const roofExtras = (x: number, z: number, w: number, d: number, h: number) => {
    plain(w + 0.5, 0.55, d + 0.5, x, h + 0.55, z, 0xece6d8); // parapet trim
    if (rng() < 0.8) plain(1.8, 1.0, 1.4, x + rand(-w / 3, w / 3), h + 1.05, z + rand(-d / 3, d / 3), 0x9aa0ad); // AC unit
  };

  for (const lot of lots) {
    const inset = 3;
    const fx0 = lot.x0 + inset;
    const fx1 = lot.x1 - inset;
    const fz0 = lot.z0 + inset;
    const fz1 = lot.z1 - inset;
    const fw = fx1 - fx0;
    const fd = fz1 - fz0;
    const cx = (fx0 + fx1) / 2;
    const cz = (fz0 + fz1) / 2;

    if (lot.district === 'downtown') {
      // distance from the downtown center makes the towers taller
      const dist = Math.hypot(lot.i - 4, (lot.j - 1.5) * 0.9);
      const heightScale = Math.max(0.45, 1.25 - dist * 0.28);
      const split = rng() < 0.3;
      const towers = split
        ? [
            { x: fx0 + fw * 0.25, z: cz, w: fw * 0.46, d: fd },
            { x: fx0 + fw * 0.75, z: cz, w: fw * 0.46, d: fd },
          ]
        : [{ x: cx, z: cz, w: fw, d: fd }];
      for (const t of towers) {
        const color = pick(PASTELS);
        let y = 0;
        const h1 = rand(14, 26) * heightScale;
        building(t.w, h1, t.d, t.x, y, t.z, color);
        addBoxCollider(t.x, t.z, t.w, t.d);
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
      }
    } else if (lot.district === 'oldtown') {
      const alongX = fw >= fd;
      const n = 2;
      for (let s = 0; s < n; s++) {
        const gap = 0.6;
        const w = alongX ? (fw - gap) / n : fw;
        const d = alongX ? fd : (fd - gap) / n;
        const x = alongX ? fx0 + w / 2 + s * (w + gap) : cx;
        const z = alongX ? cz : fz0 + d / 2 + s * (d + gap);
        const h = rand(7, 11);
        const color = pick(PASTELS);
        building(w, h, d, x, 0, z, color);
        addBoxCollider(x, z, w, d);
        roofExtras(x, z, w, d, h);
        // storefront faces the nearest road along the short axis
        if (alongX) {
          const dirZ = lot.j < 4 ? -1 : 1;
          awning(x, z + dirZ * d / 2, 0, dirZ, w * 0.82);
          addSign(x, z + dirZ * d / 2, 0, dirZ, w);
        } else {
          const dirX = lot.i < 4 ? -1 : 1;
          awning(x + dirX * w / 2, z, dirX, 0, d * 0.82);
          addSign(x + dirX * w / 2, z, dirX, 0, d);
        }
      }
    } else if (lot.district === 'harbor') {
      if (rng() < 0.4) {
        const h = rand(9, 13);
        const color = pick([0xc9ced8, 0xe2c48f, 0xa9bdd1]);
        building(fw, h, fd, cx, 0, cz, color, false);
        bld.box(fw + 0.6, 2.2, fd * 0.55, cx, h + 1.1, cz, 0x7d8696, (p) => {
          for (let n = 0; n < p.count; n++) if (p.getY(n) > 0) p.setX(n, p.getX(n) * 0.55);
        });
        addBoxCollider(cx, cz, fw, fd);
      } else {
        // container yard with 1.5 m alleys
        const cw = 6, ch = 2.4, cd = 2.6, gap = 1.6;
        const nx = Math.max(1, Math.floor((fw + gap) / (cw + gap)));
        const nz = Math.max(1, Math.floor((fd + gap) / (cd + gap)));
        const totalW = nx * cw + (nx - 1) * gap;
        const totalD = nz * cd + (nz - 1) * gap;
        for (let ix = 0; ix < nx; ix++) {
          for (let iz = 0; iz < nz; iz++) {
            const stack = 1 + Math.floor(rng() * 3);
            const px = cx - totalW / 2 + cw / 2 + ix * (cw + gap);
            const pz = cz - totalD / 2 + cd / 2 + iz * (cd + gap);
            for (let s = 0; s < stack; s++) {
              bld.box(cw, ch, cd, px, ch / 2 + s * ch, pz, pick(CONTAINER_COLORS));
              bld.box(cw + 0.05, 0.12, cd + 0.05, px, ch * (s + 1) - 0.06, pz, 0x555a66);
            }
            addBoxCollider(px, pz, cw, cd);
          }
        }
      }
    } else {
      // beach: low pastel cafes on about half the lots
      if (rng() < 0.55) {
        const w = fw * rand(0.5, 0.75);
        const d = fd * 0.4;
        const x = cx + rand(-2, 2);
        const z = lot.z0 + inset + d / 2 + 0.5;
        const h = rand(4, 6);
        building(w, h, d, x, 0, z, pick(PASTELS));
        addBoxCollider(x, z, w, d);
        roofExtras(x, z, w, d, h);
        awning(x, z + d / 2, 0, 1, w * 0.8);
      }
    }
  }
  const buildingMesh = new THREE.Mesh(bld.build(), windowMaterial);
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  group.add(buildingMesh);

  // ---------- jump ramps ----------
  const ramps: Ramp[] = [
    { x: 66, z: 320, dx: 1, dz: 0, len: 10, width: 9, h: 3.2 },   // coastal highway, eastbound (stunt jump)
    { x: 282, z: 320, dx: -1, dz: 0, len: 10, width: 9, h: 3.2 }, // coastal highway, westbound
    { x: 165, z: 118, dx: 0, dz: -1, len: 10, width: 9, h: 3.2 }, // downtown avenue, northbound
    { x: 240, z: 196, dx: 0, dz: 1, len: 10, width: 9, h: 3.2 },  // harbor road, southbound
  ];
  const rb = new MeshBuilder();
  for (const r of ramps) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(r.x, r.h / 2, r.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(r.dx, r.dz), 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const g = new THREE.BoxGeometry(r.width, r.h, r.len);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 0 && pos.getY(i) > 0) pos.setY(i, -r.h / 2);
    rb.add(g, 0xff8c00, m);
    for (const sx of [-1, 1]) {
      const side = new THREE.Matrix4().compose(
        new THREE.Vector3(r.x - r.dz * sx * (r.width / 2 + 0.1), 0.2, r.z + r.dx * sx * (r.width / 2 + 0.1)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(r.dx, r.dz), 0)),
        new THREE.Vector3(1, 1, 1),
      );
      rb.add(new THREE.BoxGeometry(0.2, 0.4, r.len), 0xffffff, side);
    }
  }
  const rampMesh = new THREE.Mesh(rb.build(), paletteMaterial());
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;
  group.add(rampMesh);

  const garages: Spot[] = [
    { x: 80, z: 220 },   // Old Town
    { x: 240, z: 100 },  // Harbor
    { x: 160, z: 60 },   // Downtown avenue
  ];

  // ---------- shop signboards ----------
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
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each). The front is the face looking along the sign direction.
      const front = along ? (sg.dirZ > 0 ? 4 : 5) : (sg.dirX > 0 ? 0 : 1);
      const col = sg.idx % 2, row = Math.floor(sg.idx / 2);
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          if (f === front) {
            uv.setXY(i, col * 0.5 + uv.getX(i) * 0.5, 1 - row * 0.25 - 0.25 + uv.getY(i) * 0.25);
          } else {
            uv.setXY(i, 0.5 * col + 0.003, 1 - row * 0.25 - 0.01); // dark border pixel of the atlas
          }
        }
      }
      g.translate(sg.x + sg.dirX * 0.2, 5.6, sg.z + sg.dirZ * 0.2);
      geos.push(g);
    }
    if (geos.length) {
      const merged = mergeGeometries(geos, false)!;
      const mesh = new THREE.Mesh(merged, signMaterial);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }

  // ---------- minimap image ----------
  const MM = 4; // px per metre
  const mm = document.createElement('canvas');
  mm.width = mm.height = (WORLD_SIZE + 80) * MM;
  const mg = mm.getContext('2d')!;
  mg.fillStyle = '#2d3b4a';
  mg.fillRect(0, 0, mm.width, mm.height);
  mg.translate(40 * MM, 40 * MM);
  mg.fillStyle = '#1f6f8f';
  mg.fillRect(-40 * MM, (WORLD_SIZE + 30) * MM, mm.width, 60 * MM);
  mg.fillStyle = '#c8b983';
  mg.fillRect(-40 * MM, (WORLD_SIZE + 6) * MM, mm.width, 24 * MM);
  for (const lot of lots) {
    mg.fillStyle = { beach: '#cdbb86', oldtown: '#a7826f', downtown: '#7f8da1', harbor: '#7c7f7a' }[lot.district];
    mg.fillRect(lot.x0 * MM, lot.z0 * MM, (lot.x1 - lot.x0) * MM, (lot.z1 - lot.z0) * MM);
  }
  mg.fillStyle = '#9aa3b5';
  for (let a = 0; a <= GRID; a++) {
    const hw = roadHalfWidth(a);
    mg.fillRect((a * CELL - hw) * MM, -hw * MM, hw * 2 * MM, (WORLD_SIZE + hw * 2) * MM);
    mg.fillRect(-hw * MM, (a * CELL - hw) * MM, (WORLD_SIZE + hw * 2) * MM, hw * 2 * MM);
  }

  const spawn = { x: 4 * CELL + 3, z: 6 * CELL, heading: Math.PI }; // on the avenue, facing north (-Z)

  return { group, lots, boxes, circles, ramps, garages, windowMaterial, signMaterial, spawn, minimapCanvas: mm };
}

// ------------------------------------------------------------------ road graph helpers (AI)
export const nodeX = (b: number): number => b * CELL;
export const nodeZ = (a: number): number => a * CELL;
