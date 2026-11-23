import * as THREE from 'three';
import { ParticlePool } from './particles';

const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

/** All low-poly particle effects: dust, smoke, fire, sparks, water, debris, skid marks. */
export class Vfx {
  readonly group = new THREE.Group();
  private dust = new ParticlePool({
    geometry: new THREE.IcosahedronGeometry(0.5, 0),
    material: new THREE.MeshLambertMaterial({ flatShading: true }), max: 160, gravity: -0.5, mode: 'puff',
  });
  private smoke = new ParticlePool({
    geometry: new THREE.IcosahedronGeometry(0.5, 0),
    material: new THREE.MeshLambertMaterial({ flatShading: true }), max: 120, gravity: -2, mode: 'puff',
  });
  private fire = new ParticlePool({
    geometry: new THREE.OctahedronGeometry(0.5, 0),
    material: new THREE.MeshBasicMaterial({ fog: false }), max: 160, gravity: -3, mode: 'shrink', spin: true,
  });
  private sparks = new ParticlePool({
    geometry: new THREE.BoxGeometry(0.05, 0.05, 0.4),
    material: new THREE.MeshBasicMaterial({ fog: false }), max: 80, gravity: 14, mode: 'shrink', bounce: true, spin: true,
  });
  private water = new ParticlePool({
    geometry: new THREE.BoxGeometry(0.14, 0.14, 0.14),
    material: new THREE.MeshBasicMaterial({ fog: false }), max: 260, gravity: 16, mode: 'solid', bounce: true,
  });
  private debris = new ParticlePool({
    geometry: new THREE.BoxGeometry(0.22, 0.22, 0.22),
    material: new THREE.MeshLambertMaterial({ flatShading: true }), max: 260, gravity: 20, mode: 'solid', bounce: true, spin: true,
  });

  private readonly SKID_MAX = 700;
  private skids: THREE.InstancedMesh;
  private skidNext = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    for (const pool of [this.dust, this.smoke, this.fire, this.sparks, this.water, this.debris]) this.group.add(pool.mesh);
    const skidGeo = new THREE.PlaneGeometry(0.34, 0.9).rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(
      skidGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0c0c10, transparent: true, opacity: 0.55, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      this.SKID_MAX,
    );
    this.skids.frustumCulled = false;
    for (let i = 0; i < this.SKID_MAX; i++) this.skids.setMatrixAt(i, this.zero);
    this.group.add(this.skids);
  }

  emitDust(x: number, z: number, vx: number, vz: number, n = 1): void {
    for (let i = 0; i < n; i++) {
      this.dust.emit(x + rnd(0.2), 0.2, z + rnd(0.2), vx * 0.15 + rnd(0.8), 0.8 + Math.random() * 1.4, vz * 0.15 + rnd(0.8),
        0.5 + Math.random() * 0.5, 0.35 + Math.random() * 0.35, Math.random() < 0.5 ? 0xd8c9a8 : 0xbfb4a0);
    }
  }

  /** Rising low-poly smoke. `dark` for heavily damaged vehicles. */
  emitSmoke(x: number, y: number, z: number, dark: boolean, n = 1): void {
    for (let i = 0; i < n; i++) {
      this.smoke.emit(x + rnd(0.3), y, z + rnd(0.3), rnd(0.5), 2 + Math.random() * 1.5, rnd(0.5),
        1.1 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, dark ? 0x3a3a40 : 0xf2f2f5);
    }
  }

  emitFire(x: number, y: number, z: number, n = 1, spread = 0.5): void {
    for (let i = 0; i < n; i++) {
      this.fire.emit(x + rnd(spread), y, z + rnd(spread), rnd(1), 2.5 + Math.random() * 2.5, rnd(1),
        0.35 + Math.random() * 0.3, 0.45 + Math.random() * 0.5, Math.random() < 0.5 ? 0xff8c00 : 0xffd23a);
    }
  }

  /** A firework: a ball of coloured sparks flying out in every direction. */
  emitBurst(x: number, y: number, z: number, color: number, n = 30): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), sp = 7 + Math.random() * 6;
      this.sparks.emit(x, y, z, Math.sin(e) * Math.cos(a) * sp, Math.cos(e) * sp, Math.sin(e) * Math.sin(a) * sp, 1.1 + Math.random() * 0.6, 2.2, color);
    }
  }

  emitSparks(x: number, y: number, z: number, n = 4): void {
    for (let i = 0; i < n; i++) this.sparks.emit(x, y, z, rnd(5), 2 + Math.random() * 4, rnd(5), 0.4 + Math.random() * 0.3, 1, 0xffe14d);
  }

  emitWater(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.water.emit(x, y, z, vx, vy, vz, 1.4, 1, Math.random() < 0.5 ? 0x5ec4ff : 0xb6e6ff);
  }

  emitDebris(x: number, y: number, z: number, vx: number, vz: number, color: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      this.debris.emit(x + rnd(0.3), y + Math.random() * 0.5, z + rnd(0.3), vx * 0.4 + rnd(4), 3 + Math.random() * 5, vz * 0.4 + rnd(4),
        1.6 + Math.random(), 0.5 + Math.random() * 0.8, color);
    }
  }

  explosion(x: number, z: number): void {
    this.emitFire(x, 0.8, z, 26, 1.6);
    this.emitSmoke(x, 1.2, z, true, 12);
    this.emitSparks(x, 1, z, 14);
    this.emitDebris(x, 1, z, 0, 0, 0x2a2a2e, 10);
  }

  addSkid(x: number, z: number, heading: number): void {
    const i = this.skidNext;
    this.skidNext = (this.skidNext + 1) % this.SKID_MAX;
    this.q.setFromEuler(this.e.set(0, heading, 0));
    this.p.set(x, 0.045, z);
    this.m.compose(this.p, this.q, this.s);
    this.skids.setMatrixAt(i, this.m);
    this.skids.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.dust.update(dt);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.sparks.update(dt);
    this.water.update(dt);
    this.debris.update(dt);
  }
}
