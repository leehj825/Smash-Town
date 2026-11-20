import * as THREE from 'three';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import type { World } from './world';

interface Placement { x: number; z: number; rot: number; scale: number }

function palmGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const segs = 5;
  const segH = 1.35;
  let px = 0;
  let py = 0;
  for (let s = 0; s < segs; s++) {
    const tilt = 0.06 + s * 0.035; // gentle curve
    const rBot = 0.34 - s * 0.04;
    const rTop = rBot - 0.04;
    b.cylinder(rTop, rBot, segH, 6, px + Math.sin(tilt) * segH * 0.5, py + Math.cos(tilt) * segH * 0.5, 0, 0x8a6a45, 0, 0, -tilt);
    px += Math.sin(tilt) * segH;
    py += Math.cos(tilt) * segH;
  }
  // crown + coconuts
  b.cylinder(0.25, 0.2, 0.3, 6, px, py + 0.1, 0, 0x6e5237);
  // fronds: flattened cones radiating outward and drooping
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
    // drooping tip segment
    const tip = new THREE.ConeGeometry(0.34, 1.7, 4, 1);
    tip.scale(1, 1, 0.18);
    tip.translate(0, 0.85, 0);
    const reach = 3.3;
    const mt = new THREE.Matrix4()
      .makeTranslation(px, py + 0.15, 0)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeTranslation(reach * Math.sin(1.28), reach * Math.cos(1.28) - 0.1, 0))
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
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.05, 0, 0xb02323); // base flange
  b.cylinder(0.3, 0.3, 0.08, 8, 0, 0.62, 0, 0xb02323); // collar
  b.add(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), red, new THREE.Matrix4().makeTranslation(0, 0.68, 0));
  b.cylinder(0.07, 0.07, 0.34, 6, 0, 0.42, 0, 0xc72827, 0, 0, Math.PI / 2); // side nozzles
  b.cylinder(0.09, 0.09, 0.06, 6, 0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  b.cylinder(0.09, 0.09, 0.06, 6, -0.2, 0.42, 0, 0xffd1d1, 0, 0, Math.PI / 2);
  return b.build();
}

export interface Props {
  group: THREE.Group;
  lampHeadMaterial: THREE.MeshStandardMaterial;
}

/** Instanced palms, street lamps and hydrants placed along the sidewalks. Static colliders are registered on the world. */
export function buildProps(world: World): Props {
  const rng = makeRng(777);
  const palms: Placement[] = [];
  const lamps: Placement[] = [];
  const hydrants: Placement[] = [];
  const EDGE = 1.4;

  for (const lot of world.lots) {
    const { x0, x1, z0, z1, district } = lot;
    // lamps at the four corners, arm pointing at the road
    if (district !== 'beach' || lot.i % 2 === 0) {
      for (const [x, z, dx, dz] of [
        [x0 + EDGE, z0 + EDGE, 0, -1], [x1 - EDGE, z0 + EDGE, 0, -1],
        [x0 + EDGE, z1 - EDGE, 0, 1], [x1 - EDGE, z1 - EDGE, 0, 1],
      ] as const) {
        lamps.push({ x, z, rot: Math.atan2(-dz, dx), scale: 1 });
      }
    }
    // palms along the road-facing edges
    const palmSpacing = district === 'beach' ? 8 : district === 'oldtown' ? 12 : district === 'downtown' ? 18 : 0;
    if (palmSpacing > 0) {
      for (const zEdge of [z0 + EDGE, z1 - EDGE]) {
        for (let x = x0 + 5 + rng() * 2; x < x1 - 4; x += palmSpacing + rng() * 3) {
          palms.push({ x, z: zEdge, rot: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.4 });
        }
      }
      if (district === 'beach') {
        // a few on the sand behind the cafes
        for (let n = 0; n < 3; n++) {
          palms.push({
            x: x0 + 4 + rng() * (x1 - x0 - 8), z: z1 - 8 - rng() * 3,
            rot: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.5,
          });
        }
      }
    }
    // hydrants
    const hCount = district === 'oldtown' ? 3 : district === 'harbor' ? 0 : district === 'beach' ? 1 : 2;
    for (let n = 0; n < hCount; n++) {
      const top = rng() < 0.5;
      hydrants.push({
        x: x0 + 4 + rng() * (x1 - x0 - 8),
        z: top ? z0 + EDGE + 0.4 : z1 - EDGE - 0.4,
        rot: rng() * Math.PI * 2,
        scale: 1,
      });
    }
  }

  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const instance = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Placement[], y: number, shadow: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // instances span the whole city; bounding sphere is the origin geometry
    group.add(mesh);
    return mesh;
  };

  const SLAB = 0.14;
  instance(palmGeometry(), paletteMaterial(), palms, SLAB, true);
  instance(lampPoleGeometry(), paletteMaterial(), lamps, SLAB, true);
  instance(hydrantGeometry(), paletteMaterial(), hydrants, SLAB, true);
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff1c9, emissive: 0xffe2a0, emissiveIntensity: 0.2, flatShading: true,
  });
  instance(lampHeadGeometry(), lampHeadMaterial, lamps, SLAB, false);

  for (const p of palms) world.circles.push({ x: p.x, z: p.z, r: 0.5 });
  for (const p of lamps) world.circles.push({ x: p.x, z: p.z, r: 0.3 });
  for (const p of hydrants) world.circles.push({ x: p.x, z: p.z, r: 0.35 });

  return { group, lampHeadMaterial };
}
