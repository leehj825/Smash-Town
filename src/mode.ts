/**
 * Game modes.
 *  - story:   the normal game. Your progress is saved in the chosen slot. (Its starting state is set in game.ts.)
 *  - sandbox: a free playground. Everything is unlocked, ammunition never runs out, the story is switched off and nothing is saved, so it never
 *             touches a story slot. A chaos panel on the phone sets the wanted level, the weather and the time, spawns cars and so on.
 *  - kids:    Kids Play, a separate gentle mode (see kids.ts): fists only, people run instead of falling, easy escapes, quick car swaps, nothing saved.
 *  - classic: the starting state the game had before modes existed ($2,000, two cars, a pistol). Automated tests run in it, so they keep their
 *             exact numbers. Pick it by hand with ?mode=classic.
 */
export type GameMode = 'story' | 'sandbox' | 'kids' | 'classic';
export const MODE_KEY = 'smashtown.mode';

export function currentMode(): GameMode {
  try {
    const q = new URLSearchParams(location.search).get('mode');
    if (q === 'story' || q === 'sandbox' || q === 'kids' || q === 'classic') return q;
    if (navigator.webdriver) return 'classic';
    const m = localStorage.getItem(MODE_KEY);
    return m === 'sandbox' ? 'sandbox' : m === 'kids' ? 'kids' : 'story';
  } catch { return 'story'; }
}

/** Story difficulty: 0 easy, 1 normal, 2 hard. It changes only two things: how fast the police heat builds and how much cash found in the world is worth. */
export const DIFF_KEY = 'smashtown.diff';
export const DIFFS = [{ heat: 0.75, money: 1.25 }, { heat: 1, money: 1 }, { heat: 1.3, money: 0.8 }] as const;
export function currentDifficulty(): 0 | 1 | 2 {
  try { if (navigator.webdriver) return 1; const d = Number(localStorage.getItem(DIFF_KEY)); return d === 0 || d === 2 ? d : 1; } catch { return 1; }
}
