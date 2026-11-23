import { Beacon } from './beacon';
import type { Game } from './game';
import { St } from './combat';
import { Role, type Human } from './humans';
import { bi } from './i18n';

type Spot = { x: number; z: number };

/**
 * Two repeatable street quests with their own characters:
 *  - Mrs. Lopez needs a taxi ride (pick her up in any car, drop her off before the clock runs out).
 *  - Officer Dee: catch a pickpocket who runs away (on foot, or run him down).
 * They only start while nothing else (gigs, chases, rooftop dash, shops) is going on.
 */
export class SideQuests {
  private mode: 'idle' | 'fareWait' | 'fareRide' | 'thief' = 'idle';
  private cool = 25;
  private next: 'taxi' | 'thief' = 'taxi';
  private t = 0;
  private pickup: Spot = { x: 0, z: 0 };
  private drop: Spot = { x: 0, z: 0 };
  private rideLen = 0;
  private thief: Human | null = null;
  private beacon = new Beacon(0xffe94d, 3.2);
  private beacon2 = new Beacon(0x7dff6a, 3.2);

  constructor(private game: Game) {
    game.scene.add(this.beacon.group, this.beacon2.group);
    this.beacon.visible = false; this.beacon2.visible = false;
  }

  get active(): boolean { return this.mode !== 'idle'; }

  markers(): { x: number; z: number; color: string }[] {
    if (this.mode === 'fareWait') return [{ ...this.pickup, color: '#ffe94d' }];
    if (this.mode === 'fareRide') return [{ ...this.drop, color: '#7dff6a' }];
    if (this.mode === 'thief' && this.thief) return [{ x: this.thief.x, z: this.thief.z, color: '#ff4d4d' }];
    return [];
  }

  /** A pavement spot beside a road at a given distance range from the player. */
  private spot(minD: number, maxD: number): Spot | null {
    const g = this.game, w = g.world;
    for (let tries = 0; tries < 80; tries++) {
      const s = w.segments[Math.floor(Math.random() * w.segments.length)];
      if (s.hw < 5.5) continue;
      const side = Math.random() < 0.5 ? -1 : 1;
      const along = (Math.random() - 0.5) * s.len * 0.7;
      const x = s.x + s.dx * along + -s.dz * side * (s.hw + 1.5);
      const z = s.z + s.dz * along + s.dx * side * (s.hw + 1.5);
      const d = Math.hypot(x - g.focusX, z - g.focusZ);
      if (d < minD || d > maxD) continue;
      if (w.boxes.some((b) => x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1)) continue;
      return { x, z };
    }
    return null;
  }

  private finish(ok: boolean, reward = 0, label = ''): void {
    const g = this.game;
    this.mode = 'idle';
    this.beacon.visible = false; this.beacon2.visible = false;
    this.thief = null;
    this.cool = 50;
    g.hud.showGig(false);
    if (ok) { reward = g.scaled(reward, 0.5); g.addCash(reward, 'gigs'); g.progress.add('quests'); g.hud.toast(`${label} +$${reward.toLocaleString('en-US')}`, 3200); }
    else if (label) g.hud.toast(label, 2600);
  }

