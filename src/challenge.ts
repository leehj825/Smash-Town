import type { Game } from './game';
import { bi } from './i18n';

export type ChaosMode = 'rockets' | 'moon';

/**
 * After the story: things to do with a city you already run. The phone lists them once the story is finished (or the city is half yours).
 *  - Five-star survival: the police are set on you at full strength; stay free as long as you can. The best time is saved and every ten seconds
 *    pays $50 when it ends. Losing them for good ends it too, and counts as a win.
 *  - Chaos switches: endless rockets and grenades, and moon gravity for people and cars. They only change how the city plays; nothing is saved.
 */
export class Challenge {
  survival = false;
  time = 0;
  readonly chaos: Record<ChaosMode, boolean> = { rockets: false, moon: false };
  static gravityMul = 1;

  constructor(private game: Game) {}

  get unlocked(): boolean { return this.game.mode === 'sandbox' || this.game.story.done || this.game.completion.percent() >= 50; }
  get best(): number { return this.game.save.survivalBest ?? 0; }

  toggleChaos(m: ChaosMode): void {
    this.chaos[m] = !this.chaos[m];
    if (m === 'moon') Challenge.gravityMul = this.chaos.moon ? 0.35 : 1;
    this.game.hud.toast(`${m === 'rockets' ? bi('Endless rockets', '무한 로켓') : bi('Moon gravity', '달 중력')}: ${this.chaos[m] ? bi('ON', '켜짐') : bi('OFF', '꺼짐')}`, 1800);
  }

  startSurvival(): boolean {
    const G = this.game;
    if (this.survival || G.stars > 0 || G.inside || G.state !== 'play') return false;
    this.survival = true; this.time = 0;
    let guard = 0;
    while (G.stars < 5 && guard++ < 40) G.addHeat(40);
    G.hud.toast(bi('FIVE-STAR SURVIVAL! Stay free as long as you can.', '5성 생존 도전! 최대한 오래 버티세요.'), 3600);
    return true;
  }

  private endSurvival(won: boolean): void {
    const G = this.game;
    this.survival = false;
    G.hud.showGig(false);
    const t = Math.floor(this.time);
    const pay = Math.floor(t / 10) * 50;
    const record = t > this.best;
    if (record) G.save.survivalBest = t;
    if (pay > 0) G.addCash(pay, 'other');
    G.hud.toast(bi(`${won ? 'You lost them!' : 'Caught!'} Survived ${t}s${record ? ' - NEW RECORD' : ''}${pay ? ` · +$${pay}` : ''}`, `${won ? '따돌렸어요!' : '붙잡혔어요!'} ${t}초 버텼어요${record ? ' - 신기록' : ''}${pay ? ` · +$${pay}` : ''}`), 4200);
    G.flushSave();
  }

  update(dt: number): void {
    const G = this.game;
    // endless rockets
    if (this.chaos.rockets) for (const id of ['rocket', 'grenade'] as const) if (G.guns.has(id) && G.guns.reserve[id] < 6) G.guns.reserve[id] = 6;
    if (!this.survival) return;
    if (G.state === 'busted' || G.state === 'wrecked' || G.state === 'wasted') { this.endSurvival(false); return; }
    if (G.state !== 'play') return;
    this.time += dt;
    G.hud.showGig(true, bi('5-STAR SURVIVAL', '5성 생존'), `${bi('Best', '최고')} ${this.best}s`, `${Math.floor(this.time)}s`);
    if (G.stars === 0) this.endSurvival(true);
  }
}
