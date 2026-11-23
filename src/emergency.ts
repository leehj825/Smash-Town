import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import type { EventType, GameEvent } from './events';
import type { StatKey } from './progress';
import type { VehicleKind } from './vehicle';
import type { GameVehicle } from './vehicles';

type P2 = { x: number; z: number };
export interface Call { x: number; z: number; t: number; held: number; beacon: Beacon; why: string; ref?: unknown }

/** What makes one emergency job different from another (paramedic, firefighter, police patrol). */
export interface JobConfig {
  id: string;
  title: [string, string];
  /** The vehicle that waits for you at the station. */
  vehicle: VehicleKind;
  /** The station's place among the long roads (0..1). */
  spotFrac: number;
  color: number;
  css: string;
  /** What the job is called on the map and in the pause stats. */
  stat: StatKey;
  /** Pay for each call, and an extra for being fast. */
  pay: number;
  /** Seconds you must stay at the scene (a fire takes a while to put out). */
  hold: number;
  patients: [string, string];
  /** Calls at the start of a shift for a moment on a plain street. */
  idleCall: [string, string];
  /** Shift bonus when the shift is done. */
  shiftBonus: number;
  /** Real incidents in the city that become calls for this job. */
  listens: { type: EventType; why: [string, string]; pos?: (e: GameEvent) => P2 | null; ref?: (e: GameEvent) => unknown }[];
  /** Called when a call is done (for instance to put a fire out). */
  onDone?: (call: Call, G: Game) => void;
  /** Before a random call is placed (a fire crew's call starts a real fire there). */
  idleSpawn?: (G: Game, p: P2) => void;
}

/**
 * An emergency job. Step into the station marker to start a shift: your vehicle is waiting. Calls come in at random, and real incidents in the
 * city (the event bus tells us) become calls too. Reach the scene before the call runs out and stay as long as the job needs. Five calls make a
 * shift. The paramedic, the firefighter and the police patrol are all this class with different settings.
 */
export class EmergencyJob {
  private spot: P2 | null = null;
  private pad: Beacon;
  private duty = false;
  calls: Call[] = [];
  private nextCall = 8;
  private done = 0;
  private cooldown = 5;
  private shifts = 0;
  private off = 0;
  van: GameVehicle | null = null;

  constructor(private game: Game, readonly cfg: JobConfig) {
    this.pad = new Beacon(cfg.color, 3.8);
    game.scene.add(this.pad.group);
    this.pad.visible = false;
    for (const l of cfg.listens) {
      game.bus.on(l.type as 'gunshot', ((e: GameEvent) => {
        if (!this.duty) return;
        const p = l.pos ? l.pos(e) : ('x' in e ? { x: (e as { x: number }).x, z: (e as { z: number }).z } : null);
        if (p) this.addCall(p.x, p.z, bi(l.why[0], l.why[1]), l.ref ? l.ref(e) : undefined);
      }) as never);
    }
  }

  get onDuty(): boolean { return this.duty; }
  get completed(): number { return this.shifts; }
  get open(): number { return this.calls.length; }
  /** The station marker (null until the roads exist). */
  spotOf(): P2 | null { this.ensureSpot(); return this.spot; }

  markers(): { x: number; z: number; flash: boolean; color: string }[] {
    if (this.duty) return this.calls.map((c) => ({ x: c.x, z: c.z, flash: true, color: this.cfg.css }));
    return this.spot ? [{ ...this.spot, flash: false, color: this.cfg.css }] : [];
  }

