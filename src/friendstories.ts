import type { Game } from './game';
import type { DEffect, DScript } from './dialogue';
import type { Human } from './humans';

type Pair = [string, string];

interface Stage {
  /** Chats needed (the friendship count). */
  need: number;
  a: Pair;
  b: Pair;
  fx: DEffect;
}

/** Three short chapters for each of four friends. Each unlocks with the friendship count and is told face to face the next time you talk. */
const STORIES: Record<string, { who: Pair; stages: Stage[] }> = {
  donna: {
    who: ['Donna', '도나'],
    stages: [
      { need: 3, a: ['You know, I opened this shop the week my husband left. People said a donut shop would not last a month.', '이 가게는 남편이 떠난 주에 열었어요. 다들 도넛 가게가 한 달도 못 간다고 했죠.'], b: ['Eight years on, I still get up at four. Here, take one for the road.', '8년이 지났는데도 새벽 네 시에 일어나요. 자, 가는 길에 하나 먹어요.'], fx: { gift: 'donut', friend: ['donna', 1] } },
      { need: 8, a: ['I made you a loyalty card. Every delivery you finish for the city, I stamp it.', '단골 카드를 만들었어요. 도시 배달을 한 번 끝낼 때마다 도장을 찍어 줄게요.'], b: ['Four stamps and a box of donuts is yours. Do not tell the Mayor, he thinks everything here is his.', '도장 네 개면 도넛 한 상자가 당신 거예요. 시장한텐 비밀이에요. 이 동네가 다 자기 거라고 생각하거든요.'], fx: { friend: ['donna', 1], rep: 4 } },
      { need: 14, a: ['When the Bigsby crew smashed my window, you were the only one who came. I will not forget that.', '빅스비 패거리가 내 유리창을 깼을 때 달려온 건 당신뿐이었어요. 잊지 않을게요.'], b: ['Take these. If you ever need to eat in a hurry, you will thank me.', '이거 받아요. 급하게 먹어야 할 때 고맙다고 할 거예요.'], fx: { gift: 'donut', friend: ['donna', 1], rep: 6 } },
    ],
  },
  park: {
    who: ['Mr. Park', '미스터 박'],
    stages: [
      { need: 3, a: ['Twenty years running a motel teaches you who sleeps where, and who pays in cash.', '모텔을 20년 하면 누가 어디서 자고 누가 현금을 내는지 다 알게 돼요.'], b: ['Everyone in this town leaves something behind. I keep my mouth shut, and my eyes open.', '이 동네 사람은 누구나 뭔가 놓고 가요. 난 입은 닫고 눈은 열어 둬요.'], fx: { friend: ['park', 1] } },
      { need: 8, a: ['A man in a grey coat rented room 6 for a month. Paid in new bills. Asked about Bigsby.', '회색 코트의 남자가 6호실을 한 달 빌렸어요. 새 돈으로 냈고, 빅스비에 대해 물었어요.'], b: ['He called someone "G" on the phone. Not Gee-something. Just G. I thought you should know.', '전화로 누군가를 "G"라고 불렀어요. 이름이 아니라 그냥 G. 알아 두면 좋을 것 같아서요.'], fx: { friend: ['park', 1], clue: 'park' } },
      { need: 14, a: ['I kept this envelope for the day somebody finally stood up to Bigsby. I think that is you.', '누군가 빅스비에게 맞서는 날을 위해 이 봉투를 보관해 왔어요. 당신인 것 같네요.'], b: ['Do not spend it all in one place.', '한곳에 다 쓰지는 말아요.'], fx: { friend: ['park', 1], cash: 150 } },
    ],
  },
  bonnie: {
    who: ['Bonnie', '보니'],
    stages: [
      { need: 3, a: ['I was a bouncer before this. Learned one rule: the loud ones are never the dangerous ones.', '여기 오기 전엔 클럽 경비였어요. 한 가지 배웠죠. 시끄러운 놈이 위험한 놈은 아니라는 거.'], b: ['If you want me to hit harder, buy me better gear. Call me on the phone.', '내가 더 세게 치길 원하면 좋은 장비를 사 줘요. 휴대폰으로 불러요.'], fx: { friend: ['bonnie', 1] } },
      { need: 8, a: ['People think I carry this bat for show. I took it from the man who hurt my brother.', '다들 내가 이 방망이를 멋으로 든다고 생각하죠. 동생을 다치게 한 놈한테서 뺏은 거예요.'], b: ['He worked for somebody. Never found out who. That is why I am still here.', '그 사람은 누군가를 위해 일했어요. 누군지는 못 알아냈고요. 그래서 아직 여기 있어요.'], fx: { friend: ['bonnie', 1] } },
      { need: 14, a: ['I found the name. Only a letter, scratched into the bat handle. G.', '이름을 찾았어요. 방망이 손잡이에 긁어 놓은 글자 하나. G.'], b: ['So we want the same man. Here, a free upgrade for my gear. I am in.', '그럼 우리는 같은 사람을 쫓는 거네요. 내 장비 업그레이드는 공짜로 해 둘게요. 나도 함께해요.'], fx: { friend: ['bonnie', 1], clue: 'bonnie', gearUp: 1 } },
    ],
  },
  kane: {
    who: ['Kane', '케인'],
    stages: [
      { need: 3, a: ['Information is a currency. I only trade with people who pay back.', '정보는 화폐예요. 갚을 줄 아는 사람하고만 거래해요.'], b: ['You are paying back. Stay that way.', '당신은 갚는 사람이네요. 계속 그래요.'], fx: { friend: ['kane', 1] } },
      { need: 8, a: ['The patrol times leak from inside City Hall. Somebody there sells them every Friday.', '순찰 시간은 시청 안에서 새요. 매주 금요일마다 누가 팔아요.'], b: ['The buyer signs with one letter. G. I have never seen the face.', '구매자는 글자 하나로 서명해요. G. 얼굴은 본 적 없어요.'], fx: { friend: ['kane', 1], clue: 'kane' } },
      { need: 14, a: ['I found where G keeps the money: the Harbor Stash, at the docks. Locked tight.', 'G가 돈을 숨기는 곳을 찾았어요. 부두의 항구 창고. 단단히 잠겨 있죠.'], b: ['Festival night, the guards leave to watch the fireworks. That is your window.', '축제의 밤엔 경비가 불꽃놀이를 보러 자리를 비워요. 그때가 기회예요.'], fx: { friend: ['kane', 1], clue: 'kane2', cash: 200 } },
    ],
  },
};

