import * as THREE from 'three';
import type { Spot } from './world';

/** Golden stars to find while exploring. Two instanced meshes (the star and a faint light column) for all of them. */
export class Collectibles {
  readonly group = new THREE.Group();
  private stars: THREE.InstancedMesh;
  private columns: THREE.InstancedMesh;
  private got: boolean[];
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private spots: Spot[], collected: number[]) {
    this.got = spots.map((_, i) => collected.includes(i));
    this.stars = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.85, 0).scale(1, 1.4, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd23a }),
      spots.length,
    );
    this.columns = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.4, 0.4, 16, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      spots.length,
    );
    for (const m of [this.stars, this.columns]) { m.frustumCulled = false; this.group.add(m); }
    this.update(0);
  }

  get total(): number { return this.spots.length; }
  get count(): number { return this.got.filter(Boolean).length; }
  indices(): number[] { return this.got.map((g, i) => (g ? i : -1)).filter((i) => i >= 0); }
  isCollected(i: number): boolean { return this.got[i]; }
  spot(i: number): Spot { return this.spots[i]; }

  update(dt: number): void {
    this.t += dt;
    this.spots.forEach((sp, i) => {
      if (this.got[i]) {
        this.stars.setMatrixAt(i, this.zero);
        this.columns.setMatrixAt(i, this.zero);
        return;
      }
      this.q.setFromEuler(this.e.set(0, this.t * 2 + i, 0));
      this.p.set(sp.x, (sp.y ?? 0) + 1.6 + Math.sin(this.t * 3 + i) * 0.25, sp.z);
      this.stars.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
      this.p.set(sp.x, (sp.y ?? 0) + 8, sp.z);
      this.q.identity();
      this.columns.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
    });
    this.stars.instanceMatrix.needsUpdate = true;
    this.columns.instanceMatrix.needsUpdate = true;
  }

  /** Collect the star within `r` metres of (x, z). Returns its index or -1. */
  tryCollect(x: number, z: number, r: number, y = 0): number {
    for (let i = 0; i < this.spots.length; i++) {
      if (this.got[i]) continue;
      if (Math.abs((this.spots[i].y ?? 0) - y) > 4) continue;
      if (Math.hypot(this.spots[i].x - x, this.spots[i].z - z) < r) { this.got[i] = true; return i; }
    }
    return -1;
  }
}
