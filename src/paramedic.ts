import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';

type P2 = { x: number; z: number };
interface Call { x: number; z: number; t: number; beacon: Beacon; why: string }

/**
 * The paramedic job. Step into the white-and-red marker at the hospital to start a shift: an ambulance is waiting. Emergency calls come in - and
 * so do the real ones: if somebody gets hurt in a fight or a blast anywhere in the city (the event bus tells us), that becomes a call too.
 * Reach the patient before the call runs out. Five patients make a shift; every one pays, and fast arrivals pay more.
 */
export class Paramedic {
  private spot: P2 | null = null;
  private pad = new Beacon(0xff3b3b, 3.8);
  private duty = false;
  private calls: Call[] = [];
  private nextCall = 8;
  private treated = 0;
  private cooldown = 5;
  private shifts = 0;
  private off = 0;
  van: import('./vehicles').GameVehicle | null = null;

  constructor(private game: Game) {
    game.scene.add(this.pad.group);
    this.pad.visible = false;
    // real incidents become calls
    const add = (x: number, z: number, why: string) => { if (this.duty) this.addCall(x, z, why); };
    game.bus.on('civAssaulted', (e) => add(e.x, e.z, bi('Someone was beaten up', '누군가 폭행당했어요')));
    game.bus.on('civKilled', (e) => add(e.x, e.z, bi('A person is down', '쓰러진 사람이 있어요')));
    game.bus.on('explosion', (e) => add(e.x, e.z, bi('An explosion - there are injured', '폭발 사고 - 부상자가 있어요')));
  }

  get onDuty(): boolean { return this.duty; }
  /** The hospital marker (null until the roads exist). */
  spotOf(): P2 | null { this.ensureSpot(); return this.spot; }
  get completed(): number { return this.shifts; }
  get open(): number { return this.calls.length; }

  markers(): { x: number; z: number; flash: boolean; color: string }[] {
    if (this.duty) return this.calls.map((c) => ({ x: c.x, z: c.z, flash: true, color: '#ff3b3b' }));
    return this.spot ? [{ ...this.spot, flash: false, color: '#ff6b6b' }] : [];
  }

  private ensureSpot(): void {
    if (this.spot) return;
    const segs = this.game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    const s = segs[Math.floor(segs.length * 0.72)];
    if (!s) return;
    this.spot = { x: s.x, z: s.z };
    this.pad.setPosition(s.x, s.z);
  }

