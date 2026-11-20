// Lightweight i18n: flat key-value dictionaries, English default, Korean built in.
export type Lang = 'en' | 'ko';

const dict = {
  en: {
    'ui.title': 'SMASH TOWN',
    'ui.tagline': 'Instant arcade chaos in your browser',
    'ui.play': 'PLAY',
    'ui.wanted': 'WANTED',
    'ui.smash_combo': 'SMASH COMBO',
    'ui.busted': 'BUSTED',
    'ui.paused': 'PAUSED',
    'ui.resume': 'RESUME',
    'ui.nitro': 'NITRO',
    'ui.hp': 'HP',
    'ui.kmh': 'km/h',
    'ui.settings.language': 'Language',
    'ui.settings.graphics': 'Graphics',
    'ui.settings.time': 'Time of day',
    'ui.quality.high': 'High',
    'ui.quality.medium': 'Medium',
    'ui.quality.low': 'Low',
    'ui.time.noon': 'Noon',
    'ui.time.sunset': 'Sunset',
    'ui.time.night': 'Night',
    'ui.hint.drive': 'WASD / Arrows: Drive',
    'ui.hint.handbrake': 'SPACE: Drift',
    'ui.hint.nitro': 'SHIFT: Nitro',
    'ui.hint.time': 'T: Time of day',
    'ui.hint.reset': 'R: Reset car',
  },
  ko: {
    'ui.title': '스매시 타운',
    'ui.tagline': '브라우저에서 즐기는 즉석 아케이드 질주',
    'ui.play': '플레이',
    'ui.wanted': '지명수배',
    'ui.smash_combo': '스매시 콤보',
    'ui.busted': '체포됨',
    'ui.paused': '일시정지',
    'ui.resume': '계속하기',
    'ui.nitro': '니트로',
    'ui.hp': '내구도',
    'ui.kmh': 'km/h',
    'ui.settings.language': '언어',
    'ui.settings.graphics': '그래픽',
    'ui.settings.time': '시간대',
    'ui.quality.high': '높음',
    'ui.quality.medium': '중간',
    'ui.quality.low': '낮음',
    'ui.time.noon': '정오',
    'ui.time.sunset': '노을',
    'ui.time.night': '밤',
    'ui.hint.drive': 'WASD / 방향키: 운전',
    'ui.hint.handbrake': '스페이스바: 드리프트',
    'ui.hint.nitro': 'SHIFT: 니트로',
    'ui.hint.time': 'T: 시간대 변경',
    'ui.hint.reset': 'R: 차량 복구',
  },
} as const;

export type I18nKey = keyof (typeof dict)['en'];

const STORAGE_KEY = 'smashtown.lang';
let current: Lang = 'en';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'ko') current = saved;
} catch {
  /* storage unavailable */
}

const listeners = new Set<() => void>();

export function t(key: I18nKey): string {
  return dict[current][key] ?? dict.en[key];
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  applyDom();
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Re-translate every element carrying a `data-i18n` attribute. */
export function applyDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey);
  });
}
