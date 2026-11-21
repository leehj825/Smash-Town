import * as THREE from 'three';
import { CarController, type CarEvents } from './carController';
import type { ControlState } from './input';
import type { PoliceBrain, TrafficBrain } from './ai';
import { VehicleFactory, dimsOf, type VehicleKind } from './vehicle';
import type { CircleCollider, World } from './world';

export type AIMode = 'player' | 'traffic' | 'police' | 'parked' | 'wreck';

export interface VehicleEvents {
  onImpact: (v: GameVehicle, strength: number) => void;
  onSmash: (v: GameVehicle, c: CircleCollider, vx: number, vz: number, speed: number) => void;
  onLand: (v: GameVehicle, distance: number) => void;
}

let nextId = 1;

/** A vehicle in the world: physics controller + model + AI state. */
export class GameVehicle {
  readonly id = nextId++;
  readonly ctrl: CarController;
  ai: AIMode;
  control: ControlState = { throttle: 0, steer: 0, handbrake: false, nitro: false };
  traffic: TrafficBrain | null = null;
  police: PoliceBrain | null = null;
  wreckTimer = 0;
  smokeAcc = 0;
  isGigTarget = false;
  /** A tyre was shot out or shredded: slower and loose. Garage repair fixes it. */
  flat = false;
  popTire(): boolean {
    if (this.flat) return false;
    this.flat = true;
    this.ctrl.stats = { ...this.ctrl.stats, maxSpeed: this.ctrl.stats.maxSpeed * 0.55, grip: this.ctrl.stats.grip * 0.7 };
    // the wheel sags: one corner sits lower
    const w = this.ctrl.model.wheelMeshes[this.id % 4];
    if (w) w.scale.y *= 0.55;
    return true;
  }
  /** A garage fixed the tyre: the wheel is round again. */
  fixTire(): void {
    const w = this.ctrl.model.wheelMeshes[this.id % 4];
    if (w && this.flat) w.scale.y /= 0.55;
    this.flat = false;
  }
  owned = false;
  ramCooldown = 0;
  /** Seconds until this car is removed once out of sight (cops that stood down after a chase). 0 = never. */
  despawnT = 0;
  despawnExtra = 0;

  constructor(
    readonly kind: VehicleKind,
    readonly color: number,
    world: World,
    events: VehicleEvents,
    private scene: THREE.Scene,
    ai: AIMode,
    full = false,
  ) {
    this.ai = ai;
    const model = VehicleFactory.create(kind, color, full);
    scene.add(model.root);
    this.ctrl = new CarController(model, kind, world, {
      onImpact: (s) => events.onImpact(this, s),
      onSmash: (c, vx, vz, sp) => events.onSmash(this, c, vx, vz, sp),
      onLand: (d) => events.onLand(this, d),
    } satisfies CarEvents);
    // Only the player's car climbs ramps by default; AI cars drive straight over.
    this.ctrl.useRamps = full;
  }

  get isPolice(): boolean {
    return this.kind === 'police' || this.kind === 'interceptor' || this.kind === 'swat' || this.kind === 'armored';
  }
  get x(): number { return this.ctrl.position.x; }
  get z(): number { return this.ctrl.position.z; }

  /** Upgrade to the full model (animated wheels, headlight glow, blob shadow). */
  ensureFull(): void {
    if (this.ctrl.model.full) return;
    const old = this.ctrl.model;
    const model = VehicleFactory.create(this.kind, this.color, true);
    this.scene.add(model.root);
    this.ctrl.setModel(model);
    if (this.wreckedLook) model.chassis.material = VehicleFactory.charred;
    VehicleFactory.dispose(old);
    this.ctrl.useRamps = true;
    if (this.neonColor) this.applyNeon();
  }

  private neonColor = 0;
  private neonMesh: THREE.Mesh | null = null;
  /** Underglow for the player's car (0 = off). Re-applied whenever the model is swapped. */
  setNeon(color: number): void {
    this.neonColor = color;
    this.applyNeon();
  }
  private applyNeon(): void {
    if (this.neonMesh) { this.neonMesh.removeFromParent(); this.neonMesh.geometry.dispose(); (this.neonMesh.material as THREE.Material).dispose(); this.neonMesh = null; }
    if (!this.neonColor) return;
    const d = dimsOf(this.kind);
    const geo = new THREE.PlaneGeometry(d.radius * 2 + 1.1, d.len + 0.9);
    geo.rotateX(-Math.PI / 2);
    this.neonMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.neonColor, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.neonMesh.position.y = 0.09;
    this.ctrl.model.root.add(this.neonMesh);
  }

  private wreckedLook = false;
  markWrecked(): void {
    this.wreckedLook = true;
    this.ctrl.wrecked = true;
    this.ctrl.model.chassis.material = VehicleFactory.charred;
  }

  remove(): void {
    this.neonColor = 0; this.applyNeon();
    VehicleFactory.dispose(this.ctrl.model);
  }
}
