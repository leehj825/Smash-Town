import { bi, onLangChange } from './i18n';
import type { Game } from './game';
import { AREAS, AREA_NAMES } from './reputation';
import { SKILLS, SKILL_NAMES, SKILL_EFFECT } from './skills';
import { ACHIEVEMENTS, OWNABLE, dailyById, type OwnableShop, type StatKey } from './progress';
import { ACTIONS, RESERVED, bindKey, keyFor, prettyKey, resetBinds, settings, saveSettings } from './settings';

/** A full-screen panel that freezes the game while open. */
export interface Modal { el: HTMLElement; isOpen: boolean; open(): void; close(): void }

function make(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'overlay modal';
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

/** Key rebinding list: click an action, press the new key. Keys are stored per action, so `R` can mean reset-car while driving and reload on foot. */
export class ControlsPanel implements Modal {
  readonly el = make('controls');
  private capturing: string | null = null;

  constructor() {
    onLangChange(() => { if (this.isOpen) this.render(); });
    window.addEventListener('keydown', (e) => {
      if (!this.capturing) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code !== 'Escape' && !RESERVED.has(e.code)) bindKey(this.capturing, e.code);
      this.capturing = null;
      this.render();
    }, true);
  }
  get isOpen(): boolean { return !this.el.hidden; }
  get isCapturing(): boolean { return this.capturing !== null; }
  open(): void { this.el.hidden = false; this.capturing = null; this.render(); }
  close(): void { this.el.hidden = true; this.capturing = null; }

  private render(): void {
    const rows = ACTIONS.map((a) => {
      const waiting = this.capturing === a.id;
      const changed = !!settings.binds[a.id];
      return `<div class="row"><span>${bi(a.en, a.ko)}</span><button class="seg key${changed ? ' sel' : ''}" data-act="${a.id}">${waiting ? bi('Press a key...', '키를 누르세요...') : prettyKey(keyFor(a.id))}</button></div>`;
    }).join('');
    this.el.innerHTML = `<div class="panel wide"><h2>${bi('CONTROLS', '조작키')}</h2>
      <p class="hint">${bi('Pick an action, then press a key. Arrow keys also steer. Esc cancels.', '동작을 고른 뒤 키를 누르세요. 방향키로도 조작됩니다. Esc로 취소.')}</p>
      <div class="scroll">${rows}</div>
      <button class="seg" id="ctl-reset">${bi('Reset to defaults', '기본값으로')}</button>
      <button class="big small" id="ctl-back">${bi('BACK', '뒤로')}</button></div>`;
    this.el.querySelectorAll<HTMLElement>('button.key').forEach((b) => b.addEventListener('click', () => { this.capturing = b.dataset.act!; this.render(); }));
    this.el.querySelector('#ctl-reset')!.addEventListener('click', () => { resetBinds(); this.render(); });
    this.el.querySelector('#ctl-back')!.addEventListener('click', () => this.close());
  }
}

