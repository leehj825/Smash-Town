import type { Game } from './game';

/**
 * Game feel that costs nothing in triangles: a white flash and a freeze-frame when something blows up close by, a red flash when you are hurt,
 * and (in hud.ts and style.css) the red-and-blue screen edge from three wanted stars. The shockwave ring itself lives in vfx.ts.
 */
export class Juice {
  private boom = document.getElementById('boomflash');
  private hurt = document.getElementById('hurtflash');
  private lastHp = -1;

  constructor(private game: Game) {
    game.bus.on('explosion', (e) => {
      const d = Math.hypot(e.x - game.focusX, e.z - game.focusZ);
      if (d < 45) {
        this.restart(this.boom);
        if (d < 22) game.hitStop = Math.max(game.hitStop, 0.05);
      }
    });
  }

  private restart(el: HTMLElement | null): void {
    if (!el) return;
    el.classList.remove('go');
    void el.offsetWidth; // restart the animation
    el.classList.add('go');
  }

  update(): void {
    const G = this.game;
    const hp = G.humans.player.hp;
    if (this.lastHp >= 0 && hp < this.lastHp - 3 && G.state === 'play') this.restart(this.hurt);
    this.lastHp = hp;
  }
}
