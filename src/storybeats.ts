import type { Game } from './game';
import type { DScript } from './dialogue';
import { STORY_EXTRA } from './story';
import { bi } from './i18n';

interface Beat { id: string; when: (G: Game) => boolean; script: DScript }

const text = (who: [string, string], en: string, ko: string): DScript => ({ x1: { id: 'x1', who, text: [en, ko] } });
const BONNIE: [string, string] = ['Bonnie (text)', '보니 (문자)'];
const PARK: [string, string] = ['Mr. Park (text)', '미스터 박 (문자)'];
const KANE: [string, string] = ['Kane (text)', '케인 (문자)'];

/**
 * Hooks into the story while you roam. After the opening, now and then something happens because of what YOU did, not because a marker says so:
 * a text from somebody who has noticed. Each one comes once (they are remembered in the save), only when nothing else is going on, and only when you
 * are on foot or stopped. They point at the next thing worth doing without forcing it.
 */
const BEATS: Beat[] = [
  { id: 'cash1000', when: (G) => G.cash >= 1000,
    script: text(PARK, "Word is you're flush now. Money talks, kid - but the Gun Shop wants a NAME, not just cash. Earn your rep first.", '돈 좀 모았다는 소문이 돌더라. 돈이 말을 하긴 하지, 하지만 총기 상점은 돈이 아니라 이름을 원해. 먼저 평판부터 쌓아.') },
  { id: 'harbor', when: (G) => G.reputation.area(G.focusX, G.focusZ) === 'harbor',
    script: text(BONNIE, 'You are at the harbor. Bigsby\'s crews move crates here after dark. Look around - if you dare.', '항구에 있네. 빅스비 패거리가 해 지면 여기서 상자를 옮겨. 둘러봐, 용기가 있다면.') },
  { id: 'turf1', when: (G) => G.gangs.ownedCount >= 1,
    script: text(KANE, 'You took a block. Word travels fast. Come see me - there is something about the Mafia you should hear.', '구역 하나를 먹었더군. 소문은 빨라. 날 찾아와, 마피아에 대해 들어둘 얘기가 있어.') },
  { id: 'poster', when: (G) => G.story.ch >= STORY_EXTRA + 3,
    script: text(PARK, "Bigsby is plastering your face all over town. There is a price on your head now - his hunters will chase you from two stars up.", '빅스비가 온 동네에 네 얼굴을 붙이고 있어. 현상금이 걸렸어. 이제 별 두 개부터 그의 사냥꾼들이 쫓아올 거야.') },
  { id: 'boss', when: (G) => G.progression.stage() >= 3,
    script: text(BONNIE, 'You are a name in Sunset Bay now. Armoured cash trucks roll through at dawn. The gold marker is where the crew hangs out.', '이제 선셋 베이에서 이름이 알려졌어. 새벽엔 현금 수송 장갑차가 지나가. 금색 마커가 일당이 모이는 곳이야.') },
];

export class StoryBeats {
  private t = 5;
  private rumorT = 420;

  constructor(private game: Game) {}

  update(dt: number): void {
    const G = this.game;
    if (G.mode !== 'story') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2;
    if (G.story.ch < STORY_EXTRA && !G.story.done) return; // not during the opening
    if (G.state !== 'play' || G.dialogue.active || G.inside || G.stars > 0 || G.gigs.active || G.race.active || G.taxi.active || G.delivery.active) return;
    if (G.jobOnDuty(null) || G.truckHeist.active || G.humans.inCombat()) return;
    if (G.driving && !G.onFoot && G.driving.ctrl.speed > 6) return;
    // now and then the radio repeats a rumour about the stranger G (it gets warmer as the story goes on)
    this.rumorT -= 2;
    if (this.rumorT <= 0 && G.story.ch > STORY_EXTRA && !G.story.done) {
      this.rumorT = 420 + Math.random() * 240;
      G.news.report('rumor', true, G.story.ch - STORY_EXTRA - 1);
    }
    const seen = (G.save.beats ??= []);
    for (const b of BEATS) {
      if (seen.includes(b.id) || !b.when(G)) continue;
      seen.push(b.id);
      G.saveDirty = true;
      G.hud.toast(bi('Your phone buzzes: a text', '휴대폰이 울려요: 문자'), 2000);
      G.dialogue.start(b.script, 'x1', null);
      return;
    }
  }
}
