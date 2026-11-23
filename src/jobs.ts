import type { JobConfig } from './emergency';

/** The three emergency jobs. Each is the same shift (five calls) with its own vehicle, calls, pay and time on scene. */
export const JOBS: Record<'paramedic' | 'firefighter' | 'patrol', JobConfig> = {
  paramedic: {
    id: 'paramedic', title: ['PARAMEDIC', '구급대원'], vehicle: 'ambulance', spotFrac: 0.72, color: 0xff3b3b, css: '#ff3b3b', stat: 'rescues',
    pay: 220, hold: 0, patients: ['Patient treated', '환자 치료'], idleCall: ['Someone has collapsed in the street', '길에서 쓰러진 사람이 있어요'], shiftBonus: 400,
    listens: [
      { type: 'civAssaulted', why: ['Someone was beaten up', '누군가 폭행당했어요'] },
      { type: 'civKilled', why: ['A person is down', '쓰러진 사람이 있어요'] },
      { type: 'explosion', why: ['An explosion - there are injured', '폭발 사고 - 부상자가 있어요'] },
    ],
  },
  firefighter: {
    id: 'firefighter', title: ['FIREFIGHTER', '소방대원'], vehicle: 'firetruck', spotFrac: 0.4, color: 0xd62d2d, css: '#ff8a2a', stat: 'fires',
    pay: 260, hold: 5, patients: ['Fire put out', '불을 껐어요'], idleCall: ['A fire has broken out', '화재가 발생했어요'], shiftBonus: 500,
    listens: [
      { type: 'fire', why: ['A fire has broken out', '화재가 발생했어요'] },
      { type: 'explosion', why: ['An explosion - fire!', '폭발 - 화재예요!'] },
    ],
    idleSpawn: (G, p) => { G.fires.ignite(p.x, p.z); },
    onDone: (c, G) => { const f = G.fires.nearest(c.x, c.z, 30); if (f) G.fires.extinguish(f); },
  },
  patrol: {
    id: 'patrol', title: ['POLICE PATROL', '경찰 순찰'], vehicle: 'police', spotFrac: 0.15, color: 0x1a1a24, css: '#4a7bff', stat: 'patrols',
    pay: 240, hold: 2, patients: ['Call handled', '출동 완료'], idleCall: ['A disturbance is reported', '소란 신고가 들어왔어요'], shiftBonus: 450,
    listens: [
      { type: 'gunshot', why: ['Shots fired!', '총소리가 들렸어요!'] },
      { type: 'theft', why: ['A thief is running - stop them!', '도둑이에요 - 잡아주세요!'] },
      { type: 'civAssaulted', why: ['A fight has broken out', '싸움이 났어요'] },
    ],
  },
};
