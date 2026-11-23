import type { DScript } from './dialogue';

/**
 * The words of the story's opening, scene by scene (see the INTRO chapter in story.ts). Every line is short enough to read at a glance on a phone.
 * The numbers match the game: a bed at the motel is $40 and you start with $20.
 */

/** Scene 1: stepping off the bus with nothing. */
export const ARRIVAL: DScript = {
  a1: { id: 'a1', who: ['You', '나'], text: ['Sunset Bay... end of the line. Twenty bucks in my pocket and nobody knows my name.', '선셋 베이... 지도 끝자락 동네라더니 진짜 조용하네. 주머니엔 20달러가 전부고, 아는 사람도 없어.'], next: 'a2' },
  a2: { id: 'a2', who: ['You', '나'], text: ['No more running. First, a place to sleep tonight. That 24h Motel looks cheap enough.', '도망치는 건 여기까지야. 일단 오늘 밤 잘 곳부터 구하자. 24시 모텔이 싸 보이는데.'] },
};

/** Scene 2: Mr. Park at the motel door. */
export const PARK: DScript = {
  p1: { id: 'p1', who: ['Mr. Park', '미스터 박'], text: ['New face in Old Town? A bed is $40 a night. Cash up front, no exceptions.', '올드타운에 처음 보는 얼굴이네? 방값은 하루 40달러야. 선불, 예외 없어.'], next: 'p2' },
  p2: {
    id: 'p2', who: ['You', '나'], text: ['(Twenty dollars... what do I say?)', '(20달러뿐인데... 뭐라고 하지?)'],
    choices: [
      { label: ["I've only got $20 right now. Give me an hour, I'll earn the rest.", '지금 20달러밖에 없어요. 한 시간만 주세요, 나머진 벌어올게요.'], next: 'p3a', fx: { rep: 3 } },
      { label: ['$40 for a roadside motel? That is highway robbery.', '길가 모텔이 40달러라고요? 거의 강도 수준인데요.'], next: 'p3b' },
    ],
  },
  p3a: { id: 'p3a', who: ['Mr. Park', '미스터 박'], text: ['Fair enough. Hustlers last longer here than talkers.', '좋아. 여기선 말만 앞서는 놈보다 발로 뛰는 놈이 오래 버티지.'], next: 'p4' },
  p3b: { id: 'p3b', who: ['Mr. Park', '미스터 박'], text: ['Take it or sleep on the park bench, kid.', '싫으면 공원 벤치에서 자든가, 젊은 친구.'], next: 'p4' },
  p4: { id: 'p4', who: ['Mr. Park', '미스터 박'], text: ["Need fast cash? Cross the street to Donna's Donut Shop. She's desperate for a delivery runner.", '급하게 돈 필요하면 길 건너 도나 도넛에 가 봐. 배달할 사람 못 구해서 난리니까.'] },
};

/** Scene 3: Donna, a donut and a job. */
export const DONNA: DScript = {
  d1: { id: 'd1', who: ['Donna', '도나'], text: ['Welcome in! Goodness, you look exhausted. Here - a fresh donut, on the house.', '어서 와요! 어머, 얼굴이 반쪽이네. 자, 갓 나온 도넛 하나 먹어요. 공짜니까.'], fx: { gift: 'donut' }, next: 'd2' },
  d2: { id: 'd2', who: ['You', '나'], text: ['Thanks, Donna. Mr. Park said you needed someone for deliveries?', '고마워요, 도나. 미스터 박이 배달할 사람을 구하신다고 하던데요?'], next: 'd3' },
  d3: { id: 'd3', who: ['Donna', '도나'], text: ["You're a lifesaver! Step into the pink marker by my door, take the orders, and deliver two in Old Town. Watch out for the Bigsby crew in the alleys.", '살았네요! 가게 문 옆 분홍 마커에 들어가서 주문을 받아 올드타운 두 군데에 배달해 줘요. 골목엔 빅스비 패거리가 어슬렁거리니까 조심하고요.'] },
};

