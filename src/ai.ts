import type { GameVehicle } from './vehicles';
import { CELL, GRID, type World } from './world';

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const LANE = 3.3;

export function pointBlocked(world: World, x: number, z: number, margin: number): boolean {
  for (const b of world.boxes) {
    if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return true;
  }
  return false;
}

/** Waypoint-based civilian traffic on the road grid (right-hand traffic, pure pursuit along lane lines). */
export class TrafficBrain {
  private ox = 0; private oz = 0; private dx = 1; private dz = 0;
  private endB = 0; private endA = 0;
  private cruise = 12;
  private stuck = 0;
  private rev = 0;

  constructor(rng: () => number) {
    this.cruise = 10 + rng() * 6;
  }

  /** Random lane position on a random road segment. */
  static randomPlacement(rng: () => number, avoidX = -999, avoidZ = -999, minDist = 0): { b: number; a: number; dx: number; dz: number; x: number; z: number; heading: number } {
    for (let tries = 0; tries < 30; tries++) {
      const b = Math.floor(rng() * (GRID + 1));
      const a = Math.floor(rng() * (GRID + 1));
      const [dx, dz] = DIRS[Math.floor(rng() * 4)];
      const eb = b + dx, ea = a + dz;
      if (eb < 0 || eb > GRID || ea < 0 || ea > GRID) continue;
      const t = 10 + rng() * 20;
      const rx = -dz, rz = dx;
      const x = b * CELL + rx * LANE + dx * t;
      const z = a * CELL + rz * LANE + dz * t;
      if (Math.hypot(x - avoidX, z - avoidZ) < minDist) continue;
      return { b, a, dx, dz, x, z, heading: Math.atan2(dx, dz) };
    }
    return { b: 4, a: 4, dx: 1, dz: 0, x: 4 * CELL + 10, z: 4 * CELL + LANE, heading: Math.PI / 2 };
  }

  /** Attach to the segment described by a placement. */
  attach(p: { b: number; a: number; dx: number; dz: number }): void {
    this.setSegment(p.b, p.a, p.dx, p.dz);
  }

  /** Attach to the nearest road segment in the car's current direction (used when cops give up the chase). */
  attachNearest(x: number, z: number, heading: number): void {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let best = Infinity, bestB = 0, bestA = 0, bdx = 1, bdz = 0;
    for (let b = 0; b <= GRID; b++) {
      for (let a = 0; a <= GRID; a++) {
        const d = Math.hypot(b * CELL - x, a * CELL - z);
        if (d > best) continue;
        for (const [dx, dz] of DIRS) {
          const eb = b + dx, ea = a + dz;
          if (eb < 0 || eb > GRID || ea < 0 || ea > GRID) continue;
          if (dx * fx + dz * fz < 0.3) continue;
          best = d; bestB = b; bestA = a; bdx = dx; bdz = dz;
        }
      }
    }
    this.setSegment(bestB, bestA, bdx, bdz);
  }

  private setSegment(b: number, a: number, dx: number, dz: number): void {
    this.dx = dx; this.dz = dz;
    this.ox = b * CELL + -dz * LANE;
    this.oz = a * CELL + dx * LANE;
    this.endB = b + dx; this.endA = a + dz;
  }

  private nextSegment(rng: () => number): void {
    const b = this.endB, a = this.endA;
    const cands: { d: [number, number]; w: number }[] = [];
    for (const d of DIRS) {
      if (d[0] === -this.dx && d[1] === -this.dz) continue;
      const nb = b + d[0], na = a + d[1];
      if (nb < 0 || nb > GRID || na < 0 || na > GRID) continue;
      cands.push({ d, w: d[0] === this.dx && d[1] === this.dz ? 3 : 1 });
    }
    if (!cands.length) {
      this.setSegment(b, a, -this.dx, -this.dz);
      return;
    }
    let r = rng() * cands.reduce((s, c) => s + c.w, 0);
    let pick = cands[0];
    for (const c of cands) { r -= c.w; if (r <= 0) { pick = c; break; } }
    this.setSegment(b, a, pick.d[0], pick.d[1]);
  }

