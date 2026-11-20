import * as THREE from 'three';
import { MeshBuilder, paletteMaterial } from './geo';

export interface VehicleModel {
  /** Root group. Local +Z is forward. Position/yaw are driven by the controller. */
  root: THREE.Group;
  /** Visual-only group (chassis + wheels) that receives body roll / pitch. */
  body: THREE.Group;
  frontPivots: THREE.Group[];
  wheelMeshes: THREE.Mesh[];
  wheelRadius: number;
  headMat: THREE.MeshStandardMaterial;
  tailMat: THREE.MeshStandardMaterial;
  /** Soft additive glow projected on the road in front of the car (night). */
  headGlow: THREE.Mesh;
  /** Cheap blob shadow used on the Low quality preset. */
  blob: THREE.Mesh;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0); // near (bottom) -> far (top)
  grad.addColorStop(0, 'rgba(255,244,200,0.95)');
  grad.addColorStop(1, 'rgba(255,244,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // fade horizontally
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.5, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const WHEEL_R = 0.38;

/** Procedural vehicles: merged static chassis + 4 independently animated wheels. */
export class VehicleFactory {
  private static wheelGeo: THREE.BufferGeometry | null = null;
  private static glowTex: THREE.CanvasTexture | null = null;
  private static blobTex: THREE.CanvasTexture | null = null;

  private static getWheelGeo(): THREE.BufferGeometry {
    if (!this.wheelGeo) {
      const b = new MeshBuilder();
      b.cylinder(WHEEL_R, WHEEL_R, 0.32, 10, 0, 0, 0, 0x1a1a1f, 0, 0, Math.PI / 2); // tire
      b.cylinder(0.22, 0.22, 0.34, 8, 0, 0, 0, 0xc9ccd6, 0, 0, Math.PI / 2); // rim
      this.wheelGeo = b.build();
    }
    return this.wheelGeo;
  }

  static createSportsCar(bodyColor = 0xffd500): VehicleModel {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const dark = 0x1a1a24;
    const b = new MeshBuilder();
    // lower body
    b.box(1.9, 0.5, 4.3, 0, 0.55, 0, bodyColor);
    // wedge hood: lower the front-top verts
    b.box(1.84, 0.34, 1.6, 0, 0.9, 1.35, bodyColor, (p) => {
      for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0 && p.getY(i) > 0) p.setY(i, p.getY(i) - 0.26);
    });
    // rear deck
    b.box(1.84, 0.3, 1.2, 0, 0.88, -1.45, bodyColor);
    // cabin trapezoid (tinted)
    b.box(1.6, 0.55, 1.9, 0, 1.2, -0.15, dark, (p) => {
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) {
          p.setX(i, p.getX(i) * 0.74);
          p.setZ(i, p.getZ(i) * 0.7);
        }
      }
    });
    // roof panel in body color
    b.box(1.1, 0.06, 0.9, 0, 1.5, -0.15, bodyColor);
    // louvers
    for (let i = 0; i < 4; i++) b.box(1.2, 0.04, 0.1, 0, 1.06, -1.2 - i * 0.2, dark);
    // spoiler
    b.box(0.08, 0.35, 0.3, 0.7, 1.15, -2.0, dark);
    b.box(0.08, 0.35, 0.3, -0.7, 1.15, -2.0, dark);
    b.box(1.9, 0.07, 0.5, 0, 1.36, -2.05, bodyColor);
    // bumpers / side skirts
    b.box(1.95, 0.22, 0.25, 0, 0.38, 2.12, dark);
    b.box(1.95, 0.22, 0.25, 0, 0.38, -2.12, dark);
    b.box(0.08, 0.14, 2.6, 0.98, 0.36, 0, dark);
    b.box(0.08, 0.14, 2.6, -0.98, 0.36, 0, dark);
    // exhausts
    b.cylinder(0.09, 0.09, 0.3, 8, 0.5, 0.42, -2.25, 0x9aa0ad, Math.PI / 2, 0, 0);
    b.cylinder(0.09, 0.09, 0.3, 8, -0.5, 0.42, -2.25, 0x9aa0ad, Math.PI / 2, 0, 0);
    const chassis = new THREE.Mesh(b.build(), paletteMaterial());
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    body.add(chassis);

    // emissive lights (own materials so night mode can drive them)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4, emissive: 0xfff3c4, emissiveIntensity: 0.6, flatShading: true,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff2a3a, emissive: 0xff1030, emissiveIntensity: 1.0, flatShading: true,
    });
    const lightBox = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      body.add(mesh);
    };
    lightBox(0.55, 0.12, 0.06, 0.58, 0.66, 2.16, headMat);
    lightBox(0.55, 0.12, 0.06, -0.58, 0.66, 2.16, headMat);
    lightBox(1.6, 0.1, 0.06, 0, 0.78, -2.16, tailMat);

    // wheels
    const wheelGeo = this.getWheelGeo();
    const wheelMat = paletteMaterial();
    const frontPivots: THREE.Group[] = [];
    const wheelMeshes: THREE.Mesh[] = [];
    for (const [x, z, front] of [
      [0.95, 1.35, true], [-0.95, 1.35, true], [0.95, -1.35, false], [-0.95, -1.35, false],
    ] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_R, z);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.castShadow = true;
      pivot.add(wheel);
      body.add(pivot);
      wheelMeshes.push(wheel);
      if (front) frontPivots.push(pivot);
    }

    // night headlight glow on the road
    if (!this.glowTex) this.glowTex = glowTexture();
    const glowGeo = new THREE.PlaneGeometry(5.5, 14);
    glowGeo.rotateX(-Math.PI / 2);
    glowGeo.translate(0, 0, 9.2);
    const headGlow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({
        map: this.glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      }),
    );
    headGlow.position.y = 0.07;
    headGlow.visible = false;
    root.add(headGlow);

    // blob shadow (Low preset)
    if (!this.blobTex) this.blobTex = blobTexture();
    const blobGeo = new THREE.PlaneGeometry(4.2, 6.2);
    blobGeo.rotateX(-Math.PI / 2);
    const blob = new THREE.Mesh(
      blobGeo,
      new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }),
    );
    blob.position.y = 0.06;
    blob.visible = false;
    root.add(blob);

    return { root, body, frontPivots, wheelMeshes, wheelRadius: WHEEL_R, headMat, tailMat, headGlow, blob };
  }
}
