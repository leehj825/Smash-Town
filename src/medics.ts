import type { Game } from './game';
import { St } from './combat';
import { Role, type Human } from './humans';
import type { GameVehicle } from './vehicles';

interface Job {
  body: Human;
  /** Seconds until the ambulance is sent. */
  delay: number;
  van: GameVehicle | null;
  phase: 'wait' | 'arrive' | 'work' | 'leave';
  t: number;
  dir: { x: number; z: number };
  spot: { x: number; z: number };
}

/**
 * When someone dies in the street an ambulance is called: it drives up along the nearest road, stops by the body for a few seconds,
 * takes the body away and drives off. It runs on the ordinary car physics (throttle and steering are set here every frame).
 */
export class Medics {
  private jobs: Job[] = [];
  constructor(private game: Game) {
    game.bus.on('civKilled', (e) => { if (!e.kids) this.report(e.human); });
  }

  get active(): boolean { return this.jobs.some((j) => j.van && j.phase !== 'wait'); }

  /** Call once for each civilian who has just died. */
  report(body: Human): void {
    if (this.jobs.length >= 2) return;
    this.jobs.push({ body, delay: 5, van: null, phase: 'wait', t: 0, dir: { x: 0, z: 1 }, spot: { x: body.x, z: body.z } });
  }

  private dispatch(j: Job): boolean {
    const G = this.game;
    let best = null as null | (typeof G.world.segments)[number], bd = Infinity;
    for (const s of G.world.segments) {
      if (s.hw < 5) continue;
      const along = Math.max(-s.len / 2, Math.min(s.len / 2, (j.body.x - s.x) * s.dx + (j.body.z - s.z) * s.dz));
      const px = s.x + s.dx * along, pz = s.z + s.dz * along;
      const d = Math.hypot(px - j.body.x, pz - j.body.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best || bd > 45) return false;
    const s = best;
    const along = Math.max(-s.len / 2 + 6, Math.min(s.len / 2 - 6, (j.body.x - s.x) * s.dx + (j.body.z - s.z) * s.dz));
    // stop in the near lane, a little way from the centre line
    const side = ((j.body.x - s.x) * -s.dz + (j.body.z - s.z) * s.dx) >= 0 ? 1 : -1;
    j.spot = { x: s.x + s.dx * along + -s.dz * side * (s.hw * 0.5), z: s.z + s.dz * along + s.dx * side * (s.hw * 0.5) };
    const sgn = Math.random() < 0.5 ? 1 : -1;
    j.dir = { x: s.dx * sgn, z: s.dz * sgn };
    const startAlong = Math.max(-s.len / 2 + 1, Math.min(s.len / 2 - 1, along - sgn * (s.len / 2 - 2)));
    const sx = s.x + s.dx * startAlong + -s.dz * side * (s.hw * 0.5), sz = s.z + s.dz * startAlong + s.dx * side * (s.hw * 0.5);
    j.van = G.spawnVehicle('ambulance', 0xf4f4f4, sx, sz, Math.atan2(j.dir.x, j.dir.z), 'parked');
    j.van.control.throttle = 0;
    j.phase = 'arrive'; j.t = 0;
    return true;
  }

  update(dt: number): void {
    const G = this.game;
    for (const j of [...this.jobs]) {
      const van = j.van;
      if (j.phase === 'wait') {
        j.delay -= dt;
        // the body may already be gone (respawned as someone else): nothing to collect
        if (j.body.state !== St.Dead || j.body.role !== Role.Civ) { this.jobs.splice(this.jobs.indexOf(j), 1); continue; }
        if (j.delay <= 0 && !this.dispatch(j)) { this.jobs.splice(this.jobs.indexOf(j), 1); }
        continue;
      }
      if (!van) continue;
      const c = van.ctrl;
      const cleanup = () => { G.removeVehicle(van); this.jobs.splice(this.jobs.indexOf(j), 1); };
      if (c.wrecked || c.hp <= 0) { cleanup(); continue; }
      j.t += dt;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      if (j.phase === 'arrive') {
        const dx = j.spot.x - van.x, dz = j.spot.z - van.z;
        const dist = Math.hypot(dx, dz);
        const ahead = dx * fx + dz * fz;
        const want = Math.atan2(dx, dz);
        let diff = want - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        van.control.steer = Math.max(-1, Math.min(1, diff * 2));
        const speed = c.speed;
        van.control.throttle = dist > 14 ? (speed < 16 ? 1 : 0.2) : speed > 4 ? -0.6 : 0.3;
        van.control.handbrake = false;
        if (dist < 5 || (ahead < 0 && dist < 9) || j.t > 25) { j.phase = 'work'; j.t = 0; van.control.throttle = 0; van.control.handbrake = true; }
      } else if (j.phase === 'work') {
        van.control.handbrake = true; van.control.throttle = 0;
        if (j.t > 4.5) {
          if (j.body.state === St.Dead) { j.body.stateT = 0.01; j.body.grounded = true; } // the body is taken away
          j.phase = 'leave'; j.t = 0; van.control.handbrake = false;
        }
      } else {
        van.control.throttle = 1; van.control.steer = 0;
        if (j.t > 7 || !G.nearPlayer(van.x, van.z, 120)) cleanup();
      }
    }
  }
}
