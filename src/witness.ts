import type { Game } from './game';
import { bi } from './i18n';
import { Role, type Human } from './humans';

const BRIBE = 40;

/**
 * Silencing a witness. A civilian who saw a crime spends five seconds phoning the police. Walk up to them while they are on the phone and press
 * F: with a gun out you scare them into dropping the call (free, but the neighbourhood thinks worse of you); without one you slip them $40 to
 * forget what they saw. Either way they hurry off without calling, and nobody gets hurt.
 */
export class Witnesses {
  constructor(private game: Game) {}

  /** The closest witness on the phone, within five metres. */
  near(): Human | null {
    const G = this.game;
    if (!G.onFoot || G.inside || G.state !== 'play') return null;
    const p = G.humans.player;
    let best: Human | null = null, bd = 5;
    for (const h of G.humans.list) {
      if (!h.active || h.role !== Role.Civ || h.calling <= 0) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  private armed(): boolean { return !!this.game.guns.current(); }

  prompt(): string {
    return this.armed()
      ? bi('[F] Scare the witness into silence', '[F] 목격자를 겁줘서 신고 막기')
      : bi(`[F] Hush money to the witness - $${BRIBE}`, `[F] 목격자 입막음 - $${BRIBE}`);
  }

  act(h: Human): void {
    const G = this.game;
    if (this.armed()) {
      G.reputation.add(h.x, h.z, -1);
      G.skills.add('stealth', 3);
      G.popups.spawn(h.x, h.y + 2.6, h.z, bi('Keep quiet!', '입 다물어!'), '#ffb347');
    } else {
      if (!G.pay(BRIBE)) return;
      G.skills.add('charm', 3);
      G.popups.spawn(h.x, h.y + 2.6, h.z, bi('I saw nothing...', '난 아무것도 못 봤어요...'), '#5ec4ff');
    }
    h.calling = 0;
    h.fleeing = true;
    G.bus.emit({ type: 'witnessSilenced', x: h.x, z: h.z });
  }
}