  update(dt: number): void {
    const g = this.game;
    this.beacon.update(dt); this.beacon2.update(dt);
    const busy = g.state !== 'play' || g.inside || g.stars > 0 || g.gigs.active || g.roofDash.active;
    if (this.mode === 'idle') {
      if (busy) return;
      this.cool -= dt;
      if (this.cool > 0) return;
      if (this.next === 'taxi') {
        const p = this.spot(70, 200);
        if (!p) { this.cool = 5; return; }
        this.pickup = p; this.mode = 'fareWait'; this.t = 120; this.next = 'thief';
        this.beacon.setPosition(p.x, p.z); this.beacon.visible = true;
        g.hud.toast(bi('Mrs. Lopez: "Taxi! Over here!" (yellow marker)', '로페즈 부인: "택시! 여기요!" (노란 표시)'), 3600);
      } else {
        const pl = g.humans.player;
        const cands = g.humans.list.filter((h) => h.active && h.role === Role.Civ && h.state !== St.Down && h.freeT <= 0 && Math.hypot(h.x - pl.x, h.z - pl.z) > 35 && Math.hypot(h.x - pl.x, h.z - pl.z) < 110);
        if (!cands.length) { this.cool = 6; return; }
        const h = cands[Math.floor(Math.random() * cands.length)];
        this.thief = h; this.mode = 'thief'; this.t = 80; this.next = 'taxi';
        h.freeT = 90; h.fleeing = true;
        this.beacon.setPosition(h.x, h.z); this.beacon.visible = true;
        g.hud.toast(bi('Officer Dee: "Stop that pickpocket!" (red marker)', '디 경관: "소매치기를 잡아요!" (빨간 표시)'), 3600);
      }
      return;
    }
    if (g.state !== 'play') return;
    this.t -= dt;
    const car = g.driving && !g.onFoot ? g.driving : null;
    const px = g.focusX, pz = g.focusZ;
    if (this.mode === 'fareWait') {
      if (this.t <= 0) return this.finish(false, 0, bi('Mrs. Lopez took another cab.', '로페즈 부인이 다른 택시를 탔어요.'));
      g.hud.showGig(true, bi('TAXI FARE', '택시 손님'), bi('Pick up Mrs. Lopez', '로페즈 부인 태우기'), `${Math.ceil(this.t)}s`);
      if (car && Math.hypot(this.pickup.x - px, this.pickup.z - pz) < 6 && car.ctrl.speed < 5) {
        const p = this.spot(150, 320);
        if (!p) return;
        this.drop = p; this.mode = 'fareRide';
        this.rideLen = Math.hypot(p.x - px, p.z - pz) * 1.3;
        this.t = this.rideLen / 9 + 30;
        this.beacon.visible = false;
        this.beacon2.setPosition(p.x, p.z); this.beacon2.visible = true;
        g.hud.toast(bi('Mrs. Lopez: "To the green marker, please!"', '로페즈 부인: "초록 표시로 가주세요!"'), 3000);
      }
    } else if (this.mode === 'fareRide') {
      if (!car) return this.finish(false, 0, bi('You left Mrs. Lopez behind!', '로페즈 부인을 두고 내렸어요!'));
      if (this.t <= 0) return this.finish(false, 0, bi('Too slow - Mrs. Lopez got out.', '너무 느려요 - 로페즈 부인이 내렸어요.'));
      g.hud.showGig(true, bi('TAXI FARE', '택시 손님'), `${bi('Drop off', '내려주기')} ${Math.round(Math.hypot(this.drop.x - px, this.drop.z - pz))} m`, `${Math.ceil(this.t)}s`);
      if (Math.hypot(this.drop.x - px, this.drop.z - pz) < 7 && car.ctrl.speed < 5) {
        const bonus = Math.round(Math.max(0, this.t) * 6);
        this.finish(true, 250 + Math.round(this.rideLen) + bonus, bi('Fare complete!', '운행 완료!'));
      }
    } else if (this.mode === 'thief') {
      const h = this.thief;
      if (!h) return this.finish(false);
      this.beacon.setPosition(h.x, h.z);
      if (h.freeT < 20) h.freeT = 60; // keep running
      g.hud.showGig(true, bi('CATCH THE THIEF', '소매치기 잡기'), `${Math.round(Math.hypot(h.x - px, h.z - pz))} m`, `${Math.ceil(this.t)}s`);
      const d = Math.hypot(h.x - px, h.z - pz);
      const caught = h.state === St.Down || h.state === St.Hit || (g.onFoot && d < 2.0) || (car !== null && d < 3.2 && car.ctrl.speed > 5);
      if (caught) { h.freeT = 0; return this.finish(true, 600, bi('Thief caught!', '소매치기 검거!')); }
      if (this.t <= 0) { h.freeT = 0; this.finish(false, 0, bi('The thief got away.', '소매치기가 도망쳤어요.')); }
    }
  }
}
