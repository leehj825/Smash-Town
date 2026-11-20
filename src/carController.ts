import * as THREE from 'three';
import type { Input } from './input';
import type { VehicleModel } from './vehicle';
import { BOUNDS, type World } from './world';

export interface CarEvents {
  onImpact: (strength: number) => void;
}

const MAX_SPEED = 38; // m/s (~137 km/h)
const NITRO_SPEED = 56;
const ACCEL = 30;
const BRAKE = 46;
const REVERSE_MAX = 12;

// car collision footprint: three circles along the car axis
const CIRCLE_R = 1.0;
const CIRCLE_OFFSETS = [-1.4, 0, 1.4];

/** Snappy arcade driving: decoupled forward/lateral velocity with tunable grip, drift on handbrake. */
export class CarController {
  position = new THREE.Vector3();
  heading = Math.PI;
  private vx = 0;
  private vz = 0;
  forwardSpeed = 0;
  lateralSpeed = 0;
  nitro = 1; // 0..1
  hp = 1; // 0..1
  nitroActive = false;
  drifting = false;

  private steerVis = 0;
  private wheelSpin = 0;
  private roll = 0;
  private pitch = 0;
  private prevFwd = 0;
  private skidAccum = 0;

  constructor(readonly model: VehicleModel, private world: World, private events: CarEvents) {}

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
  get velocityX(): number { return this.vx; }
  get velocityZ(): number { return this.vz; }

  reset(x: number, z: number, heading: number): void {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.vx = this.vz = 0;
    this.hp = 1;
    this.nitro = 1;
    this.syncModel(0);
  }

  update(dt: number, input: Input, spawnSkid: (x: number, z: number, h: number) => void, spawnDust: (x: number, z: number, vx: number, vz: number, n: number) => void): void {
    const h = this.heading;
    let fx = Math.sin(h), fz = Math.cos(h);
    let sx = Math.cos(h), sz = -Math.sin(h);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * sx + this.vz * sz;

    // --- nitro ---
    const wantsNitro = input.nitro && input.throttle > 0 && this.nitro > 0.02;
    this.nitroActive = wantsNitro;
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - dt * 0.35);
    else this.nitro = Math.min(1, this.nitro + dt * 0.12);
    const maxSpeed = wantsNitro ? NITRO_SPEED : MAX_SPEED;

    // --- steering (heading changes first; the old velocity then becomes lateral slip) ---
    const hb = input.handbrake;
    const speedAbs = Math.abs(vf);
    const authority = Math.min(1, speedAbs / 7) / (1 + speedAbs / 48);
    const dir = vf >= -0.5 ? 1 : -1;
    const steerRate = -input.steer * 2.5 * authority * dir * (hb ? 1.6 : 1);
    this.heading += steerRate * dt;
    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    vf = this.vx * fx + this.vz * fz;
    vl = this.vx * sx + this.vz * sz;

    // --- longitudinal ---
    if (input.throttle > 0) {
      if (vf < maxSpeed) vf += ACCEL * (wantsNitro ? 1.6 : 1) * (1 - Math.max(0, vf) / (maxSpeed + 8)) * dt;
      else vf -= (vf - maxSpeed) * Math.min(1, dt * 2);
    } else if (input.throttle < 0) {
      if (vf > 0.5) vf = Math.max(0, vf - BRAKE * dt);
      else vf = Math.max(-REVERSE_MAX, vf - ACCEL * 0.6 * dt);
    } else {
      vf *= Math.exp(-0.45 * dt);
    }
    if (hb) vf *= Math.exp(-0.9 * dt);

    // --- lateral grip: high normally, loose on handbrake or hard cornering at speed ---
    const hardTurn = Math.abs(input.steer) > 0.5 && speedAbs > 24;
    const grip = hb ? 1.1 : hardTurn ? 4.2 : 9;
    vl *= Math.exp(-grip * dt);

    this.vx = fx * vf + sx * vl;
    this.vz = fz * vf + sz * vl;

    // --- integrate ---
    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    this.collide();

    // recompute components after collisions
    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    this.forwardSpeed = this.vx * fx + this.vz * fz;
    this.lateralSpeed = this.vx * sx + this.vz * sz;

    // --- drift FX ---
    this.drifting = Math.abs(this.lateralSpeed) > 3.2 && this.speed > 8;
    if (this.drifting) {
      this.skidAccum += this.speed * dt;
      if (this.skidAccum > 0.6) {
        this.skidAccum = 0;
        for (const side of [-0.85, 0.85]) {
          const wx = this.position.x - fx * 1.35 + sx * side;
          const wz = this.position.z - fz * 1.35 + sz * side;
          spawnSkid(wx, wz, Math.atan2(this.vx, this.vz));
        }
      }
      spawnDust(this.position.x - fx * 1.5, this.position.z - fz * 1.5, this.vx, this.vz, 1);
    } else if (wantsNitro || (input.throttle > 0 && this.speed < 6 && input.handbrake)) {
      spawnDust(this.position.x - fx * 2, this.position.z - fz * 2, -fx * 4, -fz * 4, 1);
    }

