import type { Game } from './game';

export const AREAS = ['downtown', 'oldtown', 'harbor', 'suburb', 'beach', 'plaza', 'park'] as const;
export type Area = typeof AREAS[number];
export const AREA_NAMES: Record<Area, [string, string]> = {
  downtown: ['Downtown', '다운타운'], oldtown: ['Old Town', '올드타운'], harbor: ['Harbor', '항구'], suburb: ['Suburbs', '교외'],
  beach: ['Beach', '해변'], plaza: ['Plaza', '광장'], park: ['Park', '공원'],
};

/**
 * Reputation, district by district (-100 to +100). Hurting people and blowing things up costs you where it happened; helping out (paramedic
 * work, deliveries, fares, taking a gang's block) earns it back. It slowly drifts toward zero. The named people of the city treat you by how
 * you stand in their district. It listens to the event bus, so anything that happens in the city can move it.
 */
export class Reputation {
  private decayT = 0;

  constructor(private game: Game) {
    const bus = game.bus;
    bus.on('civAssaulted', (e) => this.add(e.x, e.z, -2));
    bus.on('civKilled', (e) => { if (e.byPlayer) this.add(e.x, e.z, -6); });
    bus.on('civRunOver', (e) => this.add(e.x, e.z, e.killed ? -5 : -2));
    bus.on('explosion', (e) => { if (e.byPlayer) this.add(e.x, e.z, -4); });
    bus.on('turfCaptured', (e) => { const z = game.gangs.zones[e.zone]; if (z) this.add(z.x, z.z, 10); });
    bus.on('helped', (e) => this.add(e.x, e.z, e.amount));
  }

  /** Which district a point is in (the nearest lot's). */
  area(x: number, z: number): Area {
    let best = this.game.world.lots[0], bd = Infinity;
    for (const l of this.game.world.lots) {
      const d = Math.hypot((l.x0 + l.x1) / 2 - x, (l.z0 + l.z1) / 2 - z);
      if (d < bd) { bd = d; best = l; }
    }
    const d = best.district as string;
    return (AREAS as readonly string[]).includes(d) ? (d as Area) : 'downtown';
  }

  get(area: Area): number { return this.game.save.rep?.[area] ?? 0; }
  at(x: number, z: number): number { return this.get(this.area(x, z)); }

  add(x: number, z: number, n: number): void {
    const a = this.area(x, z);
    const rep = (this.game.save.rep ??= {});
    rep[a] = Math.max(-100, Math.min(100, (rep[a] ?? 0) + n));
  }

  /** 'friendly' (25 and up), 'hostile' (-25 and down) or 'neutral'. */
  tier(x: number, z: number): 'friendly' | 'neutral' | 'hostile' {
    const r = this.at(x, z);
    return r >= 25 ? 'friendly' : r <= -25 ? 'hostile' : 'neutral';
  }

  update(dt: number): void {
    this.decayT += dt;
    if (this.decayT < 180) return;
    this.decayT = 0;
    const rep = this.game.save.rep;
    if (!rep) return;
    for (const k of Object.keys(rep)) rep[k] += rep[k] > 0 ? -1 : rep[k] < 0 ? 1 : 0;
  }
}
