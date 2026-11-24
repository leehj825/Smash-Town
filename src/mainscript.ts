import type { DScript } from './dialogue';

type Pair = [string, string];
const DONNA: Pair = ['Donna', '도나'];
const PARK: Pair = ['Mr. Park', '미스터 박'];
const BONNIE: Pair = ['Bonnie', '보니'];
const YOU: Pair = ['You', '나'];
const HALE: Pair = ['Deputy Hale', '헤일 부시장'];

// ---------------------------------------------------------------- chapter 1: Welcome to Sunset Bay
/** Donna asks for help clearing the junk the mayor's crew dumped in the street. */
export const C1_START: DScript = {
  a1: { id: 'a1', who: DONNA, text: ['There you are! The whole street heard about the kid who stood up to the Bigsby crew.', '거기 있었네! 빅스비 패거리에게 맞선 청년 얘기가 온 동네에 퍼졌어.'], next: 'a2' },
  a2: { id: 'a2', who: DONNA, text: ['The mayor wants to tear Old Town down for a giant mall. His crew dumped junk all over our block so nobody can walk or park.', '시장은 올드타운을 밀고 거대한 쇼핑몰을 지으려 해. 일꾼들이 우리 동네에 쓰레기를 잔뜩 버려서 걷지도 주차하지도 못해.'], next: 'a3' },
  a3: {
    id: 'a3', who: YOU, text: ['(She is asking for help.)', '(도움을 청하고 있어.)'],
    choices: [
      { label: ['Point me at the junk. I will clear it.', '쓰레기 있는 곳만 알려 줘요. 치울게요.'], next: 'a4a', fx: { friend: ['donna', 1] } },
      { label: ['What is in it for me?', '나한텐 뭐가 남죠?'], next: 'a4b' },
    ],
  },
  a4a: { id: 'a4a', who: DONNA, text: ['Bless you. Four piles, anything you can break: hydrants, benches, bins. Smashing it is not a crime, it is housekeeping.', '고마워. 네 군데야. 소화전, 벤치, 쓰레기통 뭐든 부숴. 이건 범죄가 아니라 청소야.'] },
  a4b: { id: 'a4b', who: DONNA, text: ['Honest answer: a hot donut, my thanks, and a town that is still standing. Four piles, anything you can break. It is not a crime, it is housekeeping.', '솔직히? 따끈한 도넛과 내 감사, 그리고 무너지지 않은 동네야. 네 군데, 뭐든 부숴. 이건 범죄가 아니라 청소야.'] },
};

/** Donna thanks you and points at Mr. Park. */
export const C1_DONE: DScript = {
  b1: { id: 'b1', who: DONNA, text: ['Look at that street! You can see the pavement again. Here, for your trouble.', '저 길 좀 봐! 보도가 다시 보이네. 수고비야.'], fx: { gift: 'donut' }, next: 'b2' },
  b2: { id: 'b2', who: DONNA, text: ['Mr. Park at the motel wants a word. He keeps his ear to the ground, and he does not ask for help lightly. Go and see him.', '모텔의 박 사장님이 할 말이 있대. 소문엔 밝은 분인데 도움을 쉽게 청하는 분이 아니야. 가 봐.'] },
};

// ---------------------------------------------------------------- chapter 2: Smash for Good
/** Mr. Park outside the motel: come in, walls have ears. */
export const C2_PARK: DScript = {
  p1: { id: 'p1', who: PARK, text: ['Good, you came alone. Not here. Come inside, the walls of the street have ears.', '좋아, 혼자 왔군. 여기서 말고. 들어와. 길가의 벽엔 귀가 있어.'] },
};

/** The meeting in the motel office. */
export const C2_MEET: DScript = {
  m1: { id: 'm1', who: PARK, text: ['The Mega Mall permit needs the council vote on Friday. A petition from the people can stop the vote, if it lands on the right desk.', '메가몰 허가는 금요일 시의회 표결로 정해져. 시민 청원이 제대로 된 책상에 닿으면 표결을 막을 수 있어.'], next: 'm2' },
  m2: { id: 'm2', who: DONNA, text: ['I got two hundred names from the street. But the mayor will say it is only noise unless we show what his crew has been doing.', '동네에서 이백 명 서명을 받았어. 그런데 시장은 그저 소란이라고 할 거야. 일꾼들이 뭘 했는지 보여 줘야 해.'], next: 'm3' },
  m3: { id: 'm3', who: BONNIE, text: ['His crew stacked demolition crates all over Old Town, ready for the bulldozers. Break them, and the bulldozers have nothing to start with.', '일꾼들이 철거 상자를 올드타운 곳곳에 쌓아 놨어. 부숴 버리면 불도저는 시작할 것도 없지.'], next: 'm4' },
  m4: { id: 'm4', who: PARK, text: ['The petition is on my desk. Take a look at it, and then we begin.', '청원서는 내 책상에 있어. 한번 보고, 시작하지.'] },
};

/** Handing the petition over at City Hall. */
export const C2_HALE: DScript = {
  h1: { id: 'h1', who: HALE, text: ['A petition? From Old Town? Do you know how long I have waited for someone to bring me a piece of paper instead of a threat?', '청원서? 올드타운에서? 협박 말고 종이 한 장 가져오는 사람을 얼마나 기다렸는지 알아요?'], next: 'h2' },
  h2: { id: 'h2', who: HALE, text: ['I am only the deputy. The mayor does not listen to me. But I will see that this lands in front of the council, and I will not let Bigsby bury it.', '저는 부시장일 뿐이라 시장은 제 말을 듣지 않아요. 하지만 이걸 의회 앞에 올려놓을 거고, 빅스비가 묻어 버리게 두지 않을 겁니다.'], next: 'h3' },
  h3: { id: 'h3', who: HALE, text: ['Be careful. Men like Bigsby do not lose votes. They buy them, or they break the people who ask. Watch your back.', '조심해요. 빅스비 같은 사람은 표결에서 지지 않아요. 표를 사거나 요구한 사람을 부숴 버리죠. 뒤를 조심해요.'] },
};