/** Scene 4: the Bigsby crew block the street before the second drop. */
export const AMBUSH: DScript = {
  t1: { id: 't1', who: ['Bigsby Thug', '빅스비 패거리'], text: ['Hold it, delivery boy. This street belongs to Mayor Bigsby. Drop the bag and empty your pockets.', '거기 서, 배달부. 이 길은 빅스비 시장님 구역이야. 가방 내려놓고 주머니 털어.'], next: 't2' },
  t2: { id: 't2', who: ['You', '나'], text: ["I've already lost everything once. You're not taking a dime.", '이미 한 번 다 잃어봤어. 너희한텐 1달러도 못 줘.'] },
};

/** Scene 5: Bonnie walks up after the fight. */
export const BONNIE: DScript = {
  b1: { id: 'b1', who: ['Bonnie', '보니'], text: ['Not bad with bare knuckles. Most rookies hand over their wallet and run.', '맨주먹 치곤 제법인데? 보통 신입들은 지갑 털리고 도망치던데.'], next: 'b2' },
  b2: {
    id: 'b2', who: ['You', '나'], text: ['(She was watching the whole time.)', '(내내 지켜보고 있었나 봐.)'],
    choices: [
      { label: ['I just wanted to finish a quiet delivery.', '그냥 조용히 배달이나 끝내고 싶었을 뿐이에요.'], next: 'b3a' },
      { label: ['If the Bigsbys run this block, maybe it is time for new management.', '빅스비 패거리가 이 구역 주인이라면, 슬슬 주인이 바뀔 때가 됐네요.'], next: 'b3b', fx: { friend: ['bonnie', 1] } },
    ],
  },
  b3a: { id: 'b3a', who: ['Bonnie', '보니'], text: ['Quiet does not last long in Sunset Bay. Better get used to fighting back.', '선셋 베이에선 조용한 날이 오래 안 가. 맞서 싸우는 데 익숙해지는 게 좋을 거야.'], next: 'b4' },
  b3b: { id: 'b3b', who: ['Bonnie', '보니'], text: ['Hah, I like that attitude. Keep that bat handy.', '하, 그 패기 마음에 드네. 그 방망이 잘 챙겨둬.'], next: 'b4' },
  b4: { id: 'b4', who: ['Bonnie', '보니'], text: ["Name's Bonnie. Grab a ride, build your rep, and the Gun Shop will open up. When there's money in your pocket, come find me outside it - I'll be waiting.", '난 보니야. 탈것부터 구하고 평판 좀 쌓으면 총기 상점도 열릴 거야. 돈이 좀 모이면 총기 상점 앞으로 와. 거기서 기다릴게.'] },
};

// ---------------------------------------------------------------- "Smash and Grab": the second chapter, a run of set pieces

/** A phone call from Mr. Park: Donna's shop is being wrecked. */
export const PARK_CALL: DScript = {
  c1: { id: 'c1', who: ['Mr. Park (phone)', '미스터 박 (전화)'], text: ["Kid! Pick up! Bigsby's boys are tearing Donna's shop apart. Get over there, now!", '얘야! 받아! 빅스비 놈들이 도나네 가게를 부수고 있어. 당장 가 봐!'], next: 'c2' },
  c2: { id: 'c2', who: ['You', '나'], text: ["On my way!", '바로 갈게요!'] },
};

/** The thugs at Donna's door. */
export const SHOP_THUGS: DScript = {
  s1: { id: 's1', who: ['Bigsby Thug', '빅스비 패거리'], text: ["Mayor Bigsby says Old Town is closing. We're starting with this donut dump.", '빅스비 시장님이 올드타운 문 닫으신대. 이 도넛 가게부터 시작이지.'], next: 's2' },
  s2: { id: 's2', who: ['You', '나'], text: ["Not while I'm standing here.", '내가 여기 서 있는 동안은 안 돼.'] },
};

