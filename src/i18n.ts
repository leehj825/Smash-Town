// Lightweight i18n: flat key-value dictionaries. English is ALWAYS the default; Korean is an opt-in setting.
export type Lang = 'en' | 'ko';

const dict = {
  en: {
    'ui.title': 'SMASH TOWN',
    'ui.wasted': 'WASTED',
    'ui.story': 'STORY',
    'ui.toast.pad': 'Controller connected',
    'ui.pad.drive': 'Controller: RT gas · LT brake · L-stick steer · A drift · RB nitro · Y exit · R3 map · Start pause',
    'ui.pad.foot': 'Controller: L-stick move · R-stick camera · X attack · RB kick · A jump / dodge · B dodge · LT aim · L3 sprint · LB weapon · RT fire · Y enter car · R3 map',
    'ui.dialog.continue': 'Press F or tap to continue',
    'ui.stars_found': 'Golden stars',
    'ui.story.wait': 'Lose the police first!',
    'ui.settings.radio': 'Radio (N)',
    'ui.settings.weather': 'Weather',
    'ui.weather.auto': 'Auto',
    'ui.weather.clear': 'Clear',
    'ui.weather.rain': 'Rain',
    'ui.weather.fog': 'Fog',
    'ui.weather.storm': 'Storm',
    'ui.weather.snow': 'Snow',
    'ui.settings.sens': 'Look sensitivity',
    'ui.settings.aimsens': 'Aim sensitivity',
    'ui.settings.autoaim': 'Auto-aim (B)',
    'ui.hint.aim': '[R-Click / X] Aim · [B] Auto-aim',
    'ui.settings.fov': 'Field of view',
    'ui.settings.shake': 'Camera shake',
    'ui.settings.controls': 'Controls',
    'ui.settings.stats': 'Stats',
    'ui.settings.howto': 'How to play',
    'ui.settings.newgame': 'New game',
    'ui.settings.newgame_confirm': 'Erase save? Press again',
    'ui.map': 'MAP',
    'ui.map.close': 'M / Esc / B to close',
    'ui.nav.here': 'You are here!',
    'ui.hint.map': 'M: Big map',
    'ui.knocked_out': 'KNOCKED OUT',
    'ui.settings.kids': 'Kids Play',
    'ui.settings.kids_hint': 'Nobody gets hurt: everyone is just knocked out',
    'pop.ko': 'K.O.!',
    'ui.mission.defeat_police': 'DEFEAT THE POLICE!',
    'ui.hint.enter_car': '[F] Enter Vehicle',
    'ui.hint.exit_car': '[F] Exit Vehicle',
    'ui.hint.attack': '[L-Click] Punch / Swing / Fire',
    'ui.hint.kick': '[R-Click / Q] Kick',
    'ui.hint.dodge': '[Space] Dodge Roll',
    'ui.hint.jump': '[C] Jump',
    'ui.hint.weapon_swap': '[1-8 / Scroll] Switch Weapon · [R] Reload',
    'ui.weapon.fist': 'Fist',
    'ui.weapon.bat': 'Bat',
    'ui.weapon.baton': 'Baton',
    'ui.toast.baton': 'Baton acquired! [3]',
    'pop.pow': 'POW!',
    'pop.wham': 'WHAM!',
    'pop.smash': 'SMASH!',
    'gig.brawl.title': 'BRAWL',
    'gig.brawl.obj': 'Officers down {a} / {b}',
    'ui.tagline': 'Instant arcade chaos in your browser',
    'ui.play': 'PLAY',
    'ui.wanted': 'WANTED',
    'ui.smash_combo': 'SMASH COMBO',
    'ui.busted': 'BUSTED',
    'ui.wrecked': 'WRECKED',
    'ui.paused': 'PAUSED',
    'ui.resume': 'RESUME',
    'ui.nitro': 'NITRO',
    'ui.hp': 'HP',
    'ui.kmh': 'km/h',
    'ui.settings.language': 'Language',
    'ui.settings.graphics': 'Graphics',
    'ui.settings.time': 'Time of day',
    'ui.settings.audio': 'Audio',
    'ui.on': 'On',
    'ui.off': 'Off',
    'ui.quality.high': 'High',
    'ui.quality.medium': 'Medium',
    'ui.quality.low': 'Low',
    'ui.time.noon': 'Noon',
    'ui.time.sunset': 'Sunset',
    'ui.time.night': 'Night',
    'ui.hint.drive': 'WASD / Arrows: Drive',
    'ui.hint.handbrake': 'SPACE: Drift',
    'ui.hint.nitro': 'SHIFT: Nitro / Sprint',
    'ui.hint.enter': 'F: Enter / Exit vehicle',
    'ui.hint.time': 'T: Time of day',
    'ui.hint.reset': 'R: Reset car',
    'ui.toast.notenough': 'Not enough cash!',
    'ui.toast.repaired': 'Repaired',
    'ui.toast.unlocked': 'Vehicle unlocked!',
    'ui.toast.wanted': 'Wanted level {n}',
    'ui.toast.lost': 'Lost the cops',
    'ui.toast.busted': 'Lost ${n}',
    'ui.toast.jump': 'Jump: {n} m',
    'ui.garage.title': 'PAY & SPRAY',
    'ui.garage.repair': 'Repair car',
    'ui.garage.vehicles': 'Vehicles',
    'ui.garage.unlock': 'Unlock',
    'ui.garage.select': 'Select',
    'ui.garage.selected': 'In use',
    'ui.garage.close': 'LEAVE',
    'ui.garage.cash': 'Cash',
    'veh.sports': 'Sports Car',
    'veh.sedan': 'Sedan',
    'veh.taxi': 'Taxi',
    'veh.pickup': 'Pickup Truck',
    'veh.muscle': 'Muscle Car',
    'veh.supercar': 'Supercar',
    'veh.limo': 'Stretch Limo',
    'veh.monster': 'Monster Truck',
    'veh.motorbike': 'Motorbike',
    'veh.scooter': 'Scooter',
    'veh.bicycle': 'Bicycle',
    'gig.rampage.title': 'SMASH RAMPAGE',
    'gig.rampage.obj': 'Damage ${a} / ${b}',
    'gig.delivery.title': 'HOT DELIVERY',
    'gig.delivery.obj': 'Checkpoint {a} / {b} - evade the police!',
    'gig.hijack.title': 'GRAND HIJACK',
    'gig.hijack.steal': 'Steal the marked supercar',
    'gig.hijack.deliver': 'Deliver it to a garage - keep it intact',
    'gig.complete': 'GIG COMPLETE +${n}',
    'gig.failed': 'GIG FAILED',
    'gig.start': 'Gig started',
  },
  ko: {
    'ui.title': '스매시 타운',
    'ui.wasted': '기절함',
    'ui.story': '스토리',
    'ui.toast.pad': '컨트롤러 연결됨',
    'ui.pad.drive': '컨트롤러: RT 가속 · LT 브레이크 · 왼쪽 스틱 조향 · A 드리프트 · RB 니트로 · Y 하차 · Start 일시정지 · R3 지도',
    'ui.pad.foot': '컨트롤러: 왼쪽 스틱 이동 · 오른쪽 스틱 카메라 · X 공격 · RB 발차기 · A 점프 / 회피 · B 회피 · LT 조준 · L3 달리기 · LB 무기 · Y 차량 탑승 · R3 지도',
    'ui.dialog.continue': 'F 키 또는 화면을 눌러 계속',
    'ui.stars_found': '황금 별',
    'ui.story.wait': '먼저 경찰을 따돌리세요!',
    'ui.settings.radio': '라디오 (N)',
    'ui.settings.weather': '날씨',
    'ui.weather.auto': '자동',
    'ui.weather.clear': '맑음',
    'ui.weather.rain': '비',
    'ui.weather.fog': '안개',
    'ui.weather.storm': '폭풍',
    'ui.weather.snow': '눈',
    'ui.settings.sens': '시점 감도',
    'ui.settings.aimsens': '조준 감도',
    'ui.settings.autoaim': '자동 조준 (B)',
    'ui.hint.aim': '[우클릭 / X] 조준 · [B] 자동 조준',
    'ui.settings.fov': '시야각',
    'ui.settings.shake': '화면 흔들림',
    'ui.settings.controls': '조작키',
    'ui.settings.stats': '기록',
    'ui.settings.howto': '플레이 방법',
    'ui.settings.newgame': '새 게임',
    'ui.settings.newgame_confirm': '저장 삭제? 한 번 더',
    'ui.map': '지도',
    'ui.map.close': 'M / Esc / B 로 닫기',
    'ui.nav.here': '여기예요!',
    'ui.hint.map': 'M: 큰 지도',
    'ui.knocked_out': '기절!',
    'ui.settings.kids': '어린이 모드',
    'ui.settings.kids_hint': '아무도 다치지 않아요: 모두 기절만 해요',
    'pop.ko': '기절!',
    'ui.mission.defeat_police': '경찰을 무찌르세요!',
    'ui.hint.enter_car': '[F] 차량 탑승',
    'ui.hint.exit_car': '[F] 차량 하차',
    'ui.hint.attack': '[좌클릭] 주먹 / 무기 공격',
    'ui.hint.kick': '[우클릭 / Q] 발차기',
    'ui.hint.dodge': '[스페이스바] 회피',
    'ui.hint.jump': '[C] 점프',
    'ui.hint.weapon_swap': '[1-8 / 휠] 무기 교체 · [R] 장전',
    'ui.weapon.fist': '주먹',
    'ui.weapon.bat': '배트',
    'ui.weapon.baton': '경찰봉',
    'ui.toast.baton': '경찰봉 획득! [3]',
    'pop.pow': '퍽!',
    'pop.wham': '쾅!',
    'pop.smash': '박살!',
    'gig.brawl.title': '난투',
    'gig.brawl.obj': '쓰러뜨린 경찰 {a} / {b}',
    'ui.tagline': '브라우저에서 즐기는 즉석 아케이드 질주',
    'ui.play': '플레이',
    'ui.wanted': '지명수배',
    'ui.smash_combo': '스매시 콤보',
    'ui.busted': '체포됨',
    'ui.wrecked': '차량 파손',
    'ui.paused': '일시정지',
    'ui.resume': '계속하기',
    'ui.nitro': '니트로',
    'ui.hp': '내구도',
    'ui.kmh': 'km/h',
    'ui.settings.language': '언어',
    'ui.settings.graphics': '그래픽',
    'ui.settings.time': '시간대',
    'ui.settings.audio': '오디오',
    'ui.on': '켜짐',
    'ui.off': '꺼짐',
    'ui.quality.high': '높음',
    'ui.quality.medium': '중간',
    'ui.quality.low': '낮음',
    'ui.time.noon': '정오',
    'ui.time.sunset': '노을',
    'ui.time.night': '밤',
    'ui.hint.drive': 'WASD / 방향키: 운전',
    'ui.hint.handbrake': '스페이스바: 드리프트',
    'ui.hint.nitro': 'SHIFT: 니트로 / 달리기',
    'ui.hint.enter': 'F: 차량 타기 / 내리기',
    'ui.hint.time': 'T: 시간대 변경',
    'ui.hint.reset': 'R: 차량 복구',
    'ui.toast.notenough': '현금이 부족합니다!',
    'ui.toast.repaired': '수리 완료',
    'ui.toast.unlocked': '차량 잠금 해제!',
    'ui.toast.wanted': '수배 레벨 {n}',
    'ui.toast.lost': '경찰을 따돌렸습니다',
    'ui.toast.busted': '-${n}',
    'ui.toast.jump': '점프: {n} m',
    'ui.garage.title': '페이 앤 스프레이',
    'ui.garage.repair': '차량 수리',
    'ui.garage.vehicles': '차량',
    'ui.garage.unlock': '구매',
    'ui.garage.select': '선택',
    'ui.garage.selected': '사용 중',
    'ui.garage.close': '나가기',
    'ui.garage.cash': '현금',
    'veh.sports': '스포츠카',
    'veh.sedan': '세단',
    'veh.taxi': '택시',
    'veh.pickup': '픽업트럭',
    'veh.muscle': '머슬카',
    'veh.supercar': '슈퍼카',
    'veh.limo': '리무진',
    'veh.monster': '몬스터 트럭',
    'veh.motorbike': '오토바이',
    'veh.scooter': '스쿠터',
    'veh.bicycle': '자전거',
    'gig.rampage.title': '스매시 랙페이지',
    'gig.rampage.obj': '피해액 ${a} / ${b}',
    'gig.delivery.title': '핫 딜리버리',
    'gig.delivery.obj': '체크포인트 {a} / {b} - 경찰을 따돌리세요!',
    'gig.hijack.title': '그랜드 하이잭',
    'gig.hijack.steal': '표시된 슈퍼카를 훔치세요',
    'gig.hijack.deliver': '손상 없이 차고로 배달하세요',
    'gig.complete': '임무 완료 +${n}',
    'gig.failed': '임무 실패',
    'gig.start': '임무 시작',
  },
} as const;

export type I18nKey = keyof (typeof dict)['en'];

const STORAGE_KEY = 'smashtown.lang';
// Default is English. Only an explicit, previously saved choice (made in Settings) switches to Korean.
let current: Lang = 'en';
try {
  if (localStorage.getItem(STORAGE_KEY) === 'ko') current = 'ko';
} catch {
  /* storage unavailable */
}

const listeners = new Set<() => void>();

export function t(key: I18nKey): string {
  return dict[current][key] ?? dict.en[key];
}

/** Translate with `{name}` placeholders. */
export function tf(key: I18nKey, params: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ''));
}

/** Pick the English or Korean text for the active language (used for story dialogue). */
export function bi(en: string, ko: string): string {
  return current === 'ko' ? ko : en;
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
