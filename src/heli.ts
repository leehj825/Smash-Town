import * as THREE from 'three';
import { MeshBuilder, paletteMaterial } from './geo';

/** The five-star police helicopter: circles the player with a searchlight. It is brought down by a rocket. */
export class Helicopter {
  readonly group = new THREE.Group();
  private rotor: THREE.Mesh;
  private tailRotor: THREE.Mesh;
  private beam: THREE.Mesh;
  private disc: THREE.Mesh;
  private ang = Math.random() * Math.PI * 2;
  x = 0; z = 0; y = 26;
  active = false;
  cooldown = 0;
  /** Bullets wear it down (rockets destroy it outright). */
  hp = 100;

  constructor() {
    const b = new MeshBuilder();
    b.box(2.4, 1.5, 4.6, 0, 0, 0, 0x1d2a44);
    b.box(1.6, 0.9, 1.6, 0, 0.35, 1.9, 0x9ec7e8);
    b.box(0.5, 0.5, 4.2, 0, 0.2, -4, 0x1d2a44);
    b.box(0.2, 1.1, 0.5, 0, 0.6, -6, 0x1d2a44);
    b.box(2.6, 0.2, 0.3, 0, -1, 1, 0x666b78);
    b.box(2.6, 0.2, 0.3, 0, -1, -1, 0x666b78);
    b.box(0.35, 0.18, 0.5, 0.7, 0.3, 2.9, 0xff2a3a);
    b.box(0.35, 0.18, 0.5, -0.7, 0.3, 2.9, 0x2a7bff);
    const body = new THREE.Mesh(b.build(), paletteMaterial());
    body.castShadow = false;
    this.group.add(body);
    const rb = new MeshBuilder();
    rb.box(9.5, 0.08, 0.35, 0, 0, 0, 0x2a2a30);
    rb.box(0.35, 0.08, 9.5, 0, 0, 0, 0x2a2a30);
    this.rotor = new THREE.Mesh(rb.build(), paletteMaterial());
    this.rotor.position.y = 1.05;
    this.group.add(this.rotor);
    const tb = new MeshBuilder();
    tb.box(0.08, 1.8, 0.2, 0, 0, 0, 0x2a2a30);
    this.tailRotor = new THREE.Mesh(tb.build(), paletteMaterial());
    this.tailRotor.position.set(0.3, 0.7, -6);
    this.group.add(this.tailRotor);
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.geometry.translate(0, -0.5, 0); // apex at the origin, opening downward
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.group.visible = false;
  }

  /** Add the lights to the scene root (they must not inherit the helicopter's transform). */
  attach(scene: THREE.Scene): void {
    scene.add(this.group, this.beam, this.disc);
    this.beam.visible = false; this.disc.visible = false;
  }

  spawn(px: number, pz: number): void {
    this.active = true;
    this.hp = 100;
    this.ang = Math.random() * Math.PI * 2;
    this.x = px + Math.cos(this.ang) * 60; this.z = pz + Math.sin(this.ang) * 60;
    this.group.visible = true; this.beam.visible = true; this.disc.visible = true;
  }

  remove(): void {
    this.active = false;
    this.group.visible = false; this.beam.visible = false; this.disc.visible = false;
  }

  /** Flat distance to a point. */
  distTo(x: number, z: number): number { return Math.hypot(this.x - x, this.z - z); }

  update(dt: number, px: number, pz: number, time: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.active) return;
    this.ang += dt * 0.45;
    const tx = px + Math.cos(this.ang) * 24, tz = pz + Math.sin(this.ang) * 24;
    const k = 1 - Math.exp(-dt * 1.4);
    this.x += (tx - this.x) * k; this.z += (tz - this.z) * k;
    this.y = 26 + Math.sin(time * 0.8) * 1.2;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = Math.atan2(px - this.x, pz - this.z);
    this.rotor.rotation.y += dt * 38;
    this.tailRotor.rotation.x += dt * 45;
    // searchlight from the belly to the player
    const dx = px - this.x, dy = -this.y, dz = pz - this.z;
    const len = Math.hypot(dx, dy, dz);
    this.beam.position.set(this.x, this.y - 1, this.z);
    this.beam.scale.set(1, len, 1);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    this.disc.position.set(px, 0.09, pz);
  }
}