    this.syncModel(dt, input);
  }

  private syncModel(dt: number, input?: Input): void {
    const m = this.model;
    m.root.position.set(this.position.x, 0.08, this.position.z);
    m.root.rotation.y = this.heading;

    // body roll/pitch for weight transfer
    const accel = dt > 0 ? (this.forwardSpeed - this.prevFwd) / dt : 0;
    this.prevFwd = this.forwardSpeed;
    const targetRoll = THREE.MathUtils.clamp(-this.lateralSpeed * 0.012, -0.12, 0.12);
    const targetPitch = THREE.MathUtils.clamp(-accel * 0.002, -0.06, 0.06);
    const k = 1 - Math.exp(-dt * 8);
    this.roll += (targetRoll - this.roll) * k;
    this.pitch += (targetPitch - this.pitch) * k;
    m.body.rotation.set(this.pitch, 0, this.roll);

    // wheels
    const steer = input ? -input.steer * 0.5 : 0;
    this.steerVis += (steer - this.steerVis) * (1 - Math.exp(-dt * 14));
    this.wheelSpin += (this.forwardSpeed * dt) / m.wheelRadius;
    for (const p of m.frontPivots) p.rotation.y = this.steerVis;
    for (const w of m.wheelMeshes) w.rotation.x = this.wheelSpin;

    // lights: brake lights brighten when braking
    const braking = input ? input.throttle < 0 && this.forwardSpeed > 0.5 : false;
    m.tailMat.emissiveIntensity = braking ? 3.2 : 1.0;
  }

  private collide(): void {
    const b = BOUNDS;
    // world bounds act as soft walls
    if (this.position.x < b.minX) { this.position.x = b.minX; this.bounce(1, 0); }
    if (this.position.x > b.maxX) { this.position.x = b.maxX; this.bounce(-1, 0); }
    if (this.position.z < b.minZ) { this.position.z = b.minZ; this.bounce(0, 1); }
    if (this.position.z > b.maxZ) { this.position.z = b.maxZ; this.bounce(0, -1); }

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (let iter = 0; iter < 2; iter++) {
      for (const off of CIRCLE_OFFSETS) {
        const cx = this.position.x + fx * off;
        const cz = this.position.z + fz * off;

        for (const box of this.world.boxes) {
          if (cx < box.minX - CIRCLE_R || cx > box.maxX + CIRCLE_R || cz < box.minZ - CIRCLE_R || cz > box.maxZ + CIRCLE_R) continue;
          const nx = Math.max(box.minX, Math.min(cx, box.maxX));
          const nz = Math.max(box.minZ, Math.min(cz, box.maxZ));
          let dx = cx - nx;
          let dz = cz - nz;
          let d = Math.hypot(dx, dz);
          if (d >= CIRCLE_R) continue;
          if (d < 1e-4) {
            // center inside the box: push out along the shallowest axis
            const pushes = [cx - box.minX, box.maxX - cx, cz - box.minZ, box.maxZ - cz];
            const mi = pushes.indexOf(Math.min(...pushes));
            dx = mi === 0 ? -1 : mi === 1 ? 1 : 0;
            dz = mi === 2 ? -1 : mi === 3 ? 1 : 0;
            d = 0;
            this.push(dx, dz, CIRCLE_R + pushes[mi]);
          } else {
            this.push(dx / d, dz / d, CIRCLE_R - d);
          }
        }
        for (const c of this.world.circles) {
          const dx = cx - c.x;
          const dz = cz - c.z;
          const r = CIRCLE_R + c.r;
          if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
          const d = Math.hypot(dx, dz);
          if (d >= r || d < 1e-4) continue;
          this.push(dx / d, dz / d, r - d);
        }
      }
    }
  }

  private push(nx: number, nz: number, depth: number): void {
    this.position.x += nx * depth;
    this.position.z += nz * depth;
    this.bounce(nx, nz);
  }

  private bounce(nx: number, nz: number): void {
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    const e = 0.25;
    this.vx -= (1 + e) * vn * nx;
    this.vz -= (1 + e) * vn * nz;
    // scrub a bit of tangential speed
    this.vx *= 0.985;
    this.vz *= 0.985;
    const impact = -vn;
    if (impact > 4) {
      this.hp = Math.max(0, this.hp - impact * 0.006);
      this.events.onImpact(impact);
    }
  }
}
