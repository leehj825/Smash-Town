import type { Game } from './game';
import { bi } from './i18n';
import { AREAS } from './reputation';
import type { GunId } from './guns';
import type { GearId } from './gear';

export type Stage = 1 | 2 | 3 | 4;
export const STAGE_NAMES: Record<Stage, [string, string]> = {
  1: ['Newcomer', '신입'], 2: ['Fixer', '해결사'], 3: ['Boss', '보스'], 4: ['Kingpin', '제왕'],
};

/** The stage at which the gun shop starts selling each thing. */
export const GUN_STAGE: Record<GunId, Stage> = { paint: 1, pistol: 2, smg: 3, shotgun: 3, rocket: 4, grenade: 4 };
export const GEAR_STAGE: Record<GearId, Stage> = { donut: 1, vest: 2, smoke: 3, c4: 3, spikes: 3 };
/** The stage at which big jobs open up. */
export const TRUCK_STAGE: Stage = 3;
export const BANK_STAGE: Stage = 4;

/**
 * How far along the player is in the story mode, in four stages. It comes from what you have done (story chapters and the standing you have
 * in a district, then the gang blocks you hold), never from a timer. The gun shop will not sell above your stage ("come back when you have a
 * name"), and the big jobs wait for theirs. In the sandbox and in classic mode every stage is open.
 *   1 Newcomer: a nobody.   2 Fixer: one story chapter done or a good name somewhere.
 *   3 Boss: three chapters or a gang block.   4 Kingpin: five chapters or three blocks.
 */
export class Progression {
  private last: Stage | 0 = 0;
  private t = 0;

  constructor(private game: Game) {}

  stage(): Stage {
    const G = this.game;
    if (G.mode === 'kids') return 1; // no weapons, no big jobs
    if (G.mode !== 'story') return 4;
    // (the intro chapter is not counted: stage 2 is the first real chapter done)
    const ch = G.story.done ? 99 : G.story.ch - 1;
    const turf = G.gangs.ownedCount;
    let rep = -100;
    for (const a of AREAS) rep = Math.max(rep, G.reputation.get(a));
    if (ch >= 5 || turf >= 3) return 4;
    if (ch >= 3 || turf >= 1) return 3;
    if (ch >= 1 || rep >= 15) return 2;
    return 1;
  }

  name(): [string, string] { return STAGE_NAMES[this.stage()]; }
  allows(need: Stage): boolean { return this.stage() >= need; }

  /** The shopkeeper's answer when you ask for something above your stage. */
  refuse(need: Stage): void {
    this.game.hud.toast(bi(
      `"I can't sell that to a rookie. Make a name for yourself first." (needs stage ${need}: ${STAGE_NAMES[need][0]})`,
      `"초짜한테는 이걸 못 팔아. 구역 평판 좀 쌓고 와." (${need}단계 필요: ${STAGE_NAMES[need][1]})`), 3600);
  }

  update(dt: number): void {
    const G = this.game;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 3;
    const s = this.stage();
    if (this.last && s > this.last && G.state === 'play') {
      G.hud.toast(bi(`Stage ${s}: ${STAGE_NAMES[s][0]}! The gun shop has new things for you.`, `${s}단계: ${STAGE_NAMES[s][1]}! 총기 상점에 새 물건이 들어왔어요.`), 4200);
      G.audio.jingle();
    }
    this.last = s;
  }
}
