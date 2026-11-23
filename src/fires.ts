import type { Game } from './game';
import { bi } from './i18n';

export interface Fire { x: number; z: number; t: number; out: boolean; size: number }

/**
 * Fires. Now and then something catches fire in the street: flames and smoke rise, people run, the news reports it, and anyone standing in the
 * flames is hurt. The fire burns itself out in two minutes, but a fire crew can put it out sooner. A crew's fire truck sprays water while it
 * holds the scene (see emergency.ts). Fires are also announced on the event bus, so jobs and the news can react.
 */
export class Fires {
  readonly list: Fire[] = [];
  private timer = 420;
  private flameT = 0;

  constructor(private game: Game) {}

  /** Light a fire at a point (also used by tests and the fire crew's random calls). */
  ignite(x: number, z: number): Fire {
    const f: Fire = { x, z, t: 120, out: false, size: 1 };
    this.list.push(f);
    this.game.bus.emit({ type: 'fire', x, z });
    return f;
  }

  extinguish(f: Fire): void {
    if (f.out) return;
    f.out = true;
    const G = this.game;
    G.vfx.emitSmoke(f.x, 1, f.z, false, 8);
    G.popups.spawn(f.x, 3, f.z, bi('Fire out!', '불을 껐어요!'), '#5ec4ff');
  }

  nearest(x: number, z: number, r: number): Fire | null {
    let best: Fire | null = null, bd = r;
    for (const f of this.list) { if (f.out) continue; const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  markers(): { x: number; z: number }[] { return this.list.filter((f) => !f.out).map((f) => ({ x: f.x, z: f.z })); }

  /** A random place on the pavement beside a road, a good way from the player. */
  private randomSpot(): { x: number; z: number } | null {
    const G = this.game;
    const segs = G.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    for (let tries = 0; tries < 40; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - G.focusX, s.z - G.focusZ);
      if (d < 120 || d > 320) continue;
      const side = Math.random() < 0.5 ? 1 : -1;
      return { x: s.x - s.dz * side * (s.hw + 1.8), z: s.z + s.dx * side * (s.hw + 1.8) };
    }
    return null;
  }

  update(dt: number): void {
    const G = this.game;
    if (G.state === 'play' && !G.inside) {
      this.timer -= dt * G.clock.trouble();
      if (this.timer <= 0) {
        this.timer = 480 + Math.random() * 420;
        const p = this.randomSpot();
        if (p) this.ignite(p.x, p.z);
      }
    }
    this.flameT -= dt;
    for (const f of [...this.list]) {
      if (f.out) { this.list.splice(this.list.indexOf(f), 1); continue; }
      f.t -= dt;
      if (f.t <= 0) { f.out = true; continue; }
      const near = Math.hypot(f.x - G.focusX, f.z - G.focusZ);
      if (near < 160 && this.flameT <= 0) {
        G.vfx.emitFire(f.x, 0.4, f.z, 3, 1.4);
        if (Math.random() < 0.5) G.vfx.emitSmoke(f.x, 2.2, f.z, true, 1);
      }
      // standing in the flames hurts
      const p = G.humans.player;
      if (G.onFoot && !G.inside && Math.hypot(f.x - p.x, f.z - p.z) < 2.6) p.hp = Math.max(1, p.hp - 8 * dt);
    }
    if (this.flameT <= 0) this.flameT = 0.12;
  }
}
