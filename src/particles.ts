import * as THREE from 'three';

export interface PoolConfig {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  max: number;
  gravity: number;
  /** puff: grow then shrink; shrink: linear shrink; solid: constant, shrink at the end. */
  mode: 'puff' | 'shrink' | 'solid';
  bounce?: boolean;
  spin?: boolean;
  castShadow?: boolean;
}

/** Pooled instanced particles. No allocations after construction. */
export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private total: Float32Array; private size: Float32Array;
  private rx: Float32Array; private ry: Float32Array; private srx: Float32Array; private sry: Float32Array;
  private next = 0;
  private active = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private c = new THREE.Color();

  constructor(private cfg: PoolConfig) {
    const n = (this.n = cfg.max);
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.total = f(); this.size = f(); this.rx = f(); this.ry = f(); this.srx = f(); this.sry = f();
    this.mesh = new THREE.InstancedMesh(cfg.geometry, cfg.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!cfg.castShadow;
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    if (this.life[i] <= 0) this.active++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = this.total[i] = life;
    this.size[i] = size;
    this.rx[i] = Math.random() * 6.28; this.ry[i] = Math.random() * 6.28;
    this.srx[i] = this.cfg.spin ? (Math.random() - 0.5) * 14 : 0;
    this.sry[i] = this.cfg.spin ? (Math.random() - 0.5) * 14 : 0;
    this.mesh.setColorAt(i, this.c.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.active === 0) return;
    const g = this.cfg.gravity;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const nl = l - dt;
      this.life[i] = nl;
      if (nl <= 0) {
        this.mesh.setMatrixAt(i, this.zero);
        this.active--;
        continue;
      }
      this.vy[i] -= g * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.cfg.bounce && this.py[i] < 0.08) {
        this.py[i] = 0.08;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.7;
        this.vz[i] *= 0.7;
        this.srx[i] *= 0.5; this.sry[i] *= 0.5;
      }
      this.rx[i] += this.srx[i] * dt;
      this.ry[i] += this.sry[i] * dt;
      const t = 1 - nl / this.total[i];
      let sc: number;
      if (this.cfg.mode === 'puff') sc = this.size[i] * Math.sin(Math.min(1, t * 1.1) * Math.PI) + 0.03;
      else if (this.cfg.mode === 'shrink') sc = this.size[i] * (1 - t);
      else sc = this.size[i] * Math.min(1, nl * 3);
      this.p.set(this.px[i], this.py[i], this.pz[i]);
      this.s.setScalar(Math.max(0.001, sc));
      this.q.setFromEuler(this.e.set(this.rx[i], this.ry[i], 0));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
