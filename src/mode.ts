/**
 * Game modes.
 *  - story:   the normal game. Your progress is saved in the chosen slot. (Its starting state is set in game.ts.)
 *  - sandbox: a free playground. Everything is unlocked, ammunition never runs out, the story is switched off and nothing is saved, so it never
 *             touches a story slot. A chaos panel on the phone sets the wanted level, the weather and the time, spawns cars and so on.
 *  - classic: the starting state the game had before modes existed ($2,000, two cars, a pistol). Automated tests run in it, so they keep their
 *             exact numbers. Pick it by hand with ?mode=classic.
 */
export type GameMode = 'story' | 'sandbox' | 'classic';
export const MODE_KEY = 'smashtown.mode';

export function currentMode(): GameMode {
  try {
    const q = new URLSearchParams(location.search).get('mode');
    if (q === 'story' || q === 'sandbox' || q === 'classic') return q;
    if (navigator.webdriver) return 'classic';
    const m = localStorage.getItem(MODE_KEY);
    return m === 'sandbox' ? 'sandbox' : 'story';
  } catch { return 'story'; }
}
