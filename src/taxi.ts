import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';

type Phase = 'idle' | 'pickup' | 'ride';

/**
 * Taxi fares. Drive a taxi and a passenger appears nearby; stop at the yellow marker to pick them up, then take them to the green marker before
 * the meter runs out. The fare grows with the distance and the time you save, and shrinks if you wreck the car on the way.
 */
export class TaxiJob {
  private phase: Phase = 'idle';
  private pick = new Beacon(0xffd23a, 4.2);
  private drop = new Beacon(0x3dff8a, 5);
  private from = { x: 0, z: 0 };
  private to = { x: 0, z: 0 };
  private time = 0;
  private dist = 0;
  private hpAtStart = 1;
  private cooldown = 6;
  private fares = 0;

  constructor(private game: Game) {
    game.scene.add(this.pick.group, this.drop.group);
    this.pick.visible = false; this.drop.visible = false;
  }

  get active(): boolean { return this.phase !== 'idle'; }
  get completed(): number { return this.fares; }

  markers(): { x: number; z: number; color: string }[] {
    if (this.phase === 'pickup') return [{ ...this.from, color: '#ffd23a' }];
    if (this.phase === 'ride') return [{ ...this.to, color: '#3dff8a' }];
    return [];
  }

  private roadPoint(minD: number, maxD: number): { x: number; z: number } | null {
    const G = this.game;
    const fx = G.focusX, fz = G.focusZ;
    const segs = G.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    for (let tries = 0; tries < 60; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - fx, s.z - fz);
      if (d >= minD && d <= maxD) return { x: s.x + s.dx * (Math.random() - 0.5) * s.len * 0.5, z: s.z + s.dz * (Math.random() - 0.5) * s.len * 0.5 };
    }
    return null;
  }

  private cancel(msg?: string): void {
    this.phase = 'idle';
    this.pick.visible = false; this.drop.visible = false;
    this.game.hud.showGig(false);
    this.cooldown = 8;
    if (msg) this.game.hud.toast(msg, 2400);
  }

  update(dt: number): void {
    const G = this.game;
    this.pick.update(dt); this.drop.update(dt);
    const d = G.driving;
    const taxi = !!d && !G.onFoot && d.kind === 'taxi' && !G.inside && G.state === 'play';
    if (!taxi) { if (this.phase !== 'idle') this.cancel(bi('Fare cancelled', '손님 호출이 취소됐어요')); return; }
    if (G.stars > 0 && this.phase !== 'idle') { this.cancel(bi('Fare cancelled - the police are after you', '경찰이 쫓아와서 손님이 내렸어요')); return; }
    if (this.phase === 'idle') {
      this.cooldown -= dt;
      if (this.cooldown > 0 || G.stars > 0 || G.gigs.active || G.range.running) return;
      const p = this.roadPoint(60, 160);
      if (!p) { this.cooldown = 5; return; }
      this.from = p; this.phase = 'pickup';
      this.pick.setPosition(p.x, p.z); this.pick.visible = true;
      G.hud.toast(bi('Taxi! A passenger is waiting - follow the yellow marker.', '택시! 손님이 기다려요 - 노란 마커로 가세요.'), 3200);
      return;
    }
    const sp = d!.ctrl.speed;
    if (this.phase === 'pickup') {
      G.hud.showGig(true, bi('TAXI', '택시'), bi('Pick up the passenger', '손님 태우기'), `${Math.round(Math.hypot(this.from.x - d!.x, this.from.z - d!.z))} m`);
      if (Math.hypot(this.from.x - d!.x, this.from.z - d!.z) < 7 && sp < 7) {
        const dest = this.roadPoint(240, 620);
        if (!dest) { this.cancel(); return; }
        this.to = dest;
        this.dist = Math.hypot(dest.x - this.from.x, dest.z - this.from.z);
        this.time = 22 + this.dist / 9;
        this.hpAtStart = d!.ctrl.hp;
        this.phase = 'ride';
        this.pick.visible = false;
        this.drop.setPosition(dest.x, dest.z); this.drop.visible = true;
        G.audio.cash();
        G.hud.toast(bi('Passenger on board! Take them to the green marker.', '손님 탑승! 초록 마커로 가세요.'), 3000);
      }
      return;
    }
    // ride
    this.time -= dt;
    const left = Math.hypot(this.to.x - d!.x, this.to.z - d!.z);
    G.hud.showGig(true, bi('TAXI', '택시'), `${bi('Destination', '목적지')}: ${Math.round(left)} m`, `${Math.max(0, Math.ceil(this.time))}s`);
    if (left < 8 && sp < 8) {
      const damage = Math.max(0, this.hpAtStart - d!.ctrl.hp);
      const base = 120 + this.dist * 0.5;
      const bonus = Math.max(0, this.time) * 3;
      const fare = Math.max(40, Math.round(base + bonus - damage * 250));
      G.addCash(fare, 'gigs');
      G.progress.add('gigs');
      this.fares++;
      G.popups.spawn(d!.x, 3, d!.z, `+$${fare}`, '#ffd23a');
      G.hud.toast(`${bi('Fare paid', '요금')} $${fare}${bonus > 20 ? ` (${bi('tip!', '팁!')})` : ''}`, 2600);
      this.cancel();
      this.cooldown = 5;
    } else if (this.time <= -10) {
      this.cancel(bi('The passenger got out and walked away.', '손님이 화가 나서 내렸어요.'));
    }
  }
}
