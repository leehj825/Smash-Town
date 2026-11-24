import type { Game } from './game';
import { Role } from './humans';
import { St } from './combat';
import { bi } from './i18n';

const FRIENDLY: [string, string][] = [['Thanks for what you did!', '해 준 일 고마워요!'], ['Hey, it is you! Old Town is lucky to have you.', '어, 당신이네요! 올드타운은 운이 좋아요.'], ['Keep it up, hero!', '계속 힘내요, 영웅!']];
const HOSTILE: [string, string][] = [['You again... stay away from here.', '또 당신이야... 여기서 떨어져요.'], ['Look what trouble brought.', '말썽꾸러기가 왔네.'], ['Somebody call the Watch!', '누가 시티 워치 좀 불러요!']];

/**
 * The street answers you. In the story mode, once the opening is over, a passer-by close to you now and then says a word that depends on how the
 * district feels about you (your standing there): thanks in a friendly one, scorn in a hostile one, nothing in between. A small, free way of
 * making what you did show.
 */
export class StreetVoices {
  private t = 6;

  constructor(private game: Game) {}

  update(dt: number): void {
    const G = this.game;
    if (G.mode !== 'story' || !G.sideOpen || G.state !== 'play' || G.inside) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 7 + Math.random() * 6;
    if (G.driving && !G.onFoot && G.driving.ctrl.speed > 5) return;
    const p = G.humans.player;
    let best = null as null | { x: number; y: number; z: number }, bd = 7;
    for (const h of G.humans.list) {
      if (!h.active || h.role !== Role.Civ || h.named || h.ally || h.gang || h.thief || h.fleeing || h.state !== St.Walk) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return;
    const tier = G.reputation.tier(best.x, best.z);
    if (tier === 'neutral') return;
    const list = tier === 'friendly' ? FRIENDLY : HOSTILE;
    const [en, ko] = list[Math.floor(Math.random() * list.length)];
    G.popups.spawn(best.x, best.y + 2.7, best.z, bi(en, ko), tier === 'friendly' ? '#7dff9a' : '#ff8a7a');
  }
}
