import * as THREE from 'three';
import { CarController, type CarEvents } from './carController';
import type { ControlState } from './input';
import type { PoliceBrain, TrafficBrain } from './ai';
import { VehicleFactory, type VehicleKind } from './vehicle';
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
  owned = false;
  ramCooldown = 0;

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
  }

  private wreckedLook = false;
  markWrecked(): void {
    this.wreckedLook = true;
    this.ctrl.wrecked = true;
    this.ctrl.model.chassis.material = VehicleFactory.charred;
  }

  remove(): void {
    VehicleFactory.dispose(this.ctrl.model);
  }
}