/** Friend stories: three chapters per friend, told as short face-to-face scenes. Never while the main story wants that person or an errand involves them. */
export class FriendStories {
  constructor(private game: Game) {}

  stage(id: string): number { return this.game.save.fstory?.[id] ?? 0; }

  /** The scene waiting for you with this person, or null. */
  next(id: string): { script: DScript; start: string; done: () => void } | null {
    const G = this.game;
    const def = STORIES[id];
    if (!def || G.mode !== 'story' || !G.sideOpen) return null;
    if (G.story.questNpc() === id || G.npcs.errand?.to === id || G.npcs.errand?.from === id) return null;
    const i = this.stage(id);
    const st = def.stages[i];
    if (!st || G.npcs.friendship(id) < st.need) return null;
    const script: DScript = {
      a: { id: 'a', who: def.who, text: st.a, next: 'b' },
      b: { id: 'b', who: def.who, text: st.b, fx: st.fx },
    };
    return { script, start: 'a', done: () => { (G.save.fstory ??= {})[id] = i + 1; G.saveDirty = true; } };
  }

  /** Start the scene, if there is one. Returns true when it did. */
  tryStart(id: string, human: Human): boolean {
    const n = this.next(id);
    if (!n) return false;
    this.game.dialogue.start(n.script, n.start, human, n.done);
    return true;
  }
}
