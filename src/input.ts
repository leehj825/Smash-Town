// Keyboard input with arcade-friendly axes.
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();

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

  /** +1 accelerate, -1 brake/reverse. */
  get throttle(): number {
    return (this.any('KeyW', 'ArrowUp') ? 1 : 0) - (this.any('KeyS', 'ArrowDown') ? 1 : 0);
  }
  /** +1 steer right, -1 steer left. */
  get steer(): number {
    return (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'ArrowLeft') ? 1 : 0);
  }
  get handbrake(): boolean {
    return this.any('Space');
  }
  get nitro(): boolean {
    return this.any('ShiftLeft', 'ShiftRight');
  }
  /** True once per key press. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }
  endFrame(): void {
    this.pressed.clear();
  }
}
