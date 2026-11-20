import * as THREE from 'three';
import { MeshBuilder } from './geo';

// ---------------------------------------------------------------------------------------------
// Humanoid rig. Same 15 joints, parents-first order and Left = +x convention as the `model_check`
// rig (src/rig.js): hips, torso, head, hip/knee/ank L/R, sh/el/wr L/R. Joint rotations are driven
// procedurally (no clips). Negative rotation.x swings a limb FORWARD (+z), positive bends knees back.
// ---------------------------------------------------------------------------------------------
export const BONES = ['hips', 'torso', 'head', 'hipL', 'kneeL', 'ankL', 'hipR', 'kneeR', 'ankR', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'] as const;
export const PARENT: Record<string, string> = {
  torso: 'hips', head: 'torso', hipL: 'hips', kneeL: 'hipL', ankL: 'kneeL', hipR: 'hips', kneeR: 'hipR', ankR: 'kneeR',
  shL: 'torso', elL: 'shL', wrL: 'elL', shR: 'torso', elR: 'shR', wrR: 'elR',
};
export const J = {
  hips: 0, torso: 1, head: 2, hipL: 3, kneeL: 4, ankL: 5, hipR: 6, kneeR: 7, ankR: 8, shL: 9, elL: 10, wrL: 11, shR: 12, elR: 13, wrR: 14,
} as const;
const PARENT_IDX: number[] = BONES.map((b) => (PARENT[b] ? BONES.indexOf(PARENT[b] as typeof BONES[number]) : -1));

/** Rest offsets of each joint relative to its parent (metres; 1.81 m tall, blocky proportions). */
const REST: [number, number, number][] = [
  [0, 0.83, 0], [0, 0.14, 0], [0, 0.5, 0],
  [0.12, 0, 0], [0, -0.4, 0], [0, -0.38, 0],
  [-0.12, 0, 0], [0, -0.4, 0], [0, -0.38, 0],
  [0.3, 0.5, 0], [0, -0.3, 0], [0, -0.3, 0],
  [-0.3, 0.5, 0], [0, -0.3, 0], [0, -0.3, 0],
];
export const HIPS_Y = 0.83;
/** A pose is one local quaternion (x,y,z,w) per joint in BONES order, then the pelvis height offset and forward shift. */
export const POSE_LEN = 15 * 4 + 2;
const HIPS_OFF_Y = 60;
const HIPS_OFF_Z = 61;
export type Pose = Float32Array;
export const POSE_HIPS_Y = HIPS_OFF_Y;
export const POSE_HIPS_Z = HIPS_OFF_Z;
/** All joints at rest (identity rotations, no pelvis offset). */
export function resetPose(p: Pose): Pose {
  p.fill(0);
  for (let i = 0; i < 15; i++) p[i * 4 + 3] = 1;
  return p;
}
export const newPose = (): Pose => resetPose(new Float32Array(POSE_LEN));

// ---------------------------------------------------------------------------------------------
// Instanced renderer: one InstancedMesh per rigid joint group (so ~13 draw calls for every human).
// ---------------------------------------------------------------------------------------------
interface PartSpec { c: [number, number, number]; s: [number, number, number]; color?: number }
interface MeshSpec { name: string; joints: number[]; parts: PartSpec[]; shared?: boolean }

const MESHES: MeshSpec[] = [
  { name: 'pelvis', joints: [J.hips], parts: [{ c: [0, -0.02, 0], s: [0.3, 0.2, 0.2] }] },
  { name: 'torso', joints: [J.torso], parts: [
    { c: [0, -0.07, 0], s: [0.28, 0.14, 0.19] }, { c: [0, 0.25, 0], s: [0.4, 0.5, 0.23] }, { c: [0, 0.44, 0], s: [0.62, 0.12, 0.2] },
    { c: [0, -0.1, 0], s: [0.31, 0.06, 0.21], color: 0x3a3a3a }, // utility belt
  ] },
  { name: 'head', joints: [J.head], parts: [{ c: [0, 0.03, 0], s: [0.09, 0.06, 0.09] }, { c: [0, 0.2, 0], s: [0.26, 0.28, 0.26] }] },
  { name: 'hair', joints: [J.head], parts: [{ c: [0, 0.34, -0.01], s: [0.28, 0.1, 0.28] }, { c: [0, 0.22, -0.12], s: [0.28, 0.22, 0.06] }] },
  { name: 'cap', joints: [J.head], parts: [{ c: [0, 0.35, 0], s: [0.3, 0.1, 0.3] }, { c: [0, 0.29, 0.17], s: [0.26, 0.025, 0.14], color: 0x2a2a2a }] },
  { name: 'armU', joints: [J.shL, J.shR], parts: [{ c: [0, -0.15, 0], s: [0.12, 0.3, 0.12] }] },
  { name: 'armF', joints: [J.elL, J.elR], parts: [{ c: [0, -0.15, 0], s: [0.1, 0.3, 0.1] }, { c: [0, -0.34, 0], s: [0.11, 0.1, 0.11] }] },
  { name: 'thigh', joints: [J.hipL, J.hipR], parts: [{ c: [0, -0.2, 0], s: [0.16, 0.4, 0.16] }] },
  { name: 'shin', joints: [J.kneeL, J.kneeR], parts: [{ c: [0, -0.19, 0], s: [0.14, 0.38, 0.14] }] },
  { name: 'foot', joints: [J.ankL, J.ankR], parts: [{ c: [0, -0.015, 0.06], s: [0.13, 0.07, 0.26] }] },
];

function partGeometry(spec: MeshSpec): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (const p of spec.parts) b.box(p.s[0], p.s[1], p.s[2], p.c[0], p.c[1], p.c[2], p.color ?? 0xffffff);
  return b.build();
}

