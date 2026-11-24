import type { Chapter } from './story';
import { C1_START, C1_DONE, C2_PARK, C2_MEET, C2_HALE, C3_KANE, C3_LOU, C4_INSIDE, C4_TAUNT, C4_HALE } from './mainscript';

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
  {
    title: ['Inside Job', '내부 작전'], reward: 2500,
    steps: [
      { k: 'talk', npc: 'kane', script: C3_KANE, start: 'k1', text: ['Meet Kane, the informant (yellow diamond)', '정보원 케인을 만나세요 (노란 마름모)'] },
      { k: 'steal', text: ["Borrow Mayor Bigsby's black limo (marked on the map)", '빅스비 시장의 검은 리무진을 빌리세요 (지도에 표시됨)'] },
      { k: 'drive', spot: 'gate', text: ['Drive the limo to the Harbor gate - keep it in one piece!', '리무진을 항구 입구까지 몰고 가세요 - 망가뜨리지 마세요!'] },
      { k: 'talk', npc: 'lou', script: C3_LOU, start: 'l1', text: ['Get out and talk to Captain Lou, the dockmaster (yellow diamond)', '차에서 내려 부두 관리인 캡틴 루와 이야기하세요 (노란 마름모)'] },
    ],
  },
  {
    title: ['The Big Shipment', '대형 화물'], reward: 3000,
    steps: [
      { k: 'enter', room: 'warehouse', text: ['Slip into the harbor warehouse (walk up to the door, F)', '항구 창고에 몰래 들어가세요 (문 앞에서 F)'] },
      { k: 'inspect', room: 'warehouse', ids: ['crate0', 'crate1', 'crate2', 'desk'], notes: {
        crate0: ['Crate 1: steel beams stamped "MEGA MALL".', '상자 1: "메가몰"이라고 찍힌 철골.'],
        crate1: ['Crate 2: demolition charges, enough to level a block.', '상자 2: 한 블록을 날릴 만한 철거용 폭약.'],
        crate2: ['Crate 3: cash boxes and a ledger signed with the letter G.', '상자 3: 현금 상자와 글자 G로 서명된 장부.'],
        desk: ["The foreman's desk: blueprints and an invoice. You take them.", '감독관의 책상: 청사진과 송장. 챙겼어요.'],
      }, text: ["Search the warehouse: 3 crates and the foreman's desk (F)", '창고를 뒤져 보세요: 상자 3개와 감독관의 책상 (F)'] },
      { k: 'monologue', script: C4_INSIDE, start: 'w1', text: ['Voices outside!', '밖에서 목소리가 들려요!'] },
      { k: 'leave', room: 'warehouse', text: ['Get out of the warehouse', '창고에서 나가세요'] },
      { k: 'brawl', at: 'door:warehouse', count: 3, taunt: { script: C4_TAUNT, start: 't1' }, text: ["Beat the mayor's men waiting at the door", '문 앞에서 기다리는 시장의 패거리를 쓰러뜨리세요'] },
      { k: 'talk', npc: 'hale', script: C4_HALE, start: 'b1', text: ['Bring the blueprints to Deputy Hale downtown (yellow diamond)', '청사진을 시내의 헤일 부시장에게 가져가세요 (노란 마름모)'] },
    ],
  },
  null, null, null, null,
];
