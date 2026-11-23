import type { Game } from './game';
import { bi, t } from './i18n';
import { Role } from './humans';
import type { Room } from './interiors';
import type { GameVehicle } from './vehicles';

/** Where the car stands in the garage, in front of the entrance (offset from the room centre along z)... */
const BAY_Z = -1.0;
/** ...and to the left of centre, so the menu panel on the right never covers it. */
const BAY_X = -3.3;

/**
 * The places you can disappear into: the garages (with their turntable and the car menu) and the houses you own (bed, wardrobe, hiding).
 * While you are inside, the heat drains away; the police must not be close when you slip in.
 */
export class Hideouts {
  static readonly HOME_PRICE = 20000;

  /** The car that the garage counter works on: the one you came in with, or your own car parked nearby. */
  garageVehicle: GameVehicle | null = null;
  /** True while the garage menu has borrowed the car as the "driven" one. */
  garageTemp = false;
  /** Where the car on the turntable stood outside, so it goes back there when you leave. */
  garageHome: { x: number; z: number; h: number } | null = null;
  private bayCircle: { x: number; z: number; r: number } | null = null;

  constructor(private G: Game) {}

  // ---------------------------------------------------------------- hiding

  /** True when no police car or cop is close enough to see you slip inside. */
  canHide(): boolean {
    const G = this.G;
    for (const v of G.policeVehicles()) if (Math.hypot(v.x - G.focusX, v.z - G.focusZ) < 28) return false;
    const p = G.humans.player;
    for (const h of G.humans.list) if (h.active && h.role === Role.Cop && !h.gang && !h.leaving && Math.hypot(h.x - p.x, h.z - p.z) < 14) return false;
    return true;
  }

  /** While hiding in a garage or at home the heat drains away quickly. */
  hideDecay(dt: number): void {
    const G = this.G;
    G.crimeT += dt;
    if (G.crimeT < 3) return;
    if (G.coolHeat(30 * dt)) { G.hud.toast(t('ui.toast.lost')); G.progress.add('hides'); }
  }

  // ---------------------------------------------------------------- garages

  /** Drive up to a garage: the car stops outside, you step out and the shutter opens. */
  parkInGarage(): void {
    const G = this.G;
    const room = G.interiors.rooms.find((r) => r.id === 'garage');
    const d = G.driving;
    if (!room || !d || G.fading) return;
    if (G.stars > 0 && !this.canHide()) { G.hud.toast(bi('The police are too close to hide!', '경찰이 너무 가까워서 숨을 수 없어요!'), 2200); G.garageLock = true; return; }
    d.ctrl.vx = d.ctrl.vz = 0;
    d.ai = 'parked';
    G.lastDriven = d;
    this.garageVehicle = d;
    G.driving = null;
    G.onFoot = true;
    let door = room.doors![0], bd = Infinity;
    for (const dr of room.doors!) { const k = Math.hypot(dr.x - d.x, dr.z - d.z); if (k < bd) { bd = k; door = dr; } }
    G.humans.setPlayerActive(true, door.x, door.z, door.h);
    G.enterBuilding(room);
  }

  /** The car to show or work on: the one you came in with, or your nearest own car within 80 m. */
  private findCar(): GameVehicle | null {
    const G = this.G;
    let v = this.garageVehicle && !this.garageVehicle.ctrl.wrecked ? this.garageVehicle : null;
    if (!v) {
      let bd = 80;
      for (const q of G.vehicles) { if (!q.owned || q.ctrl.wrecked) continue; const k = Math.hypot(q.x - G.ret.x, q.z - G.ret.z); if (k < bd) { bd = k; v = q; } }
    }
    return v;
  }

  /** The garage counter: repair, paint and vehicle menus for the car on the turntable. */
  openCounter(): void {
    const G = this.G;
    const v = this.findCar();
    if (!v || !G.inside) { G.hud.toast(bi('Bring your car to the garage', '차를 차고 앞에 세워 주세요'), 2200); return; }
    this.garageVehicle = v;
    G.driving = v;
    this.garageTemp = true;
    G.openGarage('garage');
  }

  /** Called when the garage menu closes: give the car back (parked) and forget the borrowed "driving" state. */
  menuClosed(): void {
    const G = this.G;
    if (!this.garageTemp) return;
    const v = G.driving;
    G.driving = null; this.garageTemp = false;
    if (v) { v.ai = 'parked'; G.lastDriven = v; this.garageVehicle = v; }
  }