  private ensureSpot(): void {
    if (this.spot) return;
    const segs = this.game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    const s = segs[Math.floor(segs.length * this.cfg.spotFrac)];
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

  addCall(x: number, z: number, why: string, ref?: unknown): void {
    if (this.calls.length >= 3) return;
    if (this.calls.some((c) => Math.hypot(c.x - x, c.z - z) < 25)) return;
    const beacon = new Beacon(this.cfg.color, 4.5);
    beacon.setPosition(x, z);
    this.game.scene.add(beacon.group);
    this.calls.push({ x, z, t: 80, held: 0, beacon, why, ref });
    this.game.hud.toast(`${bi('Emergency call', '긴급 출동')}: ${why}`, 2600);
    this.game.audio.tink();
  }

  private clearCalls(): void {
    for (const c of this.calls) c.beacon.group.removeFromParent();
    this.calls = [];
  }

  end(msg: string, bonus: number): void {
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
    const inVan = !!G.driving && !G.onFoot && G.driving.kind === this.cfg.vehicle;
    if (!this.duty) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.pad.visible = this.cooldown <= 0;
      if (this.cooldown > 0 || G.stars > 0 || G.gigs.active || G.race.active || G.taxi.active || G.delivery.active || G.truckHeist.active || G.jobOnDuty(this)) return;
      const px = G.driving && !G.onFoot ? G.driving.x : G.humans.player.x, pz = G.driving && !G.onFoot ? G.driving.z : G.humans.player.z;
      if (Math.hypot(this.spot.x - px, this.spot.z - pz) < 4) {
        if (G.factions.refusesShifts()) { this.cooldown = 20; G.hud.toast(bi('The City Watch will not give you a shift - you have hurt too many people.', '시티 워치가 근무를 주지 않아요 - 너무 많은 사람을 다치게 했어요.'), 3200); return; }
        this.begin();
      }
      return;
    }
    if (G.stars > 0 && this.cfg.id !== 'patrol') { this.end(bi('Shift cancelled - the police are after you', '경찰에 쫓겨서 근무가 취소됐어요'), 0); return; }
    this.off = inVan ? 0 : this.off + dt;
    if (this.off > 25) { this.end(bi('You left the vehicle - shift over', '차량을 떠나서 근무가 끝났어요'), this.done * 60); return; }
    this.nextCall -= dt;
    if (this.nextCall <= 0) {
      this.nextCall = 14 + Math.random() * 14;
      const p = this.roadPoint(90, 320);
      if (p) { this.cfg.idleSpawn?.(G, p); this.addCall(p.x, p.z, bi(this.cfg.idleCall[0], this.cfg.idleCall[1])); }
    }
    const vx = G.driving && inVan ? G.driving.x : G.humans.player.x, vz = G.driving && inVan ? G.driving.z : G.humans.player.z;
    const sp = G.driving && inVan ? G.driving.ctrl.speed : 0;
    for (const c of [...this.calls]) {
      c.t -= dt;
      const there = inVan && Math.hypot(c.x - vx, c.z - vz) < (this.cfg.hold > 0 ? 15 : 9) && sp < 7;
      if (there) c.held += dt; else c.held = Math.max(0, c.held - dt);
      if (there && c.held >= this.cfg.hold) {
        const bonus = Math.round(Math.max(0, c.t) * 2.5);
        const pay = Math.round((this.cfg.pay + bonus) * G.factions.payMult());
        G.addCash(pay, 'gigs');
        this.done++;
        G.progress.add(this.cfg.stat);
        G.bus.emit({ type: 'helped', x: vx, z: vz, amount: 3 });
        G.popups.spawn(vx, 3, vz, `+$${pay}`, this.cfg.css);
        G.hud.toast(`${bi(this.cfg.patients[0], this.cfg.patients[1])} $${pay}${bonus > 100 ? ` (${bi('fast!', '빨랐어요!')})` : ''}`, 2200);
        G.audio.cash();
        this.cfg.onDone?.(c, G);
        c.beacon.group.removeFromParent();
        this.calls.splice(this.calls.indexOf(c), 1);
        if (this.done >= 5) { this.shifts++; this.end(bi('Shift complete - well done!', '근무 완료 - 수고했어요!'), this.cfg.shiftBonus); return; }
      } else if (c.t <= 0) {
        c.beacon.group.removeFromParent();
        this.calls.splice(this.calls.indexOf(c), 1);
        G.hud.toast(bi('Too late - the call was handled by someone else', '너무 늦어서 다른 팀이 처리했어요'), 2200);
      }
    }
    if (inVan) {
      const c0 = this.calls[0];
      const hold = c0 && this.cfg.hold > 0 && c0.held > 0 ? ` · ${bi('working', '진행')} ${Math.min(100, Math.round((c0.held / this.cfg.hold) * 100))}%` : '';
      G.hud.showGig(true, bi(this.cfg.title[0], this.cfg.title[1]), `${this.done}/5 · ${bi('open calls', '출동')} ${this.calls.length}${c0 ? ` · ${Math.round(Math.hypot(c0.x - vx, c0.z - vz))} m${hold}` : ''}`, c0 ? `${Math.max(0, Math.ceil(c0.t))}s` : '');
    }
  }

  private begin(): void {
    const G = this.game;
    this.duty = true; this.done = 0; this.off = 0; this.nextCall = 4; this.pad.visible = false;
    if (!(G.driving && !G.onFoot && G.driving.kind === this.cfg.vehicle)) {
      // the vehicle waits beside the marker: you are put behind the wheel
      const s = this.spot!;
      const seg = G.world.segments.reduce((b, q) => (Math.hypot(q.x - s.x, q.z - s.z) < Math.hypot(b.x - s.x, b.z - s.z) ? q : b), G.world.segments[0]);
      const v = G.spawnVehicle(this.cfg.vehicle, this.cfg.color, s.x, s.z, Math.atan2(seg.dx, seg.dz), 'parked');
      v.isGigTarget = true;
      this.van = v;
      G.boardVehicle(v);
    }
    G.hud.toast(bi('You are on duty! Drive to the emergency calls (markers on the map).', '근무 시작! 지도의 마커로 긴급 출동하세요.'), 3600);
  }
}
