import { canonical, settings } from './settings';

export interface ControlState {
  throttle: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export type VirtualButton = 'up' | 'down' | 'left' | 'right' | 'hand' | 'nitro' | 'fire';

/** Keyboard + on-screen (touch) input with arcade-friendly axes. */
export class Input implements ControlState {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private virtual = new Set<VirtualButton>();
  /** Analog stick (touch): x right +, y forward +, both -1..1. */
  private stickX = 0;
  private stickY = 0;

  /** Set by the game each frame: gamepad controls change meaning between driving and walking, and in menus. */
  mode: 'car' | 'foot' = 'car';
  menu = false;
  /** True while the last input came from a gamepad (the HUD then shows controller hints). */
  padActive = false;
  onPadChange: ((active: boolean) => void) | null = null;
  private pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, a: false, x: false, rb: false, lb: false, lsClick: false };
  private mouseDown = false;
  private prevBtn: boolean[] = [];
  private gpRef: Gamepad | null = null;
  private lastRumble = 0;

  /** Accumulated camera-look deltas (pixels) since the last `takeLook`. */
  private lookX = 0;
  private lookY = 0;

  /** Wire mouse + touch-look to the game canvas. Left click = attack, right click = kick, wheel = weapon. */
  attachCanvas(canvas: HTMLElement): void {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.setPadActive(false);
      if (e.button === 0) { this.pressed.add('Attack'); this.mouseDown = true; }
      if (e.button === 2) this.pressed.add('Kick');
      // capture the mouse on first click for orbiting (Esc releases it)
      if (e.button === 0 && !document.pointerLockElement && !document.body.classList.contains('is-touch')) {
        try { void canvas.requestPointerLock?.(); } catch { /* optional */ }
      }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.lookX += e.movementX; this.lookY += e.movementY; }
      else if (e.buttons & 4) { this.lookX += e.movementX; this.lookY += e.movementY; } // middle-drag orbit
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.pressed.add(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
    }, { passive: false });
    // touch look: a finger dragged on the open canvas orbits the camera
    let last: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') last = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !last) return;
      this.lookX += (e.clientX - last.x) * 1.4; this.lookY += (e.clientY - last.y) * 1.4;
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  releaseMouse(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  takeLook(): { x: number; y: number } {
    const r = { x: this.lookX * settings.sens, y: this.lookY * settings.sens };
    this.lookX = this.lookY = 0;
    return r;
  }

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.setPadActive(false);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      const code = canonical(e.code);
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(canonical(e.code)));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });
  }

  private any(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
  }

  setVirtual(b: VirtualButton, on: boolean): void {
    if (on) this.virtual.add(b);
    else this.virtual.delete(b);
  }

  /** Simulate a one-shot key press (touch action buttons). */
  tap(code: string): void {
    this.pressed.add(code);
  }

  get throttle(): number {
    const up = this.any('KeyW', 'ArrowUp') || this.virtual.has('up');
    const dn = this.any('KeyS', 'ArrowDown') || this.virtual.has('down');
    const digital = (up ? 1 : 0) - (dn ? 1 : 0);
    if (digital !== 0) return digital;
    if (this.stickY !== 0) return this.stickY;
    // gamepad: triggers drive the car (RT gas, LT brake / reverse); on foot the left stick moves forward / back
    if (this.mode === 'car') {
      const trig = this.pad.rt - this.pad.lt;
      return Math.abs(trig) > 0.04 ? trig : 0;
    }
    return this.pad.ly;
  }
  get steer(): number {
    const r = this.any('KeyD', 'ArrowRight') || this.virtual.has('right');
    const l = this.any('KeyA', 'ArrowLeft') || this.virtual.has('left');
    const digital = (r ? 1 : 0) - (l ? 1 : 0);
    if (digital !== 0) return digital;
    return this.stickX !== 0 ? this.stickX : this.pad.lx;
  }
  get handbrake(): boolean {
    return this.any('Space') || this.virtual.has('hand') || (this.mode === 'car' && this.pad.a);
  }
  get nitro(): boolean {
    if (this.any('ShiftLeft', 'ShiftRight') || this.virtual.has('nitro')) return true;
    // gamepad: RB boosts the car; on foot LT or a left-stick click sprints
    return this.mode === 'car' ? this.pad.rb : this.pad.lt > 0.5 || this.pad.lsClick;
  }
  /** Fire button held: left mouse, the touch HIT button, RT or X on a gamepad (used by automatic guns). */
  get fireHeld(): boolean {
    return this.mouseDown || this.virtual.has('fire') || (this.mode === 'foot' && !this.menu && (this.pad.rt > 0.5 || this.pad.x));
  }
  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }
  endFrame(): void {
    this.pressed.clear();
  }

  private setPadActive(on: boolean): void {
    if (on === this.padActive) return;
    this.padActive = on;
    document.body.classList.toggle('gamepad', on);
    this.onPadChange?.(on);
  }

  /** Short vibration on controllers that support it (impacts, hits). */
  rumble(strong: number, weak: number, ms: number): void {
    const gp = this.gpRef as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null;
    if (!this.padActive || !gp?.vibrationActuator?.playEffect) return;
    const now = performance.now();
    if (now - this.lastRumble < 90) return;
    this.lastRumble = now;
    try {
      void gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong })?.catch?.(() => undefined);
    } catch { /* unsupported */ }
  }

  /**
   * Poll the first connected gamepad (standard layout). Call once per frame.
   * Driving: RT gas, LT brake/reverse, left stick steer, A handbrake, RB nitro.
   * On foot: left stick move, right stick camera, X attack, RB kick, A jump / dodge, B dodge, LT or L3 sprint, LB weapon.
   * Common: Y enter/exit, Start pause, right-stick click map, Back reset car, D-pad up time of day, D-pad left/right weapon. In menus: D-pad + A, B back.
   */
  pollGamepad(dt: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected && p.buttons.length >= 10) { gp = p; break; }
    this.gpRef = gp;
    const P = this.pad;
    if (!gp) {
      P.lx = P.ly = P.rx = P.ry = P.lt = P.rt = 0;
      P.a = P.rb = P.lb = P.lsClick = P.x = false;
      this.prevBtn = [];
      return;
    }
    // radial dead zone so a resting stick never drifts the car or camera
    const stick = (x: number, y: number): [number, number] => {
      const m = Math.hypot(x, y);
      if (m < 0.18) return [0, 0];
      const k = Math.min(1, (m - 0.18) / 0.82) / m;
      return [x * k, y * k];
    };
    const [lx, ly] = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
    const [rx, ry] = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
    P.lx = lx; P.ly = -ly; P.rx = rx; P.ry = ry;
    const val = (i: number) => gp!.buttons[i]?.value ?? 0;
    const held = (i: number) => !!gp!.buttons[i]?.pressed || val(i) > 0.5;
    P.lt = val(6); P.rt = val(7);
    P.a = held(0); P.x = held(2); P.rb = held(5); P.lb = held(4); P.lsClick = held(10);

    const foot = this.mode === 'foot' && !this.menu;
    const now: boolean[] = [];
    for (let i = 0; i < 16; i++) now[i] = held(i);
    const edge = (i: number) => now[i] && !this.prevBtn[i];
    const add = (c: string) => this.pressed.add(c);
    let active = Math.hypot(lx, ly) > 0.4 || Math.hypot(rx, ry) > 0.4 || P.lt > 0.3 || P.rt > 0.3;
    for (let i = 0; i < 16; i++) if (edge(i)) active = true;
    if (edge(0)) { add('Space'); add('PadA'); }
    if (edge(1)) { add('PadB'); if (this.menu) add('Escape'); else if (foot) add('ControlLeft'); }
    if (edge(2)) { add('PadX'); if (foot) add('Attack'); }
    if (edge(3)) { add('PadY'); add('KeyF'); }
    if (edge(4) && foot) add('KeyV');
    if (edge(5) && foot) add('Kick');
    if (edge(8)) add('KeyR');
    if (edge(9)) { add('Escape'); add('Enter'); }
    if (edge(11)) add('KeyM');
    if (edge(12)) { add('PadUp'); if (!this.menu) add('KeyT'); }
    if (edge(13)) add('PadDown');
    if (edge(14)) { add('PadLeft'); if (foot) add('WheelDown'); }
    if (edge(15)) { add('PadRight'); if (foot) add('WheelUp'); }
    this.prevBtn = now;
    if (active) this.setPadActive(true);
    // right stick orbits the camera (mouse-pixel equivalent)
    this.lookX += P.rx * 1000 * dt;
    this.lookY += P.ry * 700 * dt;
  }
}
