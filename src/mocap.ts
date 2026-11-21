import * as THREE from 'three';
import raw from './data/anims.json';
import { J, POSE_HIPS_Y, POSE_HIPS_Z, resetPose, type Pose } from './characters';

// Plays the motion-capture clips of the `model_check` repository (data/anims.js, Mixamo clips retargeted to the shared
// 15-joint rig; see scripts/extract-anims.mjs). A clip stores, per bone, Euler XYZ rotations per frame plus the pelvis height
// (`hipsY`, 0.9 m standing) and forward shift (`hipsZ`). Frames are converted to quaternions once; sampling slerps between them.

interface RawClip { d: number; n: number; loop: boolean; hit: number; root?: number[]; t: Record<string, number[][] | number[]> }

/** Mocap bone -> rig joint index (same mapping as model_check's mocap.js). */
const BONE_TO_JOINT: Record<string, number> = {
  hips: J.hips, spine: J.torso, head: J.head, shoulderL: J.shL, shoulderR: J.shR,
  elbowL: J.elL, elbowR: J.elR, handL: J.wrL, handR: J.wrR, hipL: J.hipL, hipR: J.hipR, kneeL: J.kneeL, kneeR: J.kneeR,
};

export interface Clip {
  d: number;
  n: number;
  loop: boolean;
  /** Seconds into the clip at which the strike/impact lands. */
  hit: number;
  tracks: { joint: number; q: Float32Array }[];
  /** Natural ground speed in m/s of a locomotion clip (from the hips travel recorded in the clip), 0 when unknown. */
  speed: number;
  y: Float32Array;
  z: Float32Array;
}

function compile(anims: Record<string, RawClip>): Record<string, Clip> {
  const clips: Record<string, Clip> = {};
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (const [name, c] of Object.entries(anims)) {
    const tracks: Clip['tracks'] = [];
    for (const [bone, joint] of Object.entries(BONE_TO_JOINT)) {
      const frames = c.t[bone] as number[][] | undefined;
      if (!frames) continue;
      const arr = new Float32Array((c.n + 1) * 4);
      frames.forEach((v, i) => {
        e.set(v[0], v[1], v[2]);
        q.setFromEuler(e);
        q.toArray(arr, i * 4);
      });
      tracks.push({ joint, q: arr });
    }
    clips[name] = {
      d: c.d, n: c.n, loop: c.loop, hit: c.hit, tracks,
      speed: c.root && c.loop ? Math.hypot(c.root[0], c.root[1]) / c.d : 0,
      y: Float32Array.from(c.t.hipsY as number[]), z: Float32Array.from(c.t.hipsZ as number[]),
    };
  }
  return clips;
}

export const CLIPS = compile(raw as unknown as Record<string, RawClip>);

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** Writes the clip at normalized time `u` (0..1; wraps for looping clips) into `out`. */
export function sampleClip(clip: Clip, u: number, out: Pose): void {
  resetPose(out);
  u = clip.loop ? u - Math.floor(u) : Math.min(1, Math.max(0, u));
  const f = u * clip.n;
  const i = Math.min(clip.n - 1, Math.floor(f));
  const k = f - i;
  const i1 = Math.min(clip.n, i + 1);
  for (const tr of clip.tracks) {
    qa.fromArray(tr.q, i * 4);
    qb.fromArray(tr.q, i1 * 4);
    qa.slerp(qb, k).toArray(out, tr.joint * 4);
  }
  // pelvis: 0.9 m in the clips is standing height; scaled like model_check does
  out[POSE_HIPS_Y] = (clip.y[i] + (clip.y[i1] - clip.y[i]) * k - 0.9) * 0.95;
  out[POSE_HIPS_Z] = clip.z[i] + (clip.z[i1] - clip.z[i]) * k;
}

/** out = a blended toward b by k (per-joint slerp). `out` may alias `a`. */
export function blendPoses(a: Pose, b: Pose, k: number, out: Pose): void {
  for (let j = 0; j < 15; j++) {
    qa.fromArray(a, j * 4);
    qb.fromArray(b, j * 4);
    qa.slerp(qb, k).toArray(out, j * 4);
  }
  out[POSE_HIPS_Y] = a[POSE_HIPS_Y] + (b[POSE_HIPS_Y] - a[POSE_HIPS_Y]) * k;
  out[POSE_HIPS_Z] = a[POSE_HIPS_Z] + (b[POSE_HIPS_Z] - a[POSE_HIPS_Z]) * k;
}

/** Per-character clip player with cross-fading between clips. */
export class AnimPlayer {
  readonly out: Pose = resetPose(new Float32Array(15 * 4 + 2));
  private snap: Pose = resetPose(new Float32Array(15 * 4 + 2));
  private tmp: Pose = resetPose(new Float32Array(15 * 4 + 2));
  private current = '';
  private fade = 1;
  private fadeDur = 0.15;

  get clipName(): string { return this.current; }

  /** Pose the character from clip `name` at normalized time `u`, cross-fading when the clip changes. */
  play(name: string, u: number, dt: number, fadeDur = 0.15): void {
    const clip = CLIPS[name] ?? CLIPS.idle;
    if (name !== this.current) {
      this.snap.set(this.out);
      this.current = name;
      this.fade = 0;
      this.fadeDur = Math.max(0.001, fadeDur);
    }
    sampleClip(clip, u, this.tmp);
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      const k = this.fade * this.fade * (3 - 2 * this.fade);
      blendPoses(this.snap, this.tmp, k, this.out);
    } else {
      this.out.set(this.tmp);
    }
  }
}
