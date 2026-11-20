import * as THREE from 'three';
import type { CarController } from './carController';

/** Chase camera: speed-based FOV, yaw lag during drifts, and damped-sinusoid screen shake. */
export class CameraRig {
  private yaw = Math.PI;
  private shakeAmp = 0;
  private shakeTime = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private initialised = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.2, this.shakeAmp + amount);
    this.shakeTime = 0;
  }

  snap(): void {
    this.initialised = false;
  }

  update(dt: number, car: CarController): void {
    // Camera yaw trails the car heading; drift slip pulls it so the side profile shows.
    const target = car.heading + Math.atan2(car.lateralSpeed, Math.max(6, Math.abs(car.forwardSpeed))) * 0.6;
    if (!this.initialised) this.yaw = target;
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * (1 - Math.exp(-dt * 4.5));

    const speedT = Math.min(1, Math.abs(car.speed) / 40);
    const dist = 8.6 + speedT * 1.8 + (car.nitroActive ? 1.2 : 0);
    const height = 3.7 + speedT * 0.6;
    const desired = this.tmp.set(
      car.position.x - Math.sin(this.yaw) * dist,
      height,
      car.position.z - Math.cos(this.yaw) * dist,
    );
    if (!this.initialised) {
      this.pos.copy(desired);
      this.initialised = true;
    } else {
      this.pos.lerp(desired, 1 - Math.exp(-dt * 9));
    }
    this.look.set(
      car.position.x + Math.sin(this.yaw) * 4,
      1.4,
      car.position.z + Math.cos(this.yaw) * 4,
    );

    // screen shake
    this.shakeTime += dt;
    this.shakeAmp *= Math.exp(-dt * 5);
    const sh = this.shakeAmp * Math.sin(this.shakeTime * 55);
    this.camera.position.set(this.pos.x + sh * 0.25, this.pos.y + sh * 0.2, this.pos.z + sh * 0.25);
    this.camera.lookAt(this.look);

    const targetFov = 60 + 14 * speedT + (car.nitroActive ? 4 : 0);
    this.camera.fov += (Math.min(78, targetFov) - this.camera.fov) * (1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
  }
}
