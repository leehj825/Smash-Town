import { settings } from './settings';
import * as THREE from 'three';

/** Anything the chase camera can follow (a car or the on-foot avatar). */
export interface Followable {
  position: THREE.Vector3;
  heading: number;
  lateralSpeed: number;
  forwardSpeed: number;
  speed: number;
  nitroActive: boolean;
  /** Distance multiplier (smaller when on foot). */
  camScale: number;
  /** On-foot over-the-shoulder camera mode. */
  foot?: boolean;
  sprinting?: boolean;
}

/** Chase camera: speed-based FOV, yaw lag during drifts, and damped-sinusoid screen shake. */
export class CameraRig {
  private yaw = Math.PI;
  private shakeAmp = 0;
  private shakeTime = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private initialised = false;
  /** Building footprints the camera must not enter. */
  obstacles: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  /** A building the camera may enter (the roof the player stands on). */
  ignore: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private target = new THREE.Vector3();
  /** On-foot orbit angles (mouse / touch drag). */
  footYaw = Math.PI;
  footPitch = 0.25;
  private lookIdle = 0;
  /** 0 = ordinary orbit camera, 1 = aiming (closer, over the shoulder), 2 = zoomed. Set by the game each frame. */
  aimMode: 0 | 1 | 2 = 0;
  private aimBlend = 0;
  private wasFoot = false;
  /** While two people talk: the point to look toward (the other person). The camera slides to an over-the-shoulder shot and back. */
  dialogFocus: { x: number; z: number } | null = null;
  private dlgBlend = 0;
  private right = new THREE.Vector3();

