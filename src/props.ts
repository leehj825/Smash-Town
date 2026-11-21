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
  const segs = 5;
  const segH = 1.35;
  let px = 0;
  let py = 0;
  for (let s = 0; s < segs; s++) {
    const tilt = 0.06 + s * 0.035;
    const rBot = 0.34 - s * 0.04;
    const rTop = rBot - 0.04;
    b.cylinder(rTop, rBot, segH, 6, px + Math.sin(tilt) * segH * 0.5, py + Math.cos(tilt) * segH * 0.5, 0, 0x8a6a45, 0, 0, -tilt);
    px += Math.sin(tilt) * segH;
    py += Math.cos(tilt) * segH;
  }
  b.cylinder(0.25, 0.2, 0.3, 6, px, py + 0.1, 0, 0x6e5237);
  const fronds = 7;
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
  b.cylinder(0.24, 0.28, 0.62, 8, 0, 0.35, 0, red);
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.05, 0, 0xb02323);
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.62, 0, 0xb02323);
  b.add(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), red, new THREE.Matrix4().makeTranslation(0, 0.68, 0));
  b.cylinder(0.07, 0.07, 0.34, 6, 0, 0.42, 0, 0xc72827, 0, 0, Math.PI / 2);
  b.cylinder(0.09, 0.09, 0.06, 6, 0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  b.cylinder(0.09, 0.09, 0.06, 6, -0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  return b.build();
}

function treeGeometry(pine: boolean): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder(0.2, 0.3, 2.4, 6, 0, 1.2, 0, 0x7a5a3a);
  if (pine) {
    for (let k = 0; k < 3; k++) {
      const r = 1.7 - k * 0.45;
      b.add(new THREE.ConeGeometry(r, 2.2, 7), k % 2 ? 0x2f7d46 : 0x2a6f3f, new THREE.Matrix4().makeTranslation(0, 2.6 + k * 1.3, 0));
    }
  } else {
    b.add(new THREE.IcosahedronGeometry(1.7, 0), 0x57b368, new THREE.Matrix4().makeTranslation(0, 3.3, 0));
    b.add(new THREE.IcosahedronGeometry(1.25, 0), 0x6cc57a, new THREE.Matrix4().makeTranslation(0.6, 4.5, 0.2));
  }
  return b.build();
}

function benchGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(1.8, 0.08, 0.5, 0, 0.5, 0, 0x9b6b3f);
  b.box(1.8, 0.45, 0.07, 0, 0.8, -0.24, 0x9b6b3f);
  for (const sx of [-1, 1]) b.box(0.08, 0.5, 0.5, sx * 0.8, 0.25, 0, 0x4a4e59);
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
  b.cylinder(0.33, 0.33, 0.07, 8, 0, 0.84, 0, 0x4a4e59);
  b.cylinder(0.06, 0.06, 0.08, 6, 0, 0.9, 0, 0x4a4e59);
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

  return { group, lampHeadMaterial, smash, update, setVegetation };
}
