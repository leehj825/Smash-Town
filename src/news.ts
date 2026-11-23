import type { Game } from './game';
import { bi, getLang } from './i18n';

type Kind = 'murder' | 'wanted3' | 'wanted5' | 'escaped' | 'heist' | 'police' | 'race' | 'bounty' | 'blackout' | 'festival' | 'explosion' | 'turf';
const HEADLINES: Record<Kind, [string, string][]> = {
  murder: [
    ['A pedestrian was killed downtown. Police are looking for a suspect.', '시내에서 보행자가 숨졌습니다. 경찰이 용의자를 쫓고 있습니다.'],
    ['Panic on the streets: a violent attack leaves one dead.', '거리에 공포: 폭행 사건으로 한 명이 사망했습니다.'],
  ],
  wanted3: [
    ['Police chase underway! Several units are pursuing a suspect.', '경찰 추격전! 여러 대의 순찰차가 용의자를 쫓고 있습니다.'],
    ['Drivers, avoid the city centre: a high-speed chase is on.', '운전자 여러분, 시내 중심은 피하세요. 고속 추격전이 벌어지고 있습니다.'],
  ],
  wanted5: [
    ['City on lockdown! Helicopters and armoured units are on the scene.', '도시 비상! 헬기와 장갑차가 현장에 출동했습니다.'],
  ],
  escaped: [
    ['The suspect slipped away. Police have called off the search.', '용의자가 달아났습니다. 경찰이 수색을 중단했습니다.'],
  ],
  heist: [
    ['Smash Bank was robbed tonight. Losses are in the thousands.', '스매시 은행에 강도가 들었습니다. 피해액은 수천 달러에 이릅니다.'],
  ],
  police: [
    ['Officers down: several police have been knocked out in clashes.', '경찰관 여러 명이 충돌 중 쓰러졌습니다.'],
  ],
  race: [
    ['Illegal street racing has the city on edge.', '불법 거리 레이스로 도시가 술렁입니다.'],
  ],
  blackout: [
    ['Storm knocks out power across the city - the lights are off.', '폭풍으로 도시 곳곳이 정전됐습니다.'],
  ],
  explosion: [
    ['A huge explosion shook the city centre - the cause is not yet known.', '도심에서 큰 폭발이 있었습니다. 원인은 아직 알려지지 않았습니다.'],
    ['Residents report a blast and thick smoke downtown.', '시민들이 폭발음과 짙은 연기를 신고하고 있습니다.'],
  ],
  turf: [
    ['A gang lost a block of the city to an outsider overnight.', '갱단이 하룻밤 사이에 한 구역을 외부인에게 빼앗겼습니다.'],
    ['Gang territory has changed hands - police warn of retaliation.', '갱단 구역의 주인이 바뀌었습니다. 경찰은 보복을 경고했습니다.'],
  ],
  festival: [
    ['A street party and fireworks show are under way in the plaza.', '광장에서 거리 축제와 불꽃놀이가 한창입니다.'],
  ],
  bounty: [
    ['A bounty hunter is reported to be tracking a wanted driver.', '현상금 사냥꾼이 수배 중인 운전자를 추적 중이라고 합니다.'],
  ],
};

/** Breaking news: a banner (and a short jingle, and a voice if the browser has one) that reports what the player has been up to. */
export class News {
  private el: HTMLElement;
  private timer = 0;
  private cooldown = 0;
  /** Every headline shown so far (newest last); handy for tests and a later news screen. */
  readonly log: { kind: Kind; en: string }[] = [];
  voice = true;

  constructor(private game: Game) {
    this.el = document.getElementById('news')!;
    const bus = game.bus;
    bus.on('civKilled', (e) => { if (!e.kids) this.report('murder'); });
    bus.on('wantedRaised', (e) => { if (e.stars >= 5) this.report('wanted5', true); else if (e.stars >= 3) this.report('wanted3'); });
    bus.on('wantedLost', () => this.report('escaped'));
    bus.on('copDown', (e) => { if (e.total % 6 === 0) this.report('police'); });
    bus.on('hunterSpawned', () => this.report('bounty'));
    bus.on('heist', () => this.report('heist', true));
    bus.on('blackout', () => this.report('blackout'));
    bus.on('turfCaptured', () => this.report('turf', true));
    bus.on('explosion', (e) => { if (Math.hypot(e.x - game.focusX, e.z - game.focusZ) < 90) this.report('explosion'); });
  }

  update(dt: number): void { this.cooldown = Math.max(0, this.cooldown - dt); }

  report(kind: Kind, force = false): void {
    if (this.cooldown > 0 && !force) return;
    const list = HEADLINES[kind];
    const [en, ko] = list[Math.floor(Math.random() * list.length)];
    this.cooldown = 30;
    this.log.push({ kind, en });
    this.el.innerHTML = `<b>${bi('BREAKING NEWS', '속보')}</b> ${bi(en, ko)}`;
    this.el.classList.add('show');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('show'), 7000);
    this.game.audio.jingle();
    if (this.voice && this.game.audio.enabled && 'speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance(getLang() === 'ko' ? ko : en);
        u.lang = getLang() === 'ko' ? 'ko-KR' : 'en-US'; u.rate = 1.05; u.volume = 0.7;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch { /* no voice available */ }
    }
  }
}
