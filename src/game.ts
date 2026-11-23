import * as THREE from 'three';
import { AudioEngine } from './audio';
import { Beacon } from './beacon';
import { Collectibles } from './collectibles';
import { StoryManager, type StorySave } from './story';
import { PoliceBrain, TrafficBrain, type PoliceRole } from './ai';
import type { CameraRig, Followable } from './cameraRig';
import type { Environment } from './environment';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import { GigManager } from './gigs';
import { Navigator, type Route } from './nav';
import { Pickups } from './pickups';
import { Helicopter } from './heli';
import { Interiors, type Room } from './interiors';
import { RoofDash } from './roofdash';
import { PoliceFire } from './policefire';
import { RangeGig } from './range';
import { SideQuests } from './sidequests';
import { Progress, type ProgressSave } from './tracker';
import { Shops } from './shops';
import { todayKey } from './progress';
import { Climber } from './climb';
import { StreetLife } from './street';
import { EventBus } from './events';
import { Crime } from './crime';
import { Hideouts } from './hideouts';
import { Medics } from './medics';
import { Machines } from './machines';
import { TrafficLights } from './lights';
import { News } from './news';
import { TaxiJob } from './taxi';
import { StreetRace } from './race';
import { DeliveryJob } from './delivery';
import { Animals } from './animals';
import { Festival } from './festival';
import { Transit } from './transit';
import { Fishing } from './fishing';
import { settings } from './settings';
import { Mood } from './mood';
import { GUN_ORDER, GUNS, GUN_UP_PRICE, GUN_UP_TIER, Guns, type GunDef, type GunId } from './guns';
import { BODY_KEYS, BODY_PRICES, MAX_LEVEL, NEONS, NEON_PRICE, PAINTS, PAINT_PRICE, UP_KEYS, UP_PRICES, emptyBody, emptyCar, fineFor, resprayCost, type BodyProgress, type CarProgress } from './upgrades';
import type { Blip, GarageModel, Hud } from './hud';
import type { Input } from './input';
import { bi, t, tf } from './i18n';
import { Humans, Role, type HumanCtx, type HumanHooks } from './humans';
import { St } from './combat';
import { Popups, SlashTrail } from './effects';
import type { Props } from './props';
import { CIVILIAN_COLORS, CIVILIAN_KINDS, PLAYER_ROSTER, STATS, VehicleFactory, type VehicleKind } from './vehicle';
import { GameVehicle, type AIMode, type VehicleEvents } from './vehicles';
import type { Vfx } from './vfx';
import type { CircleCollider, World } from './world';

/** Three save slots. Slot 1 uses the original key, so saves from before slots existed are slot 1. */
export const SLOT_KEY = 'smashtown.slot';
export function currentSlot(): number {
  try { const n = Number(localStorage.getItem(SLOT_KEY)); return n === 2 || n === 3 ? n : 1; } catch { return 1; }
}
export const slotSaveKey = (slot: number): string => (slot === 1 ? 'smashtown.save.v1' : `smashtown.save.v1.s${slot}`);
export const SAVE_KEY = slotSaveKey(currentSlot());
interface SaveData { cash: number; unlocked: VehicleKind[]; selected: VehicleKind; story?: StorySave; collected?: number[]; cars?: Record<string, CarProgress>; body?: BodyProgress; guns?: GunId[]; ammo?: Partial<Record<GunId, number>>; gunUp?: Partial<Record<GunId, [number, number]>>; outfit?: number; bank?: number; homes?: number[]; raceBest?: number[]; login?: { day: string; streak: number }; progress?: ProgressSave }
export type EarnSrc = 'props' | 'stars' | 'gigs' | 'story' | 'police' | 'other';

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

