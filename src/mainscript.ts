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

// ---------------------------------------------------------------- chapter 3: Inside Job
const KANE: Pair = ['Kane', '케인'];
const LOU: Pair = ['Captain Lou', '캡틴 루'];
const THUG: Pair = ['Bigsby Thug', '빅스비 패거리'];

/** Kane briefs you on the mayor's limo. */
export const C3_KANE: DScript = {
  k1: { id: 'k1', who: KANE, text: ['You are the one breaking his props. Good. I sell information, and I have a free sample for you.', '그 사람이구나, 시장네 물건 부수고 다니는. 좋아. 난 정보를 파는데, 당신한텐 샘플을 공짜로 줄게.'], next: 'k2' },
  k2: { id: 'k2', who: KANE, text: ["Bigsby's black limo drives to the harbor every night to meet somebody who signs with one letter. I need that car at the harbor gate, in one piece.", '빅스비의 검은 리무진은 매일 밤 항구로 가서 글자 하나로 서명하는 누군가를 만나. 그 차가 항구 입구에 멀쩡하게 서 있어야 해.'], next: 'k3' },
  k3: {
    id: 'k3', who: YOU, text: ['(Borrow the mayor\'s car. Not exactly legal.)', '(시장의 차를 빌린다. 합법은 아니네.)'],
    choices: [
      { label: ['Where do I find the limo?', '리무진은 어디 있죠?'], next: 'k4' },
      { label: ['Why do you want it at the harbor?', '왜 항구에 가져다 놓으라는 거죠?'], next: 'k4b', fx: { friend: ['kane', 1] } },
    ],
  },
  k4: { id: 'k4', who: KANE, text: ['It is marked on your map. Drive it gently: a scratched limo and the deal is off.', '지도에 표시해 놨어. 살살 몰아. 긁히면 거래는 없던 일이야.'] },
  k4b: { id: 'k4b', who: KANE, text: ['Because the harbor master owes me a favor, and the man in the grey coat only trusts that car. It is marked on your map. Drive it gently.', '부두 관리인이 내게 빚이 있고, 회색 코트 남자는 그 차만 믿거든. 지도에 표시해 놨어. 살살 몰아.'] },
};

/** At the harbor gate. */
export const C3_LOU: DScript = {
  l1: { id: 'l1', who: LOU, text: ['That is the mayor\'s car, alright. Kane said somebody was bringing it. Park it where the cameras cannot see.', '시장 차가 맞군. 케인이 누가 가져올 거라고 하더군. 카메라가 안 보이는 데 세워.'], next: 'l2' },
  l2: { id: 'l2', who: LOU, text: ['The Big Shipment arrives tonight: three crates, no paperwork. Mayor\'s men guard the warehouse, but I have the key. Take a look inside before they move it.', '오늘 밤 대형 화물이 들어와. 상자 세 개에 서류는 없어. 시장 패거리가 창고를 지키지만 열쇠는 내게 있어. 옮기기 전에 안을 봐 둬.'] },
};

// ---------------------------------------------------------------- chapter 4: The Big Shipment
/** Inside the warehouse, after you have looked at the crates and the foreman's desk. */
export const C4_INSIDE: DScript = {
  w1: { id: 'w1', who: YOU, text: ['(Blueprints for the Mega Mall. And an invoice signed with a single letter: G.)', '(메가몰 청사진. 그리고 글자 하나로 서명된 송장: G.)'], next: 'w2' },
  w2: { id: 'w2', who: THUG, text: ['Hey! The warehouse is open! Somebody is inside!', '어이! 창고가 열려 있어! 안에 누가 있어!'], next: 'w3' },
  w3: { id: 'w3', who: YOU, text: ['(Time to go. Take the blueprints and get out of here.)', '(나갈 시간이야. 청사진을 챙겨 나가자.)'] },
};

/** The mayor's men wait at the door. */
export const C4_TAUNT: DScript = {
  t1: { id: 't1', who: THUG, text: ['That is Bigsby\'s paper you are holding. Hand it over, or we take it.', '그건 빅스비 서류야. 내놔, 아니면 뺏는다.'], next: 't2' },
  t2: { id: 't2', who: YOU, text: ['Come and take it.', '와서 가져가 봐.'] },
};

/** Handing the blueprints to Deputy Hale. */
export const C4_HALE: DScript = {
  b1: { id: 'b1', who: HALE, text: ['The blueprints. Signed invoices. Do you realize what this is? Proof that the Mega Mall was never meant to be built on public land.', '청사진. 서명된 송장. 이게 뭔지 알아요? 메가몰이 공공 부지에 지어질 계획이 아니었다는 증거예요.'], next: 'b2' },
  b2: { id: 'b2', who: HALE, text: ['And that letter, G... I have seen it on a lot of papers in this building. I do not know who G is. But somebody above the mayor has been paying him.', '그리고 그 글자 G... 이 건물의 많은 서류에서 본 적이 있어요. G가 누군지는 몰라요. 하지만 시장 위의 누군가가 그에게 돈을 주고 있었어요.'] },
};