  private roadPoint(minD: number, maxD: number): P2 | null {
    const G = this.game;
    const segs = G.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    for (let tries = 0; tries < 60; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - G.focusX, s.z - G.focusZ);
      if (d >= minD && d <= maxD) return { x: s.x + s.dx * (Math.random() - 0.5) * s.len * 0.4, z: s.z + s.dz * (Math.random() - 0.5) * s.len * 0.4 };
    }
    return null;
  }

  addCall(x: number, z: number, why: string): void {
    if (this.calls.length >= 3) return;
    const beacon = new Beacon(0xff3b3b, 4.5);
    beacon.setPosition(x, z);
    this.game.scene.add(beacon.group);
    this.calls.push({ x, z, t: 75, beacon, why });
    this.game.hud.toast(`${bi('Emergency call', '긴급 출동')}: ${why}`, 2600);
    this.game.audio.tink();
  }

  private clearCalls(): void {
    for (const c of this.calls) c.beacon.group.removeFromParent();
    this.calls = [];
  }

  private end(msg: string, bonus: number): void {
    const G = this.game;
    this.duty = false;
    this.clearCalls();
    G.hud.showGig(false);
    this.cooldown = 60;
    if (bonus > 0) { G.addCash(bonus, 'gigs'); G.progress.add('gigs'); }
    G.hud.toast(msg, 3200);
  }

  update(dt: number): void {
    const G = this.game;
    this.ensureSpot();
    this.pad.update(dt);
    for (const c of this.calls) c.beacon.update(dt);
    if (!this.spot || G.inside || G.state !== 'play') return;
    const inVan = !!G.driving && !G.onFoot && G.driving.kind === 'ambulance';
    if (!this.duty) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.pad.visible = this.cooldown <= 0;
      if (this.cooldown > 0 || G.stars > 0 || G.gigs.active || G.race.active || G.taxi.active || G.delivery.active) return;
      const px = G.driving && !G.onFoot ? G.driving.x : G.humans.player.x, pz = G.driving && !G.onFoot ? G.driving.z : G.humans.player.z;
      if (Math.hypot(this.spot.x - px, this.spot.z - pz) < 4) this.begin();
      return;
    }
    if (G.stars > 0) { this.end(bi('Shift cancelled - the police are after you', '경찰에 쫓겨서 근무가 취소됐어요'), 0); return; }
    this.off = inVan ? 0 : this.off + dt;
    if (this.off > 25) { this.end(bi('You left the ambulance - shift over', '구급차를 떠나서 근무가 끝났어요'), this.treated * 60); return; }
    this.nextCall -= dt;
    if (this.nextCall <= 0) {
      this.nextCall = 14 + Math.random() * 14;
      const p = this.roadPoint(90, 320);
      if (p) this.addCall(p.x, p.z, bi('Someone has collapsed in the street', '길에서 쓰러진 사람이 있어요'));
    }
    const vx = G.driving && inVan ? G.driving.x : G.humans.player.x, vz = G.driving && inVan ? G.driving.z : G.humans.player.z;
    const sp = G.driving && inVan ? G.driving.ctrl.speed : 0;
    for (const c of [...this.calls]) {
      c.t -= dt;
      if (inVan && Math.hypot(c.x - vx, c.z - vz) < 9 && sp < 7) {
        const bonus = Math.round(Math.max(0, c.t) * 2.5);
        const pay = 220 + bonus;
        G.addCash(pay, 'gigs');
        this.treated++;
        G.progress.add('rescues');
        G.bus.emit({ type: 'helped', x: vx, z: vz, amount: 3 });
        G.popups.spawn(vx, 3, vz, `+$${pay}`, '#ff6b6b');
        G.hud.toast(`${bi('Patient treated', '환자 치료')} $${pay}${bonus > 100 ? ` (${bi('fast!', '빨랐어요!')})` : ''}`, 2200);
        G.audio.cash();
        c.beacon.group.removeFromParent();
        this.calls.splice(this.calls.indexOf(c), 1);
        if (this.treated >= 5) { this.shifts++; this.end(bi('Shift complete - well done, medic!', '근무 완료 - 수고했어요!'), 400); return; }
      } else if (c.t <= 0) {
        c.beacon.group.removeFromParent();
        this.calls.splice(this.calls.indexOf(c), 1);
        G.hud.toast(bi('Too late - the call was handled by someone else', '너무 늦어서 다른 팀이 처리했어요'), 2200);
      }
    }
    if (inVan) G.hud.showGig(true, bi('PARAMEDIC', '구급대원'), `${bi('Patients', '환자')} ${this.treated}/5 · ${bi('open calls', '출동')} ${this.calls.length}${this.calls[0] ? ` · ${Math.round(Math.hypot(this.calls[0].x - vx, this.calls[0].z - vz))} m` : ''}`, this.calls[0] ? `${Math.max(0, Math.ceil(this.calls[0].t))}s` : '');
  }

  private begin(): void {
    const G = this.game;
    this.duty = true; this.treated = 0; this.off = 0; this.nextCall = 4; this.pad.visible = false;
    if (!(G.driving && !G.onFoot && G.driving.kind === 'ambulance')) {
      // an ambulance waits beside the marker: you are put behind the wheel
      const s = this.spot!;
      const seg = G.world.segments.reduce((b, q) => (Math.hypot(q.x - s.x, q.z - s.z) < Math.hypot(b.x - s.x, b.z - s.z) ? q : b), G.world.segments[0]);
      const v = G.spawnVehicle('ambulance', 0xf4f4f4, s.x, s.z, Math.atan2(seg.dx, seg.dz), 'parked');
      v.isGigTarget = true;
      this.van = v;
      G.boardVehicle(v);
    }
    G.hud.toast(bi('You are on duty! Drive to the emergency calls (red markers).', '근무 시작! 빨간 마커의 긴급 출동으로 달리세요.'), 3600);
  }
}
