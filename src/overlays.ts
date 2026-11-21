import { bi, onLangChange } from './i18n';
import type { Game } from './game';
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
    this.el.innerHTML = `<div class="panel wide"><h2>${bi('HOW TO PLAY', '플레이 방법')}</h2>
      <ul class="howto">
        <li><b>${bi('Drive', '운전')}</b> ${drive}</li>
        <li><b>${bi('On foot', '도보')}</b> ${foot}</li>
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
      return `<div class="erow ${done ? 'done' : ''}"><span>${done ? '\u2713' : '\u25CB'} ${bi(q.en, q.ko)}</span><b>${done ? bi('done', '완료') : `${have}/${q.target} \u00B7 $${q.reward}`}</b></div>`;
    }).join('');
    const ach = ACHIEVEMENTS.map((a) => {
      const done = p.ach.includes(a.id);
      return `<div class="erow ${done ? 'done' : 'todo'}"><span>${done ? '\u2605' : '\u2606'} ${bi(a.en, a.ko)}</span><b>${done ? '' : `${Math.floor(Math.min(a.target, p.stats[a.key]))}/${a.target}`}</b></div>`;
    }).join('');
    const shops = (Object.keys(OWNABLE) as OwnableShop[]).map((id) => {
      const own = p.owned.includes(id);
      return `<div class="erow"><span>${id === 'donut' ? bi("Donna's Donuts", '도나의 도넛') : id === 'motel' ? bi('24h Motel', '24시 모텔') : bi('Arcade', '오락실')}</span><b>${own ? `$${Math.floor(p.pending[id]).toLocaleString('en-US')} ${bi('waiting', '대기 중')}` : `${bi('for sale', '판매 중')} $${OWNABLE[id].price.toLocaleString('en-US')}`}</b></div>`;
    }).join('');
    this.el.innerHTML = `<div class="panel wide"><h2>${bi('STATS', '기록')}</h2><div class="scroll statsbox">
      <h3>${bi('DAILY CHALLENGES', '오늘의 도전')}</h3>${daily}
      <h3>${bi('YOUR SHOPS', '내 가게')}</h3>${shops}
      <h3>${bi('LIFETIME', '누적 기록')}</h3>${stats}
      <h3>${bi('ACHIEVEMENTS', '업적')} ${p.ach.length}/${ACHIEVEMENTS.length}</h3>${ach}</div>
      <button class="big small" id="stats-back">${bi('BACK', '뒤로')}</button></div>`;
    this.el.querySelector('#stats-back')!.addEventListener('click', () => this.close());
  }
}
