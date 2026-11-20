export interface ControlState {
  throttle: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}

export type VirtualButton = 'up' | 'down' | 'left' | 'right' | 'hand' | 'nitro';

/** Keyboard + on-screen (touch) input with arcade-friendly axes. */
export class Input implements ControlState {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private virtual = new Set<VirtualButton>();

  /** Accumulated camera-look deltas (pixels) since the last `takeLook`. */
  private lookX = 0;
  private lookY = 0;

  /** Wire mouse + touch-look to the game canvas. Left click = attack, right click = kick, wheel = weapon. */
  attachCanvas(canvas: HTMLElement): void {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pressed.add('Attack');
      if (e.button === 2) this.pressed.add('Kick');
      // capture the mouse on first click for orbiting (Esc releases it)
      if (e.button === 0 && !document.pointerLockElement && !document.body.classList.contains('is-touch')) {
        try { void canvas.requestPointerLock?.(); } catch { /* optional */ }
      }
    });
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
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
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
    return (up ? 1 : 0) - (dn ? 1 : 0);
  }
  get steer(): number {
    const r = this.any('KeyD', 'ArrowRight') || this.virtual.has('right');
    const l = this.any('KeyA', 'ArrowLeft') || this.virtual.has('left');
    return (r ? 1 : 0) - (l ? 1 : 0);
  }
  get handbrake(): boolean {
    return this.any('Space') || this.virtual.has('hand');
  }
  get nitro(): boolean {
    return this.any('ShiftLeft', 'ShiftRight') || this.virtual.has('nitro');
  }
  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }
  endFrame(): void {
    this.pressed.clear();
  }
}
