import type { Chapter } from './story';
import { C1_START, C1_DONE, C2_PARK, C2_MEET, C2_HALE } from './mainscript';

/**
 * The story mode's own version of the eight main chapters. Same titles and same order as the originals (so rewards, teasers, stages and the
 * ending still line up); what changes is the rhythm: get out and walk up to people, talk face to face, go indoors and look around, and keep
 * the clocks for the chases. The classic mode keeps the original list. A `null` slot keeps the original chapter.
 */
export const REWORK: (Chapter | null)[] = [
  {
    title: ['Welcome to Sunset Bay', '선셋 베이에 온 걸 환영해'], reward: 1000,
    steps: [
      { k: 'talk', npc: 'donna', script: C1_START, start: 'a1', text: ["Talk to Donna at her donut shop (yellow diamond)", '도넛 가게의 도나와 대화하세요 (노란 마름모)'] },
      { k: 'smash', count: 4, text: ["Clear the junk the Bigsby crew dumped (smash 4 things)", '빅스비 패거리가 버린 쓰레기를 치우세요 (4개 부수기)'] },
      { k: 'talk', npc: 'donna', script: C1_DONE, start: 'b1', text: ['Go back to Donna (yellow diamond)', '도나에게 돌아가세요 (노란 마름모)'] },
    ],
  },
  {
    title: ['Smash for Good', '부수는 건 좋은 일'], reward: 1500,
    steps: [
      { k: 'talk', npc: 'park', script: C2_PARK, start: 'p1', text: ['Meet Mr. Park outside the 24h Motel (yellow diamond)', '24시 모텔 앞에서 미스터 박을 만나세요 (노란 마름모)'] },
      { k: 'enter', room: 'motel', text: ['Follow him into the motel (walk up to the door, F)', '모텔 안으로 따라 들어가세요 (문 앞에서 F)'] },
      { k: 'monologue', script: C2_MEET, start: 'm1', text: ['The meeting', '회의'] },
      { k: 'inspect', room: 'motel', ids: ['petition'], notes: { petition: ['Two hundred names in Donna\'s handwriting, and the last line: "Save Old Town."', '도나의 글씨로 적힌 이백 명의 이름, 마지막 줄: "올드타운을 지켜 주세요."'] }, text: ['Look at the petition on the desk (F)', '책상 위의 청원서를 보세요 (F)'] },
      { k: 'leave', room: 'motel', text: ['Step back outside', '밖으로 나가세요'] },
      { k: 'smash', count: 8, text: ["Smash the mall crew's demolition crates (8)", '철거 상자를 부수세요 (8개)'] },
      { k: 'talk', npc: 'hale', script: C2_HALE, start: 'h1', text: ['Take the petition to Deputy Hale downtown (yellow diamond)', '시내의 헤일 부시장에게 청원서를 전하세요 (노란 마름모)'] },
    ],
  },
  null, null, null, null, null, null,
];