  /** Mouse / touch deltas in pixels. */
  applyLook(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.footYaw -= dx * 0.0035;
    // aiming lets you look up (to shoot at the helicopter) and keeps the camera from tipping far down
    this.footPitch = Math.max(this.aimMode ? -0.5 : -0.12, Math.min(this.aimMode ? 0.4 : 0.9, this.footPitch + dy * 0.0025));
    this.lookIdle = 0;
  }

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Closer over-the-shoulder camera: 4.8 m behind, ~2.4 m high, FOV 58. Auto-aligns behind the player while sprinting. */
  private updateFoot(dt: number, f: Followable): void {
    if (!this.wasFoot) { this.footYaw = f.heading + Math.PI * 0 ; this.wasFoot = true; this.lookIdle = 2; }
    this.lookIdle += dt;
    const aimT = this.aimMode === 2 ? 1 : this.aimMode === 1 ? 0.55 : 0;
    this.aimBlend += (aimT - this.aimBlend) * (1 - Math.exp(-dt * 9));
    const ab = this.aimBlend;
    // entering aim mode levels the view so the crosshair points ahead, not at the ground
    if (this.aimMode && this.footPitch > 0.12) this.footPitch += (0.08 - this.footPitch) * (1 - Math.exp(-dt * 6));
    if (f.sprinting && this.lookIdle > 1 && !this.aimMode) {
      const d = Math.atan2(Math.sin(f.heading - this.footYaw), Math.cos(f.heading - this.footYaw));
      this.footYaw += d * (1 - Math.exp(-dt * 1.6));
    }
    const dist = 4.8 - ab * 2.1;
    const side = 0.5 + ab * 0.45;
    const hor = dist * Math.cos(this.footPitch);
    const ver = 1.2 + ab * 0.35 + dist * Math.sin(this.footPitch);
    const sy = Math.sin(this.footYaw), cy = Math.cos(this.footYaw);
    this.right.set(-cy, 0, sy);
    const desired = this.tmp.set(
      f.position.x - sy * hor + this.right.x * side,
      Math.max(f.position.y + 0.4, f.position.y + ver),
      f.position.z - cy * hor + this.right.z * side,
    );
    // pull the camera in when a wall is behind the player, but never closer than ~40 % of the full distance; lift it instead
    const tx = f.position.x, tz = f.position.z;
    const fullX = desired.x - tx, fullZ = desired.z - tz;
    let frac = 1;
    while (frac > 0.4 && this.blocked(tx + fullX * frac, tz + fullZ * frac)) frac -= 0.1;
    desired.x = tx + fullX * frac;
    desired.z = tz + fullZ * frac;
    desired.y += (1 - frac) * 1.6;
    // a conversation: slide to an over-the-shoulder two-shot (in 0.25 s, back out in 0.35 s)
    const df = this.dialogFocus;
    this.dlgBlend += ((df ? 1 : 0) - this.dlgBlend) * (1 - Math.exp(-dt * (df ? 14 : 9)));
    const db = this.dlgBlend > 0.02 ? this.dlgBlend : 0;
    let dlgX = 0, dlgZ = 0;
    if (df && db > 0) {
      const ux = df.x - f.position.x, uz = df.z - f.position.z, ul = Math.hypot(ux, uz) || 1;
      const nx = ux / ul, nz = uz / ul;
      dlgX = f.position.x - nx * 3.0 + nz * 1.1; dlgZ = f.position.z - nz * 3.0 - nx * 1.1;
      let fr = 1;
      while (fr > 0.4 && this.blocked(f.position.x + (dlgX - f.position.x) * fr, f.position.z + (dlgZ - f.position.z) * fr)) fr -= 0.1;
      dlgX = f.position.x + (dlgX - f.position.x) * fr; dlgZ = f.position.z + (dlgZ - f.position.z) * fr;
      desired.x += (dlgX - desired.x) * db; desired.z += (dlgZ - desired.z) * db; desired.y += (f.position.y + 1.7 - desired.y) * db;
    }
    if (!this.initialised) { this.pos.copy(desired); this.initialised = true; }
    else this.pos.lerp(desired, 1 - Math.exp(-dt * 12));
    this.look.set(f.position.x + this.right.x * side, f.position.y + 1.45 + ab * 0.05, f.position.z + this.right.z * side);
    if (df && db > 0) this.look.set(this.look.x + ((f.position.x + df.x) / 2 - this.look.x) * db, f.position.y + 1.45, this.look.z + ((f.position.z + df.z) / 2 - this.look.z) * db);
    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 6);
    const sh = this.shakeAmp * Math.sin(this.shakeTime * 60);
    this.camera.position.set(this.pos.x + sh * 0.12, this.pos.y + sh * 0.1, this.pos.z + sh * 0.12);
    this.camera.lookAt(this.look);
    this.camera.fov += (58 - ab * 14 + settings.fov - this.camera.fov) * (1 - Math.exp(-dt * 6));
    this.camera.updateProjectionMatrix();
  }

  /** Current camera yaw (the direction the camera looks along), used for camera-relative movement. */
  get moveYaw(): number { return this.footYaw; }

  private blocked(x: number, z: number): boolean {
    for (const b of this.obstacles) {
      if (b === this.ignore) continue;
      if (x > b.minX - 0.8 && x < b.maxX + 0.8 && z > b.minZ - 0.8 && z < b.maxZ + 0.8) return true;
    }
    return false;
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount * settings.shake);
    this.shakeTime = 0;
  }

  snap(): void {
    this.initialised = false;
  }

  update(dt: number, car: Followable): void {
    if (car.foot) { this.updateFoot(dt, car); return; }
    this.wasFoot = false;
    // Camera yaw trails the car heading; drift slip pulls it so the side profile shows.
    const target = car.heading + Math.atan2(car.lateralSpeed, Math.max(6, Math.abs(car.forwardSpeed))) * 0.6;
    if (!this.initialised) this.yaw = target;
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt * 4.5));

    const speedT = Math.min(1, Math.abs(car.speed) / 40);
    const dist = (8.6 + speedT * 1.8 + (car.nitroActive ? 1.2 : 0)) * car.camScale;
    const height = (3.7 + speedT * 0.6) * (0.55 + 0.45 * car.camScale);
    const desired = this.tmp.set(
      car.position.x - Math.sin(this.yaw) * dist,
      height,
      car.position.z - Math.cos(this.yaw) * dist,
    );
    // keep the camera out of buildings: pull it toward the car until the spot is free
    this.target.set(car.position.x, desired.y, car.position.z);
    for (let k = 0; k < 8 && this.blocked(desired.x, desired.z); k++) {
      desired.x = this.target.x + (desired.x - this.target.x) * 0.75;
      desired.z = this.target.z + (desired.z - this.target.z) * 0.75;
    }
    if (!this.initialised) {
      this.pos.copy(desired);
      this.initialised = true;
    } else {
      this.pos.lerp(desired, 1 - Math.exp(-dt * 9));
    }
    this.look.set(
      car.position.x + Math.sin(this.yaw) * 4,
      1.4,
      car.position.z + Math.cos(this.yaw) * 4,
    );

    // screen shake
    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 5);
    const sh = this.shakeAmp * Math.sin(this.shakeTime * 55);
    this.camera.position.set(this.pos.x + sh * 0.25, this.pos.y + sh * 0.2, this.pos.z + sh * 0.25);
    this.camera.lookAt(this.look);

    const targetFov = 60 + 14 * speedT + (car.nitroActive ? 4 : 0);
    this.camera.fov += (Math.min(78, targetFov) + settings.fov - this.camera.fov) * (1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
  }
}
