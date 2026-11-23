import type { Game } from './game';
import { bi } from './i18n';

export const SKILLS = ['driving', 'shooting', 'fighting', 'charm', 'stealth'] as const;
export type Skill = typeof SKILLS[number];
export const SKILL_NAMES: Record<Skill, [string, string]> = {
  driving: ['Driving', '운전'], shooting: ['Shooting', '사격'], fighting: ['Fighting', '격투'], charm: ['Charm', '말발'], stealth: ['Stealth', '은신'],
};
export const SKILL_EFFECT: Record<Skill, [string, string]> = {
  driving: ['takes less crash damage', '충돌 피해 감소'], shooting: ['more bullet damage', '총알 피해 증가'], fighting: ['harder punches', '더 센 주먹'],
  charm: ['cheaper prices', '물건 값 할인'], stealth: ['less heat from crimes', '범죄 열기 감소'],
};
/** Experience needed for levels 1 to 5. */
export const LEVELS = [40, 120, 280, 560, 1000];

/**
 * Skills grow by use: drive to improve driving, shoot to improve shooting, fight, talk and shop to improve charm, get away with things to improve
 * stealth. Each level (up to 5) gives a small, permanent edge. Experience is saved.
 */
export class Skills {
  /** Switches every bonus and all experience off (for tests that count dollars and damage exactly). */
  off = false;
  private lastDrive = 0;
  private fightT = 0;

  constructor(private game: Game) {
    const bus = game.bus;
    bus.on('gunshot', () => this.add('shooting', 1));
    bus.on('wantedLost', () => this.add('stealth', 14));
    bus.on('turfCaptured', () => { this.add('fighting', 40); this.add('charm', 10); });
    bus.on('helped', () => this.add('charm', 3));
    bus.on('civRunOver', () => this.add('driving', 1));
  }

  xp(s: Skill): number { return this.game.save.skills?.[s] ?? 0; }

  level(s: Skill): number {
    const x = this.xp(s);
    let l = 0;
    for (const t of LEVELS) if (x >= t) l++;
    return l;
  }

  /** 0..1 progress to the next level (1 at the top). */
  progress(s: Skill): number {
    const l = this.level(s);
    if (l >= LEVELS.length) return 1;
    const lo = l === 0 ? 0 : LEVELS[l - 1];
    return (this.xp(s) - lo) / (LEVELS[l] - lo);
  }

  add(s: Skill, n: number): void {
    if (n <= 0 || this.off) return;
    const G = this.game;
    const before = this.level(s);
    const sk = (G.save.skills ??= {});
    sk[s] = (sk[s] ?? 0) + n;
    const after = this.level(s);
    if (after > before) {
      G.hud.toast(`${bi(SKILL_NAMES[s][0], SKILL_NAMES[s][1])} ${bi('level', '레벨')} ${after}! ${bi(SKILL_EFFECT[s][0], SKILL_EFFECT[s][1])}`, 3200);
      G.audio.cash();
    }
  }

  /** A melee hit by the player (called from the combat hook). */
  fought(): void { this.add('fighting', 1); }

  /** Bonuses the rest of the game reads. */
  get crashGuard(): number { return this.off ? 1 : 1 - 0.06 * this.level('driving'); }
  get gunMul(): number { return this.off ? 1 : 1 + 0.05 * this.level('shooting'); }
  get punchMul(): number { return this.off ? 1 : 1 + 0.04 * this.level('fighting'); }
  get priceMul(): number { return this.off ? 1 : 1 - 0.03 * this.level('charm'); }
  get heatMul(): number { return this.off ? 1 : 1 - 0.05 * this.level('stealth'); }

  update(dt: number): void {
    const G = this.game;
    // driving earns experience by the distance driven
    const dm = G.progress.stats.driveM;
    if (this.lastDrive === 0) this.lastDrive = dm; // start counting from where the save left off
    else if (dm - this.lastDrive >= 100) { this.add('driving', Math.floor((dm - this.lastDrive) / 100)); this.lastDrive = dm; }
    G.humans.skillPower = this.punchMul;
    this.fightT = Math.max(0, this.fightT - dt);
  }
}
