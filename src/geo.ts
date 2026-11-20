import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** Collects primitives, bakes vertex colors, and merges them into a single flat-shaded geometry. */
export class MeshBuilder {
  private parts: THREE.BufferGeometry[] = [];

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Add a geometry (indexed or not) with a baked color. Returns the non-indexed copy for UV tweaks. */
  add(geo: THREE.BufferGeometry, color: number, matrix?: THREE.Matrix4): THREE.BufferGeometry {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (matrix) g.applyMatrix4(matrix);
    g.computeVertexNormals();
    tmpColor.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmpColor.r;
      arr[i * 3 + 1] = tmpColor.g;
      arr[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return g;
  }

  box(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    color: number,
    tweak?: (p: THREE.BufferAttribute) => void,
  ): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tweak) tweak(g.attributes.position as THREE.BufferAttribute);
    return this.add(g, color, tmpMat.makeTranslation(x, y, z));
  }

  /** Box with arbitrary Euler rotation applied about its own center. */
  rotatedBox(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    rx: number, ry: number, rz: number,
    color: number,
  ): THREE.BufferGeometry {
    tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
    tmpMat.compose(tmpPos.set(x, y, z), tmpQuat, ONE);
    return this.add(new THREE.BoxGeometry(w, h, d), color, tmpMat);
  }

  cylinder(
    rTop: number, rBot: number, h: number, seg: number,
    x: number, y: number, z: number,
    color: number,
    rx = 0, ry = 0, rz = 0,
  ): THREE.BufferGeometry {
    tmpQuat.setFromEuler(tmpEuler.set(rx, ry, rz));
    tmpMat.compose(tmpPos.set(x, y, z), tmpQuat, ONE);
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, tmpMat);
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('MeshBuilder: attribute mismatch while merging');
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Flat-shaded vertex-color material (the shared "palette" material). */
export function paletteMaterial(extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.0,
    ...extra,
  });
}

/** Seeded RNG (mulberry32) so the city is identical every run. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