/** Weapons have the grip at the origin and their length along +y, like model_check's hand items. */
function weaponGeometry(kind: 'bat' | 'baton'): THREE.BufferGeometry {
  const b = new MeshBuilder();
  if (kind === 'bat') {
    b.cylinder(0.022, 0.022, 0.22, 6, 0, 0.06, 0, 0x1a1a1a);   // grip tape
    b.cylinder(0.028, 0.05, 0.62, 7, 0, 0.47, 0, 0xd8a868);     // barrel
  } else {
    b.cylinder(0.026, 0.026, 0.55, 6, 0, 0.24, 0, 0x16161c);
    b.cylinder(0.034, 0.034, 0.1, 6, 0, -0.02, 0, 0x333340);
  }
  return b.build();
}

/** Palette for one character. */
export interface Look { shirt: number; pants: number; skin: number; shoe: number; hair: number; cap: boolean }

export class CharacterRenderer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private weapons: Record<'bat' | 'baton', THREE.InstancedMesh>;
  private partLocal: THREE.Matrix4[][] = [];
  private world: THREE.Matrix4[] = BONES.map(() => new THREE.Matrix4());
  private localM = new THREE.Matrix4();
  private base = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private pivot = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private one = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private col = new THREE.Color();
  private white = new THREE.Color(0xffffff);
  // model_check holds right-hand items tilted "blade up and a little forward from the forearm"
  private grip = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.003, -0.09, -0.002),
    new THREE.Quaternion(0.7931, -0.1585, 0.1425, 0.5706),
    new THREE.Vector3(1, 1, 1),
  );

  constructor(readonly count: number) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (const spec of MESHES) {
      const mesh = new THREE.InstancedMesh(partGeometry(spec), mat, count * spec.joints.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = spec.name !== 'hair' && spec.name !== 'cap';
      for (let i = 0; i < mesh.count; i++) { mesh.setMatrixAt(i, this.zero); mesh.setColorAt(i, this.white); }
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.partLocal.push([new THREE.Matrix4()]);
    }
    const wmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.weapons = {
      bat: new THREE.InstancedMesh(weaponGeometry('bat'), wmat, count),
      baton: new THREE.InstancedMesh(weaponGeometry('baton'), wmat, count),
    };
    for (const w of Object.values(this.weapons)) {
      w.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      w.frustumCulled = false;
      w.castShadow = true;
      for (let i = 0; i < count; i++) w.setMatrixAt(i, this.zero);
      this.group.add(w);
    }
  }

  private meshIndex(name: string): number {
    return MESHES.findIndex((m) => m.name === name);
  }

  /** Paint a character's instances (dirty flag flushed in `finish`). */
  setLook(slot: number, look: Look, flash = 0): void {
    const f = (c: number) => {
      this.col.setHex(c);
      if (flash > 0) this.col.lerp(this.white, Math.min(1, flash * 7));
      return this.col;
    };
    const set = (name: string, c: number) => {
      const mi = this.meshIndex(name);
      const mesh = this.meshes[mi];
      const per = MESHES[mi].joints.length;
      for (let k = 0; k < per; k++) mesh.setColorAt(slot * per + k, f(c));
    };
    set('pelvis', look.pants); set('torso', look.shirt); set('head', look.skin); set('hair', look.hair); set('cap', 0x23386b);
    set('armU', look.shirt); set('armF', look.skin); set('thigh', look.pants); set('shin', look.pants); set('foot', look.shoe);
    this.colorsDirty = true;
  }
  private colorsDirty = false;

  hide(slot: number): void {
    for (let mi = 0; mi < MESHES.length; mi++) {
      const per = MESHES[mi].joints.length;
      for (let k = 0; k < per; k++) this.meshes[mi].setMatrixAt(slot * per + k, this.zero);
    }
    this.weapons.bat.setMatrixAt(slot, this.zero);
    this.weapons.baton.setMatrixAt(slot, this.zero);
  }

  /**
   * FK for one character and write all part instances.
   * `lie` rotates the whole body about the hips (knockdown), `weapon` 0 none / 1 bat / 2 baton.
   */
  draw(slot: number, x: number, y: number, z: number, heading: number, scale: number, lie: number, pose: Pose, hasCap: boolean, weapon: number, weaponScale = 1): void {
    // base transform: root position, facing, and a hips-pivoted lie rotation
    this.q.setFromEuler(this.e.set(0, heading, 0));
    this.base.compose(this.p.set(x, y - Math.abs(Math.sin(lie)) * 0.62 * scale, z), this.q, this.s.setScalar(scale));
    if (lie !== 0) {
      this.pivot.makeTranslation(0, HIPS_Y, 0);
      this.base.multiply(this.pivot);
      this.q.setFromEuler(this.e.set(lie, 0, 0));
      this.tmp.compose(this.p.set(0, 0, 0), this.q, this.one);
      this.base.multiply(this.tmp);
      this.pivot.makeTranslation(0, -HIPS_Y, 0);
      this.base.multiply(this.pivot);
    }
    for (let i = 0; i < BONES.length; i++) {
      const r = REST[i];
      const oy = i === 0 ? pose[HIPS_OFF_Y] : 0;
      const oz = i === 0 ? pose[HIPS_OFF_Z] : 0;
      this.q.fromArray(pose, i * 4);
      this.localM.compose(this.p.set(r[0], r[1] + oy, r[2] + oz), this.q, this.one);
      const parent = PARENT_IDX[i];
      this.world[i].copy(parent < 0 ? this.base : this.world[parent]).multiply(this.localM);
    }
    for (let mi = 0; mi < MESHES.length; mi++) {
      const spec = MESHES[mi];
      const mesh = this.meshes[mi];
      const per = spec.joints.length;
      if (spec.name === 'cap' && !hasCap) { mesh.setMatrixAt(slot, this.zero); continue; }
      if (spec.name === 'hair' && hasCap) { mesh.setMatrixAt(slot, this.zero); continue; }
      for (let k = 0; k < per; k++) mesh.setMatrixAt(slot * per + k, this.world[spec.joints[k]]);
    }
    const wb = this.weapons.bat, wt = this.weapons.baton;
    if (weapon > 0) {
      this.tmp.copy(this.world[J.wrR]).multiply(this.grip);
      if (weaponScale !== 1) this.tmp.scale(this.s.setScalar(weaponScale));
      (weapon === 1 ? wb : wt).setMatrixAt(slot, this.tmp);
      (weapon === 1 ? wt : wb).setMatrixAt(slot, this.zero);
    }
    else { wb.setMatrixAt(slot, this.zero); wt.setMatrixAt(slot, this.zero); }
  }

  /** World matrix of the right-hand weapon socket (valid after `draw`). */
  socketPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixPosition(this.world[J.wrR]);
  }

  finish(): void {
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (this.colorsDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.weapons.bat.instanceMatrix.needsUpdate = true;
    this.weapons.baton.instanceMatrix.needsUpdate = true;
    this.colorsDirty = false;
  }
}
