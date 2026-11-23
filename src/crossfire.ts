import type { Game } from './game';
import { bi } from './i18n';
import { Role } from './humans';

interface Fight { t: number; shotT: number; blastT: number; told: boolean; cool: number }

/**
 * Crossfire. Lead the police into a gang's or the Mafia's block and the two sides shoot at each other instead of only at you: shots ring out,
 * cops near the block are pinned down and pull back, your heat drops while they are busy, and now and then something blows up. The blast is
 * an `explosion` event like any other, so it starts a fire, the fire crew gets the call, and the news reports it. Nothing here is a crime of
 * yours: the shots are marked `ambient`, so they do not train your shooting skill or count against you.
 */
export class Crossfire {
  private fights = new Map<number, Fight>();

  constructor(private game: Game) {}

  /** The block currently in a firefight (or null). */
  active(): number | null {
    for (const [i, f] of this.fights) if (f.t > 0) return i;
    return null;
  }

  update(dt: number): void {
    const G = this.game;
    if (G.state !== 'play' || G.inside) return;
    const zones = G.gangs.zones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      let f = this.fights.get(i);
      if (!f) { f = { t: 0, shotT: 0, blastT: 8, told: false, cool: 0 }; this.fights.set(i, f); }
      f.cool = Math.max(0, f.cool - dt);
      const near = Math.hypot(z.x - G.focusX, z.z - G.focusZ) < 80;
      const live = z.owner === 'gang' && z.members.length > 0 && G.stars > 0 && near;
      if (f.t <= 0) {
        if (live && f.cool <= 0 && this.copsNear(z.x, z.z, 45) > 0) { f.t = 35; f.told = false; }
        else continue;
      }
      if (!live) { f.t = Math.min(f.t, 0); f.cool = 90; continue; }
      f.t -= dt;
      if (f.t <= 0) { f.cool = 120; continue; }
      if (!f.told) {
        f.told = true;
        for (const m of z.members) m.hostile = true;
        G.bus.emit({ type: 'crossfire', x: z.x, z: z.z });
        G.hud.toast(bi(`The cops and ${z.name} are shooting at each other!`, `경찰과 ${z.nameKo}가 서로 총격전을 벌여요!`), 3200);
      }
      // the cops are busy: your heat falls
      G.coolHeat(3 * dt, 1);
      // shots between the two sides
      f.shotT -= dt;
      if (f.shotT <= 0) {
        f.shotT = 0.7 + Math.random() * 0.6;
        const sx = z.x + (Math.random() - 0.5) * 24, sz = z.z + (Math.random() - 0.5) * 24;
        G.bus.emit({ type: 'gunshot', x: sx, z: sz, ambient: true });
        G.vfx.emitSparks(sx, 1.2, sz, 5);
        if (G.nearPlayer(sx, sz, 90)) G.audio.gun('pistol');
        this.pinCop(z.x, z.z);
      }
      // now and then something blows up
      f.blastT -= dt;
      if (f.blastT <= 0) {
        f.blastT = 9 + Math.random() * 6;
        const bx = z.x + (Math.random() - 0.5) * 20, bz = z.z + (Math.random() - 0.5) * 20;
        G.vfx.explosion(bx, bz);
        G.bus.emit({ type: 'explosion', x: bx, z: bz, byPlayer: false });
        if (G.nearPlayer(bx, bz, 90)) { G.audio.explosion(); G.cameraRig.shake(0.4); }
      }
    }
  }

  private copsNear(x: number, z: number, r: number): number {
    let n = 0;
    for (const h of this.game.humans.list) if (h.active && h.role === Role.Cop && !h.gang && !h.leaving && Math.hypot(h.x - x, h.z - z) < r) n++;
    return n;
  }

  /** The nearest cop is pinned down: he backs off for a few seconds. */
  private pinCop(x: number, z: number): void {
    let best = null as null | { leaving: boolean; leaveT: number; x: number; z: number }, bd = 45;
    for (const h of this.game.humans.list) {
      if (!h.active || h.role !== Role.Cop || h.gang || h.leaving) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < bd) { bd = d; best = h; }
    }
    if (best && Math.random() < 0.35) { best.leaving = true; best.leaveT = 7; }
  }
}