  private bayCar(): GameVehicle | null {
    return this.G.driving && this.garageTemp ? this.G.driving : this.garageVehicle;
  }

  /** The garage shows your car on the turntable. */
  parkCarInBay(room: Room): void {
    const G = this.G;
    const v = this.findCar();
    if (!v) { this.garageHome = null; return; }
    this.garageVehicle = v;
    this.garageHome = { x: v.x, z: v.z, h: v.ctrl.heading };
    v.ctrl.display = true;
    v.ctrl.reset(room.ox + BAY_X, room.oz + BAY_Z, 2.6);
    this.bayCircle = { x: room.ox + BAY_X, z: room.oz + BAY_Z, r: 2.1 };
    G.world.circles.push(this.bayCircle);
    v.ctrl.vx = v.ctrl.vz = 0;
    v.ctrl.update(0.001, v.control, null);
  }

  returnCarToStreet(): void {
    const G = this.G;
    const v = this.bayCar();
    const h = this.garageHome;
    if (v) v.ctrl.display = false;
    if (v && h) { v.ctrl.reset(h.x, h.z, h.h); v.ctrl.vx = v.ctrl.vz = 0; v.ctrl.update(0.001, v.control, null); }
    this.garageVehicle = v;
    this.garageHome = null;
    if (this.bayCircle) { const i = G.world.circles.indexOf(this.bayCircle); if (i >= 0) G.world.circles.splice(i, 1); this.bayCircle = null; }
  }

  /** A slow turn on the turntable; whatever the menu changes (car, paint, neon, parts) shows on the car right away. */
  spin(dt: number): void {
    const G = this.G;
    const v = this.bayCar();
    const room = G.inside;
    if (!v || !room || room.id !== 'garage' || !this.garageHome) return;
    const c = v.ctrl;
    c.display = true; // a swapped-in car joins the turntable
    if (Math.hypot(v.x - (room.ox + BAY_X), v.z - (room.oz + BAY_Z)) > 3) c.reset(room.ox + BAY_X, room.oz + BAY_Z, c.heading);
    c.vx = c.vz = 0;
    c.heading += dt * 0.5;
    v.control.throttle = 0; v.control.steer = 0; v.control.handbrake = true;
    c.update(0.001, v.control, null);
  }

  // ---------------------------------------------------------------- houses

  ownsHome(i: number): boolean { return (this.G.save.homes ?? []).includes(i); }

  refreshHomeDoors(): void {
    const G = this.G;
    const room = G.interiors.rooms.find((r) => r.id === 'home');
    if (room) room.doors = G.world.homes.filter((_, i) => this.ownsHome(i)).map((h) => h.door!);
  }

  /** Index of the house whose front door you are standing at (-1 = none). */
  homeNear(): number {
    const G = this.G;
    const p = G.humans.player;
    for (let i = 0; i < G.world.homes.length; i++) if (Math.hypot(G.world.homes[i].x - p.x, G.world.homes[i].z - p.z) < 2.6) return i;
    return -1;
  }

  buyHome(i: number): void {
    const G = this.G;
    if (this.ownsHome(i)) return;
    if (!G.pay(Hideouts.HOME_PRICE)) return;
    (G.save.homes ??= []).push(i);
    this.refreshHomeDoors();
    G.progress.add('shops');
    G.flushSave();
    G.hud.toast(bi('You bought a house! A bed to rest and a place to hide.', '집을 샀어요! 쉴 수 있고 숨을 수도 있어요.'), 3200);
  }

  /** At home the wardrobe changes your clothes for free; with the police after you it also throws them off the scent (a third of the heat). */
  wardrobe(): void {
    const G = this.G;
    G.save.outfit = ((G.save.outfit ?? 0) + 1) % G.outfitCount;
    G.applyOutfit(G.save.outfit);
    const pl = G.humans.player;
    if (G.stars > 0) {
      G.coolHeat(0, 0.67);
      G.popups.spawn(pl.x, 3, pl.z, bi('New disguise!', '변장 완료!'), '#b084ff');
    } else G.popups.spawn(pl.x, 3, pl.z, bi('New look!', '새 옷!'), '#b084ff');
    G.flushSave();
  }
}
