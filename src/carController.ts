import * as THREE from 'three';
import type { ControlState } from './input';
import { tunedStats, nitroEfficiency } from './upgrades';
import { STATS, dimsOf, type VehicleKind, type VehicleModel, type VehicleStats } from './vehicle';
import type { CircleCollider, World } from './world';

export interface CarEvents {
  onImpact: (strength: number) => void;
  onSmash: (circle: CircleCollider, vx: number, vz: number, speed: number) => void;
  onLand: (distance: number) => void;
}

export interface CarFx {
  skid: (x: number, z: number, h: number) => void;
  dust: (x: number, z: number, vx: number, vz: number, n: number) => void;
}

const NITRO_BOOST = 1.5;
const REVERSE_MAX = 12;
const GRAVITY = 24;

/** Snappy arcade driving: decoupled forward/lateral velocity with tunable grip, drift on handbrake, ramps & jumps. */
export class CarController {
  position = new THREE.Vector3();
  heading = Math.PI;
  vx = 0;
  vz = 0;
  vy = 0;
  forwardSpeed = 0;
  lateralSpeed = 0;
  nitro = 1;
  hp = 1;
  nitroActive = false;
  /** Nitro tuning: multiplies duration and recharge. */
  nitroEff = 1;
  drifting = false;
  airborne = false;
  wrecked = false;
  useRamps = true;
  /** Incremented on each landing; `lastJump` is that jump's horizontal distance. */
  jumpSeq = 0;
  lastJump = 0;

  stats: VehicleStats;
  /** Road grip multiplier set by the weather (1 = dry). */
  static gripMul = 1;
  private radius: number;
  private offsets: number[];
  private steerVis = 0;
  private wheelSpin = 0;
  private roll = 0;
  private pitch = 0;
  private prevFwd = 0;
  private skidAccum = 0;
  private airStartX = 0;
  private airStartZ = 0;
  private lastRampVy = 0;

