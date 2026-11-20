/** Melee move table: wind-up / active / recovery timings, reach, arc, damage and knockback (GDD section 4.3). */
export type AttackKind = 'punch' | 'kick' | 'swing';

export interface Attack {
  id: 'jab' | 'cross' | 'upper' | 'kick' | 'swing1' | 'swing2';
  kind: AttackKind;
  wind: number;
  act: number;
  rec: number;
  reach: number;
  /** Cone angle in degrees. */
  arc: number;
  dmg: number;
  /** Horizontal knockback (m/s) and vertical launch (m/s). */
  push: number;
  up: number;
  /** Forward lunge speed while active. */
  lunge: number;
  /** Hit-stop in seconds. */
  stop: number;
  /** Always knocks the target down. */
  heavy: boolean;
  /** Can smash street props. */
  smash: boolean;
  /** Which arm / swing direction: -1 = left, +1 = right (swing: +1 forehand, -1 backhand). */
  side: -1 | 1;
  popup: 'pow' | 'wham' | 'smash';
}

export const ATTACKS: Record<Attack['id'], Attack> = {
  jab:    { id: 'jab',    kind: 'punch', wind: 0.07, act: 0.08, rec: 0.14, reach: 1.4,  arc: 70,  dmg: 15, push: 2.5,  up: 0, lunge: 3.5, stop: 0.025, heavy: false, smash: false, side: -1, popup: 'pow' },
  cross:  { id: 'cross',  kind: 'punch', wind: 0.08, act: 0.09, rec: 0.16, reach: 1.5,  arc: 75,  dmg: 20, push: 4.0,  up: 0, lunge: 3.5, stop: 0.025, heavy: false, smash: false, side: 1,  popup: 'pow' },
  upper:  { id: 'upper',  kind: 'punch', wind: 0.12, act: 0.10, rec: 0.24, reach: 1.6,  arc: 85,  dmg: 35, push: 7.5,  up: 4, lunge: 3.5, stop: 0.03,  heavy: true,  smash: false, side: 1,  popup: 'wham' },
  kick:   { id: 'kick',   kind: 'kick',  wind: 0.13, act: 0.10, rec: 0.25, reach: 1.75, arc: 65,  dmg: 30, push: 10.0, up: 1.5, lunge: 1.5, stop: 0.035, heavy: true,  smash: true,  side: 1,  popup: 'wham' },
  swing1: { id: 'swing1', kind: 'swing', wind: 0.11, act: 0.11, rec: 0.22, reach: 2.2,  arc: 130, dmg: 45, push: 8.5,  up: 0, lunge: 1.0, stop: 0.045, heavy: false, smash: true,  side: 1,  popup: 'wham' },
  swing2: { id: 'swing2', kind: 'swing', wind: 0.10, act: 0.11, rec: 0.26, reach: 2.3,  arc: 140, dmg: 55, push: 10.5, up: 2, lunge: 1.0, stop: 0.045, heavy: true,  smash: true,  side: -1, popup: 'smash' },
};

export const PUNCH_COMBO: Attack['id'][] = ['jab', 'cross', 'upper'];
export const SWING_COMBO: Attack['id'][] = ['swing1', 'swing2'];

/** Character states. */
export const St = {
  Idle: 0, Walk: 1, Run: 2, Attack: 3, Dodge: 4, Hit: 5, Down: 6, GetUp: 7, Dead: 8,
} as const;

export const DODGE = { speed: 11.5, dur: 0.32, iframes: 0.24, cooldown: 0.5 };
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 8.2;
export const JUMP_VY = 7.5;
export const GRAVITY = 22;
