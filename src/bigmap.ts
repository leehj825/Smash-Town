import type { Game } from './game';
import { bi, t } from './i18n';

const DOT = (c: string, label: string) => `<i style="background:${c}"></i><span>${label}</span>`;

/** Full-screen city map: your position, the story goal and road route, garages, jobs, golden stars and the chapter checklist. */
export class BigMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private side: HTMLElement;
  private t = 0;

  constructor(private game: Game) {
    this.el = document.createElement('div');
    this.el.id = 'bigmap';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div id="bigmap-wrap"><canvas id="bigmap-canvas"></canvas></div>
      <div id="bigmap-side"></div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('#bigmap-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.side = this.el.querySelector('#bigmap-side')!;
    const mm = game.world.minimap.canvas;
    this.canvas.width = mm.width;
    this.canvas.height = mm.height;
  }

  get isOpen(): boolean { return !this.el.hidden; }

  open(): void { this.el.hidden = false; this.buildSide(); this.draw(0); }
  close(): void { this.el.hidden = true; }

  private buildSide(): void {
    const g = this.game;
    const list = g.story.checklist();
    const goal = g.goal;
    const li = (x: { state: string }, text: string) => `<li class="${x.state}">${text}</li>`;
    this.side.innerHTML = `
      <button id="bigmap-close" type="button">${t('ui.map.close')}</button>
      <h2>${t('ui.map')}</h2>
      <div id="bigmap-goal">${goal ? `➤ ${goal.label}` : g.story.done ? bi('Story complete!', '스토리 완료!') : bi('Follow the conversation', '대화를 따라가요')}</div>
      <div><h3>${bi('CHAPTERS', '챕터')}</h3><ul>${list.chapters.map((c) => li(c, c.title)).join('')}</ul></div>
      ${list.steps.length ? `<div><h3>${bi('THIS CHAPTER', '이번 챕터')}</h3><ul>${list.steps.map((s) => li(s, s.text)).join('')}</ul></div>` : ''}
      <div id="bigmap-legend">
        ${DOT('#ffd23a', bi('Story goal (gold line = road route)', '스토리 목표 (금색 선 = 길)'))}
        ${DOT('#3dff8a', bi('Garage', '차고'))}
        ${DOT('#ff9a3d', bi('Side jobs', '부업'))}
        ${DOT('#ffe27a', bi('Golden star', '황금 별'))}
      </div>`;
    this.side.querySelector('#bigmap-close')!.addEventListener('click', () => this.close());
  }

  /** Redraw (called every frame while open so the arrow and goal pulse). */
  draw(dt: number): void {
    if (!this.isOpen) return;
    this.t += dt;
    const g = this.game, w = g.world;
    const { canvas: img, scale: MM, pad: PAD } = w.minimap;
    const c = this.ctx;
    const X = (x: number) => (x + PAD) * MM, Z = (z: number) => (z + PAD) * MM;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(img, 0, 0);
    const dot = (x: number, z: number, r: number, color: string) => {
      c.fillStyle = color; c.strokeStyle = '#000'; c.lineWidth = 3;
      c.beginPath(); c.arc(X(x), Z(z), r, 0, Math.PI * 2); c.fill(); c.stroke();
    };
    const R = 9;
    for (const s of w.garages) dot(s.x, s.z, R, '#3dff8a');
    for (const m of g.gigs.markers) if (m.cooldown <= 0) dot(m.x, m.z, R - 1, '#ff9a3d');
    for (let i = 0; i < g.collectibles.total; i++) if (!g.collectibles.isCollected(i)) { const s = g.collectibles.spot(i); dot(s.x, s.z, R - 3, '#ffe27a'); }

    if (g.route && g.goal) {
      c.lineJoin = 'round'; c.lineCap = 'round';
      const trace = () => { c.beginPath(); g.route!.pts.forEach((p, k) => { if (k === 0) c.moveTo(X(p.x), Z(p.z)); else c.lineTo(X(p.x), Z(p.z)); }); c.stroke(); };
      c.strokeStyle = 'rgba(20,20,30,.9)'; c.lineWidth = 11; trace();
      c.strokeStyle = '#ffd23a'; c.lineWidth = 6; trace();
      const pulse = 1 + 0.25 * Math.sin(this.t * 6);
      c.strokeStyle = '#ffd23a'; c.lineWidth = 4;
      c.beginPath(); c.arc(X(g.goal.x), Z(g.goal.z), 22 * pulse, 0, Math.PI * 2); c.stroke();
      dot(g.goal.x, g.goal.z, 13, '#ffd23a');
    }

    // you: an arrow pointing the way you face
    const f = g.followable;
    const th = Math.atan2(Math.cos(f.heading), Math.sin(f.heading)) + Math.PI / 2;
    c.save();
    c.translate(X(g.focusX), Z(g.focusZ));
    c.rotate(th);
    c.fillStyle = '#fff'; c.strokeStyle = '#1a1a24'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -20); c.lineTo(14, 16); c.lineTo(0, 8); c.lineTo(-14, 16); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#fff'; c.font = '800 22px sans-serif'; c.textAlign = 'center';
    c.strokeStyle = '#000'; c.lineWidth = 4;
    c.strokeText(bi('YOU', '나'), X(g.focusX), Z(g.focusZ) - 28); c.fillText(bi('YOU', '나'), X(g.focusX), Z(g.focusZ) - 28);
  }
}
