import type { VehicleStats } from './vehicle';

// Garage progression: per-car tuning, paint and neon, and on-foot training. Prices in dollars.

export type UpKey = 'engine' | 'nitro' | 'armor' | 'grip';
export const UP_KEYS: UpKey[] = ['engine', 'nitro', 'armor', 'grip'];
export const MAX_LEVEL = 3;
export const UP_PRICES: Record<UpKey, number[]> = {
  engine: [1500, 3500, 8000],
  nitro: [1000, 2500, 6000],
  armor: [1500, 3500, 8000],
  grip: [1000, 2500, 6000],
};
export const UP_NAMES: Record<UpKey, [string, string]> = {
  engine: ['Engine', '엔진'], nitro: ['Nitro', '니트로'], armor: ['Armor', '장갑'], grip: ['Tires', '타이어'],
};
export const UP_DESC: Record<UpKey, [string, string]> = {
  engine: ['+4% top speed, +8% acceleration per level', '레벨당 최고속도 +4%, 가속 +8%'],
  nitro: ['Longer boosts, faster recharge', '더 긴 부스트, 빠른 충전'],
  armor: ['-14% damage taken per level', '레벨당 받는 피해 -14%'],
  grip: ['+5% grip per level', '레벨당 접지력 +5%'],
};

export type BodyKey = 'health' | 'power' | 'speed';
export const BODY_KEYS: BodyKey[] = ['health', 'power', 'speed'];
export const BODY_PRICES: Record<BodyKey, number[]> = {
  health: [800, 2000, 5000],
  power: [1000, 2500, 6000],
  speed: [800, 2000, 4500],
};
export const BODY_NAMES: Record<BodyKey, [string, string]> = { health: ['Toughness', '체력'], power: ['Punch power', '펀치 힘'], speed: ['Running speed', '달리기 속도'] };
export const BODY_DESC: Record<BodyKey, [string, string]> = {
  health: ['+20 max HP per level', '레벨당 최대 체력 +20'],
  power: ['+15% melee damage per level', '레벨당 근접 피해 +15%'],
  speed: ['+5% walk and sprint speed per level', '레벨당 이동 속도 +5%'],
};

export const PAINTS: number[] = [0xe85a4f, 0x3b82f6, 0x2fb87a, 0xf2a73b, 0x8a5cd6, 0xf4a7b9, 0x66d1c9, 0xeceff4, 0x23262f, 0xff2a55];
export const PAINT_PRICE = 200;
export const NEONS: number[] = [0x00e5ff, 0xff2bd6, 0x7dff3a, 0xffd23a];
export const NEON_PRICE = 600;

export interface CarProgress { up: number[]; paint: number; neon: number } // levels per UP_KEYS; 0 = default / none
export interface BodyProgress { health: number; power: number; speed: number }

export const emptyCar = (): CarProgress => ({ up: [0, 0, 0, 0], paint: 0, neon: 0 });
export const emptyBody = (): BodyProgress => ({ health: 0, power: 0, speed: 0 });

export function tunedStats(base: VehicleStats, up: number[]): VehicleStats {
  const [e, , a, g] = up;
  return { ...base, maxSpeed: base.maxSpeed * (1 + 0.04 * e), accel: base.accel * (1 + 0.08 * e), dmg: base.dmg * (1 - 0.14 * a), grip: base.grip * (1 + 0.05 * g) };
}
export const nitroEfficiency = (up: number[]): number => 1 + 0.25 * up[1];

/** Heat-clearing respray price: $500 at one star up to $2,500 at five. */
export const resprayCost = (stars: number): number => 500 * Math.max(1, stars);
/** Bail after a bust or wreck: free under $500, otherwise a share of the cash with sensible limits. */
export function fineFor(cash: number, share: number, cap: number): number {
  if (cash < 500) return 0;
  return Math.min(Math.round(cash), Math.max(100, Math.min(cap, Math.round(cash * share))));
}
