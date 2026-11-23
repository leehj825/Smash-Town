import type { Game } from './game';
import { bi } from './i18n';
import { CHAPTERS } from './story';
import { ACHIEVEMENTS } from './progress';

export interface Goal { id: string; en: string; ko: string; got: number; max: number; weight: number }

const MILESTONES: [number, number][] = [[25, 1000], [50, 3000], [75, 6000], [100, 15000]];

/**
 * City completion. One number (0 to 100%) and a checklist that read what the player has already done: gang blocks taken, story chapters,
 * shifts worked, friends made, collectibles, races won, a house, and a few street deeds. It adds nothing new to do by itself: it tells the
 * player what is left, and pays a bonus when 25, 50, 75 and 100% are reached. The stats screen shows it.
 */
export class Completion {
  private t = 5;
  private lastRank = '';

  constructor(private game: Game) {}

  goals(): Goal[] {
    const G = this.game;
    const st = G.progress.stats;
    const friends = G.npcs.list.filter((n) => G.npcs.level(n.def.id) >= 1).length;
    const homes = (G.save.homes ?? []).length;
    const races = (G.save.raceBest ?? []).filter((t) => t > 0).length;
    const ach = G.progress.ach.length;
    return [
      { id: 'turf', en: 'Take over every gang and Mafia block', ko: '모든 갱단과 마피아 구역 점령', got: G.gangs.ownedCount, max: G.gangs.zones.length, weight: 20 },
      { id: 'story', en: 'Finish the story chapters', ko: '스토리 챕터 완료', got: G.story.done ? CHAPTERS.length : G.story.ch, max: CHAPTERS.length, weight: 20 },
      { id: 'jobs', en: 'Work a shift as medic, firefighter and officer', ko: '구급대원, 소방대원, 경찰 근무 경험', got: (st.rescues >= 5 ? 1 : 0) + (st.fires >= 5 ? 1 : 0) + (st.patrols >= 5 ? 1 : 0), max: 3, weight: 15 },
      { id: 'friends', en: 'Make friends with 5 named people', ko: '이름 있는 사람 5명과 친구 되기', got: Math.min(5, friends), max: 5, weight: 10 },
      { id: 'collect', en: 'Collect every hidden gem', ko: '숨은 보석 모두 모으기', got: G.collectibles.count, max: Math.max(1, G.collectibles.total), weight: 10 },
      { id: 'races', en: 'Set a time on every race level', ko: '모든 레이스 단계에 기록 세우기', got: Math.min(3, races), max: 3, weight: 5 },
      { id: 'home', en: 'Buy a house', ko: '집 사기', got: Math.min(1, homes), max: 1, weight: 5 },
      { id: 'street', en: 'Catch 3 thieves', ko: '도둑 3명 잡기', got: Math.min(3, st.thieves), max: 3, weight: 5 },
      { id: 'fish', en: 'Catch 10 fish', ko: '물고기 10마리 낚기', got: Math.min(10, st.fish), max: 10, weight: 5 },
      { id: 'ach', en: 'Unlock a third of the achievements', ko: '업적의 3분의 1 달성', got: Math.min(1, ach / Math.max(1, ACHIEVEMENTS.length / 3)), max: 1, weight: 5 },
    ];
  }

  /** The player's standing, by city completion. */
  rank(): [string, string] {
    if (this.game.mode === 'story') return this.game.progression.name();
    const p = this.percent();
    return p >= 100 ? ['Kingpin', '도시의 제왕'] : p >= 75 ? ['Underboss', '언더보스'] : p >= 50 ? ['District boss', '구역 보스'] : p >= 25 ? ['Block boss', '동네 보스'] : ['Street thug', '거리의 불량배'];
  }

  percent(): number {
    let p = 0;
    for (const g of this.goals()) p += g.weight * Math.min(1, g.got / g.max);
    return Math.min(100, Math.floor(p + 1e-6));
  }

  update(dt: number): void {
    const G = this.game;
    this.t -= dt;
    if (this.t > 0 || G.state !== 'play' || G.inside) return;
    this.t = 5;
    const pct = this.percent();
    const rank = this.rank()[0];
    if (this.lastRank && rank !== this.lastRank) G.hud.toast(bi(`New rank: ${rank}!`, `새 등급: ${this.rank()[1]}!`), 3200);
    this.lastRank = rank;
    const done = G.save.milestone ?? 0;
    for (const [m, reward] of MILESTONES) {
      if (pct >= m && done < m) {
        G.save.milestone = m;
        G.addCash(reward, 'other');
        G.hud.toast(bi(`City completion ${m}%! Bonus $${reward.toLocaleString('en-US')}`, `도시 완성도 ${m}%! 보너스 $${reward.toLocaleString('en-US')}`), 4200);
        G.audio.cash();
        G.flushSave();
        break;
      }
    }
  }
}
