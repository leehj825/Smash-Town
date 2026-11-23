import type { Game } from './game';
import { bi, t } from './i18n';

/**
 * The consequences of crimes against civilians: heat, witnesses who phone the police, and the text above the victim. It only listens to the
 * event bus, so whatever causes a crime (a punch, a gun, a car) never has to know about any of this.
 */
export class Crime {
  constructor(private game: Game) {
    const bus = game.bus;
    bus.on('civKilled', (e) => {
      const G = this.game;
      if (e.byPlayer) {
        G.addHeat(20);
        if (G.stars === 0 && G.humans.startWitnesses(e.x, e.z, 30, 3) === 0) G.popups.spawn(e.x, e.human.y + 3, e.z, bi('No witnesses', '목격자 없음'), '#9aa0ad');
      }
      if (e.kids) G.popups.spawn(e.x, e.human.y + 2.2, e.z, t('pop.ko'), '#8a5cd6');
      else G.popups.spawn(e.x, e.human.y + 2.2, e.z, bi('Murder!', '살인!'), '#ff3b3b');
    });
    bus.on('civAssaulted', (e) => {
      const G = this.game;
      if (G.stars === 0 && Math.random() < 0.5) G.humans.startWitnesses(e.x, e.z, 22, 1);
    });
    // blowing things up in the street counts as a crime if people are close enough to see it
    bus.on('explosion', (e) => {
      const G = this.game;
      if (!e.byPlayer) return;
      if (Math.hypot(e.x - G.focusX, e.z - G.focusZ) < 60) G.addHeat(15);
    });
    bus.on('civRunOver', (e) => {
      const G = this.game;
      if (G.stars === 0) G.humans.startWitnesses(e.x, e.z, 30, 3);
    });
  }
}
