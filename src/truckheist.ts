import * as THREE from 'three';
import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import { MeshBuilder, paletteMaterial } from './geo';
import type { GameVehicle } from './vehicles';

type Phase = 'idle' | 'hunt' | 'loot' | 'escape';
interface Bag { x: number; z: number; value: number; mesh: THREE.Mesh; taken: boolean }

const PLAN_COST = 500;

/**
 * The armoured-truck job, in three steps.
 *  1. Plan: step on the gold marker (it costs $500 for the crew and gear, paid back in the cut). A cash truck is parked somewhere in the city.
 *  2. Hit it: wreck the truck (ram it, shoot it, blow it up). Bags of cash spill out and the alarm raises your wanted level to three stars.
 *     Grab the bags within a minute and a quarter. The cash is "hot": you carry it, you do not own it yet.
 *  3. Get away: lose the police. Then the money is clean and you get it, plus your $500 back. Hire Bonnie first and she helps carry (+25%). If you are busted or wrecked first, the hot cash is gone.
 */
export class TruckHeist {
  phase: Phase = 'idle';
  private spot: { x: number; z: number } | null = null;
  private pad = new Beacon(0xffd23a, 3.8);
  private truck: GameVehicle | null = null;
  private bags: Bag[] = [];
  private bagGroup = new THREE.Group();
  private t = 0;
  hot = 0;
  /** The $500 plan fee was paid (and is paid back); a tip or a bank job has none. */
  private paid = true;
  private label: [string, string] = ['CASH TRUCK', '현금 수송차'];
  private cooldown = 6;
  done = 0;
  private bagGeo: THREE.BufferGeometry;

  constructor(private game: Game) {
    game.scene.add(this.pad.group, this.bagGroup);
    const b = new MeshBuilder();
    b.box(0.8, 0.45, 0.6, 0, 0.3, 0, 0x2f7d3a); b.box(0.82, 0.08, 0.62, 0, 0.35, 0, 0xffd23a); b.box(0.2, 0.2, 0.05, 0, 0.3, 0.32, 0xffd23a);
    this.bagGeo = b.build();
  }

  get active(): boolean { return this.phase !== 'idle'; }

  spotOf(): { x: number; z: number } | null { this.ensureSpot(); return this.spot; }
  private ensureSpot(): void {
    if (this.spot) return;
    const segs = this.game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    const s = segs[Math.floor(segs.length * 0.5)];
    if (!s) return;
    this.spot = { x: s.x, z: s.z };
    this.pad.setPosition(s.x, s.z);
  }

  markers(): { x: number; z: number; flash: boolean; color: string }[] {
    const out: { x: number; z: number; flash: boolean; color: string }[] = [];
    if (this.phase === 'idle' && this.spot) out.push({ ...this.spot, flash: false, color: '#ffd23a' });
    if (this.phase === 'hunt' && this.truck) out.push({ x: this.truck.x, z: this.truck.z, flash: true, color: '#ffd23a' });
    if (this.phase === 'loot') for (const b of this.bags) if (!b.taken) out.push({ x: b.x, z: b.z, flash: true, color: '#7dff6a' });
    return out;
  }

