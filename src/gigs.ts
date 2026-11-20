import * as THREE from 'three';
import { Beacon } from './beacon';
import type { Game } from './game';
import type { GameVehicle } from './vehicles';
import { t, tf } from './i18n';
import type { Blip } from './hud';

export type GigId = 'rampage' | 'delivery' | 'hijack' | 'brawl';

interface Marker { id: GigId; x: number; z: number; color: number; css: string; beacon: Beacon; cooldown: number }

interface Active {
  id: GigId;
  time: number;
  // rampage
  startDamage: number;
  target: number;
  // delivery
  cp: number;
  // hijack
  stage: 'steal' | 'deliver';
  car: GameVehicle | null;
  // brawl
  baseline: number;
}

const RAMPAGE_TARGET = 25000;
const BRAWL_TARGET = 5;
const CHECKPOINTS = [{ x: 200, z: 60 }, { x: 80, z: 190 }, { x: 240, z: 290 }];
const HIJACK_SPOTS = [
  { x: 124.5, z: 140, h: Math.PI }, { x: 35.5, z: 260, h: 0 }, { x: 275.5, z: 60, h: 0 },
];

/** Four instant missions: Smash Rampage, Hot Delivery, Grand Hijack, Stunt Jump. */
export class GigManager {
  readonly markers: Marker[];
  active: Active | null = null;
  private objective = new Beacon(0xffd500, 6);
  private extra = new Beacon(0xb066ff, 4);

  constructor(private game: Game, scene: THREE.Scene) {
    const mk = (id: GigId, x: number, z: number, color: number, css: string): Marker => {
      const beacon = new Beacon(color, 4.5);
      beacon.setPosition(x, z);
      scene.add(beacon.group);
      return { id, x, z, color, css, beacon, cooldown: 0 };
    };
    this.markers = [
      mk('rampage', 40, 100, 0xff8c00, '#ff8c00'),
      mk('delivery', 120, 20, 0xff3355, '#ff3355'),
      mk('hijack', 280, 140, 0xb066ff, '#b066ff'),
      mk('brawl', 80, 60, 0x36e0ff, '#36e0ff'),
    ];
    scene.add(this.objective.group, this.extra.group);
    this.objective.visible = false;
    this.extra.visible = false;
  }

  private titleKey(id: GigId) {
    return ({ rampage: 'gig.rampage.title', delivery: 'gig.delivery.title', hijack: 'gig.hijack.title', brawl: 'gig.brawl.title' } as const)[id];
  }

  start(id: GigId): void {
    const g = this.game;
    const a: Active = { id, time: 0, startDamage: g.damageTotal, target: 0, cp: 0, stage: 'steal', car: null, baseline: g.humans.copsDefeated };
    switch (id) {
      case 'rampage':
        a.time = 60; a.target = RAMPAGE_TARGET;
        break;
      case 'delivery':
        a.time = 110;
        g.setMinStars(2);
        this.objective.setPosition(CHECKPOINTS[0].x, CHECKPOINTS[0].z);
        this.objective.visible = true;
        break;
      case 'hijack': {
        a.time = 150;
        const px = g.focusX, pz = g.focusZ;
        const spots = HIJACK_SPOTS.filter((s) => Math.hypot(s.x - px, s.z - pz) > 50);
        const s = spots[Math.floor(Math.random() * spots.length)] ?? HIJACK_SPOTS[0];
        a.car = g.spawnVehicle('supercar', 0xf5f5f5, s.x, s.z, s.h, 'parked');
        a.car.isGigTarget = true;
        this.extra.setPosition(s.x, s.z);
        this.extra.visible = true;
        break;
      }
      case 'brawl':
        a.time = 120; a.target = BRAWL_TARGET;
        g.setMinStars(2);
        break;
    }
    this.active = a;
    g.hud.toast(t('gig.start'));
  }

  private finish(ok: boolean, reward = 0): void {
    const a = this.active!;
    const g = this.game;
    this.objective.visible = false;
    this.extra.visible = false;
    if (a.car) a.car.isGigTarget = false;
    const m = this.markers.find((q) => q.id === a.id)!;
    m.cooldown = 25;
    this.active = null;
    g.hud.showGig(false);
    if (ok) {
      g.addCash(reward);
      g.hud.toast(tf('gig.complete', { n: reward.toLocaleString('en-US') }), 3000);
    } else {
      g.hud.toast(t('gig.failed'), 2600);
    }
  }

