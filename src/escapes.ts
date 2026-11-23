import * as THREE from 'three';
import type { Game } from './game';
import { bi } from './i18n';
import { MeshBuilder, paletteMaterial } from './geo';
import type { Ramp, RoadSegment } from './world';

/**
 * Ways to get away, beyond just driving fast.
 *  - Shortcuts: a bike or scooter can cut across a park, a plaza or the beach, where a police car will not follow. Stay on one for two seconds
 *    and the cruisers around you turn back and your heat drops. (The city has no alleys narrower than a street, so the footpath areas do the job.)
 *  - Stunt ramps: a few concrete jump ramps stand on the wide roads of the harbour, the beach and downtown. They are marked on the map.
 *  - (Vaulting low props on foot lives in humans.ts, and the metro takes you away if no cop is on you: see transit.ts.)
 */
export class Escapes {
  ramps: { ramp: Ramp; seg: RoadSegment }[] = [];
  private inAlley = 0;
  private told = 0;
  private scanT = 0;
  private built = false;

  constructor(private game: Game) {}

  markers(): { x: number; z: number }[] { return this.ramps.map((r) => ({ x: r.ramp.x, z: r.ramp.z })); }

  /** Is this point on a footpath area (a park, plaza or beach lot)? Bikes ride across them; police cars will not. */
  alleyAt(x: number, z: number): boolean {
    for (const l of this.game.world.lots) {
      if (l.district !== 'park' && l.district !== 'plaza' && l.district !== 'beach') continue;
      if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1) return true;
    }
    return false;
  }

  /** Place the ramps on the wide roads of three districts. */
  private build(): void {
    const G = this.game;
    this.built = true;
    const want = ['harbor', 'beach', 'downtown'];
    const mat = paletteMaterial();
    for (const area of want) {
      const segs = G.world.segments.filter((s) => s.len >= 44 && s.hw >= 6 && G.reputation.area(s.x, s.z) === area);
      const s = segs[Math.floor(segs.length / 2)];
      if (!s) continue;
      // the ramp sits on the road, aimed along it, a third of the way along so cars come at it straight
      const x = s.x - s.dx * s.len * 0.2, z = s.z - s.dz * s.len * 0.2;
      const ramp: Ramp = { x, z, dx: s.dx, dz: s.dz, len: 8, width: 4.4, h: 1.5 };
      G.world.ramps.push(ramp);
      this.ramps.push({ ramp, seg: s });
      const b = new MeshBuilder();
      b.box(ramp.width, ramp.h, ramp.len, 0, ramp.h / 2, 0, 0x8a8f99, (p) => {
        for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0 && p.getY(i) > 0) p.setY(i, -p.getY(i)); // low end at the back, rising toward +z
      });
      b.box(ramp.width + 0.1, 0.05, 0.5, 0, 0.1, -ramp.len / 2 + 0.3, 0xffd23a); // hazard stripe at the foot
      b.box(0.2, 1.3, 0.2, ramp.width / 2 + 0.3, 0.65, -ramp.len / 2, 0xffd23a); b.box(0.2, 1.3, 0.2, -ramp.width / 2 - 0.3, 0.65, -ramp.len / 2, 0xffd23a); // marker posts
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = Math.atan2(s.dx, s.dz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      G.scene.add(mesh);
    }
  }

  update(dt: number): void {
    const G = this.game;
    if (!this.built && G.state === 'play') this.build();
    this.told = Math.max(0, this.told - dt);
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.2;
    const d = G.driving;
    const bike = !!d && !G.onFoot && (d.kind === 'motorbike' || d.kind === 'scooter' || d.kind === 'bicycle');
    if (!bike || G.stars === 0 || G.inside || !this.alleyAt(d!.x, d!.z)) { this.inAlley = 0; return; }
    this.inAlley += 0.2;
    G.coolHeat(8 * 0.2, 1);
    if (this.inAlley >= 2) {
      let turned = 0;
      for (const v of [...G.vehicles]) {
        if (v.ai !== 'police' || v.ctrl.wrecked) continue;
        if (Math.hypot(v.x - d!.x, v.z - d!.z) < 70) { G.removeVehicle(v); turned++; }
      }
      if (turned > 0) {
        G.coolHeat(30, 1);
        if (this.told <= 0) { this.told = 20; G.hud.toast(bi('The cruisers will not follow a bike across the park!', '순찰차는 공원을 가로지르는 오토바이를 따라오지 않아요!'), 2600); }
      }
    }
  }
}
