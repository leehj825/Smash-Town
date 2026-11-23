import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import type { GameVehicle } from './vehicles';

/**
 * The helipad: a white-and-yellow marker on a wide road (marked on the map). A light helicopter waits there. Walk up and press F as with any
 * vehicle, then fly: W/S forward and back, A/D turn, Space climb, Shift descend. Buildings block you below their roofs. Land (low and slow)
 * before you step out. If it is wrecked a new one is parked on the pad a minute later.
 */
export class Helipad {
  private spot: { x: number; z: number; heading: number } | null = null;
  private pad = new Beacon(0xffd23a, 4.2);
  heli: GameVehicle | null = null;
  private respawnT = 0;

  constructor(private game: Game) {
    game.scene.add(this.pad.group);
  }

  spotOf(): { x: number; z: number; heading: number } | null { this.ensureSpot(); return this.spot; }

  private ensureSpot(): void {
    if (this.spot) return;
    const segs = this.game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    const s = segs[Math.floor(segs.length * 0.27)];
    if (!s) return;
    this.spot = { x: s.x, z: s.z, heading: Math.atan2(s.dx, s.dz) };
    this.pad.setPosition(s.x, s.z);
  }

  markers(): { x: number; z: number }[] { return this.spot ? [this.spot] : []; }

  private park(): void {
    const G = this.game;
    const s = this.spot!;
    const v = G.spawnVehicle('helicopter', 0xe8ecf4, s.x, s.z, s.heading, 'parked');
    v.isGigTarget = true; // never swept up as an abandoned car
    this.heli = v;
  }

  update(dt: number): void {
    const G = this.game;
    this.ensureSpot();
    this.pad.update(dt);
    if (!this.spot || G.state !== 'play') return;
    const h = this.heli;
    if (h && !G.vehicles.includes(h)) this.heli = null;
    this.pad.visible = !this.heli || (!!G.driving && G.driving === this.heli) === false;
    const d = Math.hypot(this.spot.x - G.focusX, this.spot.z - G.focusZ);
    if (!this.heli) {
      if (d < 140 && !G.inside) { this.respawnT -= dt; if (this.respawnT <= 0) { this.park(); G.hud.toast(bi('A helicopter waits at the helipad (yellow marker).', '헬리패드에 헬기가 있어요 (노란 마커).'), 3000); } }
    } else if (this.heli.ctrl.wrecked) {
      this.respawnT = 60;
      if (d > 80) { G.removeVehicle(this.heli); this.heli = null; }
    }
  }
}
