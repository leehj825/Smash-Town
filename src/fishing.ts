import type { Game } from './game';
import { bi } from './i18n';

type Phase = 'idle' | 'wait' | 'bite';

/**
 * Fishing: stand at the water's edge and press F to cast, wait for the bite ("!"), then press F again quickly to reel in the fish.
 * Small fish are common, rare ones pay well. Nothing else happens - it is a quiet corner of the game.
 */
export class Fishing {
  private phase: Phase = 'idle';
  private t = 0;
  private catches = 0;
  /** A tip from Old Pete: until this time (seconds on the page clock) a quarter of the bites are rare fish. */
  luckUntil = 0;

  constructor(private game: Game) {}

  get active(): boolean { return this.phase !== 'idle'; }
  get caught(): number { return this.catches; }

  /** Is the player standing at the edge of the sea, the harbour or the river? */
  atWater(): boolean {
    const G = this.game;
    const p = G.humans.player;
    for (const l of G.world.lots) {
      if (l.district !== 'water') continue;
      const r = l.rim ?? 0;
      const minX = l.x0 + r * 0.5, maxX = l.x1 - r * 0.5, minZ = l.z0 + r * 0.5, maxZ = l.z1 - r * 0.5;
      const dx = Math.max(minX - p.x, 0, p.x - maxX), dz = Math.max(minZ - p.z, 0, p.z - maxZ);
      if (Math.hypot(dx, dz) < 3.4) return true;
    }
    return false;
  }

  prompt(): string | null {
    if (this.phase === 'wait') return bi('Waiting for a bite... ([F] to pull the line in)', '입질을 기다리는 중... ([F] 줄 걷기)');
    if (this.phase === 'bite') return bi('A BITE! Press [F] now!', '입질이에요! 지금 [F]!');
    return this.atWater() ? bi('[F] Cast a fishing line', '[F] 낚싯줄 던지기') : null;
  }

  /** Press F. Returns true if the press was used by fishing. */
  press(): boolean {
    const G = this.game;
    if (this.phase === 'idle') {
      if (!this.atWater()) return false;
      this.phase = 'wait'; this.t = 2.5 + Math.random() * 6;
      G.hud.toast(bi('You cast the line...', '낚싯줄을 던졌어요...'), 1600);
      return true;
    }
    if (this.phase === 'wait') { this.phase = 'idle'; G.hud.toast(bi('Too early - nothing yet.', '너무 일렀어요 - 아직 아무것도 없어요.'), 1600); return true; }
    // bite: reel it in
    this.phase = 'idle';
    const lucky = performance.now() / 1000 < this.luckUntil;
    const r = lucky && Math.random() < 0.25 ? 0.9 + Math.random() * 0.08 : Math.random(); // luck: a quarter of the bites are rare ones
    const fish = r < 0.6 ? { en: 'a small fish', ko: '작은 물고기', v: 25 } : r < 0.9 ? { en: 'a big fish', ko: '큰 물고기', v: 90 } : r < 0.985 ? { en: 'a rare golden fish', ko: '희귀 황금 물고기', v: 350 } : { en: 'an old boot...', ko: '낡은 장화...', v: 2 };
    const v = fish.v + Math.floor(Math.random() * fish.v * 0.3);
    G.addCash(v, 'other');
    G.progress.add('fish');
    this.catches++;
    const pl = G.humans.player;
    G.popups.spawn(pl.x, 3, pl.z, `+$${v}`, '#5ec4ff');
    G.hud.toast(`${bi('You caught', '낚았어요:')} ${bi(fish.en, fish.ko)}  $${v}`, 2400);
    G.audio.cash();
    return true;
  }

  update(dt: number): void {
    const G = this.game;
    if (this.phase === 'idle') return;
    if (G.stars > 0 || G.inside || !G.onFoot || !this.atWater()) { this.phase = 'idle'; return; }
    this.t -= dt;
    if (this.phase === 'wait' && this.t <= 0) {
      this.phase = 'bite'; this.t = 1.3;
      const pl = G.humans.player;
      G.popups.spawn(pl.x, 3.2, pl.z, '!', '#ffd23a');
      G.audio.tink();
    } else if (this.phase === 'bite' && this.t <= 0) {
      this.phase = 'idle';
      G.hud.toast(bi('It got away!', '놓쳤어요!'), 1600);
    }
  }
}
