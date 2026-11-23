// Player settings that survive reloads: look sensitivity, field of view, screen shake, key bindings, tutorial flag.

export interface ActionDef { id: string; def: string; en: string; ko: string }

/** Rebindable keyboard actions. `def` is the canonical key code the game reads; a rebinding maps a different physical key onto it. */
export const ACTIONS: ActionDef[] = [
  { id: 'forward', def: 'KeyW', en: 'Forward / Gas', ko: '앞으로 / 가속' },
  { id: 'back', def: 'KeyS', en: 'Back / Brake', ko: '뒤로 / 브레이크' },
  { id: 'left', def: 'KeyA', en: 'Left', ko: '왼쪽' },
  { id: 'right', def: 'KeyD', en: 'Right', ko: '오른쪽' },
  { id: 'hand', def: 'Space', en: 'Drift / Jump / Dodge', ko: '드리프트 / 점프 / 회피' },
  { id: 'nitro', def: 'ShiftLeft', en: 'Nitro / Sprint', ko: '니트로 / 달리기' },
  { id: 'use', def: 'KeyF', en: 'Enter / exit car, talk', ko: '차량 타기/내리기, 대화' },
  { id: 'reset', def: 'KeyR', en: 'Reset car (driving) / Reload (on foot)', ko: '차량 복구 (운전) / 재장전 (도보)' },
  { id: 'kick', def: 'KeyQ', en: 'Kick', ko: '발차기' },
  { id: 'weapon', def: 'KeyV', en: 'Next weapon', ko: '다음 무기' },
  { id: 'jump', def: 'KeyC', en: 'Jump', ko: '점프' },
  { id: 'time', def: 'KeyT', en: 'Time of day', ko: '시간대 변경' },
  { id: 'aim', def: 'KeyX', en: 'Aim on / off (gun out)', ko: '조준 켜기/끄기 (총 사용 중)' },
  { id: 'auto', def: 'KeyB', en: 'Auto-aim on / off', ko: '자동 조준 켜기/끄기' },
  { id: 'radio', def: 'KeyN', en: 'Radio on / off', ko: '라디오 켜기/끄기' },
  { id: 'map', def: 'KeyM', en: 'Big map', ko: '큰 지도' },
];

/** Keys that can never be bound (menus and system). */
export const RESERVED = new Set(['Escape', 'Enter', 'KeyP', 'Tab']);

export interface Settings {
  sens: number; // mouse / touch look multiplier
  aimSens: number; // look multiplier while aiming (slower is steadier)
  fov: number; // degrees added to the camera field of view
  shake: number; // screen-shake multiplier (0 = off)
  binds: Record<string, string>; // action id -> physical key code
  tutorialDone: boolean;
  /** Accessibility: bigger HUD text, and a colour-blind-safe palette (blue and orange instead of red and green). */
  bigUi: boolean;
  colorSafe: boolean;
  /** A small box with frame rate, triangles and draw calls, for measuring how the game runs on a phone. */
  perfHud: boolean;
}

const KEY = 'smashtown.settings.v1';
const DEFAULTS: Settings = { sens: 1, aimSens: 0.85, fov: 0, shake: 1, binds: {}, tutorialDone: false, bigUi: false, colorSafe: false, perfHud: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      const binds: Record<string, string> = {};
      for (const a of ACTIONS) { const k = s.binds?.[a.id]; if (typeof k === 'string' && k && !RESERVED.has(k)) binds[a.id] = k; }
      return {
        sens: typeof s.sens === 'number' ? s.sens : 1,
        aimSens: typeof s.aimSens === 'number' ? s.aimSens : 0.85,
        fov: typeof s.fov === 'number' ? s.fov : 0,
        shake: typeof s.shake === 'number' ? s.shake : 1,
        binds, tutorialDone: !!s.tutorialDone, bigUi: !!s.bigUi, colorSafe: !!s.colorSafe, perfHud: !!s.perfHud,
      };
    }
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS, binds: {} };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  rebuild();
}

/** Physical key -> canonical key. Keys whose default action was moved elsewhere become unbound. */
let phys2canon = new Map<string, string>();
let shadowed = new Set<string>();
function rebuild(): void {
  phys2canon = new Map();
  shadowed = new Set();
  for (const a of ACTIONS) {
    const k = settings.binds[a.id];
    if (k && k !== a.def) phys2canon.set(k, a.def);
  }
  for (const a of ACTIONS) if (settings.binds[a.id] && settings.binds[a.id] !== a.def && !phys2canon.has(a.def)) shadowed.add(a.def);
}
rebuild();

export function canonical(code: string): string {
  const c = phys2canon.get(code);
  if (c) return c;
  return shadowed.has(code) ? 'Unbound:' + code : code;
}

export function keyFor(id: string): string {
  const a = ACTIONS.find((x) => x.id === id)!;
  return settings.binds[id] ?? a.def;
}

/** Bind `code` to an action; if another action already uses it the two swap keys. */
export function bindKey(id: string, code: string): void {
  if (RESERVED.has(code)) return;
  const old = keyFor(id);
  for (const a of ACTIONS) if (a.id !== id && keyFor(a.id) === code) settings.binds[a.id] = old;
  settings.binds[id] = code;
  // drop entries equal to the default so the map stays small
  for (const a of ACTIONS) if (settings.binds[a.id] === a.def) delete settings.binds[a.id];
  saveSettings();
}

export function resetBinds(): void { settings.binds = {}; saveSettings(); }

export function prettyKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace('Left', ' L').replace('Right', ' R').replace('Arrow', '↔ ').replace('Space', 'Space');
}
