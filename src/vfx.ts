import * as THREE from 'three';

/** Pooled dust puffs (instanced low-poly icosahedrons) and a ring buffer of skid-mark quads. No allocations in update(). */
export class Vfx {
  readonly group = new THREE.Group();

  private readonly DUST_MAX = 160;
  private dust: THREE.InstancedMesh;
  private dustPos = new Float32Array(this.DUST_MAX * 3);
  private dustVel = new Float32Array(this.DUST_MAX * 3);
  private dustLife = new Float32Array(this.DUST_MAX); // remaining
  private dustTotal = new Float32Array(this.DUST_MAX);
  private dustSize = new Float32Array(this.DUST_MAX);
  private dustNext = 0;

  private readonly SKID_MAX = 700;
  private skids: THREE.InstancedMesh;
  private skidNext = 0;

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private color = new THREE.Color();

  constructor() {
    this.dust = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshLambertMaterial({ flatShading: true, color: 0xffffff }),
      this.DUST_MAX,
    );
    this.dust.frustumCulled = false;
    for (let i = 0; i < this.DUST_MAX; i++) {
      this.dust.setMatrixAt(i, this.zero);
      this.dust.setColorAt(i, this.color.set(0xd8c9a8));
    }
    this.group.add(this.dust);

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

  emitDust(x: number, y: number, z: number, vx: number, vz: number, amount = 1): void {
    for (let n = 0; n < amount; n++) {
      const i = this.dustNext;
      this.dustNext = (this.dustNext + 1) % this.DUST_MAX;
      this.dustPos[i * 3] = x + (Math.random() - 0.5) * 0.4;
      this.dustPos[i * 3 + 1] = y + Math.random() * 0.2;
      this.dustPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      this.dustVel[i * 3] = vx * 0.15 + (Math.random() - 0.5) * 1.6;
      this.dustVel[i * 3 + 1] = 0.8 + Math.random() * 1.4;
      this.dustVel[i * 3 + 2] = vz * 0.15 + (Math.random() - 0.5) * 1.6;
      const life = 0.5 + Math.random() * 0.5;
      this.dustLife[i] = this.dustTotal[i] = life;
      this.dustSize[i] = 0.25 + Math.random() * 0.3;
    }
  }

  addSkid(x: number, z: number, heading: number): void {
    const i = this.skidNext;
    this.skidNext = (this.skidNext + 1) % this.SKID_MAX;
    this.q.setFromEuler(this.e.set(0, heading, 0));
    this.p.set(x, 0.045, z);
    this.s.set(1, 1, 1);
    this.m.compose(this.p, this.q, this.s);
    this.skids.setMatrixAt(i, this.m);
    this.skids.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.DUST_MAX; i++) {
      const life = this.dustLife[i];
      if (life <= 0) continue;
      const nl = life - dt;
      this.dustLife[i] = nl;
      if (nl <= 0) {
        this.dust.setMatrixAt(i, this.zero);
        continue;
      }
      this.dustPos[i * 3] += this.dustVel[i * 3] * dt;
      this.dustPos[i * 3 + 1] += this.dustVel[i * 3 + 1] * dt;
      this.dustPos[i * 3 + 2] += this.dustVel[i * 3 + 2] * dt;
      const t = 1 - nl / this.dustTotal[i];
      // expand then shrink
      const size = this.dustSize[i] * Math.sin(Math.min(1, t * 1.1) * Math.PI) + 0.03;
      this.p.set(this.dustPos[i * 3], this.dustPos[i * 3 + 1], this.dustPos[i * 3 + 2]);
      this.s.setScalar(size);
      this.q.identity();
      this.m.compose(this.p, this.q, this.s);
      this.dust.setMatrixAt(i, this.m);
    }
    this.dust.instanceMatrix.needsUpdate = true;
  }
}