  constructor(public model: VehicleModel, public kind: VehicleKind, private world: World, private events: CarEvents) {
    this.stats = STATS[kind];
    const d = dimsOf(kind);
    this.radius = d.radius;
    this.offsets = d.offsets;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
  get camScale(): number { return 1; }
  get collisionRadius(): number { return this.radius; }
  get collisionOffsets(): number[] { return this.offsets; }

  reset(x: number, z: number, heading: number): void {
    this.position.set(x, 0, z);
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.airborne = false;
    this.hp = 1;
    this.nitro = 1;
    this.wrecked = false;
    this.syncModel(0);
  }

  setModel(model: VehicleModel): void {
    this.model = model;
    this.syncModel(0);
  }

  /** Apply garage upgrades (engine, nitro, armor, tires) on top of the base stats. */
  setUpgrades(up: number[]): void {
    this.stats = tunedStats(STATS[this.kind], up);
    this.nitroEff = nitroEfficiency(up);
  }

  /** Apply damage scaled by this vehicle's toughness. */
  damage(amount: number): void {
    if (this.wrecked) return;
    this.hp = Math.max(0, this.hp - amount * this.stats.dmg);
  }

  update(dt: number, ctl: ControlState, fx: CarFx | null): void {
    const st = this.stats;
    const wrecked = this.wrecked;
    const throttle = wrecked ? 0 : ctl.throttle;
    const steerIn = wrecked ? 0 : ctl.steer;
    const hb = wrecked ? true : ctl.handbrake;

    let fx_ = Math.sin(this.heading), fz_ = Math.cos(this.heading);
    let sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
    let vf = this.vx * fx_ + this.vz * fz_;
    let vl = this.vx * sx + this.vz * sz;

    // --- nitro ---
    const wantsNitro = !wrecked && ctl.nitro && throttle > 0 && this.nitro > 0.02 && !this.airborne;
    this.nitroActive = wantsNitro;
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - (dt * 0.35) / this.nitroEff);
    else this.nitro = Math.min(1, this.nitro + dt * 0.12 * this.nitroEff);
    const maxSpeed = wantsNitro ? st.maxSpeed * 1.47 : st.maxSpeed;

    const grounded = !this.airborne;

    // --- steering ---
    const speedAbs = Math.abs(vf);
    const authority = Math.min(1, speedAbs / 7) / (1 + speedAbs / 48);
    const dir = vf >= -0.5 ? 1 : -1;
    const steerRate = -steerIn * 2.5 * authority * dir * (hb ? 1.6 : 1) * (grounded ? 1 : 0.25);
    this.heading += steerRate * dt;
    fx_ = Math.sin(this.heading); fz_ = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    vf = this.vx * fx_ + this.vz * fz_;
    vl = this.vx * sx + this.vz * sz;

    // --- longitudinal ---
    if (grounded) {
      if (throttle > 0) {
        if (vf < maxSpeed) vf += st.accel * (wantsNitro ? NITRO_BOOST : 1) * (1 - Math.max(0, vf) / (maxSpeed + 8)) * dt;
        else vf -= (vf - maxSpeed) * Math.min(1, dt * 2);
      } else if (throttle < 0) {
        if (vf > 0.5) vf = Math.max(0, vf - 46 * dt);
        else vf = Math.max(-REVERSE_MAX, vf - st.accel * 0.6 * dt);
      } else {
        vf *= Math.exp(-0.45 * dt);
      }
      if (hb) vf *= Math.exp(-0.9 * dt);

      const hardTurn = Math.abs(steerIn) > 0.5 && speedAbs > st.maxSpeed * 0.63;
      const grip = (hb ? 1.1 : hardTurn ? st.grip * 0.47 : st.grip) * CarController.gripMul;
      vl *= Math.exp(-grip * dt);
    }

    this.vx = fx_ * vf + sx * vl;
    this.vz = fz_ * vf + sz * vl;

    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;

    this.collide();
    this.vertical(dt);

    fx_ = Math.sin(this.heading); fz_ = Math.cos(this.heading);
    sx = Math.cos(this.heading); sz = -Math.sin(this.heading);
    this.forwardSpeed = this.vx * fx_ + this.vz * fz_;
    this.lateralSpeed = this.vx * sx + this.vz * sz;

    // --- drift FX ---
    this.drifting = !this.airborne && Math.abs(this.lateralSpeed) > 3.2 && this.speed > 8;
    if (fx) {
      if (this.drifting) {
        this.skidAccum += this.speed * dt;
        if (this.skidAccum > 0.6) {
          this.skidAccum = 0;
          for (const side of [-0.85, 0.85]) {
            fx.skid(this.position.x - fx_ * 1.35 + sx * side, this.position.z - fz_ * 1.35 + sz * side, Math.atan2(this.vx, this.vz));
          }
        }
        fx.dust(this.position.x - fx_ * 1.5, this.position.z - fz_ * 1.5, this.vx, this.vz, 1);
      } else if (wantsNitro) {
        fx.dust(this.position.x - fx_ * 2, this.position.z - fz_ * 2, -fx_ * 4, -fz_ * 4, 1);
      }
    }
    this.syncModel(dt, ctl);
  }

