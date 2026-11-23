import type { Game } from './game';
import { bi } from './i18n';

interface Stop { x: number; z: number; sx: number; sz: number; heading: number }

/**
 * The city bus line: every bus shelter is a stop. Stand at one and press F to ride to the next stop on the line for $5; the line runs in a loop
 * from west to east and back, so you can reach the far side of town without driving. Not while the police are after you.
 */
export class Transit {
  readonly stops: Stop[] = [];

  constructor(private game: Game) {
    const lots = game.world.lots;
    const raw = game.props.busStops();
    for (const p of raw) {
      // stand on the pavement side of the shelter: toward the middle of the lot it belongs to
      let best = lots[0], bd = Infinity;
      for (const l of lots) { const d = Math.hypot((l.x0 + l.x1) / 2 - p.x, (l.z0 + l.z1) / 2 - p.z); if (d < bd) { bd = d; best = l; } }
      const dir = p.z < (best.z0 + best.z1) / 2 ? 1 : -1;
      this.stops.push({ x: p.x, z: p.z, sx: p.x, sz: p.z + dir * 2.4, heading: dir > 0 ? 0 : Math.PI });
    }
    // the line: west to east, wrapping round
    this.stops.sort((a, b) => a.x - b.x || a.z - b.z);
  }

  /** The stop you are standing at (within 3.5 m), or -1. */
  near(): number {
    const p = this.game.humans.player;
    for (let i = 0; i < this.stops.length; i++) if (Math.hypot(this.stops[i].sx - p.x, this.stops[i].sz - p.z) < 3.5) return i;
    return -1;
  }

  prompt(_i: number): string {
    return this.game.stars > 0
      ? bi('Bus stop - the police are watching you', '버스 정류장 - 경찰이 지켜보고 있어요')
      : `${bi('[F] Ride the bus to the next stop', '[F] 버스 타고 다음 정류장으로')} - $5`;
  }

  /** Ride to the next stop on the line. Returns false if refused. */
  ride(i: number): boolean {
    const G = this.game;
    if (G.stars > 0) { G.hud.toast(bi('No bus while the police are after you', '경찰에 쫓기는 동안은 버스를 탈 수 없어요'), 2200); return false; }
    if (this.stops.length < 2) return false;
    if (!G.pay(5)) return false;
    const next = this.stops[(i + 1) % this.stops.length];
    G.travelTo(next.sx, next.sz, next.heading, bi('Next stop', '다음 정류장'));
    return true;
  }
}
