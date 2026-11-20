import * as THREE from 'three';

/** Glowing light pillar + ground ring used for gigs, checkpoints and garages. */
export class Beacon {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private pillar: THREE.Mesh;
  private t = Math.random() * 6;

  constructor(color: number, radius = 5) {
    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 36, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    this.pillar.position.y = 18;
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.22, 6, 28).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, fog: false }),
    );
    this.ring.position.y = 0.25;
    this.group.add(this.pillar, this.ring);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  set visible(v: boolean) { this.group.visible = v; }

  update(dt: number): void {
    this.t += dt;
    this.ring.scale.setScalar(1 + Math.sin(this.t * 3) * 0.05);
    this.pillar.rotation.y += dt * 0.8;
  }
}
