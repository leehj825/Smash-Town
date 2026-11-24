import type { Game } from './game';
import { bi } from './i18n';

/**
 * Short first-time hints, shown as a toast (never a blocking card) and only when things are calm: no wanted level, no dialogue, no fight in
 * progress. Each one shows once and is remembered in the save. A hint that comes due during a chase simply waits.
 */
export class Tips {
  private t = 4;
  private lostPending = false;

  constructor(private game: Game) {
    game.bus.on('wantedLost', () => { this.lostPending = true; });
  }

  private seen(id: string): boolean { return !!this.game.save.tips?.includes(id); }

  private show(id: string, text: string): void {
    const G = this.game;
    (G.save.tips ??= []).push(id);
    G.saveDirty = true;
    G.hud.toast(text, 4800);
    this.t = 12;
  }

  update(dt: number): void {
    const G = this.game;
    if (G.mode !== 'story' || G.state !== 'play' || G.inside || G.stars > 0) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    if (G.humans.player.hp < G.humans.player.maxHp * 0.5) return;
    if (G.sideOpen && !this.seen('pill')) { this.show('pill', bi('Tip: tap the yellow objective at the top to see today\'s steps. The map shows jobs.', '팁: 위쪽 노란 목표를 누르면 오늘 할 일이 보여요. 지도에는 부업도 나와요.')); return; }
    if (this.lostPending && !this.seen('hide')) { this.lostPending = false; this.show('hide', bi('Tip: break line of sight, then wait in a garage or park to lose the police for good.', '팁: 경찰 시야에서 벗어난 뒤 차고나 공원에서 기다리면 완전히 따돌릴 수 있어요.')); return; }
    this.lostPending = false;
    const d = G.driving;
    if (d && !G.onFoot && !d.owned && d.ai !== 'police' && G.sideOpen && !this.seen('plates')) { this.show('plates', bi('Tip: bring a stolen car to a garage counter to register it as yours for $200.', '팁: 훔친 차를 차고 카운터로 가져가면 $200에 내 차로 등록할 수 있어요.')); return; }
    if (G.sideOpen && G.cash >= 300 && !this.seen('cash')) this.show('cash', bi('Tip: spend cash at a garage. Upgrades make your cars faster and tougher.', '팁: 번 돈은 차고에서 써요. 업그레이드하면 차가 더 빠르고 튼튼해져요.'));
  }
}
