import type { Game } from './game';
import { bi } from './i18n';

export type Faction = 'watch' | 'mafia';
export const FACTION_NAMES: Record<Faction, [string, string]> = { watch: ['City Watch', '시티 워치'], mafia: ['The Mafia', '더 마피아'] };

/**
 * Two factions besides the street gangs. The City Watch is the civic group (volunteers, the fire and ambulance crews, shopkeepers): it likes
 * you when you help and fall out with you when you hurt people. The Mafia is the opposite: it likes chaos and respects a strong hand, and it
 * does not forgive anyone who takes its block. Standings (-100..100) live in the same save table as district reputation and drift to zero.
 * Perks: a friendly Watch pays 15% more on emergency shifts and thief rewards; a hostile Watch will not give you a shift. A friendly Mafia
 * adds 25% to your turf income.
 */
export class Factions {
  constructor(private game: Game) {
    const bus = game.bus;
    bus.on('helped', (e) => { this.add('watch', e.amount * 1.5); this.add('mafia', -e.amount * 0.5); });
    bus.on('civAssaulted', () => { this.add('watch', -2); this.add('mafia', 1); });
    bus.on('civKilled', (e) => { if (e.byPlayer) { this.add('watch', -8); this.add('mafia', 3); } });
    bus.on('explosion', (e) => { if (e.byPlayer) { this.add('watch', -3); this.add('mafia', 1); } });
    bus.on('turfCaptured', (e) => {
      if (game.gangs.zones[e.zone]?.faction === 'mafia') { this.add('mafia', -45); this.add('watch', 15); }
      else { this.add('watch', 5); this.add('mafia', 4); }
    });
  }

  get(f: Faction): number { return this.game.save.rep?.[f] ?? 0; }
  add(f: Faction, n: number): void {
    const rep = (this.game.save.rep ??= {});
    rep[f] = Math.max(-100, Math.min(100, (rep[f] ?? 0) + n));
  }
  tier(f: Faction): 'friendly' | 'neutral' | 'hostile' {
    const r = this.get(f);
    return r >= 25 ? 'friendly' : r <= -25 ? 'hostile' : 'neutral';
  }
  /** Pay multiplier for emergency shifts and thief rewards. */
  payMult(): number { return this.tier('watch') === 'friendly' ? 1.15 : 1; }
  /** Turf income multiplier. */
  incomeMult(): number { return this.tier('mafia') === 'friendly' ? 1.25 : 1; }
  /** A hostile Watch gives you no shifts. */
  refusesShifts(): boolean { return this.tier('watch') === 'hostile'; }
  label(f: Faction): string {
    const t = this.tier(f);
    const word = t === 'friendly' ? bi('friendly', '우호') : t === 'hostile' ? bi('hostile', '적대') : bi('neutral', '중립');
    return `${bi(FACTION_NAMES[f][0], FACTION_NAMES[f][1])}: ${word} (${Math.round(this.get(f))})`;
  }
}
