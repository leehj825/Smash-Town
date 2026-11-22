import type { Game } from './game';
import { bi } from './i18n';
import type { Roof } from './world';

export interface ClimbState { t: number; dur: number; fx: number; fz: number; fy: number; tx: number; tz: number; ty: number; roof: Roof; up: boolean }

/** Ladders up the sides of old-town buildings: climbing to a rooftop and back down. */
export class Climber {
  state: ClimbState | null = null;
  constructor(private game: Game) {}

  /** The ladder you could use right now (up from the street, or down from the roof), or null. */
  option(): { roof: Roof; up: boolean } | null {
    const G = this.game;
    if (!G.onFoot || this.state || G.inside || G.state !== 'play') return null;
    const pl = G.humans.player;
    if (pl.roof && pl.y >= pl.roof.h - 0.5) {
      const r = pl.roof;
      const tx = r.ladder.x - r.ladder.nx * 0.55, tz = r.ladder.z - r.ladder.nz * 0.55;
      return Math.hypot(pl.x - tx, pl.z - tz) < 2.7 ? { roof: r, up: false } : null;
    }
    if (pl.y > 1) return null;
    for (const r of G.world.roofs) if (Math.hypot(pl.x - r.ladder.x, pl.z - r.ladder.z) < 1.9) return { roof: r, up: true };
    return null;
  }

  start(o: { roof: Roof; up: boolean }): void {
    const G = this.game;
    const pl = G.humans.player;
    const r = o.roof, L = r.ladder;
    this.state = o.up
      ? { t: 0, dur: 0.35 + r.h * 0.13, fx: pl.x, fz: pl.z, fy: pl.y, tx: L.x - L.nx * 1.7, tz: L.z - L.nz * 1.7, ty: r.h, roof: r, up: true }
      : { t: 0, dur: 0.35 + r.h * 0.11, fx: pl.x, fz: pl.z, fy: pl.y, tx: L.x, tz: L.z, ty: 0.1, roof: r, up: false };
    pl.roof = r;
    G.audio.step();
  }

  apply(dt: number): void {
    const G = this.game;
    const c = this.state;
    if (!c) return;
    const pl = G.humans.player;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    pl.x = c.fx + (c.tx - c.fx) * k; pl.z = c.fz + (c.tz - c.fz) * k; pl.y = c.fy + (c.ty - c.fy) * k;
    pl.vy = 0; pl.grounded = true; pl.mvx = pl.mvz = pl.vx = pl.vz = 0; pl.invuln = 0.3; pl.peak = pl.y;
    pl.heading = Math.atan2(-c.roof.ladder.nx, -c.roof.ladder.nz);
    if (k >= 1) {
      this.state = null;
      pl.roof = c.up ? c.roof : null;
      pl.y = c.ty;
      if (c.up) { G.progress.add('roofs'); G.hud.toast(bi('Rooftop! Golden stars shine from up here.', '옥상이에요! 위에는 황금 별이 빛나요.'), 2200); }
    }
  }
}