/** The last thug grabs the cash box. */
export const CASHBOX: DScript = {
  x1: { id: 'x1', who: ['Donna', '도나'], text: ['He grabbed my cash box and ran! Stop him!', '저 녀석이 내 돈 상자를 들고 튀었어요! 잡아 줘요!'] },
};

/** Sirens. */
export const SIRENS: DScript = {
  z1: { id: 'z1', who: ['You', '나'], text: ['Sirens... Bigsby has the police in his pocket. They are coming for ME.', '사이렌 소리... 빅스비가 경찰도 구워삶았나 봐. 나를 잡으러 오고 있어.'], next: 'z2' },
  z2: { id: 'z2', who: ['You', '나'], text: ['Run. Lose them. Then think.', '일단 도망쳐. 따돌리고 나서 생각하자.'] },
};

/** Donna, afterwards. */
export const SG_THANKS: DScript = {
  g1: { id: 'g1', who: ['Donna', '도나'], text: ['You saved my shop, kid. Bigsby will not stop, though. Take this for your trouble.', '네가 우리 가게를 살렸어. 하지만 빅스비는 포기하지 않을 거야. 수고비야, 받아.'], next: 'g2' },
  g2: {
    id: 'g2', who: ['You', '나'], text: ['(She presses a roll of bills into my hand.)', '(도나가 지폐 뭉치를 손에 쥐여 준다.)'],
    choices: [
      { label: ['He will regret it. I am staying in Old Town.', '그 사람이 후회하게 될 거예요. 전 올드타운에 남겠어요.'], next: 'g3', fx: { friend: ['donna', 1] } },
      { label: ['Just paying my way. Where is the next job?', '제 몫을 했을 뿐이에요. 다음 일은 어디 있죠?'], next: 'g3' },
    ],
  },
  g3: { id: 'g3', who: ['Donna', '도나'], text: ['Talk to everyone. Old Town has more friends than you think.', '모두와 이야기해 봐요. 올드타운엔 네 생각보다 친구가 많아요.'] },
};

// ---------------------------------------------------------------- the phone calls from the stranger, between chapters

const STRANGER: [string, string] = ['Unknown number', '모르는 번호'];
export const TEASERS: Record<string, DScript> = {
  'Smash and Grab': {
    x1: { id: 'x1', who: STRANGER, text: ['Nice work, kid. Bigsby is scared now, and a scared man is dangerous. Watch your back.', '잘했어, 꼬마. 빅스비가 겁먹었어. 겁먹은 사람이 제일 위험하지. 뒤를 조심해.'], next: 'x2' },
    x2: { id: 'x2', who: STRANGER, text: ['- A friend.', '- 친구가.'] },
  },
  'Inside Job': {
    x1: { id: 'x1', who: STRANGER, text: ['Someone inside City Hall feeds Bigsby the police patrol times. Find out who.', '시청 안에 빅스비에게 경찰 순찰 시간을 알려 주는 사람이 있어. 누군지 알아내.'], next: 'x2' },
    x2: { id: 'x2', who: STRANGER, text: ['- G', '- G'] },
  },
  'Save the Day': {
    x1: { id: 'x1', who: STRANGER, text: ['Old Town is saved? Bigsby was never the boss. Come to the arcade. Come alone.', '올드타운을 구했다고? 빅스비는 보스였던 적이 없어. 오락실로 와. 혼자서.'], next: 'x2' },
    x2: { id: 'x2', who: STRANGER, text: ['- G', '- G'] },
  },
  'The Harbor Stash': {
    x1: { id: 'x1', who: STRANGER, text: ['You found the stash. And my name. Festival night, ten o\'clock, the hall steps. Be there.', '창고를 찾았군. 내 이름도. 축제의 밤, 밤 열 시, 시청 계단. 나와.'] },
  },
};
