import * as THREE from 'three';
import { AudioEngine } from './audio';
import { Beacon } from './beacon';
import { PoliceBrain, TrafficBrain, type PoliceRole } from './ai';
import type { CameraRig, Followable } from './cameraRig';
import type { Environment } from './environment';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import { GigManager } from './gigs';
import type { Blip, Hud } from './hud';
import type { Input } from './input';
import { t, tf } from './i18n';
import { Humans, Role, type HumanCtx, type HumanHooks } from './humans';
import { Popups, SlashTrail } from './effects';
import type { Props } from './props';
import { CIVILIAN_COLORS, CIVILIAN_KINDS, PLAYER_ROSTER, STATS, VehicleFactory, type VehicleKind } from './vehicle';
import { GameVehicle, type AIMode, type VehicleEvents } from './vehicles';
import type { Vfx } from './vfx';
import type { CircleCollider, World } from './world';

const SAVE_KEY = 'smashtown.save.v1';
interface SaveData { cash: number; unlocked: VehicleKind[]; selected: VehicleKind }

// Heat needed for 1..5 stars. Raised so a few smashed props don't instantly bring the whole police force.
const STAR_HEAT = [30, 90, 170, 270, 400];
const COMPOSITION: Record<number, [PoliceRole, number][]> = {
  // total police cars: 1, 3, 5, 8, 10
  1: [['cruiser', 1]],
  2: [['cruiser', 3]],
  3: [['cruiser', 3], ['interceptor', 2]],
  4: [['cruiser', 4], ['interceptor', 2], ['swat', 2]],
  5: [['cruiser', 4], ['interceptor', 2], ['swat', 2], ['armored', 2]],
};
const ROLE_KIND: Record<PoliceRole, VehicleKind> = { cruiser: 'police', interceptor: 'interceptor', swat: 'swat', armored: 'armored' };

interface Roadblock { x: number; z: number; mesh: THREE.Mesh; box: { minX: number; maxX: number; minZ: number; maxZ: number }; cars: GameVehicle[] }

export interface GameDeps {
  scene: THREE.Scene;
  world: World;
  props: Props;
  vfx: Vfx;
  hud: Hud;
  input: Input;
  env: Environment;
  cameraRig: CameraRig;
}

/** Owns the simulation: vehicles, AI, wanted level, combos, gigs, garage and persistence. */
export class Game {
  readonly scene: THREE.Scene;
  readonly world: World;
  readonly props: Props;
  readonly vfx: Vfx;
  readonly hud: Hud;
  readonly input: Input;
  readonly env: Environment;
  readonly cameraRig: CameraRig;
  readonly audio = new AudioEngine();
  readonly humans: Humans;
  readonly popups = new Popups();
  readonly slash = new SlashTrail();
  readonly gigs: GigManager;

  vehicles: GameVehicle[] = [];
  driving: GameVehicle | null = null;
  onFoot = false;
  state: 'play' | 'garage' | 'busted' | 'wrecked' | 'wasted' = 'play';
  damageTotal = 0;
  hitStop = 0;
  trafficTarget = 6;
  useBlob = false;

  private rng = makeRng(99);
  private save: SaveData;
  private saveDirty = false;
  private saveTimer = 0;
  private cash = 0;

  // wanted
  private heat = 0;
  stars = 0;
  private unseen = 0;
  private minHeat = 0;
  private bustTimer = 0;
  private stateTimer = 0;
  private policeSpawnTimer = 0;
  private roadblockTimer = 6;
  private roadblocks: Roadblock[] = [];
  private heatCooldown = 0;
  private survivalAcc = 0;

  // combo
  private comboCount = 0;
  private comboTimer = 0;

  // on foot
  private foot = { position: new THREE.Vector3(), heading: 0, lateralSpeed: 0, forwardSpeed: 0, speed: 0, nitroActive: false, camScale: 1, foot: true, sprinting: false };
  private copCars: { x: number; z: number }[] = [];
  private assaultCooldown = 0;
  private marker: THREE.Sprite;
  private dustAcc = 0;
  private garageLock = false;
  private garageBeacons: Beacon[] = [];
  private time = 0;
  private blipPool: (Blip & { x: number; z: number })[] = [];
  private blipCount = 0;
  private blips: Blip[] = [];

  private events: VehicleEvents;

  constructor(d: GameDeps) {
    this.scene = d.scene; this.world = d.world; this.props = d.props; this.vfx = d.vfx;
    this.hud = d.hud; this.input = d.input; this.env = d.env; this.cameraRig = d.cameraRig;
    this.humans = new Humans(d.world, this.humanHooks());
    this.scene.add(this.humans.group, this.popups.group, this.slash.mesh);
    this.marker = this.makePlayerMarker();
    this.scene.add(this.marker);
    this.gigs = new GigManager(this, this.scene);

    for (let i = 0; i < 80; i++) this.blipPool.push({ x: 0, z: 0, color: '#fff' });

    this.save = this.loadSave();
    this.cash = this.save.cash;
    this.hud.setCash(this.cash);

    for (const g of this.world.garages) {
      const b = new Beacon(0x3dff8a, 6);
      b.setPosition(g.x, g.z);
      this.scene.add(b.group);
      this.garageBeacons.push(b);
    }

    this.events = {
      onImpact: (v, s) => this.onImpact(v, s),
      onSmash: (v, c, vx, vz, sp) => this.onSmash(v, c, vx, vz, sp),
      onLand: (v, dist) => { if (v === this.driving && dist > 8) this.hud.toast(tf('ui.toast.jump', { n: Math.round(dist) })); },
    };

    // civilians and patrols
    for (let i = 0; i < this.trafficTarget; i++) this.spawnTraffic(true);
    this.spawnPlayer(this.save.selected, this.world.spawn.x, this.world.spawn.z, this.world.spawn.heading);
  }