/** First-play tutorial card (also reachable from the pause menu). */
export class HowToPlay implements Modal {
  readonly el = make('howto');
  constructor() { onLangChange(() => { if (this.isOpen) this.render(); }); }
  get isOpen(): boolean { return !this.el.hidden; }
  open(): void { this.el.hidden = false; this.render(); }
  close(): void {
    this.el.hidden = true;
    if (!settings.tutorialDone) { settings.tutorialDone = true; saveSettings(); }
  }
  private render(): void {
    const touch = document.body.classList.contains('is-touch');
    const pad = document.body.classList.contains('gamepad');
    const drive = touch ? bi('Arrow buttons steer, the green button is gas.', '화살표로 조향하고 초록 버튼으로 가속해요.')
      : pad ? bi('Right trigger gas, left trigger brake, left stick steers.', 'RT 가속, LT 브레이크, 왼쪽 스틱 조향.')
      : bi('W / S gas and brake, A / D steer, Space drifts, Shift is nitro.', 'W/S 가속·브레이크, A/D 조향, Space 드리프트, Shift 니트로.');
    const foot = touch ? bi('Press F to leave the car. The left stick walks; tap the attack buttons to fight.', 'F로 차에서 내려요. 왼쪽 스틱으로 걷고 공격 버튼으로 싸워요.')
      : pad ? bi('Y gets in or out of cars. On foot X attacks, RB kicks, A jumps.', 'Y로 차 타기/내리기. 도보에서 X 공격, RB 발차기, A 점프.')
      : bi('F gets in or out of cars. On foot: left click attacks, right click or Q kicks.', 'F로 차 타기/내리기. 도보: 좌클릭 공격, 우클릭/Q 발차기.');
    const map = touch ? bi('Tap the map button for the big map.', '지도 버튼으로 큰 지도를 열어요.')
      : pad ? bi('Click the right stick for the big map.', '오른쪽 스틱을 눌러 큰 지도를 열어요.')
      : bi('Press M for the big map.', 'M 키로 큰 지도를 열어요.');
    const guns = touch ? bi('Buy guns at a garage (Arms) or the Gun Shop. Tap WPN to switch, AIM for the crosshair, AUTO to lock on to the closest cop, R to reload.', '차고(무기)나 총기 상점에서 총을 사세요. WPN으로 교체, AIM으로 조준점, AUTO로 가장 가까운 경찰 자동 조준, R로 재장전.')
      : pad ? bi('Buy guns at a garage or the Gun Shop. RT fires, LT turns aiming on and off, D-pad down is auto-aim, Back reloads, LB switches weapons.', '차고나 총기 상점에서 총을 사세요. RT 발사, LT 조준 켜기/끄기, 아래 방향키 자동 조준, Back 재장전, LB 무기 교체.')
      : bi('Buy guns at a garage (Arms) or the Gun Shop and press 4-9. Right click or X aims (crosshair), B turns auto-aim on, left click fires, R reloads.', '차고(무기)나 총기 상점에서 총을 사고 4-9를 누르세요. 우클릭 또는 X로 조준, B로 자동 조준, 좌클릭 발사, R 재장전.');
    this.el.innerHTML = `<div class="panel wide"><h2>${bi('HOW TO PLAY', '플레이 방법')}</h2>
      <ul class="howto">
        <li><b>${bi('Drive', '운전')}</b> ${drive}</li>
        <li><b>${bi('On foot', '도보')}</b> ${foot}</li>
        <li><b>${bi('Guns', '총')}</b> ${guns}</li>
        <li><b>${bi('Smash', '부수기')}</b> ${bi('Hit hydrants, benches and cans for cash. Big smashes attract police.', '소화전, 벤치, 쓰레기통을 부숴 돈을 벌어요. 크게 부수면 경찰이 와요.')}</li>
        <li><b>${bi('Story', '스토리')}</b> ${bi('Follow the gold arrow at the top. ', '위쪽의 금색 화살표를 따라가세요. ')}${map}</li>
        <li><b>${bi('Explore', '탐험')}</b> ${bi('Golden stars, side jobs and garages are all on the map.', '황금 별, 부업, 차고가 모두 지도에 있어요.')}</li>
      </ul>
      <button class="big small" id="howto-ok">${bi('GOT IT', '알겠어요')}</button></div>`;
    this.el.querySelector('#howto-ok')!.addEventListener('click', () => this.close());
  }
}

const STAT_LABELS: [StatKey, string, string][] = [
  ['smashes', 'Props smashed', '부순 물건'], ['stars', 'Golden stars', '황금 별'], ['copsKO', 'Cops knocked out', '제압한 경찰'],
  ['gigs', 'Side jobs done', '완료한 부업'], ['quests', 'Street quests done', '완료한 거리 퀘스트'], ['earned', 'Money earned', '번 돈'],
  ['driveM', 'Distance driven', '주행 거리'], ['roofs', 'Ladders climbed', '오른 사다리'], ['shops', 'Shop visits', '상점 방문'], ['playSec', 'Time played', '플레이 시간'],
  ['fares', 'Taxi fares', '택시 손님'], ['races', 'Races won', '레이스 우승'], ['deliveries', 'Deliveries', '배달'], ['heists', 'Bank heists', '은행 강도'],
  ['robberies', 'Tills robbed', '털은 금고'], ['fish', 'Fish caught', '낚은 물고기'], ['turfs', 'Gang blocks taken', '점령한 구역'], ['rescues', 'Patients treated', '치료한 환자'], ['fires', 'Fires put out', '끈 불'], ['patrols', 'Patrol calls handled', '처리한 순찰 출동'], ['thieves', 'Thieves caught', '잡은 도둑'], ['bounties', 'Bounty hunters wrecked', '격파한 사냥꾼'], ['hides', 'Times hidden from police', '경찰 피해 숨은 횟수'],
];