interface Roadblock {
  x: number; z: number; mesh: THREE.Mesh; box: { minX: number; maxX: number; minZ: number; maxZ: number }; cars: GameVehicle[];
  /** Spike strip laid ahead of the barricade (4+ stars). */
  strip?: { mesh: THREE.Mesh; x: number; z: number; dx: number; dz: number; half: number; used: boolean };
}

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
  readonly story: StoryManager;
  readonly pickups: Pickups;
  readonly guns: Guns;
  readonly interiors: Interiors;
  readonly roofDash: RoofDash;
  readonly policeFire: PoliceFire;
  readonly range: RangeGig;
  readonly shops: Shops;
  readonly medics: Medics;
  machines!: Machines;
  lights!: TrafficLights;
  news!: News;
  taxi!: TaxiJob;
  race!: StreetRace;
  delivery!: DeliveryJob;
  animals!: Animals;
  festival!: Festival;
  transit!: Transit;
  fishing!: Fishing;
  /** A storm has cut the power: windows, signs and street lamps go dark for a while. */
  blackout = false;
  readonly sideQuests: SideQuests;
  readonly progress: Progress;
  readonly mood: Mood;
  /** The shop the player is inside (null on the street). While inside, the city is frozen and unseen. */
  inside: Room | null = null;
  ret = { x: 0, z: 0, h: 0 };
  fading = false;
  /** Ladders and rooftops (see climb.ts). */
  private climber!: Climber;
  street!: StreetLife;
  /** Everything that happens in the city is announced here (see events.ts). */
  readonly bus = new EventBus();
  crime!: Crime;
  /** Garages and houses: where you can hide (see hideouts.ts). */
  readonly hideouts: Hideouts = new Hideouts(this);
  /** How many outfits there are. */
  get outfitCount(): number { return Game.OUTFITS.length; }
  private get climb(): Climber['state'] { return this.climber.state; }
  readonly heli = new Helicopter();
  private heliTimer = 0;
  /** Road route to the story goal (refreshed a few times a second) and the goal itself. */
  route: Route | null = null;
  goal: { x: number; z: number; label: string; prop?: boolean } | null = null;
  nav = new Navigator();
  private routeT = 0;
  readonly collectibles: Collectibles;
  smashTotal = 0;

  vehicles: GameVehicle[] = [];
  driving: GameVehicle | null = null;
  onFoot = false;
  state: 'play' | 'garage' | 'busted' | 'wrecked' | 'wasted' | 'dialog' = 'play';
  damageTotal = 0;
  hitStop = 0;
  trafficTarget = 14;
  useBlob = false;

  private rng = makeRng(99);
  save: SaveData;
  private saveDirty = false;
  private saveTimer = 0;
  cash = 0;

  // wanted
  private heat = 0;
  /** Seconds since the last crime: the police do not give up while it is fresh. */
  crimeT = 0;
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
  garageLock = false;
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
    this.applyBody();

    this.collectibles = new Collectibles(d.world.landmarks.collectibles, this.save.collected ?? []);
    this.scene.add(this.collectibles.group);
    this.hud.setCollectibles(this.collectibles.count, this.collectibles.total);
    this.story = new StoryManager(this, this.scene, this.save.story);
    this.pickups = new Pickups(d.world, makeRng(2024));
    this.scene.add(this.pickups.group);
    this.guns = new Guns(this, this.save.guns ?? [], this.save.ammo ?? {}, this.save.gunUp ?? {});
    this.scene.add(this.guns.group);
    this.heli.attach(this.scene);
    this.interiors = new Interiors(d.world, this.scene);
    this.machines = new Machines(this);
    this.news = new News(this);
    this.taxi = new TaxiJob(this);
    this.race = new StreetRace(this);
    this.delivery = new DeliveryJob(this);
    this.animals = new Animals(this);
    this.festival = new Festival(this);
    this.transit = new Transit(this);
    this.fishing = new Fishing(this);
    this.lights = new TrafficLights();
    this.scene.add(this.lights.group);
    {
      const gr = this.interiors.rooms.find((r) => r.id === 'garage');
      if (gr) gr.doors = this.world.garages.map((g) => g.door ?? { x: g.x, z: g.z, h: 0 });
      this.hideouts.refreshHomeDoors();
    }
    this.roofDash = new RoofDash(this);
    this.policeFire = new PoliceFire(this);
    this.range = new RangeGig(this);
    this.shops = new Shops(this);
    this.climber = new Climber(this);
    this.street = new StreetLife(this);
    this.crime = new Crime(this);
    this.medics = new Medics(this);
    this.sideQuests = new SideQuests(this);
    this.progress = new Progress(this.save.progress, (m) => this.hud.toast(m, 3600), (n) => { this.cash += n; this.hud.setCash(this.cash); this.saveDirty = true; this.audio.cash(); }, () => { this.saveDirty = true; });
    this.mood = new Mood(this);
    this.applyOutfit(this.save.outfit ?? 0);
    this.humans.guns = this.guns.flags();

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
    const fallback: SaveData = { cash: 2000, unlocked: ['sports', 'sedan'], selected: 'sports' };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const s = JSON.parse(raw) as Partial<SaveData>;
      const unlocked = (s.unlocked ?? []).filter((k): k is VehicleKind => PLAYER_ROSTER.includes(k as VehicleKind));
      for (const k of fallback.unlocked) if (!unlocked.includes(k)) unlocked.push(k);
      const selected = s.selected && unlocked.includes(s.selected) ? s.selected : 'sports';
      const st = s.story;
      const story = st && Number.isFinite(st.ch) && Number.isFinite(st.step) && Number.isFinite(st.prog) ? { ch: st.ch, step: st.step, prog: st.prog } : undefined;
      const collected = Array.isArray(s.collected) ? s.collected.filter((n): n is number => Number.isInteger(n)) : [];
      const cars: Record<string, CarProgress> = {};
      for (const k of PLAYER_ROSTER) {
        const c = s.cars?.[k];
        if (!c) continue;
        const up = Array.isArray(c.up) ? UP_KEYS.map((_, i) => Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(c.up[i]) || 0)))) : [0, 0, 0, 0];
        cars[k] = { up, paint: PAINTS.includes(c.paint) ? c.paint : 0, neon: NEONS.includes(c.neon) ? c.neon : 0 };
      }
      const b = s.body;
      const lv = (n: unknown) => Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(n) || 0)));
      const body = b ? { health: lv(b.health), power: lv(b.power), speed: lv(b.speed) } : emptyBody();
      const guns = Array.isArray(s.guns) ? s.guns.filter((g): g is GunId => GUN_ORDER.includes(g as GunId)) : [];
      const ammo: Partial<Record<GunId, number>> = {};
      for (const g of GUN_ORDER) { const n = Number(s.ammo?.[g]); if (Number.isFinite(n) && n > 0) ammo[g] = Math.floor(n); }
      const gunUp: Partial<Record<GunId, [number, number]>> = {};
      for (const g of GUN_ORDER) { const u = s.gunUp?.[g]; if (Array.isArray(u)) gunUp[g] = [Number(u[0]) || 0, Number(u[1]) || 0]; }
      const outfit = Number.isInteger(s.outfit) ? Number(s.outfit) : 0;
      const bank = typeof s.bank === 'number' && s.bank > 0 ? Math.floor(s.bank) : 0;
      const homes = Array.isArray(s.homes) ? s.homes.filter((n: unknown) => Number.isInteger(n)) as number[] : [];
      const raceBest = Array.isArray(s.raceBest) ? s.raceBest.map((n: unknown) => (typeof n === 'number' && n > 0 ? n : 0)) : [];
      const login = s.login && typeof s.login.day === 'string' ? { day: s.login.day, streak: Number(s.login.streak) || 1 } : undefined;
      return { cash: typeof s.cash === 'number' ? s.cash : fallback.cash, unlocked, selected, story, collected, cars, body, guns, ammo, gunUp, outfit, bank, homes, raceBest, login, progress: s.progress };
    } catch {
      return fallback;
    }
  }
  /** Set while the save is being erased so nothing rewrites it before the reload. */
  noSave = false;
  flushSave(): void {
    if (this.noSave) return;
    this.save.cash = Math.round(this.cash);
    this.save.collected = this.collectibles.indices();
    this.save.progress = this.progress.toSave();
    this.save.outfit = this.save.outfit ?? 0;
    this.save.guns = [...this.guns.owned];
    this.save.ammo = { ...this.guns.reserve };
    this.save.gunUp = { ...this.guns.up };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
    this.saveDirty = false;
  }

  // ------------------------------------------------------------------ accessors
  get focusX(): number { if (this.inside) return this.ret.x; return this.onFoot || !this.driving ? this.humans.player.x : this.driving.x; }
  get focusZ(): number { if (this.inside) return this.ret.z; return this.onFoot || !this.driving ? this.humans.player.z : this.driving.z; }
  get followable(): Followable { return this.onFoot || !this.driving ? this.foot : this.driving.ctrl; }
  get cashAmount(): number { return this.cash; }

  /** Money earned this session, by source (shown on the pause screen). */
  readonly earned: Record<EarnSrc, number> = { props: 0, stars: 0, gigs: 0, story: 0, police: 0, other: 0 };

  addCash(n: number, src: EarnSrc = 'other'): void {
    if (n > 0) { this.earned[src] += n; this.progress?.add('earned', n); }
    this.cash += n;
    this.saveDirty = true;
    this.hud.setCash(this.cash);
    if (n >= 100) this.audio.cash();
  }

  /** Called by the story when its position changes. */
  saveStory(s: StorySave): void {
    this.save.story = s;
    this.saveDirty = true;
  }

  unlockVehicle(kind: VehicleKind): void {
    if (!this.save.unlocked.includes(kind)) { this.save.unlocked.push(kind); this.saveDirty = true; }
  }

  /** Opens / closes a story conversation: the player stops and input is ignored until it ends. */
  setDialogOpen(open: boolean): void {
    if (open && this.state === 'play') {
      this.state = 'dialog';
      if (this.driving) { this.driving.ctrl.vx = this.driving.ctrl.vz = 0; }
    } else if (!open && this.state === 'dialog') this.state = 'play';
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

  removeVehicle(v: GameVehicle): void {
    v.remove();
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  private spawnPlayer(kind: VehicleKind, x: number, z: number, heading: number): GameVehicle {
    const v = this.spawnVehicle(kind, this.paintOf(kind), x, z, heading, 'player', true);
    v.owned = true;
    this.applyLook(v);
    this.driving = v;
    this.onFoot = false;
    this.humans.setPlayerActive(false, 0, 0, 0);
    return v;
  }

  private spawnTraffic(initial: boolean): void {
    const px = this.focusX || 0, pz = this.focusZ || 0;
    const p = TrafficBrain.randomPlacement(this.rng, px, pz, initial ? 25 : 90);
    const kind = CIVILIAN_KINDS[Math.floor(this.rng() * CIVILIAN_KINDS.length)];
    const color = kind === 'taxi' ? 0xffc400 : kind === 'bus' ? 0x2f78d6 : CIVILIAN_COLORS[Math.floor(this.rng() * CIVILIAN_COLORS.length)];
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
  nearPlayer(x: number, z: number, r: number): boolean {
    return Math.hypot(x - this.focusX, z - this.focusZ) < r;
  }

  private onImpact(v: GameVehicle, s: number): void {
    const c = v.ctrl;
    this.vfx.emitSparks(c.position.x, 0.8, c.position.z, Math.min(10, 2 + s * 0.4));
    if (v === this.driving) {
      this.input.rumble(Math.min(1, s / 18), 0.5, 140);
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
    this.smashTotal++;
    this.progress.add('smashes');
    this.input.rumble(0.3, 0.7, 90);
    this.story.onSmash();
    this.damageTotal += value;
    this.comboCount++;
    this.comboTimer = 4;
    const mult = Math.min(10, 1 + Math.floor(this.comboCount / 2));
    const pay = Math.round(value * 0.1 * mult);
    this.addCash(pay, 'props');
    this.popups.spawn(c.x, 1.8, c.z, `+$${pay}`, '#3dff8a');
    this.addHeat(3);
    this.audio.smash();
    this.cameraRig.shake(Math.min(0.5, speed / 70));
  }

  // ------------------------------------------------------------------ wanted
  addHeat(n: number): void {
    if (n > 0) this.crimeT = 0;
    this.heat = Math.min(400, Math.max(this.heat + n, this.minHeat));
    const prev = this.stars;
    let s = 0;
    for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) s = i + 1;
    if (s > prev) {
      if (prev === 0) this.policeSpawnTimer = Math.max(this.policeSpawnTimer, 3); // first cruiser arrives after a short delay
      this.stars = s;
      this.hud.toast(tf('ui.toast.wanted', { n: s }), 1600);
      this.bus.emit({ type: 'wantedRaised', stars: s });
    }
    this.hud.setWanted(this.stars);
  }

  /** Cool the heat (`amount` off, then multiplied by `factor`) and drop any star it no longer earns. Returns true when that cleared the wanted level. */
  coolHeat(amount: number, factor = 1): boolean {
    if (this.heat <= this.minHeat) return false;
    this.heat = Math.max(this.minHeat, this.heat * factor - amount);
    let st = 0;
    for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) st = i + 1;
    if (st < this.stars) {
      this.stars = st;
      this.hud.setWanted(st);
      if (st === 0) { this.clearWanted(); return true; }
    }
    return false;
  }

  clearWanted(): void {
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
        v.despawnT = 6 + this.rng() * 6; // they drive off and are removed once out of sight, so police never pile up in the traffic
      }
    }
    for (const rb of [...this.roadblocks]) this.removeRoadblock(rb);
  }

  policeVehicles(): GameVehicle[] {
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

  /** A bounty hunter: a black muscle car that joins a chase at four stars. Wreck it for a $1,500 bounty. */
  hunter: GameVehicle | null = null;
  private hunterTimer = 20;
  private spawnHunter(): void {
    const px = this.focusX, pz = this.focusZ;
    let p = TrafficBrain.randomPlacement(this.rng, px, pz, 90);
    for (let i = 0; i < 8 && Math.hypot(p.x - px, p.z - pz) > 200; i++) p = TrafficBrain.randomPlacement(this.rng, px, pz, 90);
    const v = this.spawnVehicle('muscle', 0x0d0d12, p.x, p.z, Math.atan2(px - p.x, pz - p.z), 'police');
    v.police = new PoliceBrain('interceptor', this.rng);
    v.ctrl.stats = { ...v.ctrl.stats, maxSpeed: v.ctrl.stats.maxSpeed * 0.97 };
    this.hunter = v;
    this.hud.toast(bi('A bounty hunter is after you!', '현상금 사냥꾼이 쫓아와요!'), 2600);
    this.bus.emit({ type: 'hunterSpawned' });
  }

  private managePolice(dt: number): void {
    if (this.stars === 0) { this.hunterTimer = Math.max(this.hunterTimer, 15); return; }
    if (this.hunter && (!this.vehicles.includes(this.hunter) || this.hunter.ctrl.wrecked || this.hunter.ai !== 'police')) this.hunter = null;
    if (this.stars >= 4 && !this.hunter) { this.hunterTimer -= dt; if (this.hunterTimer <= 0) { this.hunterTimer = 90; this.spawnHunter(); } }
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
    this.checkSpikes();
    for (const rb of [...this.roadblocks]) {
      if (Math.hypot(rb.x - this.focusX, rb.z - this.focusZ) > 210) this.removeRoadblock(rb);
    }
  }

  /** The player's car shredding its tyres on a spike strip. */
  private checkSpikes(): void {
    const d = this.driving;
    if (!d || this.onFoot) return;
    for (const rb of this.roadblocks) {
      const s = rb.strip;
      if (!s || s.used) continue;
      const rx = d.x - s.x, rz = d.z - s.z;
      const along = rx * s.dx + rz * s.dz;
      const cross = -rx * s.dz + rz * s.dx;
      if (Math.abs(along) < 1.8 && Math.abs(cross) < s.half) {
        s.used = true;
        s.mesh.visible = false;
        if (d.popTire()) {
          this.hud.toast(bi('Spike strip! Tires shredded - repair at a garage', '스파이크! 타이어 파손 - 차고에서 수리하세요'), 3200);
          this.vfx.emitSparks(d.x, 0.3, d.z, 16);
          this.audio.crash(14);
          this.input.rumble(0.8, 0.5, 200);
        }
      }
    }
  }

  // ------------------------------------------------------------------ shops (hidden-pocket interiors)
  static OUTFITS: [number, number][] = [[0xd93636, 0x2a4a8a], [0x2fb87a, 0x23262f], [0xf2a73b, 0x3b3b52], [0x8a5cd6, 0x1a1a24], [0x3b82f6, 0xe8e8ee], [0xf4a7b9, 0x445566], [0x111111, 0x111111], [0xffffff, 0x33415c]];
  applyOutfit(i: number): void {
    const o = Game.OUTFITS[((i % Game.OUTFITS.length) + Game.OUTFITS.length) % Game.OUTFITS.length];
    const pl = this.humans.player;
    pl.look = { ...pl.look, shirt: o[0], pants: o[1] };
    this.humans.renderer.setLook(pl.slot, pl.look);
  }

  private fadeThen(cb: () => void): void {
    if (this.fading) return;
    this.fading = true;
    this.hud.fade(() => { cb(); this.fading = false; });
  }

  enterBuilding(room: Room): void {
    if (this.fading || this.state !== 'play') return;
    if (this.stars > 0 && !((room.id === 'garage' || room.id === 'home') && this.hideouts.canHide())) { this.hud.toast(room.id === 'garage' || room.id === 'home' ? bi('The police are too close to hide!', '경찰이 너무 가까워서 숨을 수 없어요!') : bi('The door is locked - the police are watching!', '문이 잠겨 있어요 - 경찰이 지켜보고 있어요!'), 2400); return; }
    const pl = this.humans.player;
    this.ret = { x: pl.x, z: pl.z, h: pl.heading };
    this.progress.add('shops');
    this.fadeThen(() => {
      this.inside = room;
      if (room.id === 'garage') this.hideouts.parkCarInBay(room);
      this.humans.setPlayerActive(true, room.exit.x, room.exit.z - 2.2, Math.PI);
      this.cameraRig.ignore = null;
      this.syncFoot();
      this.cameraRig.snap();
      this.hud.toast(`${bi(room.en, room.ko)}`, 1800);
    });
  }

  private leaveBuilding(): void {
    this.fadeThen(() => {
      const r = this.ret;
      if (this.inside?.id === 'garage') this.hideouts.returnCarToStreet();
      this.inside = null;
      document.body.classList.remove('can-rob');
      this.humans.setPlayerActive(true, r.x, r.z, r.h);
      this.syncFoot();
      this.cameraRig.snap();
    });
  }

  /** Inside a shop only you move: the street is frozen far away. */
  /** The camera follows this proxy: keep it on the player (inside a shop the street update that normally does it does not run). */
  private syncFoot(): void {
    const pl = this.humans.player, f = this.foot;
    f.position.set(pl.x, pl.y - 0.1, pl.z);
    f.heading = pl.heading; f.forwardSpeed = pl.speed; f.speed = pl.speed; f.sprinting = pl.speed > 6.2;
  }

  private updateInside(dt: number): void {
    const room = this.inside!;
    const input = this.input;
    const pl = this.humans.player;
    const look = input.takeLook();
    this.cameraRig.applyLook(look.x, look.y);
    const playing = this.state === 'play' && !this.fading;
    this.humans.update(dt, {
      input: playing ? input : this.idleInput, camYaw: this.cameraRig.moveYaw, vehicles: [], wantCops: 0, wantRiot: 0, playerActive: true,
      playerCarX: pl.x, playerCarZ: pl.z, playerCarSpeed: 0, policeCars: [], time: this.time,
    });
    this.syncFoot();
    this.hideouts.spin(dt);
    this.popups.update(dt);
    this.slash.update(dt);
    this.guns.tick(dt);
    this.interiors.update(dt);
    if ((room.id === 'garage' || room.id === 'home') && this.stars > 0) this.hideouts.hideDecay(dt);
    if (room.id === 'bank') this.shops.updateHeist(dt, room);
    if (playing && (input.wasPressed('KeyF') || input.wasPressed('KeyE'))) {
      if (Math.hypot(pl.x - room.exit.x, pl.z - room.exit.z) < 2.4) this.leaveBuilding();
      else if (room.id === 'bank' && this.shops.vaultNear(room)) this.shops.startHeist();
      else if (room.id === 'home' && this.shops.wardrobeNear(room)) this.hideouts.wardrobe();
      else if (this.shops.deskNear(room)) this.shops.deskAction(room);
      else if (Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4) this.shops.action(room);
    }
    if (playing && input.wasPressed('KeyG') && Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4) this.shops.rob(room);
    if (playing && room.id === 'arcade' && input.wasPressed('KeyH')) this.shops.startBowling();
    this.shops.updateBowling(dt, room);
    this.input.gunOut = false; this.cameraRig.aimMode = 0; this.guns.aimPoint = null; this.hud.setCrosshair(false); this.hud.setLockOn(false); this.hud.setGunOut(false);
    this.hud.setPrompt(this.state === 'play' ? this.shops.prompt(room) : null);
    document.body.classList.toggle('can-rob', this.shops.canRob(room) && Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4);
    this.progress.tick(dt);
    this.updateLights();
    this.hud.update(this.followable, 1, 1, false, [], dt);
    this.hud.setNav(null, ''); this.hud.setRoute(null);
    this.hud.setFootMode(true, pl.weapon, this.humans.ownedFlags());
    this.hud.setAmmo(this.guns.hudText());
    this.hud.setReloadButton(false);
    this.hud.setPlayerHp(Math.max(0, pl.hp / pl.maxHp));
    this.hud.setPlayerArmor(this.humans.armor / 50);
    this.hud.setWantedBanner(false);
    if (this.saveDirty) { this.saveTimer -= dt; if (this.saveTimer <= 0) { this.flushSave(); this.saveTimer = 3; } }
  }

  /** The police helicopter was hit by a rocket. */
  heliDown(): void {
    const h = this.heli;
    if (!h.active) return;
    this.vfx.emitFire(h.x, h.y, h.z, 30, 2);
    this.vfx.emitSparks(h.x, h.y, h.z, 24);
    this.vfx.emitDebris(h.x, h.y, h.z, 0, 0, 0x1d2a44, 14);
    this.audio.explosion();
    this.cameraRig.shake(0.7);
    this.addCash(1500, 'police');
    this.popups.spawn(h.x, h.y, h.z, bi('HELICOPTER DOWN +$1,500', '헬기 격추 +$1,500'), '#ffd23a');
    this.addHeat(10);
    h.remove();
    h.cooldown = 45;
  }

  private updateHeli(dt: number): void {
    const h = this.heli;
    if (this.stars >= 5 && this.state === 'play') {
      if (!h.active && h.cooldown <= 0) { this.heliTimer += dt; if (this.heliTimer > 5) { this.heliTimer = 0; h.spawn(this.focusX, this.focusZ); this.hud.toast(bi('Police helicopter inbound!', '경찰 헬기 접근 중!'), 2400); } }
    } else {
      this.heliTimer = 0;
      if (h.active) h.remove();
    }
    h.update(dt, this.focusX, this.focusZ, this.time);
    // the searchlight keeps you "seen": you cannot lose the cops while it is on you
    if (h.active && h.distTo(this.focusX, this.focusZ) < 80) this.unseen = 0;
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
    const rb: Roadblock = { x, z, mesh, box, cars };
    if (this.stars >= 4) {
      // a spike strip across the road on the approach side
      const sd = approach * Math.min(32, seg.len * 0.42);
      const sx = x + dx * sd, sz = z + dz * sd;
      const half = hw - 0.6;
      const sb = new MeshBuilder();
      const alongX = dx !== 0;
      sb.box(alongX ? 0.6 : half * 2, 0.07, alongX ? half * 2 : 0.6, sx, 0.04, sz, 0x2a2a30);
      for (let k = 0; k < 14; k++) {
        const o = -half + (k + 0.5) * (half * 2 / 14);
        sb.box(alongX ? 0.12 : 0.12, 0.16, 0.12, alongX ? sx : sx + o, 0.12, alongX ? sz + o : sz, 0xdadde6);
      }
      const smesh = new THREE.Mesh(sb.build(), paletteMaterial());
      this.scene.add(smesh);
      rb.strip = { mesh: smesh, x: sx, z: sz, dx, dz, half, used: false };
    }
    this.roadblocks.push(rb);
  }

  private removeRoadblock(rb: Roadblock): void {
    if (rb.strip) { rb.strip.mesh.removeFromParent(); rb.strip.mesh.geometry.dispose(); }
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
      if (!v.owned && v.ai === 'parked' && !v.isPolice && !hadDriver && Math.random() < 0.3) this.bus.emit({ type: 'carAlarm', vehicle: v });
      v.ai = 'player';
      v.ensureFull();
      this.driving = v;
      this.onFoot = false;
      this.humans.setPlayerActive(false, 0, 0, 0);
      this.cameraRig.snap();
      this.audio.thump();
    }
  }
  lastDriven: GameVehicle | null = null;

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
    this.garageLock = true; // you roll out of the garage: do not walk straight back in
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
  private carProg(k: VehicleKind): CarProgress {
    this.save.cars ??= {};
    return (this.save.cars[k] ??= emptyCar());
  }
  private paintOf(k: VehicleKind): number { return this.save.cars?.[k]?.paint || STATS[k].color; }
  private applyLook(v: GameVehicle): void {
    const p = this.carProg(v.kind);
    v.ctrl.setUpgrades(p.up);
    v.setNeon(p.neon);
    v.setMods(p.up.reduce((a, b) => a + b, 0));
  }
  private applyBody(): void {
    const b = (this.save.body ??= emptyBody());
    this.humans.setBody(b.health, b.power, b.speed);
  }
  /** Re-skin the car the player is driving after a paint change. */
  private repaintCurrent(): void {
    const old = this.driving;
    if (!old) return;
    const hp = old.ctrl.hp, nitro = old.ctrl.nitro;
    const nv = this.spawnVehicle(old.kind, this.paintOf(old.kind), old.x, old.z, old.ctrl.heading, 'player', true);
    nv.owned = true; nv.ctrl.hp = hp; nv.ctrl.nitro = nitro;
    nv.ctrl.vx = old.ctrl.vx; nv.ctrl.vz = old.ctrl.vz;
    this.applyLook(nv);
    this.removeVehicle(old);
    this.driving = nv;
    this.cameraRig.snap();
  }

  private garageModel(): GarageModel {
    const d = this.driving;
    const k = this.save.selected;
    const cp = this.carProg(k);
    let copNear = false;
    for (const v of this.policeVehicles()) if (Math.hypot(v.x - this.focusX, v.z - this.focusZ) < 30) { copNear = true; break; }
    return {
      cash: this.cash,
      repairCost: 100 + Math.round((1 - (d?.ctrl.hp ?? 1)) * 400),
      respray: { cost: resprayCost(this.stars), state: this.stars === 0 ? 'none' : copNear ? 'police' : 'ok' },
      unlocked: new Set(this.save.unlocked),
      selected: k,
      car: cp,
      body: this.save.body ?? emptyBody(),
      arms: { owned: [...this.guns.owned], reserve: { ...this.guns.reserve }, up: { ...this.guns.up } },
    };
  }

  pay(price: number): boolean {
    if (this.cash < price) { this.hud.toast(t('ui.toast.notenough')); return false; }
    this.cash -= price;
    this.saveDirty = true;
    this.hud.setCash(this.cash);
    this.audio.cash();
    return true;
  }

  openGarage(mode: 'garage' | 'arms' = 'garage'): void {
    this.state = 'garage';
    // inside the garage building the menu slides to the side so you can watch the car change
    document.getElementById('garage')?.classList.toggle('in-garage', this.inside?.id === 'garage');
    const d = this.driving;
    if (d && mode === 'garage') d.ctrl.vx = d.ctrl.vz = 0;
    const refresh = () => this.hud.refreshGarage(this.garageModel());
    this.hud.openGarage(this.garageModel(), {
      onRepair: () => {
        const m = this.garageModel();
        if (this.driving!.ctrl.hp >= 0.999 && !this.driving!.flat) { this.hud.toast(bi('Already in perfect shape', '이미 완벽한 상태예요')); return; }
        if (!this.pay(m.repairCost)) return;
        this.driving!.ctrl.hp = 1;
        if (this.driving!.flat) { this.driving!.fixTire(); this.applyLook(this.driving!); }
        this.hud.toast(t('ui.toast.repaired'));
        refresh();
      },
      onRespray: () => {
        const m = this.garageModel();
        if (m.respray.state === 'none') return;
        if (m.respray.state === 'police') { this.hud.toast(bi('Police are too close - lose them first!', '경찰이 너무 가까워요 - 먼저 따돌리세요!')); return; }
        if (!this.pay(m.respray.cost)) return;
        this.clearWanted();
        this.hud.toast(bi('Fresh paint - heat cleared!', '새 도색 - 수배 해제!'));
        refresh();
      },
      onBuy: (k) => {
        if (!this.pay(STATS[k].price)) return;
        this.save.unlocked.push(k);
        this.hud.toast(t('ui.toast.unlocked'));
        this.selectVehicle(k);
        refresh();
      },
      onSelect: (k) => { this.selectVehicle(k); refresh(); },
      onUpgrade: (i) => {
        const cp = this.carProg(this.save.selected);
        const lv = cp.up[i];
        if (lv >= MAX_LEVEL || !this.pay(UP_PRICES[UP_KEYS[i]][lv])) return;
        cp.up[i] = lv + 1;
        if (this.driving) this.applyLook(this.driving);
        refresh();
      },
      onPaint: (color) => {
        const cp = this.carProg(this.save.selected);
        if (cp.paint === color) return;
        if (color !== 0 && !this.pay(PAINT_PRICE)) return;
        cp.paint = color;
        this.repaintCurrent();
        refresh();
      },
      onNeon: (color) => {
        const cp = this.carProg(this.save.selected);
        if (cp.neon === color) return;
        if (color !== 0 && !this.pay(NEON_PRICE)) return;
        cp.neon = color;
        this.driving?.setNeon(color);
        refresh();
      },
      onBody: (i) => {
        const key = BODY_KEYS[i];
        const b = (this.save.body ??= emptyBody());
        const lv = b[key];
        if (lv >= MAX_LEVEL || !this.pay(BODY_PRICES[key][lv])) return;
        b[key] = lv + 1;
        this.applyBody();
        refresh();
      },
      onBuyGun: (id) => {
        if (this.guns.has(id) || !this.pay(GUNS[id].price)) return;
        this.guns.buyGun(id);
        this.humans.guns = this.guns.flags();
        this.hud.toast(bi('New weapon! Press its number key on foot.', '새 무기! 도보에서 숫자 키로 선택하세요.'));
        refresh();
      },
      onGunUp: (id, which) => {
        const lv = this.guns.up[id][which];
        const tier = GUN_UP_TIER[id];
        if (!this.guns.has(id) || lv >= 3 || tier === 0 || (which === 1 && (id === 'rocket' || id === 'grenade'))) return;
        if (!this.pay(Math.round(GUN_UP_PRICE[which][lv] * tier))) return;
        this.guns.up[id][which] = lv + 1;
        refresh();
      },
      onBuyAmmo: (id) => {
        const d = GUNS[id];
        if (!this.guns.has(id) || d.infinite) return;
        if (this.guns.reserve[id] >= d.pack * 6) { this.hud.toast(bi('Ammo is full', '탄약이 가득 찼어요')); return; }
        if (!this.pay(d.packPrice)) return;
        this.guns.addAmmo(id, d.pack);
        refresh();
      },
      onClose: () => this.closeGarage(),
    }, mode === 'arms' ? ['arms'] : undefined);
  }

  closeGarage(): void {
    if (this.state !== 'garage') return;
    this.hud.closeGarage();
    document.getElementById('garage')?.classList.remove('in-garage');
    this.hideouts.menuClosed();
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
    const nv = this.spawnVehicle(k, this.paintOf(k), old.x, old.z, old.ctrl.heading, 'player', true);
    nv.owned = true;
    this.applyLook(nv);
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
    input.mode = this.onFoot ? 'foot' : 'car';

    if (input.wasPressed('Escape') && this.state === 'garage') this.closeGarage();
    if (this.state === 'dialog' && (input.wasPressed('KeyF') || input.wasPressed('Enter') || input.wasPressed('Space'))) this.story.advanceDialog();

    if (this.inside) { this.updateInside(dt); return; }

    if (this.state === 'play') {
      if (input.wasPressed('KeyF') || input.wasPressed('KeyE')) {
        const lo = this.climber.option();
        const door = this.onFoot && !this.climb ? this.interiors.roomAt(this.humans.player.x, this.humans.player.z, 2.6) : null;
        const mach = this.onFoot && !lo && !door ? this.machines.nearest(this.humans.player.x, this.humans.player.z) : null;
        const home = this.onFoot && !lo && !door && !mach && !this.humans.player.roof ? this.hideouts.homeNear() : -1;
        const stop = this.onFoot && !lo && !door && !mach && home < 0 && !this.humans.player.roof ? this.transit.near() : -1;
        if (home >= 0) { if (this.hideouts.ownsHome(home)) this.enterBuilding(this.interiors.rooms.find((r) => r.id === 'home')!); else this.hideouts.buyHome(home); }
        else if (stop >= 0) this.transit.ride(stop);
        else if (this.onFoot && !lo && !door && !mach && !this.humans.player.roof && (this.fishing.active || this.fishing.atWater()) && this.fishing.press()) { /* fishing */ }
        else if (lo) this.climber.start(lo);
        else if (door && !this.humans.player.roof) this.enterBuilding(door);
        else if (mach) this.machines.use(mach);
        else this.enterExit();
      }
      if (input.wasPressed('KeyR')) { if (this.onFoot) this.guns.reload(); else this.resetCar(); }
    }

    // ---- player control
    const playing = this.state === 'play';
    const look = input.takeLook();
    // Aiming has two switches. AIM (right mouse, X, left trigger, the AIM button) puts the crosshair in the middle of the screen, tightens
    // the camera over the shoulder and keeps the body facing where the camera points. AUTO (B, D-pad down, the AUTO button) locks on to the
    // closest hostile in range, behind you too. With both off you walk and run normally. Sprinting lowers the gun.
    const pl0 = this.humans.player;
    const gun = this.onFoot && !this.inside && !this.climb && this.state === 'play' ? this.guns.current() : null;
    input.gunOut = this.onFoot && !!this.guns.current();
    if (gun) {
      if (input.wasPressed('KeyX') || input.wasPressed('AimToggle')) { this.aimOn = !this.aimOn; this.hud.toast(this.aimOn ? bi('Aim on', '조준 켜짐') : bi('Aim off', '조준 꺼짐'), 900); }
      if (input.wasPressed('KeyB') || input.wasPressed('AutoToggle')) this.setAutoAim(!this.autoAim, true);
    }
    const lowered = input.nitro || pl0.hp <= 0;
    const manual = !!gun && this.aimOn && !lowered;
    const auto = !!gun && this.autoAim && !manual && !lowered;
    this.cameraRig.aimMode = manual ? 1 : 0;
    if (this.onFoot) this.cameraRig.applyLook(look.x * (manual ? settings.aimSens : 1), look.y * (manual ? settings.aimSens : 1));
    if (manual) { pl0.aimT = Math.max(pl0.aimT, 0.3); pl0.aimYaw = this.cameraRig.moveYaw; }
    else if (gun && input.nitro) pl0.aimT = 0;
    this.updateCrosshair(gun, manual, auto);
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
    // bikes show the player only while the player is riding them
    {
      const look = this.humans.player.look;
      for (const v of this.vehicles) if (v.isBike) v.setRider(v === this.driving && !this.onFoot, look.pants, look.shirt, look.skin);
    }
    this.medics.update(dt);
    this.race.drive(dt);
    this.lights.update(dt);
    this.animals.update(dt);
    this.news.update(dt);
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
    this.updateHeli(dt);
    this.updateCombo(dt);
    this.updateGarageZones();
    this.gigs.update(dt);
    if (this.state === 'play') { this.roofDash.update(dt); this.sideQuests.update(dt); this.mood.update(dt); this.progress.tick(dt); this.range.update(dt); this.shops.tickBank(dt); this.taxi.update(dt); this.race.update(dt); this.delivery.update(dt); this.festival.update(dt); this.fishing.update(dt); }
    if (this.driving && !this.onFoot) this.progress.add('driveM', Math.abs(this.driving.ctrl.forwardSpeed) * dt);
    this.story.update(dt);
    this.collectibles.update(dt);
    this.collectStars();
    this.updatePickups(dt);
    if (this.state === 'play' && this.onFoot) this.guns.update(dt, this.input.fireHeld, this.input.wasPressed('Attack') || this.input.wasPressed('KeyJ'));
    else if (this.state === 'play' && this.driving && !this.inside && this.driveBy(dt)) { /* firing from the car window */ }
    else this.guns.tick(dt);
    this.updateStateMachine(dt);

    // ---- presentation
    this.updateLights();
    this.updatePrompt();
    this.updateAudio(dt);
    this.buildBlips();
    this.updateGuide(dt);
    const d = this.driving;
    this.hud.update(this.followable, d ? d.ctrl.hp : 1, d ? d.ctrl.nitro : 1, d ? d.ctrl.nitroActive : false, this.blips.slice(0, this.blipCount), dt);
    const pl = this.humans.player;
    this.hud.setStory(this.race.active ? this.race.pillInfo() : this.story.hudInfo());
    this.hud.setStoryProgress(this.story.progressText());
    this.hud.setTelemetryVisible(!!d);
    this.hud.setFootMode(this.onFoot, pl.weapon, this.humans.ownedFlags());
    this.hud.setAmmo(this.onFoot || (this.driving && this.guns.current() && this.guns.current()!.id !== 'rocket' && this.guns.current()!.id !== 'grenade') ? this.guns.hudText() : null, `${this.aimOn ? 'AIM' : ''}${this.aimOn && this.autoAim ? ' \u00B7 ' : ''}${this.autoAim ? 'AUTO' : ''}`);
    this.hud.setReloadButton(this.onFoot && this.guns.needsReload());
    this.hud.setPlayerHp(Math.max(0, pl.hp / pl.maxHp));
    this.hud.setWantedBanner(this.stars > 0);

    if (this.saveDirty) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) { this.flushSave(); this.saveTimer = 3; }
    }
  }

  /** Story guidance: road route to the goal, the guide arrow and its distance. */
  private updateGuide(dt: number): void {
    const o = this.race.active ? this.race.guideGoal() : this.story.objective();
    this.goal = o;
    if (!o) { this.route = null; this.hud.setNav(null, ''); this.hud.setRoute(null); return; }
    const fx = this.focusX, fz = this.focusZ;
    const straight = Math.hypot(o.x - fx, o.z - fz);
    this.routeT -= dt;
    const moved = this.route ? Math.hypot(this.route.pts[this.route.pts.length - 1].x - o.x, this.route.pts[this.route.pts.length - 1].z - o.z) > 4 : true;
    if (this.routeT <= 0 || moved) { this.routeT = 0.6; this.route = this.nav.route(fx, fz, o.x, o.z); }
    else this.route!.pts[0] = { x: fx, z: fz };
    if (straight < 14 && !o.prop) { this.hud.setNav(null, t('ui.nav.here')); this.hud.setRoute(null); return; }
    const pts = this.route!.pts;
    // aim along the road: the first waypoint that is far enough ahead (or straight at the goal when it is close)
    let tx = o.x, tz = o.z;
    if (straight > 35) {
      for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - fx, pts[k].z - fz) > 22) { tx = pts[k].x; tz = pts[k].z; break; }
    }
    const f = this.camDir;
    this.cameraRig.camera.getWorldDirection(f);
    const dx = tx - fx, dz = tz - fz;
    const along = dx * f.x + dz * f.z, side = dx * -f.z + dz * f.x;
    const m = Math.max(this.route!.len, straight);
    this.hud.setNav(Math.atan2(side, along), `${Math.round(m / 5) * 5} m`);
    this.hud.setRoute(pts);
  }

  /** The crosshair: where it points, how open it is (moving and firing widen it), red over a hostile. */
  private updateCrosshair(gun: GunDef | null, manual: boolean, auto: boolean): void {
    this.hud.setGunOut(this.onFoot && !!this.guns.current());
    this.hud.setAimButtons(this.aimOn, this.autoAim);
    const pl = this.humans.player;
    if (gun && manual) {
      this.guns.updateAim();
      const ap = this.guns.aimPoint!;
      const base: Record<GunId, number> = { pistol: 6, smg: 12, shotgun: 24, rocket: 18, paint: 10, grenade: 20 };
      const gap = base[gun.id] + Math.min(14, pl.speed * 1.8) + pl.recoil * 10;
      const round = gun.id === 'shotgun' || gun.id === 'rocket' || gun.id === 'grenade';
      this.hud.setCrosshair(true, gap, ap.hostile, round, gun.id === 'rocket' && ap.heli, false);
      this.hud.setLockOn(false);
      return;
    }
    if (gun && auto) {
      this.guns.updateAutoAim(Math.min(35, gun.range * 0.7));
      const ap = this.guns.aimPoint;
      if (ap) {
        // turn to the target, even if it is behind you
        pl.aimT = Math.max(pl.aimT, 0.3);
        pl.aimYaw = Math.atan2(ap.x - pl.x, ap.z - pl.z);
        // the crosshair itself moves onto the target (the camera stays put); a target off the screen or behind the camera gets the
        // crosshair on the screen edge with an arrow pointing toward it
        const v = this.autoV.set(ap.x, ap.y, ap.z).project(this.cameraRig.camera);
        if (v.z > 1) { v.x = -v.x; v.y = -v.y; }
        let px = (v.x * 0.5 + 0.5) * window.innerWidth, py = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const W = window.innerWidth, H = window.innerHeight, m = 44;
        const off = v.z > 1 || px < m || px > W - m || py < m || py > H - m;
        let edge: number | null = null;
        if (off) {
          const cx = W / 2, cy = H / 2;
          let dx = px - cx, dy = py - cy;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
          const k = Math.min((W / 2 - m) / (Math.abs(dx) || 1e-6), (H / 2 - m) / (Math.abs(dy) || 1e-6));
          px = cx + dx * k; py = cy + dy * k;
          edge = (Math.atan2(dy, dx) * 180) / Math.PI;
        }
        const base: Record<GunId, number> = { pistol: 6, smg: 12, shotgun: 24, rocket: 18, paint: 10, grenade: 20 };
        const gap = base[gun.id] + Math.min(14, pl.speed * 1.8) + pl.recoil * 10;
        this.hud.setCrosshair(true, gap, true, gun.id === 'shotgun' || gun.id === 'rocket' || gun.id === 'grenade', gun.id === 'rocket' && ap.heli, false, { x: px, y: py, edge });
        this.hud.setLockOn(false);
        return;
      }
    } else this.guns.aimPoint = null;
    this.hud.setCrosshair(false);
    this.hud.setLockOn(false);
  }
  private autoV = new THREE.Vector3();

  /** Auto-aim on or off (remembered between sessions); the settings menu and the B key both use this. */
  setAutoAim(on: boolean, toast: boolean): void {
    this.autoAim = on;
    try { localStorage.setItem('smashtown.autoaim', on ? '1' : '0'); } catch { /* ignore */ }
    if (toast) this.hud.toast(on ? bi('Auto-aim on', '자동 조준 켜짐') : bi('Auto-aim off', '자동 조준 꺼짐'), 900);
    this.onAutoAimChange?.();
  }
  onAutoAimChange: (() => void) | null = null;

  /** Aim switches (see update): manual aim starts off each session, auto-aim is remembered. */
  aimOn = false;
  autoAim = (() => { try { return localStorage.getItem('smashtown.autoaim') === '1'; } catch { return false; } })();

  /**
   * Drive-by: with a pistol, SMG, shotgun or paintball gun out you can fire from the car (left click, or X on a controller). It aims at the
   * closest hostile within 30 m, otherwise straight ahead. Keys 4-9 pick the gun while driving. Returns true when it handled the guns this frame.
   */
  private driveBy(dt: number): boolean {
    const input = this.input, pl = this.humans.player;
    for (let k = 4; k <= 9; k++) if (input.wasPressed('Digit' + k) && this.humans.weaponOwned(k - 1)) pl.weapon = k - 1;
    const g = this.guns.current();
    if (!g || g.id === 'rocket' || g.id === 'grenade') return false;
    this.guns.updateAutoAim(30);
    if (!this.guns.aimPoint) {
      // nothing to aim at: shoot ahead of the car
      const d = this.driving!;
      this.guns.aimPoint = { x: d.x + Math.sin(d.ctrl.heading) * 30, y: 1.3, z: d.z + Math.cos(d.ctrl.heading) * 30, t: 30, hostile: false, heli: false, auto: true };
    }
    this.guns.update(dt, input.fireHeld, input.wasPressed('Attack') || input.wasPressed('KeyJ'));
    return true;
  }

  /** Street pickups: health, armor, cash, burger stands. */
  private updatePickups(dt: number): void {
    const pl = this.humans.player;
    const d = this.driving;
    this.pickups.update(dt, this.focusX, this.focusZ, this.onFoot ? 1.7 : 3.2, (type) => {
      if (this.state !== 'play') return false;
      if (type === 'health') return this.onFoot ? pl.hp < pl.maxHp : !!d && d.ctrl.hp < 0.999;
      if (type === 'burger') return this.onFoot && pl.hp < pl.maxHp && this.cash >= 15;
      if (type === 'armor') return this.humans.armor < 50;
      if (type === 'ammo') return this.guns.owned.some((g) => !GUNS[g].infinite);
      return true;
    }, (type, value) => {
      const x = this.focusX, z = this.focusZ;
      if (type === 'health') {
        if (this.onFoot) { pl.hp = Math.min(pl.maxHp, pl.hp + 40); this.popups.spawn(x, 3, z, '+40 HP', '#ff5f7a'); }
        else if (d) { d.ctrl.hp = Math.min(1, d.ctrl.hp + 0.35); this.popups.spawn(x, 3, z, bi('REPAIR', '수리'), '#ff5f7a'); }
      } else if (type === 'burger') {
        this.cash -= 15; this.hud.setCash(this.cash); this.saveDirty = true;
        pl.hp = pl.maxHp; this.popups.spawn(x, 3, z, bi('Burger! -$15, full HP', '버거! -$15, 체력 회복'), '#ffb23d');
      } else if (type === 'ammo') {
        for (const g of this.guns.owned) if (!GUNS[g].infinite) this.guns.addAmmo(g, Math.ceil(GUNS[g].pack / 2));
        this.popups.spawn(x, 3, z, bi('+AMMO', '+탄약'), '#ff9a3d');
        this.saveDirty = true;
      } else if (type === 'armor') {
        this.humans.armor = Math.min(50, this.humans.armor + 25); this.popups.spawn(x, 3, z, '+25 ARMOR', '#4da3ff');
      } else {
        this.addCash(value, 'other'); this.popups.spawn(x, 3, z, `+$${value}`, '#3dff8a');
      }
      this.audio.cash();
    });
    this.hud.setPlayerArmor(this.humans.armor / 50);
  }

  /** Pick up golden stars by touching them (in a car or on foot). */
  private collectStars(): void {
    if (this.state !== 'play') return;
    const i = this.collectibles.tryCollect(this.focusX, this.focusZ, this.onFoot ? 2.4 : 4, this.onFoot ? this.humans.player.y : 0);
    if (i < 0) return;
    this.progress.add('stars');
    this.addCash(300, 'stars');
    this.popups.spawn(this.focusX, 3, this.focusZ, '+$300', '#ffe27a');
    this.saveDirty = true;
    this.hud.setCollectibles(this.collectibles.count, this.collectibles.total);
    this.hud.toast(`${t('ui.stars_found')} ${this.collectibles.count}/${this.collectibles.total}  +$300`, 2200);
    this.audio.cash();
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
      input: playing && !this.climb ? this.input : this.idleInput,
      camYaw: this.cameraRig.moveYaw,
      vehicles: this.vehicles,
      wantCops: want,
      wantRiot: want > 0 ? (this.stars >= 5 ? 3 : this.stars >= 4 ? 2 : 0) : 0,
      wantShooters: want > 0 ? (this.stars >= 4 ? 3 : this.stars >= 2 ? 2 : 0) : 0,
      playerActive: this.onFoot,
      playerCarX: d ? d.x : pl.x, playerCarZ: d ? d.z : pl.z, playerCarSpeed: d ? d.ctrl.speed : 0,
      policeCars: this.copCars,
      time: this.time,
    };
    this.humans.update(dt, ctx);
    this.climber.apply(dt);
    this.policeFire.update(dt);
    this.cameraRig.ignore = this.onFoot && this.humans.player.roof ? this.humans.player.roof.box : null;
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
          if (tgt.role === Role.Civ) this.bus.emit({ type: 'civAssaulted', x: tgt.x, z: tgt.z });
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
      onPlayerHurt: () => { this.cameraRig.shake(0.35); this.audio.thump(); this.input.rumble(0.9, 0.6, 180); },
      onCopDown: (h) => {
        this.addCash(150, 'police');
        this.progress.add('copsKO');
        this.bus.emit({ type: 'copDown', total: this.humans.copsDefeated });
        if (Math.random() < 0.55) this.pickups.drop(h.x, h.z, (['cash', 'health', 'ammo'] as const)[Math.floor(Math.random() * 3)], 120);
        this.addHeat(15);
        if (this.humans.kids) this.popups.spawn(h.x, h.y + 2.2, h.z, t('pop.ko'), '#8a5cd6'); // knocked out, not killed
        else this.vfx.emitFire(h.x, 1, h.z, 4, 0.3);
      },
      onCivDown: (h, by) => {
        this.bus.emit({ type: 'civKilled', x: h.x, z: h.z, human: h, byPlayer: !!by && by.role === Role.Player, kids: this.humans.kids });
      },
      onWitnessStart: (h) => this.popups.spawn(h.x, h.y + 2.6, h.z, bi('📞 Calling the cops!', '📞 경찰에 신고 중!'), '#ffd23a'),
      onWitnessCall: (h) => {
        this.popups.spawn(h.x, h.y + 2.6, h.z, bi('Reported!', '신고 완료!'), '#ff3b3b');
        this.addHeat(40);
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
          this.addHeat((h.role === Role.Cop ? 20 : 15) + (h.state === St.Dead && h.role === Role.Civ ? 5 : 0));
          if (h.role === Role.Civ) this.bus.emit({ type: 'civRunOver', x: h.x, z: h.z, killed: h.state === St.Dead });
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
        if (v.ai === 'police') {
          this.addCash(v === this.hunter ? 1700 : 200, 'police'); this.addHeat(30);
          if (v === this.hunter) { this.popups.spawn(v.x, 3, v.z, bi('BOUNTY $1,500!', '현상금 $1,500!'), '#ffd23a'); this.hunter = null; this.progress.add('bounties'); }
        }
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
      // police that stood down leave once nobody can see them
      if (v.despawnT > 0 && v.ai === 'traffic') {
        v.despawnT -= dt;
        if (v.despawnT <= 0) {
          // leave as soon as they are out of the camera's view (or far away); if they linger in view, give up after 20 s more
          if (!this.nearPlayer(v.x, v.z, 50) || !this.inCameraView(v.x, v.z) || v.despawnExtra > 20) { this.removeVehicle(v); continue; }
          v.despawnT = 2; v.despawnExtra += 2;
        }
      }
      // recycle faraway AI (police are removed instead of being moved back into the city)
      if (v.ai === 'traffic' && !this.nearPlayer(v.x, v.z, 200)) {
        if (v.isPolice) { this.removeVehicle(v); continue; }
        this.relocate(v);
      }
      else if (v.ai === 'police' && !this.nearPlayer(v.x, v.z, 190)) { this.removeVehicle(v); continue; } // they give up when left far behind (no rubber-banding back)
      else if (v.ai === 'parked' && !v.owned && !v.isGigTarget && !this.nearPlayer(v.x, v.z, 240) && !this.roadblocks.some((r) => r.cars.includes(v))) this.removeVehicle(v);
    }
  }

  private camDir = new THREE.Vector3();
  /** Is the ground point in front of the camera (roughly on screen) and not too far? */
  private inCameraView(x: number, z: number): boolean {
    const cam = this.cameraRig.camera;
    cam.getWorldDirection(this.camDir);
    const dx = x - cam.position.x, dz = z - cam.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 240) return false;
    const fl = Math.hypot(this.camDir.x, this.camDir.z) || 1;
    return (dx * this.camDir.x + dz * this.camDir.z) / (Math.max(d, 0.001) * fl) > 0.3;
  }

  private maintainTraffic(): void {
    let n = 0;
    for (const v of this.vehicles) if (v.ai === 'traffic' && !v.isPolice) n++; // only ordinary cars count toward the traffic quota
    if (n < this.trafficTarget) this.spawnTraffic(false);
    else if (n > this.trafficTarget + 2) {
      const v = this.vehicles.find((q) => q.ai === 'traffic' && !q.isPolice && !this.nearPlayer(q.x, q.z, 60));
      if (v) this.removeVehicle(v);
    }
  }

  private updateWanted(dt: number): void {
    if (this.stars === 0) { this.managePolice(dt); return; }
    let nearest = Infinity;
    for (const v of this.policeVehicles()) nearest = Math.min(nearest, Math.hypot(v.x - this.focusX, v.z - this.focusZ));
    this.crimeT += dt;
    this.unseen = nearest > 85 ? this.unseen + dt : 0;
    if (this.unseen > 6 && this.crimeT > 12 && this.heat > this.minHeat) {
      this.heat = Math.max(this.minHeat, this.heat - 12 * dt);
      let s = 0;
      for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) s = i + 1;
      if (s < this.stars) {
        this.stars = s;
        this.hud.setWanted(s);
        if (s === 0) { this.hud.toast(t('ui.toast.lost')); this.clearWanted(); this.bus.emit({ type: 'wantedLost' }); }
      }
    }
    // survival bonus at high heat
    if (this.stars >= 4) {
      this.survivalAcc += dt * this.stars * 8;
      if (this.survivalAcc >= 50) { this.addCash(Math.floor(this.survivalAcc), 'police'); this.survivalAcc = 0; }
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

  private fineText(n: number): string { return n > 0 ? tf('ui.toast.busted', { n }) : bi('Bail waived - you are nearly broke', '보석금 면제 - 거의 파산 상태예요'); }

  /** Fixes the station outcome (for tests): 0-0.2 warning, 0.2-0.5 bribe, above that full bail. */
  bustRoll: number | null = null;
  private busted(): void {
    this.state = 'busted';
    this.stateTimer = 2.8;
    // the station: usually you pay bail, sometimes the officer takes a bribe instead (half), and now and then you are let off with a warning
    const roll = this.bustRoll ?? Math.random();
    let fine = fineFor(this.cash, 0.1, 2500); // bail: 10% of cash, free under $500
    let note = '';
    if (fine > 0 && roll < 0.2) { fine = 0; note = bi(' - The officer lets you off with a warning.', ' - 경찰이 경고만 주고 풀어줬어요.'); }
    else if (fine > 0 && roll < 0.5) { fine = Math.round(fine / 2); note = bi(' - You slipped the officer a bribe: half price.', ' - 경찰에게 뇌물을 줘서 절반만 냈어요.'); }
    this.cash -= fine;
    this.saveDirty = true;
    this.hud.setCash(this.cash);
    this.hud.setOverlay('ui.busted', fine === 0 && note ? note.replace(/^ - /, '') : this.fineText(fine) + note);
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

  /** Once a day: a login bonus that grows with the streak of days in a row (up to a week). Returns the amount, or 0 if already claimed today. */
  claimLogin(now = new Date()): number {
    const today = todayKey(now);
    const prev = this.save.login;
    if (prev?.day === today) return 0;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const streak = prev && prev.day === todayKey(y) ? Math.min(7, prev.streak + 1) : 1;
    this.save.login = { day: today, streak };
    const bonus = 150 * streak;
    this.addCash(bonus, 'other');
    this.flushSave();
    this.hud.toast(`${bi('Daily bonus', '출석 보너스')} $${bonus} · ${bi(`day ${streak} in a row`, `${streak}일 연속`)}`, 3600);
    return bonus;
  }

  /** Fade out and arrive somewhere else on foot (the bus line uses this). */
  travelTo(x: number, z: number, heading: number, label: string): void {
    if (this.fading || this.state !== 'play') return;
    this.fadeThen(() => {
      this.humans.setPlayerActive(true, x, z, heading);
      this.syncFoot();
      this.cameraRig.snap();
      this.hud.toast(label, 1600);
    });
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
    if (this.garageLock || d.ctrl.speed > 14) return;
    if (this.gigs.onGarageArrival()) { this.garageLock = true; return; }
    this.hideouts.parkInGarage();
  }

  private updateStateMachine(dt: number): void {
    if (this.state === 'play') {
      const d = this.driving;
      if (d && d.ctrl.wrecked && !this.onFoot) {
        this.state = 'wrecked';
        this.stateTimer = 2.8;
        const fine = fineFor(this.cash, 0.06, 1500);
        this.cash -= fine;
        this.saveDirty = true;
        this.hud.setCash(this.cash);
        this.hud.setOverlay('ui.wrecked', this.fineText(fine));
      } else if (this.onFoot && this.humans.player.hp <= 0) {
        this.state = 'wasted';
        this.stateTimer = 2.8;
        const fine = fineFor(this.cash, 0.06, 1500);
        this.cash -= fine;
        this.saveDirty = true;
        this.hud.setCash(this.cash);
        this.hud.setOverlay(this.humans.kids ? 'ui.knocked_out' : 'ui.wasted', this.fineText(fine));
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
    this.humans.armor = 0;
    this.guns.loseAmmo();
        this.humans.setPlayerActive(false, 0, 0, 0);
        this.respawnAtGarage();
      }
    }
  }

  // ------------------------------------------------------------------ presentation helpers
  private updateLights(): void {
    const n = this.env.night * (this.blackout ? 0.06 : 1);
    this.world.windowMaterial.emissiveIntensity = n * 1.1;
    this.world.signMaterial.emissiveIntensity = 0.15 + n * 1.0;
    this.props.lampHeadMaterial.emissiveIntensity = 0.15 + n * 3.2;
    this.props.setNight(n);
    VehicleFactory.sharedHead.emissiveIntensity = 0.6 + n * 2.6;
    const flash = Math.floor(this.time * 7) % 2 === 0;
    const sirens = this.stars > 0 || this.roadblocks.length > 0 || this.medics.active;
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
    if (!this.onFoot) this.hud.setActionLabel('F');
    if (this.onFoot) {
      const lo = this.climber.option();
      const door = this.climb ? null : this.interiors.roomAt(this.humans.player.x, this.humans.player.z, 2.6);
      this.hud.setActionLabel(lo ? bi('CLIMB', '오르기') : door && !this.humans.player.roof ? bi('ENTER', '입장') : 'F');
      if (lo) this.hud.setPrompt(lo.up ? bi('[F] Climb the ladder', '[F] 사다리 오르기') : bi('[F] Climb down', '[F] 내려가기'));
      else if (door && !this.humans.player.roof) this.hud.setPrompt(`${bi('[F] Enter', '[F] 들어가기')} ${bi(door.en, door.ko)}`);
      else {
        const mach = this.machines.nearest(this.humans.player.x, this.humans.player.z);
        const hm = mach ? -1 : this.hideouts.homeNear();
        const bs = mach || hm >= 0 ? -1 : this.transit.near();
        const fp = mach || hm >= 0 || bs >= 0 ? null : this.fishing.prompt();
        this.hud.setPrompt(mach ? this.machines.prompt(mach) : bs >= 0 ? this.transit.prompt(bs) : fp ? fp : hm >= 0 ? (this.hideouts.ownsHome(hm) ? bi('[F] Go home', '[F] 집에 들어가기') : `${bi('[F] Buy this house', '[F] 이 집 사기')} - $${Hideouts.HOME_PRICE.toLocaleString('en-US')}`) : this.nearestVehicle(3.2) ? t('ui.hint.enter_car') : null);
      }
    }
    else if (this.driving && this.driving.ctrl.speed < 2.5 && this.stars === 0) this.hud.setPrompt(t('ui.hint.exit_car'));
    else this.hud.setPrompt(null);
  }

  /** Set by main: lowers the radio under sirens. */
  radioDuck: ((v: number) => void) | null = null;

  private updateAudio(dt: number): void {
    const d = this.driving;
    this.street.updateAmbience(dt);
    let siren: number | null = null;
    for (const v of this.vehicles) {
      if (v.isPolice && (v.ai === 'police' || (v.ai === 'parked' && this.roadblocks.length))) {
        const dist = Math.hypot(v.x - this.focusX, v.z - this.focusZ);
        if (siren === null || dist < siren) siren = dist;
      }
    }
    this.radioDuck?.(this.stars > 0 || this.roadblocks.length ? (siren !== null && siren < 60 ? 0.25 : 0.6) : 1);
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
    for (const st of this.transit.stops) this.pushBlip(st.x, st.z, '#6bd1ff', false, 3.5);
    this.world.homes.forEach((h, i) => this.pushBlip(h.x, h.z, this.hideouts.ownsHome(i) ? '#ffd23a' : '#6bd1ff', false, 4.5));
    this.gigs.blips(this.pushBlip);
    for (const r of this.interiors.rooms) if (Math.hypot(r.door.x - this.focusX, r.door.z - this.focusZ) < 160) this.pushBlip(r.door.x, r.door.z, r.css, false, 4);
    if (this.hunter) this.pushBlip(this.hunter.x, this.hunter.z, '#ff9a3d', true, 5);
    for (const m of this.festival.markers()) this.pushBlip(m.x, m.z, '#ff5db1', true, 5.5);
    for (const m of this.delivery.markers()) this.pushBlip(m.x, m.z, '#ff8fb8', m.flash, 5);
    for (const m of this.race.markers()) this.pushBlip(m.x, m.z, m.color, m.flash, 5);
    for (const m of this.taxi.markers()) this.pushBlip(m.x, m.z, m.color, true, 5.5);
    for (const m of this.range.markers()) this.pushBlip(m.x, m.z, '#ff9a3d', m.active, m.active ? 5 : 4);
    for (const m of this.roofDash.markers()) this.pushBlip(m.x, m.z, '#4dd2ff', false, m.active ? 5.5 : 4);
    for (const m of this.sideQuests.markers()) this.pushBlip(m.x, m.z, m.color, true, 5);
    this.pickups.forEach((type, x, z) => { if (Math.hypot(x - this.focusX, z - this.focusZ) < 90 && type !== 'cash') this.pushBlip(x, z, Pickups.color(type), false, 3); });
    this.story.blips(this.pushBlip);
    for (let i = 0; i < this.collectibles.total; i++) {
      if (this.collectibles.isCollected(i)) continue;
      const sp = this.collectibles.spot(i);
      if (Math.hypot(sp.x - this.focusX, sp.z - this.focusZ) < 110) this.pushBlip(sp.x, sp.z, '#ffe27a', false, 3.2);
    }
    for (const v of this.vehicles) {
      if (v.isPolice && !v.ctrl.wrecked && (v.ai === 'police' || v.ai === 'parked')) this.pushBlip(v.x, v.z, '#ff2a3a', true, 4.5);
    }
  }
}