// ---------------------------------------------------------------- chapter 5: Save the Day
/** Deputy Hale: the vote is tomorrow, and the mall crew is coming for the rally in the plaza. */
export const C5_HALE: DScript = {
  s1: { id: 's1', who: HALE, text: ['The council meets in the plaza at noon. With the blueprints and the petition I can stop the vote, if the rally holds.', '의회가 정오에 광장에서 열려요. 청사진과 청원서가 있으면 표결을 막을 수 있어요. 집회가 무사히 열린다면요.'], next: 's2' },
  s2: { id: 's2', who: HALE, text: ['But Bigsby sent his mall crew to break it up. I cannot ask the police: half of them work for him.', '그런데 빅스비가 일꾼들을 보내 집회를 깨려 해요. 경찰에겐 부탁할 수 없어요. 절반이 그의 사람이거든요.'], next: 's3' },
  s3: {
    id: 's3', who: YOU, text: ['(The whole thing depends on the plaza staying calm.)', '(광장이 무사해야 모든 게 풀려.)'],
    choices: [
      { label: ['I will hold the plaza. Go and set up.', '내가 광장을 지킬게요. 가서 준비하세요.'], next: 's4a', fx: { rep: 3 } },
      { label: ['Do you have a plan if I fail?', '내가 실패하면 대책이 있나요?'], next: 's4b' },
    ],
  },
  s4a: { id: 's4a', who: HALE, text: ['Thank you. They will come from the harbor side. Do not let them reach the stage.', '고마워요. 항구 쪽에서 올 거예요. 무대까지 못 가게 막아요.'] },
  s4b: { id: 's4b', who: HALE, text: ['No. That is why I am asking you. They will come from the harbor side. Do not let them reach the stage.', '없어요. 그래서 당신에게 부탁하는 거예요. 항구 쪽에서 올 거예요. 무대까지 못 가게 막아요.'] },
};

/** The mall crew at the plaza. */
export const C5_TAUNT: DScript = {
  t1: { id: 't1', who: THUG, text: ['Rally? There is no rally. Everybody go home before somebody gets hurt.', '집회? 그런 건 없어. 다치기 전에 다들 집에 가.'], next: 't2' },
  t2: { id: 't2', who: YOU, text: ['The vote happens today. You are in the way.', '표결은 오늘이야. 방해되는 건 너희야.'] },
};

/** After the rally: Donna and the celebration. */
export const C5_DONNA: DScript = {
  e1: { id: 'e1', who: DONNA, text: ['They stopped the vote! The council sent the Mega Mall back to the drawing board. Old Town is still standing!', '표결이 중단됐어! 의회가 메가몰 계획을 백지로 돌렸대. 올드타운은 아직 서 있어!'], next: 'e2' },
  e2: { id: 'e2', who: DONNA, text: ['Everyone is in the plaza. Let me give you something: the town is giving you a supercar, and I am giving you the biggest donut I have.', '다들 광장에 모였어. 선물이 있어: 마을이 슈퍼카를 드리고, 나는 제일 큰 도넛을 줄게.'], fx: { gift: 'donut' } },
};

// ---------------------------------------------------------------- chapter 6: Arcade Rumors
/** Kane outside: come to the arcade. */
export const C6_KANE: DScript = {
  k1: { id: 'k1', who: KANE, text: ['You made the news. That is good for business, and bad for your health. The mayor lost the vote, so now he is asking who is behind it.', '뉴스에 났더군. 장사엔 좋고 건강엔 나빠. 시장이 표결에서 졌으니 이제 누가 뒤에 있는지 찾을 거야.'], next: 'k2' },
  k2: { id: 'k2', who: KANE, text: ['Not here. Meet me in the arcade. Loud machines, nobody listens.', '여기선 말고. 오락실에서 보자. 기계 소리가 시끄러워서 아무도 안 들어.'] },
};

/** Inside the arcade, over the noise of the machines. */
export const C6_ARCADE: DScript = {
  a1: { id: 'a1', who: KANE, text: ['Here is what I have. The mayor has a courier who carries envelopes between his office and a man nobody names. Tonight he drops a satchel at the harbor.', '내가 아는 건 이거야. 시장에겐 사무실과 이름 없는 남자 사이에서 봉투를 나르는 배달꾼이 있어. 오늘 밤 항구에 가방을 떨궈.'], next: 'a2' },
  a2: { id: 'a2', who: KANE, text: ['The man is called G. If you catch the courier before he gets there, you will have his satchel. Bring it to me.', '그 남자 이름이 G야. 배달꾼이 닿기 전에 잡으면 가방이 당신 거야. 나한테 가져와.'], next: 'a3' },
  a3: { id: 'a3', who: YOU, text: ['(A courier with a satchel. How hard can it be?)', '(가방 든 배달꾼이라. 어렵겠어?)'] },
};

export const C6_END: DScript = {
  z1: { id: 'z1', who: KANE, text: ['Good work. Look at this: a delivery schedule, and a map with the Harbor Stash circled in red.', '잘했어. 이걸 봐. 배달 일정표, 그리고 항구 창고가 빨갛게 표시된 지도야.'], next: 'z2' },
  z2: { id: 'z2', who: KANE, text: ['Bonnie at the gun shop knows the harbor better than anyone. Go and see her. Tell her I sent you.', '총기 상점의 보니가 항구를 제일 잘 알아. 가서 봐. 내가 보냈다고 해.'] },
};
