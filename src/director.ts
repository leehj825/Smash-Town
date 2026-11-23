import type { Game } from './game';
import { TRUCK_STAGE } from './progression';

/**
 * The director. Nobody sees it. If the player has been driving or walking about for a minute and a half with nothing going on (no wanted level, no
 * job, no race, no fight), it throws one thing into view: a bag snatcher, a street fire, a riot down the road, or a cash truck rolling by. It
 * waits at least two and a half minutes between throws and stays quiet when the player is busy, inside a building or in a menu. It follows the
 * game clock's `auto` switch, so a test that sets the time by hand is never surprised by it.
 */
export class Director {
  quiet = 0;
  private cooldown = 60;
  /** What it threw last (for tests and the stats screen). */
  last = '';
  throws = 0;

  constructor(private game: Game) {}

  /** Is something going on that keeps the player busy? */
  busy(): boolean {
    const G = this.game;
    return !!(G.stars > 0 || G.inside !== null || G.state !== 'play' || G.gigs.active || G.race.active || G.taxi.active || G.delivery.active
      || G.truckHeist.active || G.jobOnDuty(null) || G.thieves.active || !!G.riots.current || G.fires.list.length > 0 || G.humans.inCombat() || G.fishing.active);
  }

  /** Throw one event now (used by the timer, and by tests with a chosen kind). */
  throwOne(kind?: 'thief' | 'fire' | 'riot' | 'truck'): boolean {
    const G = this.game;
    const stage = G.progression.stage();
    const pick = kind ?? ((): 'thief' | 'fire' | 'riot' | 'truck' => {
      // a newcomer only meets small trouble; the cash truck waits for a name
      const r = Math.random();
      if (stage < 2) return r < 0.6 ? 'thief' : 'fire';
      if (stage < TRUCK_STAGE) return r < 0.5 ? 'thief' : r < 0.8 ? 'fire' : 'riot';
      return r < 0.4 ? 'thief' : r < 0.65 ? 'fire' : r < 0.82 ? 'riot' : 'truck';
    })();
    let ok = false;
    const ahead = (d: number) => {
      const h = G.driving && !G.onFoot ? G.driving.ctrl.heading : G.humans.player.heading;
      return { x: G.focusX + Math.sin(h) * d, z: G.focusZ + Math.cos(h) * d };
    };
    if (pick === 'thief') ok = G.thieves.start();
    else if (pick === 'fire') { const p = ahead(80); G.fires.ignite(p.x, p.z); ok = true; }
    else if (pick === 'riot') { const p = ahead(130); ok = G.riots.start(p.x, p.z); }
    else ok = G.truckHeist.start(true);
    if (ok) { this.last = pick; this.throws++; }
    return ok;
  }

  update(dt: number): void {
    const G = this.game;
    if (!G.clock.auto) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.busy()) { this.quiet = 0; return; }
    this.quiet += dt;
    if (this.quiet >= 90 && this.cooldown <= 0) {
      if (this.throwOne()) { this.quiet = 0; this.cooldown = 150; } else this.quiet = 70; // nothing suitable right now: try again in twenty seconds
    }
  }
}
