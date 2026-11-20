import { J, rx, ry, rz, setHipsY, type Pose } from './characters';
import { ATTACKS, St, type Attack } from './combat';

export interface AnimInput {
  state: number;
  speed: number;
  phase: number;
  time: number;
  attack: Attack | null;
  /** 0 wind-up, 1 active, 2 recovery. */
  atkPhase: number;
  /** Progress through the current attack phase, 0..1. */
  atkU: number;
  weapon: number;
  airborne: boolean;
  stateT: number;
  stateDur: number;
  fleeing: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function splayed(t: Pose, k: number): void {
  rz(t, J.shL, 1.2 * k); rz(t, J.shR, -1.2 * k);
  rx(t, J.shL, -0.3 * k); rx(t, J.shR, -0.3 * k);
  rz(t, J.hipL, 0.3 * k); rz(t, J.hipR, -0.3 * k);
  rx(t, J.kneeL, 0.2 * k); rx(t, J.kneeR, 0.2 * k);
}

function locomotion(t: Pose, a: AnimInput): void {
  const run = a.speed > 6.2;
  if (a.speed > 0.4) {
    const s = Math.sin(a.phase);
    const c = Math.cos(a.phase);
    const legAmp = run ? 1.13 : 0.61;
    const armAmp = run ? 0.96 : 0.44;
    rx(t, J.hipL, s * legAmp); rx(t, J.hipR, -s * legAmp);
    rx(t, J.kneeL, Math.max(0, c) * (run ? 1.5 : 0.55)); rx(t, J.kneeR, Math.max(0, -c) * (run ? 1.5 : 0.55));
    rx(t, J.shL, -s * armAmp); rx(t, J.shR, s * armAmp);
    if (run) { rx(t, J.elL, -1.25); rx(t, J.elR, -1.25); rx(t, J.torso, 0.24); }
    setHipsY(t, (run ? -0.05 : 0) + Math.abs(s) * (run ? 0.07 : 0.035));
  } else {
    const b = Math.sin(a.time * 2.5);
    setHipsY(t, b * 0.03);
    rz(t, J.shL, 0.07 + b * 0.02); rz(t, J.shR, -0.07 - b * 0.02);
    rx(t, J.torso, b * 0.015);
  }
  if (a.fleeing) { rx(t, J.shL, -2.4); rx(t, J.shR, -2.0); }
  if (a.weapon > 0 && !a.fleeing) { rx(t, J.shR, -0.5); rx(t, J.elR, -0.95); }
  if (a.airborne) {
    rx(t, J.hipL, -0.7); rx(t, J.hipR, -0.2); rx(t, J.kneeL, 1.0); rx(t, J.kneeR, 0.8);
    rx(t, J.shL, -2.2); rx(t, J.shR, -2.0); rx(t, J.torso, 0.1);
  }
}

/** Pose for one attack phase. Phase 2 (recovery) falls back to the stance so the limb returns smoothly. */
function attackPose(t: Pose, atk: Attack, phase: number, weapon: number): void {
  // stance: slight forward lean with a staggered stride
  rx(t, J.hipL, -0.22); rx(t, J.hipR, 0.22); rx(t, J.kneeL, 0.25); rx(t, J.kneeR, 0.25);
  const wind = phase === 0;
  if (phase === 2) {
    if (weapon > 0) { rx(t, J.shR, -0.5); rx(t, J.elR, -0.95); }
    return;
  }
  switch (atk.kind) {
    case 'punch': {
      if (atk.id === 'upper') {
        if (wind) { rx(t, J.shR, 0.35); rx(t, J.elR, -1.2); ry(t, J.torso, -0.5); setHipsY(t, -0.14); rx(t, J.kneeL, 0.6); rx(t, J.kneeR, 0.6); }
        else { rx(t, J.shR, -2.5); rx(t, J.elR, -0.2); rx(t, J.torso, 0.25); ry(t, J.torso, 0.7); rx(t, J.shL, 0.4); }
        break;
      }
      const left = atk.side < 0;
      const sh = left ? J.shL : J.shR, el = left ? J.elL : J.elR, other = left ? J.shR : J.shL, oel = left ? J.elR : J.elL;
      const tw = left ? 1 : -1;
      rx(t, other, -1.0); rx(t, oel, -1.6); // guard hand
      if (wind) { ry(t, J.torso, tw * 0.61); rx(t, sh, 0.5); rx(t, el, -1.1); }
      else { ry(t, J.torso, -tw * (left ? 0.45 : 0.79)); rx(t, sh, -1.55); rx(t, el, 0); rx(t, J.torso, 0.1); }
      break;
    }
    case 'kick': {
      if (wind) { rx(t, J.torso, -0.35); rx(t, J.hipR, 0.5); rx(t, J.kneeR, 1.3); rx(t, J.shL, -0.4); rx(t, J.shR, 0.4); }
      else { rx(t, J.torso, -0.3); rx(t, J.hipR, -1.45); rx(t, J.kneeR, 0.1); rx(t, J.shL, 0.9); rx(t, J.shR, -0.5); rx(t, J.hipL, 0.1); rx(t, J.kneeL, 0.3); }
      break;
    }
    case 'swing': {
      const fwd = atk.side > 0; // forehand: right-to-left
      const s = fwd ? -1 : 1;
      rx(t, J.elR, -0.3);
      rx(t, J.shL, -0.7); rx(t, J.elL, -1.1);
      if (wind) { ry(t, J.torso, s * 1.13); rx(t, J.shR, -1.45); rz(t, J.shR, fwd ? -0.35 : 0.5); }
      else { ry(t, J.torso, -s * 1.13); rx(t, J.shR, -1.5); rz(t, J.shR, fwd ? -0.1 : 0.2); rx(t, J.torso, 0.08); }
      break;
    }
  }
}

/** Fill `t` with this frame's target joint rotations for the given state. */
export function computePose(t: Pose, a: AnimInput): void {
  t.fill(0);
  switch (a.state) {
    case St.Attack:
      attackPose(t, a.attack ?? ATTACKS.jab, a.atkPhase, a.weapon);
      break;
    case St.Dodge: {
      const u = clamp01(1 - a.stateT / a.stateDur);
      rx(t, J.hips, Math.PI * 2 * u);
      rx(t, J.hipL, -1.5); rx(t, J.hipR, -1.5); rx(t, J.kneeL, 1.9); rx(t, J.kneeR, 1.9);
      rx(t, J.shL, -0.9); rx(t, J.shR, -0.9); rx(t, J.elL, -1.7); rx(t, J.elR, -1.7);
      rx(t, J.torso, 0.5);
      setHipsY(t, -0.2);
      break;
    }
    case St.Hit: {
      const u = clamp01(1 - a.stateT / 0.28);
      rx(t, J.torso, -0.6 * (1 - u * 0.7)); rx(t, J.head, -0.3 * (1 - u));
      rx(t, J.shL, 0.6); rx(t, J.shR, 0.6); rx(t, J.hipL, -0.2); rx(t, J.hipR, 0.25); rx(t, J.kneeL, 0.3);
      break;
    }
    case St.Down:
    case St.Dead:
      splayed(t, 1);
      break;
    case St.GetUp: {
      const u = clamp01(1 - a.stateT / a.stateDur);
      splayed(t, 1 - u);
      break;
    }
    default:
      locomotion(t, a);
  }
}

/** Pose smoothing: current rotations chase the targets (damped blend). */
export function blendPose(cur: Pose, target: Pose, k: number): void {
  for (let i = 0; i < cur.length; i++) cur[i] += (target[i] - cur[i]) * k;
}
