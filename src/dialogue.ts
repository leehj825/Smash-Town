import type { Game } from './game';
import type { Human } from './humans';
import { bi } from './i18n';

type Pair = [string, string]; // [English, Korean]

/** What a line (or a choice) does when it is shown (or picked): a little standing, a friend, a gift, some cash. */
export interface DEffect { rep?: number; friend?: [string, number]; gift?: 'donut'; cash?: number }
export interface DChoice { label: Pair; next: string; fx?: DEffect }
export interface DNode {
  id: string;
  who: Pair;
  text: Pair;
  /** The line that follows (none: the conversation ends). Ignored when there are choices. */
  next?: string;
  choices?: DChoice[];
  fx?: DEffect;
}
export type DScript = Record<string, DNode>;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Face-to-face conversations. The two of you turn to look at each other (and step to a talking distance), the camera moves to an over-the-
 * shoulder two-shot, and nothing can hurt you or raise your wanted level while you talk. A line may offer two choices (click one, tap it, or
 * press 1 or 2); a choice can change your standing, make a friend or earn a gift. Used by the story's opening; ordinary chats with the people of
 * the city (npcs.ts) keep their simple lines.
 */
export class Dialogue {
  active = false;
  private script: DScript = {};
  private cur: DNode | null = null;
  private npc: Human | null = null;
  private done: (() => void) | null = null;

  constructor(private game: Game) {
    game.hud.onDialogChoice = (i) => this.choose(i);
  }

  /** The line on screen (for tests). */
  get node(): DNode | null { return this.cur; }

  start(script: DScript, startId: string, npc: Human | null, done?: () => void): void {
    const G = this.game;
    if (this.active || !script[startId]) return;
    this.script = script; this.npc = npc; this.done = done ?? null;
    this.active = true;
    G.setDialogOpen(true);
    this.cur = null;
    this.go(startId);
  }

  private fx(e?: DEffect): void {
    if (!e) return;
    const G = this.game, pl = G.humans.player;
    if (e.rep) G.reputation.add(pl.x, pl.z, e.rep);
    if (e.friend) G.npcs.befriend(e.friend[0], e.friend[1]);
    if (e.gift === 'donut') { G.gear.give('donut', 1); G.hud.toast(bi('You got a donut! (U eats it: health back)', '도넛을 받았어요! (U로 먹으면 체력 회복)'), 3000); }
    if (e.cash) G.addCash(e.cash, 'story');
  }

  private go(id: string): void {
    const n = this.script[id];
    if (!n) { this.end(); return; }
    this.cur = n;
    this.fx(n.fx);
    const G = this.game;
    G.hud.showDialog(
      `${bi(n.who[0], n.who[1])}`, bi(n.text[0], n.text[1]),
      n.choices ? bi('Pick one: click it, or press 1 / 2', '하나를 고르세요: 클릭하거나 1 / 2 키') : bi('Continue [F]', '계속 [F]'),
      n.choices ? n.choices.map((c) => bi(c.label[0], c.label[1])) : undefined,
    );
  }

  advance(): void {
    const n = this.cur;
    if (!this.active || !n || n.choices) return;
    if (n.next) this.go(n.next); else this.end();
  }

  choose(i: number): void {
    const n = this.cur;
    if (!this.active || !n?.choices) return;
    const c = n.choices[i];
    if (!c) return;
    this.fx(c.fx);
    this.go(c.next);
  }

  private end(): void {
    const G = this.game;
    this.active = false; this.cur = null;
    G.hud.hideDialog();
    G.setDialogOpen(false);
    G.cameraRig.dialogFocus = null;
    const d = this.done; this.done = null;
    d?.();
  }

  update(dt: number): void {
    if (!this.active) return;
    const G = this.game;
    if (G.state !== 'dialog') { this.end(); return; }
    const pl = G.humans.player;
    pl.invuln = Math.max(pl.invuln, 0.3); // nothing can hurt you while you talk
    if (this.npc) {
      const n = this.npc;
      const dx = n.x - pl.x, dz = n.z - pl.z, d = Math.hypot(dx, dz) || 1;
      const a = Math.atan2(dx, dz), k = Math.min(1, dt * 8);
      pl.heading += wrap(a - pl.heading) * k;
      n.heading += wrap(a + Math.PI - n.heading) * k;
      // a natural talking distance
      if (d < 1.2 || d > 3) { const m = Math.min(1, dt * 4) * (d - 1.8); pl.x += (dx / d) * m; pl.z += (dz / d) * m; }
      G.cameraRig.dialogFocus = { x: n.x, z: n.z };
    }
    const cur = this.cur;
    if (cur?.choices) {
      if (G.input.wasPressed('Digit1')) this.choose(0);
      else if (G.input.wasPressed('Digit2')) this.choose(1);
    }
  }
}