  private roadPoint(minD: number, maxD: number): { x: number; z: number; heading: number } | null {
    const G = this.game;
    const segs = G.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    for (let tries = 0; tries < 80; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - G.focusX, s.z - G.focusZ);
      if (d >= minD && d <= maxD) return { x: s.x, z: s.z, heading: Math.atan2(s.dx, s.dz) };
    }
    return null;
  }

  /** Begin the job (the plan step). Returns false if it cannot start. */
  start(free = false): boolean {
    const G = this.game;
    if (this.phase !== 'idle') return false;
    const p = this.roadPoint(140, 320);
    if (!p) return false;
    if (!free && !G.pay(PLAN_COST)) return false;
    const v = G.spawnVehicle('armored', 0xd8c25a, p.x, p.z, p.heading, 'parked');
    v.isGigTarget = true;
    this.truck = v;
    this.phase = 'hunt'; this.t = 240; this.hot = 0; this.paid = !free; this.label = ['CASH TRUCK', '현금 수송차'];
    G.hud.toast(bi('The plan is set: an armoured cash truck is parked on the map (gold marker). Wreck it, grab the cash, and get away!', '계획 완료: 현금 수송 장갑차가 지도에 표시돼요(금색). 부수고, 돈을 줍고, 달아나세요!'), 5000);
    G.audio.tink();
    return true;
  }

  /** Another job (the bank vault) hands over hot cash: now the player has to get away with it. */
  beginEscape(hot: number, title: [string, string]): void {
    const G = this.game;
    if (this.phase !== 'idle') return;
    this.phase = 'escape'; this.hot = Math.round(hot); this.paid = false; this.label = title; this.t = 0;
    while (G.stars < 3) G.addHeat(30);
    G.hud.toast(bi('The vault is open! The cash is hot - get out and lose the police!', '금고가 열렸어요! 훔친 돈이에요 - 나가서 경찰을 따돌리세요!'), 4200);
  }

  private end(msg: string, ok: boolean): void {
    const G = this.game;
    this.phase = 'idle';
    this.cooldown = 90;
    G.hud.showGig(false);
    for (const b of this.bags) b.mesh.removeFromParent();
    this.bags = [];
    if (this.truck && !this.truck.ctrl.wrecked) G.removeVehicle(this.truck);
    if (this.truck) this.truck.isGigTarget = false;
    this.truck = null;
    this.hot = 0;
    G.hud.toast(msg, ok ? 5000 : 3600);
  }

  private spill(): void {
    const G = this.game;
    const tx = this.truck!.x, tz = this.truck!.z;
    const mat = paletteMaterial();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 3 + Math.random() * 4;
      const mesh = new THREE.Mesh(this.bagGeo, mat);
      const bx = tx + Math.cos(a) * r, bz = tz + Math.sin(a) * r;
      mesh.position.set(bx, 0, bz);
      mesh.rotation.y = Math.random() * 6;
      this.bagGroup.add(mesh);
      this.bags.push({ x: bx, z: bz, value: 250 + Math.floor(Math.random() * 5) * 50, mesh, taken: false });
    }
    this.phase = 'loot'; this.t = 75;
    while (G.stars < 3) G.addHeat(30);
    G.bus.emit({ type: 'truckRobbed', x: tx, z: tz });
    G.hud.toast(bi('The truck is open! Grab the bags - the alarm is on!', '수송차가 열렸어요! 돈 가방을 주우세요 - 경보가 울려요!'), 3600);
  }

  update(dt: number): void {
    const G = this.game;
    this.ensureSpot();
    this.pad.update(dt);
    for (const b of this.bags) if (!b.taken) b.mesh.rotation.y += dt * 1.5;
    if (!this.spot || G.state !== 'play' && this.phase === 'idle') return;
    if (this.phase === 'idle') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.pad.visible = this.cooldown <= 0 && !G.inside;
      if (this.cooldown > 0 || G.inside || G.stars > 0 || !G.onFoot || G.jobOnDuty(null) || G.gigs.active || G.race.active || G.taxi.active || G.delivery.active) return;
      const p = G.humans.player;
      if (Math.hypot(this.spot.x - p.x, this.spot.z - p.z) < 3.5) {
        if (G.cash < PLAN_COST) { this.cooldown = 8; G.hud.toast(bi(`The crew wants $${PLAN_COST} up front for the gear.`, `팀이 장비값으로 선금 $${PLAN_COST}을 원해요.`), 2600); return; }
        this.start();
      }
      return;
    }
    this.pad.visible = false;
    // failure: busted, wrecked or knocked out while carrying hot cash
    if (G.state === 'busted' || G.state === 'wrecked' || G.state === 'wasted') {
      this.end(bi('The job went wrong - the hot cash is gone.', '작전 실패 - 훔친 돈을 잃었어요.'), false);
      return;
    }
    if (G.state !== 'play') return;
    this.t -= dt;
    const px = G.focusX, pz = G.focusZ;
    if (this.phase === 'hunt') {
      const tr = this.truck;
      if (!tr || !G.vehicles.includes(tr)) { this.end(bi('The truck is gone.', '수송차가 사라졌어요.'), false); return; }
      if (tr.ctrl.wrecked || tr.ctrl.hp <= 0) { this.spill(); return; }
      if (this.t <= 0) { this.end(bi('The truck left town. The crew walks away with your $500.', '수송차가 떠났어요. 팀이 선금을 챙겨 갔어요.'), false); return; }
      G.hud.showGig(true, bi('CASH TRUCK', '현금 수송차'), `${bi('Wreck the armoured truck', '장갑차를 부수세요')} · ${Math.round(Math.hypot(tr.x - px, tr.z - pz))} m`, `${Math.max(0, Math.ceil(this.t))}s`);
      return;
    }
    if (this.phase === 'loot') {
      for (const b of this.bags) {
        if (b.taken || Math.hypot(b.x - px, b.z - pz) > 2.6) continue;
        b.taken = true; b.mesh.removeFromParent();
        this.hot += b.value;
        G.popups.spawn(b.x, 2.5, b.z, `+$${b.value}`, '#7dff6a');
        G.audio.cash();
      }
      const left = this.bags.filter((b) => !b.taken).length;
      G.hud.showGig(true, bi('CASH TRUCK', '현금 수송차'), `${bi('Grab the bags', '가방을 주우세요')} ${8 - left}/8 · ${bi('hot cash', '훔친 돈')} $${this.hot}`, `${Math.max(0, Math.ceil(this.t))}s`);
      if (left === 0 || this.t <= 0) {
        this.phase = 'escape';
        G.hud.toast(bi('Now lose the police! The money is clean once you are free.', '이제 경찰을 따돌리세요! 자유로워지면 돈이 깨끗해져요.'), 3600);
      }
      return;
    }
    // escape: lose the wanted level
    G.hud.showGig(true, bi(this.label[0], this.label[1]), `${bi('Lose the police', '경찰을 따돌리세요')} · ${bi('hot cash', '훔친 돈')} $${this.hot}`, '★'.repeat(G.stars));
    if (G.stars === 0) this.finish();
  }

  private finish(): void {
    const G = this.game;
    const bonus = G.buddy.hired ? 1.25 : 1;
    const cut = Math.round(this.hot * bonus);
    const refund = this.paid ? PLAN_COST : 0;
    const total = cut + refund;
    G.addCash(total, 'other');
    G.progress.add('heists');
    this.done++;
    G.popups.spawn(G.focusX, 3, G.focusZ, `+$${total}`, '#ffd23a');
    G.audio.cash();
    this.end(bi(`You got away clean! Your cut: $${cut}${bonus > 1 ? ' (Bonnie helped carry: +25%)' : ''} ${refund ? ` + $${refund} back` : ''}.`, `깨끗하게 달아났어요! 몫 $${cut}${bonus > 1 ? ' (보니가 거들어서 +25%)' : ''}${refund ? ` + 선금 $${refund} 환급` : ''}.`), true);
  }
}
