import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import type { Roof } from './world';

/** Rooftop Dash: climb the start roof, then reach three more rooftops before time runs out. */
export class RoofDash {
  private start: Roof | null;
  private chain: Roof[] = [];
  private step = -1; // -1 idle, 0.. next checkpoint index
  private time = 0;
  private cooldown = 0;
  private beacon = new Beacon(0x4dd2ff, 3.4);
  private startBeacon = new Beacon(0x4dd2ff, 3.4);

  constructor(private game: Game) {
    const roofs = game.world.roofs;
    this.start = roofs.length >= 4 ? roofs[0] : null;
    if (this.start) {
      const c = this.centre(this.start);
      this.startBeacon.setPosition(c.x, c.z);
      this.startBeacon.group.position.y = this.start.h;
      game.scene.add(this.startBeacon.group, this.beacon.group);
    }
    this.beacon.visible = false;
  }

  private centre(r: Roof): { x: number; z: number } { return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 }; }
  get active(): boolean { return this.step >= 0; }
  hide(): void { this.startBeacon.visible = false; this.beacon.visible = false; }

  /** Marker positions for the maps. */
  markers(): { x: number; z: number; active: boolean }[] {
    if (!this.start) return [];
    if (this.step >= 0) return this.chain[this.step] ? [{ ...this.centre(this.chain[this.step]), active: true }] : [];
    return [{ ...this.centre(this.start), active: false }];
  }

  private begin(): void {
    const g = this.game;
    const roofs = g.world.roofs.filter((r) => r !== this.start);
    const chain: Roof[] = [];
    let cur = this.centre(this.start!);
    while (chain.length < 3 && roofs.length) {
      let best = 0, bd = Infinity;
      roofs.forEach((r, i) => { const c = this.centre(r); const d = Math.hypot(c.x - cur.x, c.z - cur.z); if (d < bd) { bd = d; best = i; } });
      const r = roofs.splice(best, 1)[0];
      chain.push(r);
      cur = this.centre(r);
    }
    this.chain = chain;
    this.step = 0;
    this.time = 140;
    this.startBeacon.visible = false;
    this.target();
    g.hud.toast(bi('Rooftop Dash! Reach 3 more rooftops.', '옥상 대시! 옥상 세 곳을 더 찾아가요.'), 3000);
  }

  private target(): void {
    const r = this.chain[this.step];
    const c = this.centre(r);
    this.beacon.setPosition(c.x, c.z);
    this.beacon.group.position.y = r.h;
    this.beacon.visible = true;
  }

  private end(ok: boolean): void {
    const g = this.game;
    this.step = -1;
    this.beacon.visible = false;
    this.cooldown = 60;
    g.hud.showGig(false);
    if (ok) { const pay = g.scaled(2000, 0.4); g.addCash(pay, 'gigs'); g.hud.toast(bi(`Rooftop Dash complete! +$${pay.toLocaleString('en-US')}`, `옥상 대시 성공! +$${pay.toLocaleString('en-US')}`), 3000); }
    else g.hud.toast(bi('Rooftop Dash failed - out of time', '옥상 대시 실패 - 시간 초과'), 2600);
  }

  update(dt: number): void {
    const g = this.game;
    if (!this.start) return;
    this.beacon.update(dt); this.startBeacon.update(dt);
    const pl = g.humans.player;
    if (this.step < 0) {
      if (this.cooldown > 0) { this.cooldown -= dt; this.startBeacon.visible = false; return; }
      this.startBeacon.visible = true;
      const c = this.centre(this.start);
      if (g.onFoot && g.state === 'play' && !g.gigs.active && pl.roof === this.start && Math.hypot(pl.x - c.x, pl.z - c.z) < 4) this.begin();
      return;
    }
    if (g.stars > 0 && g.state === 'play') { /* chases do not pause the clock */ }
    this.time -= dt;
    const r = this.chain[this.step];
    const c = this.centre(r);
    if (g.onFoot && pl.roof === r && Math.hypot(pl.x - c.x, pl.z - c.z) < 4) {
      this.step++;
      g.addCash(g.scaled(250, 0.4), 'gigs');
      if (this.step >= this.chain.length) { this.end(true); return; }
      this.target();
      g.hud.toast(bi('Checkpoint! Next rooftop', '체크포인트! 다음 옥상'), 1600);
    } else if (this.time <= 0) { this.end(false); return; }
    g.hud.showGig(true, bi('ROOFTOP DASH', '옥상 대시'), `${bi('Rooftop', '옥상')} ${this.step + 1} / ${this.chain.length}`, `${Math.ceil(this.time)}s`);
  }
}
