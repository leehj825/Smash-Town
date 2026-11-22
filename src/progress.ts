// Long-term progress: lifetime stats, achievements, daily challenges and shop ownership.

export type StatKey = 'smashes' | 'stars' | 'copsKO' | 'gigs' | 'earned' | 'driveM' | 'playSec' | 'roofs' | 'shops' | 'quests' | 'fares' | 'races' | 'heists' | 'bounties' | 'hides' | 'deliveries' | 'robberies';
export type Stats = Record<StatKey, number>;
export const emptyStats = (): Stats => ({ smashes: 0, stars: 0, copsKO: 0, gigs: 0, earned: 0, driveM: 0, playSec: 0, roofs: 0, shops: 0, quests: 0, fares: 0, races: 0, heists: 0, bounties: 0, hides: 0, deliveries: 0, robberies: 0 });

export interface Achievement { id: string; en: string; ko: string; key: StatKey; target: number }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'smash50', en: 'Demolition Rookie: smash 50 props', ko: '철거 새내기: 물건 50개 부수기', key: 'smashes', target: 50 },
  { id: 'smash300', en: 'Wrecking Crew: smash 300 props', ko: '철거반: 물건 300개 부수기', key: 'smashes', target: 300 },
  { id: 'stars8', en: 'Star Hunter: collect 8 golden stars', ko: '별 사냥꾼: 황금 별 8개', key: 'stars', target: 8 },
  { id: 'stars16', en: 'Constellation: collect every golden star', ko: '별자리: 황금 별 모두 모으기', key: 'stars', target: 16 },
  { id: 'cops10', en: 'Tough Guy: knock out 10 cops', ko: '터프가이: 경찰 10명 제압', key: 'copsKO', target: 10 },
  { id: 'gigs5', en: 'Odd Jobs: finish 5 side jobs', ko: '아르바이트: 부업 5번 완료', key: 'gigs', target: 5 },
  { id: 'earn10k', en: 'Pocket Money: earn $10,000', ko: '용돈: $10,000 벌기', key: 'earned', target: 10000 },
  { id: 'earn100k', en: 'Big Spender: earn $100,000', ko: '큰손: $100,000 벌기', key: 'earned', target: 100000 },
  { id: 'drive20', en: 'Road Tripper: drive 20 km', ko: '드라이버: 20km 주행', key: 'driveM', target: 20000 },
  { id: 'roofs5', en: 'Rooftop Runner: climb 5 times', ko: '옥상 러너: 사다리 5번 오르기', key: 'roofs', target: 5 },
  { id: 'shops10', en: 'Regular: visit shops 10 times', ko: '단골: 상점 10번 방문', key: 'shops', target: 10 },
  { id: 'fares5', en: 'Cabbie: finish 5 taxi fares', ko: '택시 기사: 손님 5명 태우기', key: 'fares', target: 5 },
  { id: 'races3', en: 'Street Racer: win 3 street races', ko: '스트리트 레이서: 레이스 3번 우승', key: 'races', target: 3 },
  { id: 'heist1', en: 'Master Thief: crack the bank vault', ko: '대도: 은행 금고 털기', key: 'heists', target: 1 },
  { id: 'bounty1', en: 'Hunter Hunted: wreck a bounty hunter', ko: '사냥꾼 사냥: 현상금 사냥꾼 격파', key: 'bounties', target: 1 },
  { id: 'hide3', en: 'Lie Low: hide from the police 3 times', ko: '잠수: 경찰 피해 3번 숨기', key: 'hides', target: 3 },
  { id: 'deliv5', en: 'Delivery Hero: finish 5 delivery runs', ko: '배달의 달인: 배달 5번 완료', key: 'deliveries', target: 5 },
  { id: 'rob3', en: 'Sticky Fingers: rob 3 tills', ko: '날쌘 손: 가게 금고 3번 털기', key: 'robberies', target: 3 },
  { id: 'quests5', en: 'Helpful Neighbour: finish 5 street quests', ko: '이웃 도우미: 거리 퀘스트 5번', key: 'quests', target: 5 },
];

export interface DailyTemplate { id: string; en: string; ko: string; key: StatKey; target: number; reward: number }
const DAILY_POOL: DailyTemplate[] = [
  { id: 'd-smash', en: 'Smash 25 props', ko: '물건 25개 부수기', key: 'smashes', target: 25, reward: 600 },
  { id: 'd-smash2', en: 'Smash 60 props', ko: '물건 60개 부수기', key: 'smashes', target: 60, reward: 1400 },
  { id: 'd-drive', en: 'Drive 3 km', ko: '3km 주행하기', key: 'driveM', target: 3000, reward: 700 },
  { id: 'd-stars', en: 'Collect 3 golden stars', ko: '황금 별 3개 모으기', key: 'stars', target: 3, reward: 900 },
  { id: 'd-cops', en: 'Knock out 3 cops', ko: '경찰 3명 제압하기', key: 'copsKO', target: 3, reward: 800 },
  { id: 'd-gigs', en: 'Finish 2 side jobs', ko: '부업 2번 완료하기', key: 'gigs', target: 2, reward: 1000 },
  { id: 'd-earn', en: 'Earn $3,000', ko: '$3,000 벌기', key: 'earned', target: 3000, reward: 800 },
  { id: 'd-roof', en: 'Climb 2 ladders', ko: '사다리 2번 오르기', key: 'roofs', target: 2, reward: 500 },
  { id: 'd-fare', en: 'Finish 2 taxi fares', ko: '택시 손님 2명 태우기', key: 'fares', target: 2, reward: 900 },
  { id: 'd-race', en: 'Win a street race', ko: '스트리트 레이스 우승', key: 'races', target: 1, reward: 1200 },
  { id: 'd-deliv', en: 'Finish a delivery run', ko: '배달 1번 완료하기', key: 'deliveries', target: 1, reward: 900 },
  { id: 'd-quest', en: 'Finish 2 street quests', ko: '거리 퀘스트 2번 완료하기', key: 'quests', target: 2, reward: 900 },
];

export interface DailyState { day: string; base: Stats; ids: string[]; done: string[] }
export const todayKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Three different challenges chosen from the date, so everyone gets the same ones on the same day. */
export function dailyFor(day: string): DailyTemplate[] {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...DAILY_POOL];
  const out: DailyTemplate[] = [];
  while (out.length < 3) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}
export const dailyById = (id: string): DailyTemplate | undefined => DAILY_POOL.find((d) => d.id === id);

// ---------------------------------------------------------------- shop ownership
export type OwnableShop = 'donut' | 'motel' | 'arcade';
export const OWNABLE: Record<OwnableShop, { price: number; perMin: number }> = {
  donut: { price: 8000, perMin: 60 },
  motel: { price: 15000, perMin: 120 },
  arcade: { price: 12000, perMin: 90 },
};
/** Income stops piling up after this many minutes, so you have to come back and collect. */
export const INCOME_CAP_MIN = 30;