  /** Called when the player drives into a garage zone. Returns true if the gig consumed the arrival. */
  onGarageArrival(): boolean {
    const a = this.active;
    if (a && a.id === 'hijack' && a.stage === 'deliver' && a.car && this.game.driving === a.car) {
      const reward = Math.round(6500 * (0.35 + 0.65 * a.car.ctrl.hp));
      this.finish(true, reward);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    const g = this.game;
    for (const m of this.markers) {
      m.beacon.update(dt);
      m.cooldown = Math.max(0, m.cooldown - dt);
      m.beacon.visible = !this.active && m.cooldown <= 0;
    }
    this.objective.update(dt);
    this.extra.update(dt);
    const a = this.active;
    if (!a) {
      if (g.state !== 'play' || (!g.driving && !g.onFoot)) return;
      for (const m of this.markers) {
        if (m.cooldown > 0) continue;
        if (Math.hypot(m.x - g.focusX, m.z - g.focusZ) < 6) { this.start(m.id); break; }
      }
      return;
    }

    a.time -= dt;
    const title = t(this.titleKey(a.id));
    const time = Math.max(0, Math.ceil(a.time)) + 's';
    switch (a.id) {
      case 'rampage': {
        const dmg = g.damageTotal - a.startDamage;
        g.hud.showGig(true, title, tf('gig.rampage.obj', { a: Math.round(dmg).toLocaleString('en-US'), b: a.target.toLocaleString('en-US') }), time);
        if (dmg >= a.target) this.finish(true, 3500);
        else if (a.time <= 0) this.finish(false);
        break;
      }
      case 'delivery': {
        const cp = CHECKPOINTS[a.cp];
        g.hud.showGig(true, title, tf('gig.delivery.obj', { a: a.cp + 1, b: CHECKPOINTS.length }), time);
        if (Math.hypot(cp.x - g.focusX, cp.z - g.focusZ) < 8) {
          a.cp++;
          g.hud.toast(`${a.cp} / ${CHECKPOINTS.length}`, 1000);
          if (a.cp >= CHECKPOINTS.length) { this.finish(true, 4500); break; }
          this.objective.setPosition(CHECKPOINTS[a.cp].x, CHECKPOINTS[a.cp].z);
        }
        if (a.time <= 0) this.finish(false);
        break;
      }
      case 'hijack': {
        const car = a.car!;
        if (car.ctrl.wrecked || !g.vehicles.includes(car)) { this.finish(false); break; }
        if (a.stage === 'steal') {
          g.hud.showGig(true, title, t('gig.hijack.steal'), time);
          if (g.driving === car) {
            a.stage = 'deliver';
            this.extra.visible = false;
            g.setMinStars(2);
          }
        } else {
          g.hud.showGig(true, title, t('gig.hijack.deliver'), time);
          if (g.driving !== car && !g.onFoot) { /* switched car: fail */ this.finish(false); break; }
        }
        if (a.time <= 0) this.finish(false);
        break;
      }
      case 'brawl': {
        const down = g.humans.copsDefeated - a.baseline;
        g.hud.showGig(true, t('ui.mission.defeat_police'), tf('gig.brawl.obj', { a: down, b: a.target }), time);
        if (down >= a.target) this.finish(true, 3500);
        else if (a.time <= 0) this.finish(false);
        break;
      }
    }
  }

  blips(push: (x: number, z: number, color: string, flash?: boolean, size?: number) => void): void {
    const a = this.active;
    if (!a) {
      for (const m of this.markers) if (m.cooldown <= 0) push(m.x, m.z, m.css, false, 5);
      return;
    }
    if (a.id === 'delivery') push(CHECKPOINTS[a.cp].x, CHECKPOINTS[a.cp].z, '#ffd500', false, 6);
    if (a.id === 'hijack' && a.stage === 'steal' && a.car) push(a.car.x, a.car.z, '#b066ff', false, 6);
    if (a.id === 'hijack' && a.stage === 'deliver') for (const gz of this.game.world.garages) push(gz.x, gz.z, '#ffd500', false, 6);
  }
}

export type { Blip };
