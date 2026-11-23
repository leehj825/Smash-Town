import * as THREE from 'three';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import type { Game } from './game';

function dogGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const W = 0xffffff, D = 0x2a2218;
  b.box(0.28, 0.26, 0.62, 0, 0.42, 0, W);                                   // body (tinted per dog)
  b.box(0.22, 0.22, 0.24, 0, 0.58, 0.38, W);                                // head
  b.box(0.12, 0.1, 0.14, 0, 0.53, 0.54, D);                                 // snout
  b.box(0.05, 0.08, 0.05, 0, 0.55, 0.62, 0x15151a);                         // nose
  for (const sx of [-1, 1]) {
    b.box(0.06, 0.12, 0.08, sx * 0.1, 0.72, 0.32, D);                       // ears
    for (const sz of [-0.22, 0.22]) b.box(0.07, 0.3, 0.07, sx * 0.09, 0.15, sz, W); // legs
  }
  b.rotatedBox(0.06, 0.06, 0.3, 0, 0.55, -0.4, -0.7, 0, 0, W);              // tail up
  return b.build();
}

function gullGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.22, 0.2, 0.7, 0, 0, 0, 0xffffff);
  b.box(0.12, 0.12, 0.16, 0, 0.06, 0.42, 0xffffff);
  b.box(0.06, 0.04, 0.1, 0, 0.04, 0.54, 0xffb300);
  b.rotatedBox(1.0, 0.04, 0.3, 0.55, 0.08, 0, 0, 0, 0.25, 0xe6e9ee); b.rotatedBox(1.0, 0.04, 0.3, -0.55, 0.08, 0, 0, 0, -0.25, 0xe6e9ee);
  b.box(0.2, 0.04, 0.3, 0, 0, -0.5, 0xc9ced6);
  return b.build();
}

interface Dog { x: number; z: number; tx: number; tz: number; heading: number; lot: { x0: number; x1: number; z0: number; z1: number }; wait: number; speed: number }

/** Life in the parks and over the harbour: dogs wander the grass and run when you get close; gulls circle above the water. */
export class Animals {
  readonly group = new THREE.Group();
  private dogs: Dog[] = [];
  private dogMesh: THREE.InstancedMesh;
  private gullMesh: THREE.InstancedMesh;
  private gulls: { cx: number; cz: number; r: number; h: number; a: number; w: number }[] = [];
  private tmp = new THREE.Object3D();
  private rng = makeRng(555);
  private t = 0;

  constructor(private game: Game) {
    const dogLots = game.world.lots.filter((l) => l.district === 'park' || l.district === 'plaza' || l.district === 'suburb');
    for (const l of dogLots) {
      const n = l.district === 'park' ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const x = l.x0 + 4 + this.rng() * (l.x1 - l.x0 - 8), z = l.z0 + 4 + this.rng() * (l.z1 - l.z0 - 8);
        this.dogs.push({ x, z, tx: x, tz: z, heading: this.rng() * 6.28, lot: l, wait: this.rng() * 4, speed: 1.1 + this.rng() * 0.5 });
      }
    }
    const mat = paletteMaterial();
    this.dogMesh = new THREE.InstancedMesh(dogGeometry(), mat, Math.max(1, this.dogs.length));
    this.dogMesh.count = this.dogs.length;
    const palette = [0xc08a5a, 0xf2f2f2, 0x3a3028, 0xd9b36a, 0x8a8f99, 0xe8c8a0];
    this.dogs.forEach((_, i) => this.dogMesh.setColorAt(i, new THREE.Color(palette[i % palette.length])));
    this.dogMesh.frustumCulled = false; this.dogMesh.castShadow = true;
    this.group.add(this.dogMesh);

    const seaLots = game.world.lots.filter((l) => l.district === 'harbor' || l.district === 'beach');
    for (const l of seaLots) {
      if (this.rng() < 0.45) continue;
      for (let k = 0; k < 2; k++) this.gulls.push({ cx: (l.x0 + l.x1) / 2, cz: (l.z0 + l.z1) / 2, r: 18 + this.rng() * 34, h: 20 + this.rng() * 16, a: this.rng() * 6.28, w: (0.25 + this.rng() * 0.3) * (this.rng() < 0.5 ? 1 : -1) });
    }
    this.gullMesh = new THREE.InstancedMesh(gullGeometry(), mat, Math.max(1, this.gulls.length));
    this.gullMesh.count = this.gulls.length;
    this.gullMesh.frustumCulled = false;
    this.group.add(this.gullMesh);
    game.scene.add(this.group);
  }

  get dogCount(): number { return this.dogs.length; }
  get gullCount(): number { return this.gulls.length; }
  set visible(v: boolean) { this.group.visible = v; }

  update(dt: number): void {
    this.t += dt;
    const G = this.game;
    const px = G.focusX, pz = G.focusZ;
    const d = this.tmp;
    this.dogs.forEach((o, i) => {
      if (Math.abs(o.x - px) > 160 || Math.abs(o.z - pz) > 160) { d.scale.setScalar(0); d.updateMatrix(); this.dogMesh.setMatrixAt(i, d.matrix); return; }
      const near = Math.hypot(o.x - px, o.z - pz);
      let speed = 0;
      if (near < 8) {
        // run away from the player, but stay on the lot
        const a = Math.atan2(o.x - px, o.z - pz);
        o.tx = THREE.MathUtils.clamp(o.x + Math.sin(a) * 6, o.lot.x0 + 3, o.lot.x1 - 3);
        o.tz = THREE.MathUtils.clamp(o.z + Math.cos(a) * 6, o.lot.z0 + 3, o.lot.z1 - 3);
        speed = 4.2; o.wait = 0;
      } else if (o.wait > 0) o.wait -= dt;
      else if (Math.hypot(o.tx - o.x, o.tz - o.z) < 0.6) {
        o.wait = 1.5 + Math.random() * 4;
        o.tx = o.lot.x0 + 3 + Math.random() * (o.lot.x1 - o.lot.x0 - 6);
        o.tz = o.lot.z0 + 3 + Math.random() * (o.lot.z1 - o.lot.z0 - 6);
      } else speed = o.speed;
      if (speed > 0) {
        const a = Math.atan2(o.tx - o.x, o.tz - o.z);
        let diff = a - o.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        o.heading += diff * Math.min(1, dt * 6);
        o.x += Math.sin(o.heading) * speed * dt; o.z += Math.cos(o.heading) * speed * dt;
      }
      d.position.set(o.x, 0.14 + (speed > 0 ? Math.abs(Math.sin(this.t * speed * 3 + i)) * 0.05 : 0), o.z);
      d.rotation.set(0, o.heading, 0); d.scale.setScalar(1); d.updateMatrix();
      this.dogMesh.setMatrixAt(i, d.matrix);
    });
    this.dogMesh.instanceMatrix.needsUpdate = true;
    this.gulls.forEach((g, i) => {
      g.a += g.w * dt;
      const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r;
      d.position.set(x, g.h + Math.sin(this.t * 1.7 + i) * 1.2, z);
      d.rotation.set(0, Math.atan2(-Math.sin(g.a) * g.w, Math.cos(g.a) * g.w), Math.sin(this.t * 3 + i) * 0.25);
      d.scale.setScalar(1.3); d.updateMatrix();
      this.gullMesh.setMatrixAt(i, d.matrix);
    });
    this.gullMesh.instanceMatrix.needsUpdate = true;
  }
}
