import type { Input, VirtualButton } from './input';

/** On-screen controls for phones/tablets (also forced with ?touch=1). */
export function setupTouch(input: Input): boolean {
  const forced = new URLSearchParams(location.search).has('touch');
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!forced && !coarse) return false;
  const root = document.getElementById('touch')!;
  root.hidden = false;
  document.body.classList.add('is-touch');
  setupStick(input);
  root.querySelectorAll<HTMLElement>('[data-vbtn]').forEach((el) => {
    const name = el.dataset.vbtn as VirtualButton;
    const on = (e: Event) => { e.preventDefault(); input.setVirtual(name, true); el.classList.add('down'); };
    const off = (e: Event) => { e.preventDefault(); input.setVirtual(name, false); el.classList.remove('down'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  });
  root.querySelectorAll<HTMLElement>('[data-tap]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); input.tap(el.dataset.tap!); });
  });
  return true;
}

/** Analog joystick: drag the knob; the vector drives forward/back (y) and strafe left/right (x). */
function setupStick(input: Input): void {
  const base = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  if (!base || !knob) return;
  let active: number | null = null;
  const DEAD = 0.14;
  const update = (e: PointerEvent) => {
    const r = base.getBoundingClientRect();
    const radius = r.width / 2 - 6;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let x = dx / radius, y = -dy / radius;
    const m = Math.hypot(x, y);
    if (m < DEAD) { x = 0; y = 0; } else { const k = (m - DEAD) / (1 - DEAD) / m; x *= k; y *= k; }
    input.setStick(x, y);
  };
  const release = () => {
    active = null;
    knob.style.transform = 'translate(0, 0)';
    input.setStick(0, 0);
  };
  base.addEventListener('pointerdown', (e) => { e.preventDefault(); active = e.pointerId; base.setPointerCapture(e.pointerId); update(e); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === active) update(e); });
  base.addEventListener('pointerup', (e) => { if (e.pointerId === active) release(); });
  base.addEventListener('pointercancel', release);
}
