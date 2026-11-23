import type { Game } from './game';
import { bi } from './i18n';
import { St } from './combat';
import { Role, type Human } from './humans';

/**
 * Bag snatchers. Now and then a passer-by grabs somebody's bag and bolts. A yellow marker follows them; catch up on foot (or knock them
 * down) before they get away and the owner pays you a reward. The police patrol job hears about thefts too (the `theft` event).
 */
export class Thieves {
  private thief: Human | null = null;
  private left = 0;
  private storyChase = false;
  /** Thieves caught so far this session (the story's chase counts them). */
  caught = 0;
  private timer = 200;

  constructor(private game: Game) {}

  get active(): boolean { return !!this.thief; }
  markers(): { x: number; z: number }[] { return this.thief ? [{ x: this.thief.x, z: this.thief.z }] : []; }

  /** Pick a civilian near the player and turn them into a thief (also used by tests). */
  start(near?: { x: number; z: number }, story = false): boolean {
    const G = this.game;
    if (this.thief) return false;
    const p = near ?? G.humans.player;
    let best: Human | null = null, bd = 1e9;
    for (const h of G.humans.list) {
      if (!h.active || h.role !== Role.Civ || h.ally || h.named || h.gang || h.state !== St.Walk) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d > (story ? 4 : 14) && d < bd) { bd = d; best = h; }
    }
    if (!best || bd > (story ? 60 : 90)) return false;
    best.thief = true; best.fleeing = true;
    this.thief = best; this.left = story ? 80 : 45; this.storyChase = story;
    G.humans.thiefSpeed = story ? 6.2 : 6.6; // (a sprint is 8.2: he can be caught)
    G.bus.emit({ type: 'theft', x: best.x, z: best.z });
    G.hud.toast(story ? bi('He is running off with the cash box! Sprint after him (Shift)!', '돈 상자를 들고 도망가요! Shift로 전력 질주해서 쫓으세요!') : bi('Thief! Someone snatched a bag - catch them (yellow marker)!', '도둑이에요! 가방을 낚아챘어요 - 노란 마커를 쫓아가 잡으세요!'), 3600);
    G.audio.tink();
    return true;
  }

  release(msg: string | null): void {
    if (this.thief) this.thief.thief = false;
    this.thief = null; this.storyChase = false; this.game.humans.thiefSpeed = 6.6;
    this.timer = 240 + Math.random() * 240;
    if (msg) this.game.hud.toast(msg, 2600);
  }

  update(dt: number): void {
    const G = this.game;
    if (G.mode === 'kids') return;
    if (G.state !== 'play') return;
    if (!this.thief) {
      if (G.inside || G.stars > 0) return;
      if (!G.clock.auto) return; // automated tests start events by hand
      this.timer -= dt * G.clock.trouble();
      if (this.timer <= 0) { if (!this.start()) this.timer = 30; }
      return;
    }
    const t = this.thief;
    this.left -= dt;
    if (!t.active || t.role !== Role.Civ) { this.release(null); return; }
    const p = G.humans.player;
    const downed = t.state !== St.Walk;
    const near = G.onFoot && !G.inside && Math.hypot(t.x - p.x, t.z - p.z) < 1.8;
    const rammed = !!G.driving && !G.onFoot && Math.hypot(t.x - G.driving.x, t.z - G.driving.z) < 3 && G.driving.ctrl.speed > 4;
    if (downed || near || rammed) {
      const reward = this.storyChase ? 0 : Math.round(180 * G.factions.payMult());
      this.caught++;
      G.addCash(reward, 'other');
      G.progress.add('thieves');
      G.bus.emit({ type: 'helped', x: t.x, z: t.z, amount: 2 });
      G.popups.spawn(t.x, 3, t.z, `+$${reward}`, '#ffe14d');
      G.audio.cash();
      this.release(bi('Thief caught! The owner gives you a reward.', '도둑을 잡았어요! 주인이 사례금을 줬어요.'));
      return;
    }
    if (this.left <= 0 || Math.hypot(t.x - p.x, t.z - p.z) > 220) this.release(bi('The thief got away.', '도둑이 달아났어요.'));
  }
}