  update(dt: number, v: GameVehicle, others: GameVehicle[], rng: () => number, people: readonly { x: number; z: number; active: boolean }[]): void {
    const c = v.ctrl;
    const px = c.position.x, pz = c.position.z;
    const t = (px - this.ox) * this.dx + (pz - this.oz) * this.dz;
    const endT = (this.endB * CELL - this.ox) * this.dx + (this.endA * CELL - this.oz) * this.dz;
    if (endT - t < 9) this.nextSegment(rng);
    const t2 = (px - this.ox) * this.dx + (pz - this.oz) * this.dz;
    const tx = this.ox + this.dx * (t2 + 11);
    const tz = this.oz + this.dz * (t2 + 11);
    const desired = Math.atan2(tx - px, tz - pz);
    const diff = wrap(desired - c.heading);
    const ctl = v.control;
    ctl.steer = clamp(-diff * 2.4, -1, 1);
    ctl.handbrake = false;
    ctl.nitro = false;

    let target = Math.abs(diff) > 0.5 ? 6 : this.cruise;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    for (const o of others) {
      if (o === v) continue;
      const rx = o.x - px, rz = o.z - pz;
      const ahead = rx * fx + rz * fz;
      if (ahead < 0 || ahead > 16) continue;
      const lat = Math.abs(rx * fz - rz * fx);
      if (lat < 2.7) target = Math.min(target, Math.max(0, (ahead - 6.5) * 1.1));
    }
    // people standing or walking in the lane (the player on foot, civilians): stop for them
    for (const p of people) {
      if (!p.active) continue;
      const rx = p.x - px, rz = p.z - pz;
      if (rx > 20 || rx < -20 || rz > 20 || rz < -20) continue;
      const ahead = rx * fx + rz * fz;
      if (ahead < 0 || ahead > 16) continue;
      const lat = Math.abs(rx * fz - rz * fx);
      if (lat < 2.2) target = Math.min(target, Math.max(0, (ahead - 7.5) * 1.2));
    }
    const sp = c.forwardSpeed;
    if (this.rev > 0) {
      this.rev -= dt;
      ctl.throttle = -1;
      ctl.steer = -ctl.steer;
      return;
    }
    ctl.throttle = sp < target - 1 ? 1 : sp > target + 1.5 ? -1 : 0;
    if (c.speed < 0.7 && target > 2) {
      this.stuck += dt;
      if (this.stuck > 2.2) { this.stuck = 0; this.rev = 1.1; }
    } else this.stuck = Math.max(0, this.stuck - dt);
  }
}

export type PoliceRole = 'cruiser' | 'interceptor' | 'swat' | 'armored';

export interface ChaseTarget { x: number; z: number; vx: number; vz: number; speed: number; onFoot: boolean }

/** Pursuit AI: steer toward a (predicted) target, with wall whiskers, stuck recovery and PIT-style ramming. */
export class PoliceBrain {
  private stuck = 0;
  private rev = 0;
  private side: number;

  constructor(readonly role: PoliceRole, rng: () => number) {
    this.side = rng() < 0.5 ? -1 : 1;
  }

  update(dt: number, v: GameVehicle, tg: ChaseTarget, world: World, stars: number): void {
    const c = v.ctrl;
    const px = c.position.x, pz = c.position.z;
    const ctl = v.control;
    const dist = Math.hypot(tg.x - px, tg.z - pz);

    let tx = tg.x, tz = tg.z;
    if (this.role === 'swat' || this.role === 'interceptor') {
      // predictive steering: aim where the player will be
      const lead = clamp(dist / Math.max(10, c.speed), 0, this.role === 'swat' ? 2.4 : 1.2);
      tx += tg.vx * lead; tz += tg.vz * lead;
    } else if (this.role === 'cruiser' && stars >= 2 && dist < 22 && tg.speed > 3) {
      // PIT: come in alongside the rear quarter
      const inv = 1 / Math.max(0.1, tg.speed);
      tx += -tg.vz * inv * this.side * 3.2; tz += tg.vx * inv * this.side * 3.2;
    }

    let desired = Math.atan2(tx - px, tz - pz);
    // whiskers: pick the closest heading to the goal whose probes are free of buildings
    const probe = (h: number) => {
      const s = Math.sin(h), co = Math.cos(h);
      return !(pointBlocked(world, px + s * 5, pz + co * 5, 1.4) || pointBlocked(world, px + s * 10, pz + co * 10, 1.4));
    };
    if (!probe(desired)) {
      for (const off of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
        if (probe(desired + off)) { desired += off; break; }
      }
    }
    const diff = wrap(desired - c.heading);
    ctl.steer = clamp(-diff * 2.6, -1, 1);
    ctl.nitro = false;
    ctl.handbrake = Math.abs(diff) > 1.25 && c.speed > 14;

    if (this.rev > 0) {
      this.rev -= dt;
      ctl.throttle = -1;
      ctl.steer = -ctl.steer;
      ctl.handbrake = false;
      return;
    }

    // police drive at ~88 % of their top speed, so a fast car can outrun them
    let want = c.stats.maxSpeed * 0.88;
    if (tg.onFoot) want = clamp((dist - 6) * 1.2, 0, 22); // roll to a stop about 6 m in front of a player on foot
    else if (dist < 9) want = Math.min(tg.speed + 5, c.stats.maxSpeed * 0.92); // ram
    if (Math.abs(diff) > 0.9) want = Math.min(want, 16);
    ctl.throttle = c.forwardSpeed < want ? 1 : c.forwardSpeed > want + 4 ? -1 : 0;
    if (tg.onFoot && dist < 7) { ctl.throttle = 0; ctl.handbrake = true; }

    if (c.speed < 1.2 && dist > 7) {
      this.stuck += dt;
      if (this.stuck > 1.2) { this.stuck = 0; this.rev = 1.0; }
    } else this.stuck = Math.max(0, this.stuck - dt);
  }
}
