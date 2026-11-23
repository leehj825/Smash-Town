import * as THREE from 'three';
import type { Game } from './game';
import { MeshBuilder, paletteMaterial } from './geo';
import { bi } from './i18n';
import { AREA_NAMES, type Area } from './reputation';

interface Stop { x: number; z: number; sx: number; sz: number; heading: number }
interface Station extends Stop { name: [string, string] }

/** Station indexes are offset by this in `near()` / `prompt()` / `ride()` so one number says which kind of stop you are at. */
export const METRO = 1000;

/**
 * The city bus line: every bus shelter is a stop. Stand at one and press F to ride to the next stop on the line for $5; the line runs in a loop
 * from west to east and back, so you can reach the far side of town without driving. Not while the police are after you.
 *
 * The metro: six stations along the long roads, each with a purple sign. The express rides two stations ahead for $12, so it covers far more
 * ground than the bus.
 */
export class Transit {
  readonly stops: Stop[] = [];
  readonly stations: Station[] = [];

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
    this.buildMetro();
  }

  private buildMetro(): void {
    const G = this.game;
    const segs = G.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    if (segs.length < 6) return;
    const b = new MeshBuilder();
    const used = new Set<string>();
    for (const f of [0.06, 0.2, 0.36, 0.52, 0.68, 0.9]) {
      const s = segs[Math.min(segs.length - 1, Math.floor(segs.length * f))];
      const side = 1;
      const x = s.x - s.dz * side * (s.hw + 3.2), z = s.z + s.dx * side * (s.hw + 3.2);
      let area = G.reputation.area(x, z) as Area;
      let nm = AREA_NAMES[area];
      let k = 2;
      while (used.has(nm[0])) { nm = [`${AREA_NAMES[area][0]} ${k}`, `${AREA_NAMES[area][1]} ${k}`]; k++; }
      used.add(nm[0]);
      this.stations.push({ x, z, sx: x, sz: z, heading: Math.atan2(s.dx, s.dz), name: nm });
      // a small entrance: stair canopy and a purple sign
      b.box(3.2, 0.15, 3.0, x, 0.15, z, 0x6b6f7a);
      b.box(0.15, 2.4, 0.15, x - 1.5, 1.35, z - 1.4, 0x4a4e58); b.box(0.15, 2.4, 0.15, x + 1.5, 1.35, z - 1.4, 0x4a4e58);
      b.box(0.15, 2.4, 0.15, x - 1.5, 1.35, z + 1.4, 0x4a4e58); b.box(0.15, 2.4, 0.15, x + 1.5, 1.35, z + 1.4, 0x4a4e58);
      b.box(3.4, 0.2, 3.2, x, 2.65, z, 0x8e44ad);
      b.box(1.2, 0.8, 0.12, x, 3.3, z, 0xffffff); b.box(0.9, 0.5, 0.14, x, 3.3, z, 0x8e44ad);
      b.box(2.4, 0.04, 2.0, x, 0.26, z, 0x15151a);
    }
    const mesh = new THREE.Mesh(b.build(), paletteMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    G.scene.add(mesh);
  }

  /** The stop you are standing at (within 3.5 m), or -1. */
  near(): number {
    const p = this.game.humans.player;
    for (let i = 0; i < this.stations.length; i++) if (Math.hypot(this.stations[i].sx - p.x, this.stations[i].sz - p.z) < 3.2) return METRO + i;
    for (let i = 0; i < this.stops.length; i++) if (Math.hypot(this.stops[i].sx - p.x, this.stops[i].sz - p.z) < 3.5) return i;
    return -1;
  }

  prompt(i: number): string {
    if (i >= METRO) {
      const to = this.stations[(i - METRO + 2) % this.stations.length];
      return this.game.stars > 0
        ? bi('Metro - the police are watching you', '지하철 - 경찰이 지켜보고 있어요')
        : `${bi('[F] Metro express to', '[F] 지하철 급행:')} ${bi(to.name[0], to.name[1])} ${bi('Station', '역')} - $12`;
    }
    return this.game.stars > 0
      ? bi('Bus stop - the police are watching you', '버스 정류장 - 경찰이 지켜보고 있어요')
      : `${bi('[F] Ride the bus to the next stop', '[F] 버스 타고 다음 정류장으로')} - $5`;
  }

  /** Ride to the next stop on the line. Returns false if refused. */
  ride(i: number): boolean {
    const G = this.game;
    if (i >= METRO) {
      if (G.stars > 0) { G.hud.toast(bi('No metro while the police are after you', '경찰에 쫓기는 동안은 지하철을 탈 수 없어요'), 2200); return false; }
      if (this.stations.length < 3 || !G.pay(12)) return false;
      const to = this.stations[(i - METRO + 2) % this.stations.length];
      G.travelTo(to.sx, to.sz, to.heading, `${bi(to.name[0], to.name[1])} ${bi('Station', '역')}`);
      return true;
    }
    if (G.stars > 0) { G.hud.toast(bi('No bus while the police are after you', '경찰에 쫓기는 동안은 버스를 탈 수 없어요'), 2200); return false; }
    if (this.stops.length < 2) return false;
    if (!G.pay(5)) return false;
    const next = this.stops[(i + 1) % this.stops.length];
    G.travelTo(next.sx, next.sz, next.heading, bi('Next stop', '다음 정류장'));
    return true;
  }
}
