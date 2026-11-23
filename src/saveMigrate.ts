/**
 * Save data versions. Every save carries `v`. When a field changes shape, add a step here that turns version N into N+1; old saves are carried
 * forward one step at a time when they load, so nothing a player earned is lost. A save from a newer game (a higher `v`) is read as far as this
 * version understands it and written back with the version it was read with, so it is not downgraded by mistake.
 *
 * History:
 *  1 - the original format (no `v` field)
 *  2 - adds `v`, `friends`, `hour` (the game clock); `rep` also holds faction standings ('watch', 'mafia')
 */
export const SAVE_VERSION = 2;

type Raw = Record<string, unknown>;
const STEPS: ((s: Raw) => Raw)[] = [
  // 1 -> 2
  (s) => ({ ...s, friends: s.friends ?? {}, hour: typeof s.hour === 'number' ? s.hour : 12 }),
];

/** Bring a parsed save up to the current version. Garbage in, an empty object out (the loader falls back to defaults). */
export function migrateSave(parsed: unknown): Raw {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  let s = { ...(parsed as Raw) };
  let v = typeof s.v === 'number' && s.v >= 1 ? Math.floor(s.v) : 1;
  const original = v;
  while (v < SAVE_VERSION) { s = STEPS[v - 1](s); v++; }
  s.v = Math.max(original, SAVE_VERSION);
  return s;
}