/** Lifetime stats, achievements, daily challenges and owned shops. */
export class StatsPanel implements Modal {
  readonly el = make('stats');
  constructor(private game: Game) { onLangChange(() => { if (this.isOpen) this.render(); }); }
  get isOpen(): boolean { return !this.el.hidden; }
  open(): void { this.el.hidden = false; this.render(); }
  close(): void { this.el.hidden = true; }

  private render(): void {
    const p = this.game.progress;
    const fmt = (k: StatKey, v: number) => k === 'earned' ? `$${Math.floor(v).toLocaleString('en-US')}` : k === 'driveM' ? `${(v / 1000).toFixed(1)} km` : k === 'playSec' ? `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m` : String(Math.floor(v));
    const stats = STAT_LABELS.map(([k, en, ko]) => `<div class="erow"><span>${bi(en, ko)}</span><b>${fmt(k, p.stats[k])}</b></div>`).join('');
    const daily = p.daily.ids.map((id) => {
      const q = dailyById(id)!;
      const done = p.daily.done.includes(id);
      const have = Math.min(q.target, Math.floor(p.stats[q.key] - p.daily.base[q.key]));
      return `<div class="erow ${done ? 'done' : ''}"><span>${done ? '\u2713' : '\u25CB'} ${bi(q.en, q.ko)}${done ? '' : `<i class="pbar"><i style="width:${Math.round((have / q.target) * 100)}%"></i></i>`}</span><b>${done ? bi('done', '완료') : `${have}/${q.target} \u00B7 $${q.reward}`}</b></div>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a) => {
      const done = p.ach.includes(a.id);
      return `<div class="erow ${done ? 'done' : 'todo'}"><span>${done ? '\u2605' : '\u2606'} ${bi(a.en, a.ko)}${done ? '' : `<i class="pbar"><i style="width:${Math.round((Math.min(a.target, p.stats[a.key]) / a.target) * 100)}%"></i></i>`}</span><b>${done ? '' : `${Math.floor(Math.min(a.target, p.stats[a.key]))}/${a.target}`}</b></div>`;
    }).join('');
    const shops = (Object.keys(OWNABLE) as OwnableShop[]).map((id) => {
      const own = p.owned.includes(id);
      return `<div class="erow"><span>${id === 'donut' ? bi("Donna's Donuts", '도나스 도넛') : id === 'motel' ? bi('24h Motel', '24시 모텔') : bi('Arcade', '오락실')}</span><b>${own ? `$${Math.floor(p.pending[id]).toLocaleString('en-US')} ${bi('waiting', '대기 중')}` : `${bi('for sale', '판매 중')} $${OWNABLE[id].price.toLocaleString('en-US')}`}</b></div>`;
    }).join('');
    this.el.innerHTML = `<div class="panel wide"><h2>${bi('STATS', '기록')}</h2><div class="scroll statsbox">
      <h3>${bi('DAILY CHALLENGES', '오늘의 도전')}</h3>${daily}
      <h3>${bi('YOUR SHOPS', '내 가게')}</h3>${shops}
      <h3>${bi('SKILLS', '스킬')}</h3>${SKILLS.map((k) => `<div class="erow"><span>${bi(SKILL_NAMES[k][0], SKILL_NAMES[k][1])} <small>${bi(SKILL_EFFECT[k][0], SKILL_EFFECT[k][1])}</small><i class="pbar"><i style="width:${Math.round(this.game.skills.progress(k) * 100)}%"></i></i></span><b>${bi('Lv', '레벨')} ${this.game.skills.level(k)}</b></div>`).join('')}
      <h3>${bi('FACTIONS', '세력')}</h3><div class="erow"><span>${this.game.factions.label('watch')}</span></div><div class="erow"><span>${this.game.factions.label('mafia')}</span></div>
      <h3>${bi('REPUTATION', '평판')}</h3>${AREAS.map((a) => `<div class="erow"><span>${bi(AREA_NAMES[a][0], AREA_NAMES[a][1])}</span><b>${this.game.reputation.get(a) > 0 ? '+' : ''}${this.game.reputation.get(a)}</b></div>`).join('')}
      <h3>${bi('LIFETIME', '누적 기록')}</h3>${stats}
      <h3>${bi('ACHIEVEMENTS', '업적')} ${p.ach.length}/${ACHIEVEMENTS.length}</h3>${ach}</div>
      <button class="big small" id="stats-back">${bi('BACK', '뒤로')}</button></div>`;
    this.el.querySelector('#stats-back')!.addEventListener('click', () => this.close());
  }
}