  /** Ramps: height field + ballistic flight. */
  private vertical(dt: number): void {
    let ground = 0;
    let slope = 0;
    if (this.useRamps) {
      for (const r of this.world.ramps) {
        const rx = this.position.x - r.x;
        const rz = this.position.z - r.z;
        const along = rx * r.dx + rz * r.dz;
        const lat = Math.abs(-rx * r.dz + rz * r.dx);
        if (lat < r.width / 2 && along > -r.len / 2 && along < r.len / 2) {
          const t = (along + r.len / 2) / r.len;
          ground = Math.max(ground, r.h * t);
          slope = r.h / r.len;
        }
      }
    }
    const y = this.position.y;
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= ground) {
        const landSpeed = -this.vy;
        this.position.y = ground;
        this.vy = 0;
        this.airborne = false;
        const dist = Math.hypot(this.position.x - this.airStartX, this.position.z - this.airStartZ);
        this.lastJump = dist;
        this.jumpSeq++;
        this.events.onLand(dist);
        if (landSpeed > 8) {
          this.events.onImpact(landSpeed * 0.8);
          this.damage(landSpeed * 0.004);
        }
      }
    } else if (ground > 0 || y > 0.001) {
      if (ground > 0) {
        // on a ramp: follow the surface; remember the climb rate for takeoff
        this.lastRampVy = slope * (this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading));
        this.position.y = ground;
      } else if (y > 0.3 && this.lastRampVy > 1) {
        // left the top of the ramp -> airborne
        this.airborne = true;
        this.vy = this.lastRampVy;
        this.airStartX = this.position.x;
        this.airStartZ = this.position.z;
      } else {
        this.position.y = 0;
      }
    }
  }

  private syncModel(dt: number, ctl?: ControlState): void {
    const m = this.model;
    m.root.position.set(this.position.x, this.position.y + 0.08, this.position.z);
    m.root.rotation.y = this.heading;

    const accel = dt > 0 ? (this.forwardSpeed - this.prevFwd) / dt : 0;
    this.prevFwd = this.forwardSpeed;
    const targetRoll = THREE.MathUtils.clamp(-this.lateralSpeed * 0.012, -0.12, 0.12);
    let targetPitch = THREE.MathUtils.clamp(-accel * 0.002, -0.06, 0.06);
    if (this.airborne) targetPitch = THREE.MathUtils.clamp(-this.vy * 0.03, -0.35, 0.35);
    else if (this.position.y > 0.05) targetPitch = -0.3;
    const k = 1 - Math.exp(-dt * 8);
    this.roll += (targetRoll - this.roll) * k;
    this.pitch += (targetPitch - this.pitch) * k;
    m.body.rotation.set(this.pitch, 0, this.roll);

    if (m.full) {
      const steer = ctl ? -ctl.steer * 0.5 : 0;
      this.steerVis += (steer - this.steerVis) * (1 - Math.exp(-dt * 14));
      this.wheelSpin += (this.forwardSpeed * dt) / m.wheelRadius;
      for (const p of m.frontPivots) p.rotation.y = this.steerVis;
      for (const w of m.wheelMeshes) w.rotation.x = this.wheelSpin;
      const braking = ctl ? ctl.throttle < 0 && this.forwardSpeed > 0.5 : false;
      m.tailMat.emissiveIntensity = braking ? 3.2 : 1.0;
    }
  }

  /** A car on a showroom stand (the garage turntable) ignores the world: the room is outside the city's bounds. */
  display = false;

  private collide(): void {
    if (this.display) return;
    const b = this.world.bounds;
    if (this.position.x < b.minX) { this.position.x = b.minX; this.bounce(1, 0); }
    if (this.position.x > b.maxX) { this.position.x = b.maxX; this.bounce(-1, 0); }
    if (this.position.z < b.minZ) { this.position.z = b.minZ; this.bounce(0, 1); }
    if (this.position.z > b.maxZ) { this.position.z = b.maxZ; this.bounce(0, -1); }
    if (this.airborne && this.position.y > 1.5) return; // flying over props

    const R = this.radius;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (let iter = 0; iter < 2; iter++) {
      for (const off of this.offsets) {
        const cx = this.position.x + fx * off;
        const cz = this.position.z + fz * off;

        for (const box of this.world.boxes) {
          if (cx < box.minX - R || cx > box.maxX + R || cz < box.minZ - R || cz > box.maxZ + R) continue;
          const nx = Math.max(box.minX, Math.min(cx, box.maxX));
          const nz = Math.max(box.minZ, Math.min(cz, box.maxZ));
          const dx = cx - nx;
          const dz = cz - nz;
          const d = Math.hypot(dx, dz);
          if (d >= R) continue;
          if (d < 1e-4) {
            const pushes = [cx - box.minX, box.maxX - cx, cz - box.minZ, box.maxZ - cz];
            const mi = pushes.indexOf(Math.min(...pushes));
            const ox = mi === 0 ? -1 : mi === 1 ? 1 : 0;
            const oz = mi === 2 ? -1 : mi === 3 ? 1 : 0;
            this.push(ox, oz, R + pushes[mi]);
          } else {
            this.push(dx / d, dz / d, R - d);
          }
        }
        for (const c of this.world.circles) {
          if (c.dead) continue;
          const dx = cx - c.x;
          const dz = cz - c.z;
          const r = R + c.r;
          if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
          const d = Math.hypot(dx, dz);
          if (d >= r || d < 1e-4) continue;
          if (c.smash && this.speed > 3.5) {
            this.events.onSmash(c, this.vx, this.vz, this.speed);
            this.vx *= 0.96;
            this.vz *= 0.96;
            continue;
          }
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

  bounce(nx: number, nz: number): void {
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return;
    const e = 0.25;
    this.vx -= (1 + e) * vn * nx;
    this.vz -= (1 + e) * vn * nz;
    this.vx *= 0.985;
    this.vz *= 0.985;
    const impact = -vn;
    if (impact > 4) {
      this.damage(impact * 0.006);
      this.events.onImpact(impact);
    }
  }
}