  // ------------------------------------------------------------------ persistence
  private loadSave(): SaveData {
    const fallback: SaveData = { cash: 12450, unlocked: ['sports', 'sedan'], selected: 'sports' };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const s = JSON.parse(raw) as Partial<SaveData>;
      const unlocked = (s.unlocked ?? []).filter((k): k is VehicleKind => PLAYER_ROSTER.includes(k as VehicleKind));
      for (const k of fallback.unlocked) if (!unlocked.includes(k)) unlocked.push(k);
      const selected = s.selected && unlocked.includes(s.selected) ? s.selected : 'sports';
      return { cash: typeof s.cash === 'number' ? s.cash : fallback.cash, unlocked, selected };
    } catch {
      return fallback;
    }
  }
  private flushSave(): void {
    this.save.cash = Math.round(this.cash);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
    this.saveDirty = false;
  }

  // ------------------------------------------------------------------ accessors
  get focusX(): number { return this.onFoot || !this.driving ? this.humans.player.x : this.driving.x; }
  get focusZ(): number { return this.onFoot || !this.driving ? this.humans.player.z : this.driving.z; }
  get followable(): Followable { return this.onFoot || !this.driving ? this.foot : this.driving.ctrl; }
  get cashAmount(): number { return this.cash; }

  addCash(n: number): void {
    this.cash += n;
    this.saveDirty = true;
    this.hud.setCash(this.cash);
    if (n >= 100) this.audio.cash();
  }

  setMinStars(n: number): void {
    this.minHeat = n > 0 ? STAR_HEAT[n - 1] : 0;
    this.addHeat(0);
  }

  // ------------------------------------------------------------------ vehicles
  spawnVehicle(kind: VehicleKind, color: number, x: number, z: number, heading: number, ai: AIMode, full = false): GameVehicle {
    const v = new GameVehicle(kind, color, this.world, this.events, this.scene, ai, full);
    v.ctrl.reset(x, z, heading);
    this.vehicles.push(v);
    return v;
  }

  private removeVehicle(v: GameVehicle): void {
    v.remove();
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  private spawnPlayer(kind: VehicleKind, x: number, z: number, heading: number): GameVehicle {
    const v = this.spawnVehicle(kind, STATS[kind].color, x, z, heading, 'player', true);
    v.owned = true;
    this.driving = v;
    this.onFoot = false;
    this.humans.setPlayerActive(false, 0, 0, 0);
    return v;
  }

  private spawnTraffic(initial: boolean): void {
    const px = this.focusX || 0, pz = this.focusZ || 0;
    const p = TrafficBrain.randomPlacement(this.rng, px, pz, initial ? 25 : 90);
    const kind = CIVILIAN_KINDS[Math.floor(this.rng() * CIVILIAN_KINDS.length)];
    const color = kind === 'taxi' ? 0xffc400 : CIVILIAN_COLORS[Math.floor(this.rng() * CIVILIAN_COLORS.length)];
    const v = this.spawnVehicle(kind, color, p.x, p.z, p.heading, 'traffic');
    v.traffic = new TrafficBrain(this.rng);
    v.traffic.attach(p);
  }

  private relocate(v: GameVehicle): void {
    const p = TrafficBrain.randomPlacement(this.rng, this.focusX, this.focusZ, 90);
    v.ctrl.reset(p.x, p.z, p.heading);
    v.ctrl.hp = Math.max(v.ctrl.hp, 0.6);
    if (!v.traffic) v.traffic = new TrafficBrain(this.rng);
    v.traffic.attach(p);
  }

  // ------------------------------------------------------------------ events
  private nearPlayer(x: number, z: number, r: number): boolean {
    return Math.hypot(x - this.focusX, z - this.focusZ) < r;
  }

  private onImpact(v: GameVehicle, s: number): void {
    const c = v.ctrl;
    this.vfx.emitSparks(c.position.x, 0.8, c.position.z, Math.min(10, 2 + s * 0.4));
    if (v === this.driving) {
      this.cameraRig.shake(Math.min(1, s / 22));
      if (s > 9) this.hitStop = Math.max(this.hitStop, 0.03);
      this.audio.crash(s);
      this.damageTotal += s * 120;
    } else if (this.nearPlayer(c.position.x, c.position.z, 50)) {
      this.audio.crash(s * 0.6);
    }
  }

  private onSmash(v: GameVehicle, c: CircleCollider, vx: number, vz: number, speed: number): void {
    this.smashProp(c, vx, vz, speed, v === this.driving);
  }

  /** Destroy a street prop (by car, kick or bat) and score it. */
  smashProp(c: CircleCollider, vx: number, vz: number, speed: number, byPlayer: boolean): void {
    if (!c.smash || c.dead) return;
    c.dead = true;
    const value = this.props.smash(c.smash, c.x, c.z, vx, vz);
    if (!byPlayer) return;
    this.damageTotal += value;
    this.comboCount++;
    this.comboTimer = 4;
    const mult = Math.min(10, 1 + Math.floor(this.comboCount / 2));
    this.addCash(Math.round(value * 0.1 * mult));
    this.addHeat(3);
    this.audio.smash();
    this.cameraRig.shake(Math.min(0.5, speed / 70));
  }

  // ------------------------------------------------------------------ wanted
  addHeat(n: number): void {
    this.heat = Math.min(400, Math.max(this.heat + n, this.minHeat));
    const prev = this.stars;
    let s = 0;
    for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) s = i + 1;
    if (s > prev) {
      if (prev === 0) this.policeSpawnTimer = Math.max(this.policeSpawnTimer, 3); // first cruiser arrives after a short delay
      this.stars = s;
      this.hud.toast(tf('ui.toast.wanted', { n: s }), 1600);
    }
    this.hud.setWanted(this.stars);
  }

  private clearWanted(): void {
    this.heat = 0;
    this.minHeat = 0;
    this.stars = 0;
    this.unseen = 0;
    this.bustTimer = 0;
    this.hud.setWanted(0);
    this.standDownPolice();
  }

  /** Cops stop chasing: chasers become ordinary patrols, roadblocks are removed. */
  private standDownPolice(): void {
    for (const v of this.vehicles) {
      if (v.ai === 'police') {
        v.ai = 'traffic';
        v.police = null;
        v.traffic = new TrafficBrain(this.rng);
        v.traffic.attachNearest(v.x, v.z, v.ctrl.heading);
      }
    }
    for (const rb of [...this.roadblocks]) this.removeRoadblock(rb);
  }

  private policeVehicles(): GameVehicle[] {
    return this.vehicles.filter((v) => v.ai === 'police' && !v.ctrl.wrecked);
  }

  private spawnPolice(role: PoliceRole): void {
    const px = this.focusX, pz = this.focusZ;
    let p = TrafficBrain.randomPlacement(this.rng, px, pz, 110);
    for (let i = 0; i < 8 && Math.hypot(p.x - px, p.z - pz) > 220; i++) p = TrafficBrain.randomPlacement(this.rng, px, pz, 110);
    const kind = ROLE_KIND[role];
    const v = this.spawnVehicle(kind, STATS[kind].color, p.x, p.z, Math.atan2(px - p.x, pz - p.z), 'police');
    v.police = new PoliceBrain(role, this.rng);
  }

  private managePolice(dt: number): void {
    if (this.stars === 0) return;
    const comp = COMPOSITION[this.stars];
    // while you are evading (police exist but are far behind) no reinforcements are sent, so a clean getaway is possible
    const evading = this.vehicles.some((v) => v.ai === 'police') && this.unseen > 2;
    const have: Record<string, number> = {};
    for (const v of this.policeVehicles()) have[v.police!.role] = (have[v.police!.role] ?? 0) + 1;
    this.policeSpawnTimer -= dt;
    if (this.policeSpawnTimer <= 0 && !evading) {
      for (const [role, n] of comp) {
        if ((have[role] ?? 0) < n) { this.spawnPolice(role); this.policeSpawnTimer = 2.5; break; }
      }
    }
    // roadblocks from 3 stars
    if (this.stars >= 3) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0 && this.roadblocks.length < 1) { this.spawnRoadblock(); this.roadblockTimer = 25; }
    }
    for (const rb of [...this.roadblocks]) {
      if (Math.hypot(rb.x - this.focusX, rb.z - this.focusZ) > 210) this.removeRoadblock(rb);
    }
  }

  /** A barricade across a road segment roughly 115 m ahead of where the player is heading, with two cruisers on the approach side. */
  private spawnRoadblock(): void {
    const d = this.driving;
    const fx = d ? Math.sin(d.ctrl.heading) : 0, fz = d ? Math.cos(d.ctrl.heading) : 1;
    const px = this.focusX, pz = this.focusZ;
    const tx = px + fx * 115, tz = pz + fz * 115;
    let seg = null as (typeof this.world.segments)[number] | null, bd = Infinity;
    for (const sgm of this.world.segments) {
      if (sgm.len < 34 || sgm.hw < 6) continue;
      if (Math.hypot(sgm.x - px, sgm.z - pz) < 70) continue;
      const dd = Math.hypot(sgm.x - tx, sgm.z - tz);
      if (dd < bd) { bd = dd; seg = sgm; }
    }
    if (!seg) return;
    const { x, z, dx, dz, hw } = seg;
    const alongZ = dz !== 0; // the road runs along z, so the barricade spreads along x
    const b = new MeshBuilder();
    const bw = hw * 2 - 1;
    const sx = alongZ ? bw : 1.2, sz = alongZ ? 1.2 : bw;
    b.box(sx, 1.1, sz, x, 0.55, z, 0xff8c00);
    b.box(alongZ ? bw : 1.25, 0.25, alongZ ? 1.25 : bw, x, 0.8, z, 0xffffff);
    const mesh = new THREE.Mesh(b.build(), paletteMaterial());
    mesh.castShadow = true;
    this.scene.add(mesh);
    const box = { minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 };
    this.world.boxes.push(box);
    // the cruisers sit on the side the player approaches from, angled toward the oncoming car
    const approach = (px - x) * dx + (pz - z) * dz >= 0 ? 1 : -1;
    const cars: GameVehicle[] = [];
    for (const side of [-1, 1]) {
      const cx = x + approach * 3.2 * dx + side * (hw - 2.2) * -dz;
      const cz = z + approach * 3.2 * dz + side * (hw - 2.2) * dx;
      const heading = Math.atan2(approach * dx, approach * dz) + side * 0.5;
      cars.push(this.spawnVehicle('police', STATS.police.color, cx, cz, heading, 'parked'));
    }
    this.roadblocks.push({ x, z, mesh, box, cars });
  }

  private removeRoadblock(rb: Roadblock): void {
    rb.mesh.removeFromParent();
    rb.mesh.geometry.dispose();
    const i = this.world.boxes.indexOf(rb.box);
    if (i >= 0) this.world.boxes.splice(i, 1);
    for (const c of rb.cars) if (c.ai !== 'player' && c !== this.driving) this.removeVehicle(c); // never delete a cruiser the player took
    this.roadblocks.splice(this.roadblocks.indexOf(rb), 1);
  }

  // ------------------------------------------------------------------ enter / exit / respawn
  private nearestVehicle(r: number): GameVehicle | null {
    let best: GameVehicle | null = null, bd = r;
    for (const v of this.vehicles) {
      if (v.ctrl.wrecked || v === this.driving) continue;
      const d = Math.hypot(v.x - this.humans.player.x, v.z - this.humans.player.z) - v.ctrl.collisionRadius;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  private enterExit(): void {
    if (this.state !== 'play') return;
    if (this.driving && !this.onFoot) {
      const v = this.driving;
      if (v.ctrl.speed > 9) return;
      const h = v.ctrl.heading;
      this.humans.setPlayerActive(true, v.x + Math.cos(h) * 2.6, v.z - Math.sin(h) * 2.6, h);
      this.onFoot = true;
      v.ai = 'parked';
      this.driving = null;
      this.lastDriven = v;
      this.cameraRig.snap();
    } else {
      const v = this.nearestVehicle(3.2);
      if (!v) return;
      // whoever was driving gets out: civilians run away, cops climb out too (also the empty roadblock cruisers)
      const hadDriver = v.ai === 'traffic' || v.ai === 'police' || (v.isPolice && v.ai === 'parked' && !v.owned);
      if (v.police || v.traffic || v.ai === 'police' || v.ai === 'traffic') {
        this.addHeat(v.isPolice ? 45 : 20);
        v.traffic = null;
        v.police = null;
      }
      if (hadDriver) {
        this.humans.ejectDriver(v.x, v.z, v.ctrl.heading, v.isPolice);
        v.ctrl.vx *= 0.2; v.ctrl.vz *= 0.2; // the car rolls to a stop as the driver bails out
      }
      v.ai = 'player';
      v.ensureFull();
      this.driving = v;
      this.onFoot = false;
      this.humans.setPlayerActive(false, 0, 0, 0);
      this.cameraRig.snap();
      this.audio.thump();
    }
  }
  private lastDriven: GameVehicle | null = null;

  private nearestGarage(x: number, z: number): { x: number; z: number } {
    let best = this.world.garages[0], bd = Infinity;
    for (const g of this.world.garages) {
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  private respawnAtGarage(): void {
    const g = this.nearestGarage(this.focusX, this.focusZ);
    const old = this.driving ?? this.lastDriven;
    if (old && this.vehicles.includes(old) && (old.owned || old.ctrl.wrecked)) this.removeVehicle(old);
    this.driving = null;
    this.spawnPlayer(this.save.selected, g.x + 3.3, g.z + 10, Math.PI);
    this.cameraRig.snap();
  }

  /** Unstick: put the car back on the avenue. */
  private resetCar(): void {
    if (!this.driving) return;
    const p = this.world.spawn;
    this.driving.ctrl.reset(p.x, p.z, p.heading);
    this.cameraRig.snap();
  }

  // ------------------------------------------------------------------ garage (Pay & Spray)
  private garageModel() {
    const d = this.driving;
    return {
      cash: this.cash,
      repairCost: 100 + this.stars * 150 + Math.round((1 - (d?.ctrl.hp ?? 1)) * 400),
      unlocked: new Set(this.save.unlocked),
      selected: this.save.selected,
    };
  }

  private openGarage(): void {
    this.state = 'garage';
    const d = this.driving!;
    d.ctrl.vx = d.ctrl.vz = 0;
    this.hud.openGarage(this.garageModel(), {
      onRepair: () => {
        const m = this.garageModel();
        if (this.cash < m.repairCost) { this.hud.toast(t('ui.toast.notenough')); return; }
        this.cash -= m.repairCost;
        this.driving!.ctrl.hp = 1;
        this.clearWanted();
        this.saveDirty = true;
        this.hud.setCash(this.cash);
        this.hud.toast(t('ui.toast.repaired'));
        this.hud.refreshGarage(this.garageModel());
      },
      onBuy: (k) => {
        const price = STATS[k].price;
        if (this.cash < price) { this.hud.toast(t('ui.toast.notenough')); return; }
        this.cash -= price;
        this.save.unlocked.push(k);
        this.saveDirty = true;
        this.hud.setCash(this.cash);
        this.hud.toast(t('ui.toast.unlocked'));
        this.audio.cash();
        this.selectVehicle(k);
        this.hud.refreshGarage(this.garageModel());
      },
      onSelect: (k) => { this.selectVehicle(k); this.hud.refreshGarage(this.garageModel()); },
      onClose: () => this.closeGarage(),
    });
  }

  closeGarage(): void {
    if (this.state !== 'garage') return;
    this.hud.closeGarage();
    this.state = 'play';
    this.garageLock = true;
    this.flushSave();
  }

  private selectVehicle(k: VehicleKind): void {
    this.save.selected = k;
    this.saveDirty = true;
    const old = this.driving;
    if (!old) return;
    const hp = old.ctrl.hp;
    const nv = this.spawnVehicle(k, STATS[k].color, old.x, old.z, old.ctrl.heading, 'player', true);
    nv.owned = true;
    nv.ctrl.hp = hp;
    this.removeVehicle(old);
    this.driving = nv;
    this.cameraRig.snap();
  }

  // ------------------------------------------------------------------ per-frame update
  update(rawDt: number): void {
    const dt = rawDt;
    this.time += dt;
    const input = this.input;

    if (input.wasPressed('Escape') && this.state === 'garage') this.closeGarage();

    if (this.state === 'play') {
      if (input.wasPressed('KeyF') || input.wasPressed('KeyE')) this.enterExit();
      if (input.wasPressed('KeyR')) this.resetCar();
    }

    // ---- player control
    const playing = this.state === 'play';
    const look = input.takeLook();
    if (this.onFoot) this.cameraRig.applyLook(look.x, look.y);
    for (const v of this.vehicles) {
      switch (v.ai) {
        case 'player':
          if (playing && v === this.driving) {
            v.control.throttle = input.throttle; v.control.steer = input.steer;
            v.control.handbrake = input.handbrake; v.control.nitro = input.nitro;
          } else {
            v.control.throttle = 0; v.control.steer = 0; v.control.handbrake = true; v.control.nitro = false;
          }
          break;
        case 'traffic': v.traffic?.update(dt, v, this.vehicles, this.rng, this.humans.list); break;
        case 'police': {
          const tg = this.chaseTarget();
          v.police?.update(dt, v, tg, this.world, this.stars);
          break;
        }
        default:
          v.control.throttle = 0; v.control.steer = 0; v.control.handbrake = true; v.control.nitro = false;
      }
    }

    // ---- physics
    const fx = this.fx;
    for (const v of this.vehicles) {
      const near = this.nearPlayer(v.x, v.z, 60);
      v.ctrl.update(dt, v.control, near ? fx : null);
    }
    this.collideVehicles();
    this.collidePeds();

    this.props.update(dt);
    this.assaultCooldown = Math.max(0, this.assaultCooldown - dt);
    this.updateHumans(dt, playing);
    this.popups.update(dt);
    this.slash.update(dt);

    this.vehicleLifecycle(dt);
    this.maintainTraffic();
    this.updateWanted(dt);
    this.updateCombo(dt);
    this.updateGarageZones();
    this.gigs.update(dt);
    this.updateStateMachine(dt);

    // ---- presentation
    this.updateLights();
    this.updatePrompt();
    this.updateAudio(dt);
    this.buildBlips();
    const d = this.driving;
    this.hud.update(this.followable, d ? d.ctrl.hp : 1, d ? d.ctrl.nitro : 1, d ? d.ctrl.nitroActive : false, this.blips.slice(0, this.blipCount), dt);
    const pl = this.humans.player;
    this.hud.setTelemetryVisible(!!d);
    this.hud.setFootMode(this.onFoot, pl.weapon, this.humans.unlockedBaton);
    this.hud.setPlayerHp(Math.max(0, pl.hp / pl.maxHp));
    this.hud.setWantedBanner(this.stars > 0);

    if (this.saveDirty) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) { this.flushSave(); this.saveTimer = 3; }
    }
  }

  private fx = {
    skid: (x: number, z: number, h: number) => this.vfx.addSkid(x, z, h),
    dust: (x: number, z: number, vx: number, vz: number, n: number) => this.vfx.emitDust(x, z, vx, vz, n),
  };

  private chaseTarget() {
    const d = this.driving;
    if (d && !this.onFoot) {
      return { x: d.x, z: d.z, vx: d.ctrl.vx, vz: d.ctrl.vz, speed: d.ctrl.speed, onFoot: false };
    }
    return { x: this.humans.player.x, z: this.humans.player.z, vx: 0, vz: 0, speed: 0, onFoot: true };
  }

  /** Drive all humans (player on foot, foot cops, civilians). */
  private updateHumans(dt: number, playing: boolean): void {
    const pl = this.humans.player;
    const d = this.driving;
    this.copCars.length = 0;
    for (const v of this.vehicles) if (v.ai === 'police' && !v.ctrl.wrecked) this.copCars.push({ x: v.x, z: v.z });
    let want = this.onFoot && playing ? [0, 1, 2, 3, 4, 5][this.stars] : 0;
    if (this.onFoot && playing && this.gigs.active?.id === 'brawl') want = Math.max(want, 4);
    const ctx: HumanCtx = {
      input: playing ? this.input : this.idleInput,
      camYaw: this.cameraRig.moveYaw,
      vehicles: this.vehicles,
      wantCops: want,
      playerActive: this.onFoot,
      playerCarX: d ? d.x : pl.x, playerCarZ: d ? d.z : pl.z, playerCarSpeed: d ? d.ctrl.speed : 0,
      policeCars: this.copCars,
      time: this.time,
    };
    this.humans.update(dt, ctx);
    this.marker.visible = this.onFoot && pl.state !== 8;
    if (this.onFoot) {
      this.marker.position.set(pl.x, pl.y + 2.55 + Math.sin(this.time * 4) * 0.08, pl.z);
      // sprint dust puffs at the feet
      if (pl.speed > 6.2 && pl.grounded) {
        this.dustAcc += dt;
        if (this.dustAcc > 0.1) {
          this.dustAcc = 0;
          this.vfx.emitDust(pl.x - Math.sin(pl.heading) * 0.3, pl.z - Math.cos(pl.heading) * 0.3, -Math.sin(pl.heading) * 2, -Math.cos(pl.heading) * 2, 1);
        }
      }
    }
    if (this.onFoot) {
      const f = this.foot;
      f.position.set(pl.x, pl.y - 0.1, pl.z);
      f.heading = pl.heading;
      f.forwardSpeed = pl.speed; f.speed = pl.speed;
      f.sprinting = pl.speed > 6.2;
    }
  }

  /** Yellow downward triangle with a PLAYER label, shown above the avatar while on foot. */
  private makePlayerMarker(): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const g = c.getContext('2d')!;
    g.font = '900 54px Montserrat, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#1a1a24'; g.strokeText('PLAYER', 128, 38);
    g.fillStyle = '#ffd500'; g.fillText('PLAYER', 128, 38);
    g.beginPath(); g.moveTo(88, 88); g.lineTo(168, 88); g.lineTo(128, 148); g.closePath();
    g.fillStyle = '#ffd500'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#1a1a24'; g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    sp.scale.set(1.6, 1, 1);
    sp.renderOrder = 11;
    sp.visible = false;
    return sp;
  }

  private idleInput = { throttle: 0, steer: 0, handbrake: false, nitro: false, wasPressed: () => false } as unknown as Input;

  private humanHooks(): HumanHooks {
    return {
      onHit: (att, tgt, atk, x, y, z, killed) => {
        const word = atk.popup === 'smash' ? t('pop.smash') : atk.popup === 'wham' ? t('pop.wham') : t('pop.pow');
        this.popups.spawn(x, y + 0.5, z, word, atk.popup === 'smash' ? '#ff8c00' : atk.popup === 'wham' ? '#e6b800' : '#ff3b3b');
        this.vfx.emitSparks(x, y, z, 6 + Math.round(atk.dmg / 8));
        this.vfx.emitFire(x, y, z, 4, 0.12); // starburst polyhedra
        this.vfx.emitDebris(x, y, z, 0, 0, 0xffd500, 3);
        this.hitStop = Math.max(this.hitStop, atk.stop);
        this.cameraRig.shake(Math.min(0.6, atk.dmg / 90));
        this.audio.impact(att.weapon === 1 ? 'bat' : atk.kind === 'kick' ? 'kick' : 'punch');
        if (att.role === Role.Player && this.assaultCooldown <= 0) {
          this.addHeat(tgt.role === Role.Cop ? 20 : 8);
          this.assaultCooldown = 0.8;
        }
        void killed;
      },
      onSmash: (c, vx, vz) => this.smashProp(c, vx, vz, 9, true),
      onVehicleHit: (att, v, ix, iz, atk) => {
        v.ctrl.vx += (ix * atk.push * 0.5) / v.ctrl.stats.mass;
        v.ctrl.vz += (iz * atk.push * 0.5) / v.ctrl.stats.mass;
        v.ctrl.damage(atk.dmg * 0.0012);
        this.vfx.emitSparks(v.x - ix * 1.5, 1, v.z - iz * 1.5, 6);
        this.audio.impact('kick');
        this.damageTotal += atk.dmg * 40;
        void att;
      },
      onPlayerHurt: () => { this.cameraRig.shake(0.35); this.audio.thump(); },
      onCopDown: (h) => {
        this.addCash(150);
        this.addHeat(15);
        if (this.humans.kids) this.popups.spawn(h.x, h.y + 2.2, h.z, t('pop.ko'), '#8a5cd6'); // knocked out, not killed
        else this.vfx.emitFire(h.x, 1, h.z, 4, 0.3);
      },
      onSwing: (att, atk) => {
        this.audio.whoosh(atk.kind !== 'punch');
        if (atk.kind === 'swing' && att.role === Role.Player) this.slash.fire(att.x, att.y + 1.1, att.z, att.heading);
      },
      onPickup: () => { this.hud.toast(t('ui.toast.baton')); this.audio.cash(); },
      onStep: () => this.audio.step(),
      onWhiff: () => { /* dodged */ },
    };
  }

  // ------------------------------------------------------------------ vehicle <-> vehicle / ped collisions
  private collideVehicles(): void {
    const vs = this.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j];
        if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) continue;
        if (a.ctrl.airborne && a.ctrl.position.y > 1.2) continue;
        if (b.ctrl.airborne && b.ctrl.position.y > 1.2) continue;
        const ca = a.ctrl, cb = b.ctrl;
        const fa = [Math.sin(ca.heading), Math.cos(ca.heading)];
        const fb = [Math.sin(cb.heading), Math.cos(cb.heading)];
        const rsum = ca.collisionRadius + cb.collisionRadius;
        let pen = 0, nx = 0, nz = 0;
        for (const oa of ca.collisionOffsets) {
          for (const ob of cb.collisionOffsets) {
            const dx = a.x + fa[0] * oa - (b.x + fb[0] * ob);
            const dz = a.z + fa[1] * oa - (b.z + fb[1] * ob);
            const d = Math.hypot(dx, dz);
            if (d < rsum && rsum - d > pen) { pen = rsum - d; nx = d > 1e-4 ? dx / d : 1; nz = d > 1e-4 ? dz / d : 0; }
          }
        }
        if (pen <= 0) continue;
        const ma = ca.stats.mass, mb = cb.stats.mass;
        const ia = 1 / ma, ib = 1 / mb;
        const share = pen / (ia + ib);
        ca.position.x += nx * share * ia; ca.position.z += nz * share * ia;
        cb.position.x -= nx * share * ib; cb.position.z -= nz * share * ib;
        const vn = (ca.vx - cb.vx) * nx + (ca.vz - cb.vz) * nz;
        if (vn >= 0) continue;
        const jimp = (-(1.35) * vn) / (ia + ib);
        ca.vx += nx * jimp * ia; ca.vz += nz * jimp * ia;
        cb.vx -= nx * jimp * ib; cb.vz -= nz * jimp * ib;
        const s = -vn;
        if (s > 3) {
          const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
          this.vfx.emitSparks(midX, 0.8, midZ, Math.min(10, 2 + s * 0.4));
          ca.damage(s * 0.005 * Math.min(2, Math.max(0.5, mb / ma)));
          cb.damage(s * 0.005 * Math.min(2, Math.max(0.5, ma / mb)));
          const pl = a === this.driving ? a : b === this.driving ? b : null;
          if (pl) {
            const other = pl === a ? b : a;
            this.cameraRig.shake(Math.min(1, s / 22));
            if (s > 9) this.hitStop = Math.max(this.hitStop, 0.03);
            this.audio.crash(s);
            this.damageTotal += s * 120;
            if (s > 4 && this.heatCooldown <= 0 && !other.isPolice) {
              this.addHeat(10);
              this.heatCooldown = 1.2;
            }
          } else if (this.nearPlayer(midX, midZ, 50)) this.audio.crash(s * 0.6);
        }
      }
    }
  }

  private collidePeds(): void {
    for (const v of this.vehicles) {
      const c = v.ctrl;
      if (c.speed < 3 || c.wrecked) continue;
      const fxv = Math.sin(c.heading), fzv = Math.cos(c.heading);
      for (const off of c.collisionOffsets) {
        const h = this.humans.hitByVehicle(v.x + fxv * off, v.z + fzv * off, c.collisionRadius, c.vx, c.vz);
        if (h && v === this.driving) {
          this.addHeat(h.role === Role.Cop ? 20 : 15);
          this.audio.thump();
          this.vfx.emitDebris(h.x, 1, h.z, c.vx, c.vz, 0xe85a4f, 4);
          this.cameraRig.shake(0.25);
        }
      }
    }
  }

  // ------------------------------------------------------------------ lifecycle (wrecks, recycling)
  private vehicleLifecycle(dt: number): void {
    this.heatCooldown = Math.max(0, this.heatCooldown - dt);
    for (const v of [...this.vehicles]) {
      const c = v.ctrl;
      if (c.hp <= 0 && !c.wrecked) {
        v.markWrecked();
        this.vfx.explosion(v.x, v.z);
        if (this.nearPlayer(v.x, v.z, 70)) { this.audio.explosion(); this.cameraRig.shake(0.5); }
        if (v === this.driving) continue; // handled by the state machine
        if (v.ai === 'police') { this.addCash(200); this.addHeat(30); }
        v.ai = 'wreck';
        v.wreckTimer = 8;
      }
      if (c.wrecked && v.ai === 'wreck') {
        v.wreckTimer -= dt;
        if (this.nearPlayer(v.x, v.z, 80)) {
          v.smokeAcc += dt;
          if (v.smokeAcc > 0.08) { v.smokeAcc = 0; this.vfx.emitFire(v.x, 1, v.z, 1, 0.8); this.vfx.emitSmoke(v.x, 1.4, v.z, true, 1); }
        }
        if (v.wreckTimer <= 0) this.removeVehicle(v);
        continue;
      }
      // damage smoke / flames at the hood
      if (!c.wrecked && c.hp < 0.6 && this.nearPlayer(v.x, v.z, 80)) {
        v.smokeAcc += dt;
        const rate = c.hp < 0.3 ? 0.07 : 0.16;
        if (v.smokeAcc > rate) {
          v.smokeAcc = 0;
          const hx = v.x + Math.sin(c.heading) * 1.6, hz = v.z + Math.cos(c.heading) * 1.6;
          this.vfx.emitSmoke(hx, 1.1, hz, c.hp < 0.3);
          if (c.hp < 0.3) this.vfx.emitFire(hx, 1.0, hz, 1, 0.3);
        }
      }
      // recycle faraway AI
      if (v.ai === 'traffic' && !this.nearPlayer(v.x, v.z, 200)) this.relocate(v);
      else if (v.ai === 'police' && !this.nearPlayer(v.x, v.z, 190)) { this.removeVehicle(v); continue; } // they give up when left far behind (no rubber-banding back)
      else if (v.ai === 'parked' && !v.owned && !v.isGigTarget && !this.nearPlayer(v.x, v.z, 240) && !this.roadblocks.some((r) => r.cars.includes(v))) this.removeVehicle(v);
    }
  }

  private maintainTraffic(): void {
    let n = 0;
    for (const v of this.vehicles) if (v.ai === 'traffic') n++;
    if (n < this.trafficTarget) this.spawnTraffic(false);
    else if (n > this.trafficTarget + 2) {
      const v = this.vehicles.find((q) => q.ai === 'traffic' && !this.nearPlayer(q.x, q.z, 60));
      if (v) this.removeVehicle(v);
    }
  }

  private updateWanted(dt: number): void {
    if (this.stars === 0) { this.managePolice(dt); return; }
    let nearest = Infinity;
    for (const v of this.policeVehicles()) nearest = Math.min(nearest, Math.hypot(v.x - this.focusX, v.z - this.focusZ));
    this.unseen = nearest > 85 ? this.unseen + dt : 0;
    if (this.unseen > 4 && this.heat > this.minHeat) {
      this.heat = Math.max(this.minHeat, this.heat - 22 * dt);
      let s = 0;
      for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) s = i + 1;
      if (s < this.stars) {
        this.stars = s;
        this.hud.setWanted(s);
        if (s === 0) { this.hud.toast(t('ui.toast.lost')); this.clearWanted(); }
      }
    }
    // survival bonus at high heat
    if (this.stars >= 4) {
      this.survivalAcc += dt * this.stars * 8;
      if (this.survivalAcc >= 50) { this.addCash(Math.floor(this.survivalAcc)); this.survivalAcc = 0; }
    }
    this.managePolice(dt);

    // busted: cops on you while stopped
    if (this.state === 'play') {
      const d = this.driving;
      const stopped = !this.onFoot && (d ? d.ctrl.speed < 3.5 : false);
      let close = false;
      for (const v of this.policeVehicles()) {
        if (Math.hypot(v.x - this.focusX, v.z - this.focusZ) < 7.5) { close = true; break; }
      }
      this.bustTimer = stopped && close ? this.bustTimer + dt : Math.max(0, this.bustTimer - dt * 1.5);
      if (this.bustTimer > 3.0) this.busted();
    }
  }

  private busted(): void {
    this.state = 'busted';
    this.stateTimer = 2.8;
    const fine = Math.min(Math.round(this.cash), 500);
    this.cash -= fine;
    this.saveDirty = true;
    this.hud.setCash(this.cash);
    this.hud.setOverlay('ui.busted', tf('ui.toast.busted', { n: fine }));
    this.audio.thump();
  }

  private updateCombo(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    const mult = Math.min(10, 1 + Math.floor(this.comboCount / 2));
    this.hud.setCombo(Math.max(0, this.comboTimer / 4), this.comboCount > 0 ? mult : 1);
  }

  private updateGarageZones(): void {
    for (const b of this.garageBeacons) b.update(1 / 60);
    const d = this.driving;
    if (!d || this.onFoot || this.state !== 'play') return;
    let near = false;
    for (const g of this.world.garages) {
      if (Math.hypot(g.x - d.x, g.z - d.z) < 7) near = true;
    }
    if (!near) { this.garageLock = false; return; }
    if (this.garageLock || d.ctrl.speed > 25) return;
    if (this.gigs.onGarageArrival()) { this.garageLock = true; return; }
    this.openGarage();
  }

  private updateStateMachine(dt: number): void {
    if (this.state === 'play') {
      const d = this.driving;
      if (d && d.ctrl.wrecked && !this.onFoot) {
        this.state = 'wrecked';
        this.stateTimer = 2.8;
        const fine = Math.min(Math.round(this.cash), 300);
        this.cash -= fine;
        this.hud.setCash(this.cash);
        this.hud.setOverlay('ui.wrecked', tf('ui.toast.busted', { n: fine }));
      } else if (this.onFoot && this.humans.player.hp <= 0) {
        this.state = 'wasted';
        this.stateTimer = 2.8;
        const fine = Math.min(Math.round(this.cash), 300);
        this.cash -= fine;
        this.hud.setCash(this.cash);
        this.hud.setOverlay(this.humans.kids ? 'ui.knocked_out' : 'ui.wasted', tf('ui.toast.busted', { n: fine }));
      }
    } else if (this.state === 'busted' || this.state === 'wrecked' || this.state === 'wasted') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.hud.setOverlay(null);
        const wasWreck = this.state === 'wrecked';
        this.state = 'play';
        this.clearWanted();
        if (!wasWreck) for (const v of this.policeVehicles()) this.removeVehicle(v);
        this.humans.healPlayer();
        this.humans.setPlayerActive(false, 0, 0, 0);
        this.respawnAtGarage();
      }
    }
  }

  // ------------------------------------------------------------------ presentation helpers
  private updateLights(): void {
    const n = this.env.night;
    this.world.windowMaterial.emissiveIntensity = n * 1.1;
    this.world.signMaterial.emissiveIntensity = 0.15 + n * 1.0;
    this.props.lampHeadMaterial.emissiveIntensity = 0.15 + n * 3.2;
    VehicleFactory.sharedHead.emissiveIntensity = 0.6 + n * 2.6;
    const flash = Math.floor(this.time * 7) % 2 === 0;
    const sirens = this.stars > 0 || this.roadblocks.length > 0;
    VehicleFactory.sirenRed.emissiveIntensity = sirens ? (flash ? 3.4 : 0.15) : 0.2;
    VehicleFactory.sirenBlue.emissiveIntensity = sirens ? (flash ? 0.15 : 3.4) : 0.2;
    const d = this.driving;
    if (d) {
      const m = d.ctrl.model;
      m.headMat.emissiveIntensity = 0.6 + n * 2.6;
      if (m.headGlow) {
        m.headGlow.visible = n > 0.05;
        (m.headGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, n * 0.6);
      }
      if (m.blob) m.blob.visible = this.useBlob;
    }
  }

  private updatePrompt(): void {
    if (this.state !== 'play') { this.hud.setPrompt(null); return; }
    if (this.onFoot) this.hud.setPrompt(this.nearestVehicle(3.2) ? t('ui.hint.enter_car') : null);
    else if (this.driving && this.driving.ctrl.speed < 2.5 && this.stars === 0) this.hud.setPrompt(t('ui.hint.exit_car'));
    else this.hud.setPrompt(null);
  }

  private updateAudio(dt: number): void {
    const d = this.driving;
    let siren: number | null = null;
    for (const v of this.vehicles) {
      if (v.isPolice && (v.ai === 'police' || (v.ai === 'parked' && this.roadblocks.length))) {
        const dist = Math.hypot(v.x - this.focusX, v.z - this.focusZ);
        if (siren === null || dist < siren) siren = dist;
      }
    }
    this.audio.update(dt, {
      inCar: !!d && !this.onFoot,
      speedRatio: d ? Math.abs(d.ctrl.forwardSpeed) / d.ctrl.stats.maxSpeed : 0,
      throttle: this.input.throttle,
      slip: d && d.ctrl.drifting ? Math.min(1, Math.abs(d.ctrl.lateralSpeed) / 10) : 0,
      nitro: !!d && d.ctrl.nitroActive,
      sirenDist: this.stars > 0 || this.roadblocks.length ? siren : null,
    });
  }

  private pushBlip = (x: number, z: number, color: string, flash = false, size = 4.5) => {
    if (this.blipCount >= this.blipPool.length) return;
    const b = this.blipPool[this.blipCount++];
    b.x = x; b.z = z; b.color = color; b.flash = flash; b.size = size;
    this.blips[this.blipCount - 1] = b;
  };

  private buildBlips(): void {
    this.blipCount = 0;
    for (const g of this.world.garages) this.pushBlip(g.x, g.z, '#3dff8a', false, 5);
    this.gigs.blips(this.pushBlip);
    for (const v of this.vehicles) {
      if (v.isPolice && !v.ctrl.wrecked && (v.ai === 'police' || v.ai === 'parked')) this.pushBlip(v.x, v.z, '#ff2a3a', true, 4.5);
    }
  }
}
