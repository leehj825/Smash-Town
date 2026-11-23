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

  dismiss(): void {
    this.hired = false;
    if (this.human) this.game.humans.removeAlly(this.human);
    this.human = null;
  }

  private appear(): void {
    const G = this.game;
    const p = G.humans.player;
    this.human = G.humans.spawnAlly(p.x - Math.sin(p.heading) * 2, p.z - Math.cos(p.heading) * 2, p.heading);
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
    if (riding || G.inside) { if (h && h.active) G.humans.removeAlly(h); this.human = null; this.gone += dt; return; }
    if (!h || !h.active) this.appear();
    else if (Math.hypot(h.x - G.humans.player.x, h.z - G.humans.player.z) > 60) {
      const p = G.humans.player;
      h.x = p.x - 3; h.z = p.z; // they catch up if you ran off
    }
  }
}
