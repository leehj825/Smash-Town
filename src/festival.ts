import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';

/**
 * Festivals: every ten minutes or so the plaza holds a street party for a minute - a pink marker, fireworks overhead, and a tip from the crowd
 * for anyone who stays to enjoy the show. Police do not care, but a rampage there still counts.
 */
export class Festival {
  private beacon = new Beacon(0xff5db1, 8);
  private timer = 240;
  private left = 0;
  private spot: { x: number; z: number } | null = null;
  private burstT = 0;
  private stayed = 0;
  private paid = false;
  private count = 0;

  constructor(private game: Game) {
    game.scene.add(this.beacon.group);
    this.beacon.visible = false;
  }

  get active(): boolean { return this.left > 0; }
  get held(): number { return this.count; }
  markers(): { x: number; z: number }[] { return this.active && this.spot ? [this.spot] : []; }

  /** Start a festival now (the timer does this on its own). */
  start(): boolean {
    const G = this.game;
    const plazas = G.world.lots.filter((l) => l.district === 'plaza');
    if (!plazas.length) return false;
    const l = plazas[Math.floor(Math.random() * plazas.length)];
    this.spot = { x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2 };
    this.beacon.setPosition(this.spot.x, this.spot.z); this.beacon.visible = true;
    this.left = 70; this.stayed = 0; this.paid = false; this.count++;
    G.hud.toast(bi('Street party in the plaza! Fireworks tonight - go and enjoy.', '광장에서 거리 축제가 열려요! 불꽃놀이를 즐기러 가보세요.'), 4000);
    return true;
  }

  update(dt: number): void {
    const G = this.game;
    this.beacon.update(dt);
    if (G.state !== 'play' || G.inside) return;
    if (this.left <= 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 480 + Math.random() * 240; this.start(); }
      return;
    }
    this.left -= dt;
    const s = this.spot!;
    this.burstT -= dt;
    if (this.burstT <= 0 && Math.hypot(s.x - G.focusX, s.z - G.focusZ) < 260) {
      this.burstT = 0.45 + Math.random() * 0.5;
      const colors = [0xff5db1, 0x35e0ff, 0xffd23a, 0x7dff6a, 0xff7a1a, 0xc86bff];
      G.vfx.emitBurst(s.x + (Math.random() - 0.5) * 24, 28 + Math.random() * 18, s.z + (Math.random() - 0.5) * 24, colors[Math.floor(Math.random() * colors.length)], 34);
    }
    const px = G.driving && !G.onFoot ? G.driving.x : G.humans.player.x, pz = G.driving && !G.onFoot ? G.driving.z : G.humans.player.z;
    if (!this.paid && Math.hypot(px - s.x, pz - s.z) < 20 && G.stars === 0) {
      this.stayed += dt;
      if (this.stayed > 12) {
        this.paid = true;
        G.addCash(400, 'other');
        G.popups.spawn(px, 3, pz, bi('+$400 tips from the crowd', '+$400 관중 팁'), '#ff5db1');
      }
    }
    if (this.left <= 0) { this.beacon.visible = false; G.hud.toast(bi('The street party is over.', '거리 축제가 끝났어요.'), 2200); }
  }
}
