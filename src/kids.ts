import type { Game } from './game';
import { bi } from './i18n';
import { PLAYER_ROSTER, type VehicleKind } from './vehicle';

/** The vehicles Kids Play cycles through (no boats: they only float). */
const KIDS_CARS: VehicleKind[] = PLAYER_ROSTER;

/**
 * Kids Play, a mode of its own (like the sandbox): everything is gentle.
 *  - Fists only: no guns, no bat, no baton, and no gun shop to buy them in.
 *  - No pedestrians, no gangs, no thieves or riots: the streets are for driving, and cars never touch people. Cops are the only people you can
 *    meet when you get a wanted level. Nobody is knocked down or hurt: a cop you hit runs away instead. The police are still after you when you
 *    are wanted: the ones who run off are replaced by others, so the chase goes on.
 *  - Getting away is easy: get a short way off and they lose you in a few seconds (see updateWanted in game.ts).
 *  - Your car cannot be wrecked and you cannot be hurt, and U (or the CAR button, or the phone) swaps your car for the next one on the spot.
 * Nothing is saved, so it never touches a story slot.
 */
export class Kids {
  private idx = 0;

  constructor(private game: Game) {}

  get on(): boolean { return this.game.mode === 'kids'; }

  /** Swap the car you are in (or put you in one if you are on foot) for the next kind, right where you are. */
  nextCar(step = 1): VehicleKind {
    const G = this.game;
    this.idx = (this.idx + step + KIDS_CARS.length * 4) % KIDS_CARS.length;
    const kind = KIDS_CARS[this.idx];
    const old = G.driving && !G.onFoot ? G.driving : null;
    const p = G.humans.player;
    const x = old ? old.x : p.x + Math.sin(p.heading) * 3, z = old ? old.z : p.z + Math.cos(p.heading) * 3;
    const h = old ? old.ctrl.heading : p.heading;
    const vx = old ? old.ctrl.vx : 0, vz = old ? old.ctrl.vz : 0;
    const v = G.spawnVehicle(kind, G.paintOf(kind), x, z, h, 'parked');
    v.owned = true;
    if (old) G.removeVehicle(old);
    G.boardVehicle(v);
    v.ctrl.vx = vx * 0.8; v.ctrl.vz = vz * 0.8; // keep rolling
    G.hud.toast(`${bi('New ride', '새 탈것')}: ${kind}`, 1200);
    return kind;
  }

  update(): void {
    const G = this.game;
    if (!this.on || G.state !== 'play') return;
    if (G.input.wasPressed('KeyU')) this.nextCar(1);
    // nothing can hurt you or your car
    G.humans.player.hp = G.humans.player.maxHp;
    if (G.driving && !G.onFoot) G.driving.ctrl.hp = 1;
  }
}
