import * as THREE from 'three';
import { MeshBuilder, paletteMaterial } from './geo';
import { net } from './world';

/** Traffic lights: every junction of three or more drivable roads cycles NS-green, NS-yellow, all-red, EW-green, EW-yellow, all-red. */
export type LightState = 'green' | 'yellow' | 'red';
const CYCLE = 16;
export const lightClock = { t: 0 };

function arms(b: number, a: number): number {
  let n = 0;
  if (b < net.nx && net.segH[a][b] && net.hwZ[a] >= 5.5) n++;
  if (b > 0 && net.segH[a][b - 1] && net.hwZ[a] >= 5.5) n++;
  if (a < net.nz && net.segV[b][a] && net.hwX[b] >= 5.5) n++;
  if (a > 0 && net.segV[b][a - 1] && net.hwX[b] >= 5.5) n++;
  return n;
}
export const isJunction = (b: number, a: number): boolean => arms(b, a) >= 3;

/** State of the light for traffic travelling along z (`axisZ`) or along x at junction (b, a). */
export function lightState(b: number, a: number, axisZ: boolean): LightState {
  let t = (lightClock.t + ((b * 7 + a * 13) % CYCLE) + (axisZ ? 0 : CYCLE / 2)) % CYCLE;
  if (t < 6) return 'green';
  if (t < 7.5) return 'yellow';
  void t;
  return 'red';
}

/** The poles and lamp heads. Each junction gets two poles on opposite corners, each carrying a head for both directions. */
export class TrafficLights {
  readonly group = new THREE.Group();
  private lamps: THREE.InstancedMesh;
  private heads: { b: number; a: number; axisZ: boolean; base: number }[] = [];
  private col = new THREE.Color();
  private lastKey = '';
  private onColor = [new THREE.Color(0xff2a2a), new THREE.Color(0xffc21a), new THREE.Color(0x2aff6a)];
  private offColor = [new THREE.Color(0x3a0a0a), new THREE.Color(0x3a2e05), new THREE.Color(0x0a3a16)];

  constructor() {
    const pole = new MeshBuilder();
    pole.box(0.18, 5.2, 0.18, 0, 2.6, 0, 0x4a4e59);
    pole.box(0.4, 0.3, 0.4, 0, 0.15, 0, 0x2f323a);
    const housing = new MeshBuilder();
    housing.box(0.55, 1.5, 0.45, 0, 0, 0, 0x1a1b20);
    housing.box(0.75, 1.7, 0.1, 0, 0, -0.2, 0x2a2c33); // back plate
    const mat = paletteMaterial();
    const dummy = new THREE.Object3D();
    const poleList: [number, number, number][] = [];
    const headList: { x: number; z: number; rot: number; b: number; a: number; axisZ: boolean }[] = [];
    for (let b = 0; b <= net.nx; b++) for (let a = 0; a <= net.nz; a++) {
      if (!isJunction(b, a)) continue;
      const hx = net.hwX[b], hz = net.hwZ[a], cx = net.xs[b], cz = net.zs[a];
      // far-right corner of the junction for traffic arriving from -z (pole at +x, +z) and for traffic arriving from -x
      for (const [sx, sz] of [[1, 1], [-1, -1]] as const) {
        const px = cx + sx * (hx + 0.9), pz = cz + sz * (hz + 0.9);
        poleList.push([px, pz, 0]);
        // a head on the z-side of the pole facing the oncoming z traffic, one on the x-side facing the oncoming x traffic
        headList.push({ x: px, z: pz - sz * 0.6, rot: sz > 0 ? Math.PI : 0, b, a, axisZ: true });
        headList.push({ x: px - sx * 0.6, z: pz, rot: sx > 0 ? -Math.PI / 2 : Math.PI / 2, b, a, axisZ: false });
      }
    }
    const poles = new THREE.InstancedMesh(pole.build(), mat, Math.max(1, poleList.length));
    poleList.forEach(([x, z], i) => { dummy.position.set(x, 0.14, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix); });
    poles.count = poleList.length; poles.castShadow = true; poles.frustumCulled = false;
    this.group.add(poles);
    const hs = new THREE.InstancedMesh(housing.build(), mat, Math.max(1, headList.length));
    headList.forEach((h, i) => { dummy.position.set(h.x, 4.7, h.z); dummy.rotation.set(0, h.rot, 0); dummy.updateMatrix(); hs.setMatrixAt(i, dummy.matrix); });
    hs.count = headList.length; hs.frustumCulled = false;
    this.group.add(hs);
    // three lamps per head (red, yellow, green) as small emissive blocks recoloured every phase change
    const lampGeo = new THREE.BoxGeometry(0.34, 0.34, 0.1);
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), Math.max(1, headList.length * 3));
    headList.forEach((h, i) => {
      this.heads.push({ b: h.b, a: h.a, axisZ: h.axisZ, base: i * 3 });
      for (let k = 0; k < 3; k++) {
        dummy.position.set(h.x, 4.7 + 0.5 - k * 0.5, h.z);
        dummy.rotation.set(0, h.rot, 0);
        dummy.translateZ(0.27);
        dummy.updateMatrix();
        this.lamps.setMatrixAt(i * 3 + k, dummy.matrix);
        this.lamps.setColorAt(i * 3 + k, this.offColor[k]);
      }
    });
    this.lamps.count = headList.length * 3; this.lamps.frustumCulled = false;
    this.group.add(this.lamps);
  }

  update(dt: number): void {
    lightClock.t += dt;
    const key = String(Math.floor(lightClock.t * 2));
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const h of this.heads) {
      const s = lightState(h.b, h.a, h.axisZ);
      const lit = s === 'red' ? 0 : s === 'yellow' ? 1 : 2;
      for (let k = 0; k < 3; k++) this.lamps.setColorAt(h.base + k, k === lit ? this.onColor[k] : this.offColor[k]);
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    void this.col;
  }

  get visible(): boolean { return this.group.visible; }
  set visible(v: boolean) { this.group.visible = v; }
}
