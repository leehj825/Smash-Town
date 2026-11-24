import type { Game } from './game';
import { bi } from './i18n';
import { GUN_ORDER } from './guns';
import { PLAYER_ROSTER, type VehicleKind } from './vehicle';

/**
 * The free sandbox's switches (the phone's "Sandbox" entries): wanted level (set it, or freeze it), time of day, weather, a car out of the whole
 * roster, and god mode. Ammunition and tools never run out. Only exists in sandbox mode; the other modes never call it.
 */
export class Sandbox {
  god = false;
  /** When set, the wanted level is held at this many stars. */
  frozen: number | null = null;
  private spawnIdx = 0;

  constructor(private game: Game) {}

  get on(): boolean { return this.game.mode === 'sandbox'; }

  /** Everything refilled every frame: ammunition, tools, donuts, armour. */
  update(): void {
    const G = this.game;
    if (!this.on) return;
    for (const id of GUN_ORDER) if (G.guns.has(id)) G.guns.reserve[id] = Math.max(G.guns.reserve[id], 99);
    const gear = (G.save.gear ??= {});
    for (const k of ['smoke', 'c4', 'spikes', 'donut', 'vest']) gear[k] = Math.max(gear[k] ?? 0, 9);
    if (this.god) {
      G.humans.player.hp = G.humans.player.maxHp;
      if (G.driving && !G.onFoot) G.driving.ctrl.hp = 1;
    }
    if (this.frozen !== null && G.stars !== this.frozen) this.setStars(this.frozen);
  }

  setStars(n: number): void {
    const G = this.game;
    if (n <= 0 || G.stars > n) G.clearWanted();
    let guard = 0;
    while (G.stars < n && guard++ < 80) G.addHeat(40);
  }

  /** "Wanted: 0 > 1 > ... > 5" */
  cycleStars(): number {
    const n = (this.game.stars + 1) % 6;
    this.frozen = this.frozen === null ? null : n;
    this.setStars(n);
    return n;
  }

  toggleFreeze(): boolean {
    this.frozen = this.frozen === null ? this.game.stars : null;
    return this.frozen !== null;
  }

  toggleGod(): boolean { this.god = !this.god; return this.god; }

  /** A car from the roster, dropped in front of you (it stays; walk up and press F). */
  spawnCar(): VehicleKind {
    const G = this.game;
    const kind = PLAYER_ROSTER[this.spawnIdx++ % PLAYER_ROSTER.length];
    const h = G.driving && !G.onFoot ? G.driving.ctrl.heading : G.humans.player.heading;
    const x = G.focusX + Math.sin(h) * 7, z = G.focusZ + Math.cos(h) * 7;
    const v = G.spawnVehicle(kind, G.paintOf(kind), x, z, h, 'parked');
    v.owned = true;
    G.hud.toast(`${bi('Spawned', '소환')}: ${kind}`, 1400);
    return kind;
  }
}
