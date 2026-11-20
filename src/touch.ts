import type { Input, VirtualButton } from './input';

/** On-screen controls for phones/tablets (also forced with ?touch=1). */
export function setupTouch(input: Input): boolean {
  const forced = new URLSearchParams(location.search).has('touch');
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!forced && !coarse) return false;
  const root = document.getElementById('touch')!;
  root.hidden = false;
  document.body.classList.add('is-touch');
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
