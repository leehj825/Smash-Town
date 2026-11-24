import type { Game } from './game';
import type { Human } from './humans';
import { bi } from './i18n';

/**
 * A bodyguard friend. Hire one (Bonnie, by the gun shop) and they walk with you and fight the gang members who come at you. They wait out of sight
 * while you drive and step out when you do. If they are knocked out for good they go home and have to be hired again.
 */
export class Buddy {
  hired = false;
  human: Human | null = null;
  private name = '';
  private gone = 0;
  /** Told to cover a spot instead of following. */
  holding = false;
  private holdAt = { x: 0, z: 0 };
  private coverT = 0;
  private toldCover = false;

  constructor(private game: Game) {}

  get present(): boolean { return this.hired && !!this.human && this.human.active; }

  recruit(name: string): boolean {
    if (this.hired) return false;
    this.hired = true;
    this.name = name;
    this.gone = 0;
    this.appear();
    return true;
  }

  /** Tell her to hold the spot she is on (true) or follow again (false). */
  setHold(on: boolean): void {
    this.holding = on;
    const h = this.human;
    if (h) {
      h.hold = on;
      if (on) { h.holdX = h.x; h.holdZ = h.z; this.holdAt = { x: h.x, z: h.z }; }
    }
  }

  dismiss(): void {
    this.hired = false;
    this.holding = false;
    if (this.human) this.game.humans.removeAlly(this.human);
    this.human = null;
  }

  private appear(): void {
    const G = this.game;
    const p = G.humans.player;
    this.human = G.humans.spawnAlly(p.x - Math.sin(p.heading) * 2, p.z - Math.cos(p.heading) * 2, p.heading);
    if (this.human) { this.human.hold = false; }
  }

  /** Passenger cover fire: every second or so a shot at the nearest police car or gang member within 40 m of your car. */
  private coverFire(dt: number): void {
    const G = this.game;
    const d = G.driving;
    if (!d) return;
    this.coverT -= dt;
    if (this.coverT > 0) return;
    this.coverT = 1.1;
    let target: { x: number; z: number; v?: import('./vehicles').GameVehicle; h?: import('./humans').Human } | null = null, bd = 40;
    for (const v of G.vehicles) {
      if (v.ai !== 'police' || v.ctrl.wrecked) continue;
      const dist = Math.hypot(v.x - d.x, v.z - d.z);
      if (dist < bd) { bd = dist; target = { x: v.x, z: v.z, v }; }
    }
    for (const h of G.humans.gangMembers()) {
      if (!h.hostile || h.ko) continue;
      const dist = Math.hypot(h.x - d.x, h.z - d.z);
      if (dist < bd && dist < 25) { bd = dist; target = { x: h.x, z: h.z, h }; }
    }
    if (!target) return;
    if (!this.toldCover) { this.toldCover = true; G.hud.toast(bi(`${this.name} leans out and covers you!`, `${this.name}가 창밖으로 몸을 내밀어 엄호해요!`), 2200); }
    G.bus.emit({ type: 'gunshot', x: d.x, z: d.z, ambient: true });
    G.vfx.emitSparks(d.x + Math.cos(d.ctrl.heading) * 1.1, 1.3, d.z - Math.sin(d.ctrl.heading) * 1.1, 4);
    G.audio.gun('pistol');
    G.vfx.emitSparks(target.x, 1, target.z, 3);
    const power = G.buddyPower;
    if (target.v) target.v.ctrl.damage(0.06 * power);
    else if (target.h) G.humans.gunHit(G.humans.player, target.h, 14 * power, 0, 1, false);
  }

  update(dt: number): void {
    const G = this.game;
    if (!this.hired) return;
    const h = this.human;
    // knocked out (or dead): they go home
    if (h && (h.ko || h.hp <= 0 || h.state === 8)) {
      this.hired = false;
      G.hud.toast(bi(`${this.name} is hurt and went home. Hire them again later.`, `${this.name}가 다쳐서 집에 갔어요. 나중에 다시 고용하세요.`), 3000);
      G.humans.removeAlly(h); this.human = null;
      return;
    }
    const riding = !!G.driving && !G.onFoot;
    if (riding && !this.holding) {
      // she rides in the passenger seat and covers you: shots at police cars and gang members close by
      if (h && h.active) G.humans.removeAlly(h);
      this.human = null;
      this.coverFire(dt);
      return;
    }
    if (riding || G.inside) { if (h && h.active) G.humans.removeAlly(h); this.human = null; this.gone += dt; return; }
    this.toldCover = false;
    if (!h || !h.active) { this.appear(); if (this.holding && this.human) { this.human.hold = true; this.human.holdX = this.holdAt.x; this.human.holdZ = this.holdAt.z; this.human.x = this.holdAt.x; this.human.z = this.holdAt.z; } }
    else if (!this.holding && Math.hypot(h.x - G.humans.player.x, h.z - G.humans.player.z) > 60) {
      const p = G.humans.player;
      h.x = p.x - 3; h.z = p.z; // they catch up if you ran off
    }
  }
}
