import type { Game } from './game';
import { bi } from './i18n';

export interface Riot { x: number; z: number; t: number; fireT: number; fires: number }

/**
 * Street unrest. Every ten minutes or so (sooner at night and in the rush) a crowd boils over somewhere: the people nearby run, smoke rises, and
 * every 25 seconds something is set alight. A police patrol that reaches the scene calms it (the patrol job gets the call from the event bus). If
 * nobody does, it burns out after 100 seconds and the district holds it against you. The fires it starts are fire-crew calls too, so one
 * incident leads to the next: riot, fires, news, a rival crew's reaction.
 */
export class Riots {
  current: Riot | null = null;
  private timer = 520;
  private smokeT = 0;
  private sweepT = 0;

  constructor(private game: Game) {}

  markers(): { x: number; z: number }[] { return this.current ? [{ x: this.current.x, z: this.current.z }] : []; }

  /** Start unrest at a point (also used by tests). */
  start(x: number, z: number): boolean {
    if (this.current) return false;
    const G = this.game;
    this.current = { x, z, t: 100, fireT: 12, fires: 0 };
    G.bus.emit({ type: 'riot', x, z });
    G.hud.toast(bi('Riot! A crowd has boiled over - see the map.', '폭동이에요! 군중이 폭발했어요 - 지도를 보세요.'), 3600);
    G.audio.tink();
    return true;
  }

  /** The crowd calms down (a patrol arrived). Returns true if there was a riot near this point. */
  quell(x: number, z: number, r = 40): boolean {
    const c = this.current;
    if (!c || Math.hypot(c.x - x, c.z - z) > r) return false;
    const G = this.game;
    this.current = null;
    this.timer = 480 + Math.random() * 300;
    G.factions.add('watch', 6); G.factions.add('mafia', -3);
    G.popups.spawn(c.x, 3, c.z, bi('Calm restored', '진정됐어요'), '#4a7bff');
    G.hud.toast(bi('The crowd calms down. The Watch is grateful.', '군중이 진정됐어요. 시티 워치가 고마워해요.'), 3000);
    return true;
  }

  private randomSpot(): { x: number; z: number } | null {
    const G = this.game;
    const segs = G.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    for (let tries = 0; tries < 40; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - G.focusX, s.z - G.focusZ);
      if (d > 110 && d < 300) return { x: s.x, z: s.z };
    }
    return null;
  }

  update(dt: number): void {
    const G = this.game;
    if (G.mode === 'kids') return;
    if (G.state !== 'play') return;
    const c = this.current;
    if (!c) {
      if (G.inside) return;
      if (!G.clock.auto) return; // automated tests start events by hand
      this.timer -= dt * G.clock.trouble();
      if (this.timer <= 0) { const p = this.randomSpot(); if (p) this.start(p.x, p.z); else this.timer = 30; }
      return;
    }
    c.t -= dt;
    this.smokeT -= dt; this.sweepT -= dt;
    if (this.smokeT <= 0 && Math.hypot(c.x - G.focusX, c.z - G.focusZ) < 170) { this.smokeT = 0.4; G.vfx.emitSmoke(c.x + (Math.random() - 0.5) * 8, 1.5, c.z + (Math.random() - 0.5) * 8, true, 1); }
    // the crowd around it runs
    if (this.sweepT <= 0) {
      this.sweepT = 2;
      for (const h of G.humans.list) if (h.active && !h.named && !h.gang && !h.ally && h.role === 0 && Math.hypot(h.x - c.x, h.z - c.z) < 45) h.fleeing = true;
    }
    c.fireT -= dt;
    if (c.fireT <= 0 && c.fires < 3) {
      c.fireT = 25; c.fires++;
      G.fires.ignite(c.x + (Math.random() - 0.5) * 14, c.z + (Math.random() - 0.5) * 14);
    }
    if (c.t <= 0) {
      this.current = null;
      this.timer = 600;
      G.reputation.add(c.x, c.z, -4);
      G.factions.add('mafia', 4);
      G.hud.toast(bi('The riot burned itself out. The district blames you for doing nothing.', '폭동이 저절로 잦아들었어요. 동네에서는 아무도 안 도왔다고 원망해요.'), 3200);
    }
  }
}
