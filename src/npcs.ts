import type { Game } from './game';
import * as THREE from 'three';
import type { Human } from './humans';
import { bi } from './i18n';

type P2 = { x: number; z: number };
type Tier = 'friendly' | 'neutral' | 'hostile';
interface NpcDef {
  id: string;
  name: [string, string];
  job: [string, string];
  look: { shirt: number; pants: number; skin: number; hair: number };
  where: () => P2 | null;
  /** What they say, by how the district feels about you. The last line of a friendly/neutral talk triggers `act`. */
  lines: Record<Tier, [string, string][]>;
  act?: (G: Game, tier: Tier) => string | null;
}

/**
 * The named people of the city. Each one stands in their own spot, has something to say that depends on how their district feels about you,
 * and can do you a favour (a free donut, a free repair, a fishing tip, intel on the gangs...) once every few minutes. Treat the district badly
 * and they will not talk to you.
 */
export class Npcs {
  readonly list: { def: NpcDef; human: Human | null; pos: P2 | null; last: number }[] = [];
  private dialog: { lines: [string, string][]; i: number; who: string; done?: () => void } | null = null;
  private clock = 0;
  /** An errand in progress: take a parcel from one person to another. */
  errand: { from: string; to: string; reward: number } | null = null;
  private errandCd = 0;
  private lastTalk: Record<string, number> = {};

  constructor(private game: Game) {
    const G = game;
    const water = (): P2 | null => {
      const l = G.world.lots.find((q) => q.district === 'water' && !q.river) ?? G.world.lots.find((q) => q.district === 'water');
      if (!l) return null;
      return { x: l.x0 + (l.rim ?? 0) * 0.5 - 2.2, z: (l.z0 + l.z1) / 2 };
    };
    const near = (p: P2 | null, dx: number, dz: number): P2 | null => (p ? { x: p.x + dx, z: p.z + dz } : null);
    /** A place on the pavement beside a road in the given district. */
    const roadside = (area: string, k: number): P2 | null => {
      const segs = G.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5 && (G.reputation.area(s.x, s.z) as string) === area);
      const s = segs[k % Math.max(1, segs.length)];
      return s ? { x: s.x - s.dz * (s.hw + 1.9), z: s.z + s.dx * (s.hw + 1.9) } : null;
    };
    const defs: NpcDef[] = [
      {
        id: 'donna', name: ['Donna', '도나'], job: ['Donut shop owner', '도넛 가게 주인'], look: { shirt: 0xf7c6d9, pants: 0xf3efe6, skin: 0xf1c27d, hair: 0x8a5a2b },
        where: () => { const r = G.interiors.rooms.find((q) => q.id === 'donut'); return r ? { x: r.door.x + Math.cos(r.door.h) * 2.6, z: r.door.z - Math.sin(r.door.h) * 2.6 } : null; },
        lines: {
          friendly: [['Oh, it is you! Everybody around here speaks well of you.', '어머, 당신이군요! 이 근방에선 다들 당신 칭찬이에요.'], ['Here, a donut on the house. Go on.', '자, 서비스 도넛이에요. 드세요.']],
          neutral: [['Fresh bread at dawn, donuts all day. Rumour has it the harbour crews are fighting over their blocks.', '새벽엔 빵, 낮엔 도넛이에요. 항구 쪽 갱들이 구역 때문에 싸운다는 소문이 있어요.']],
          hostile: [['I have nothing to say to you. Leave my shop alone.', '당신한테 할 말 없어요. 우리 가게에서 떨어져 주세요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.humans.player.hp = g.humans.player.maxHp; return bi('You feel full again.', '체력이 가득 찼어요.'); },
      },
      {
        id: 'park', name: ['Mr. Park', '미스터 박'], job: ['Motel owner', '모텔 주인'], look: { shirt: 0x8d939c, pants: 0x15151a, skin: 0xe0ac69, hair: 0x2a2a2a },
        where: () => { const r = G.interiors.rooms.find((q) => q.id === 'motel'); return r ? { x: r.door.x + Math.cos(r.door.h) * 2.6, z: r.door.z - Math.sin(r.door.h) * 2.6 } : null; },
        lines: {
          friendly: [['A good tenant is worth gold. A bed is still $40, but for you I will keep the quiet room.', '좋은 손님은 금이지. 방값은 그대로 40달러지만, 당신한테는 조용한 방을 내주지.']],
          neutral: [['A bed is $40 a night - a rest and a saved game, no questions. Old Town talks, kid. Keep your ears open.', '방은 하룻밤 40달러. 쉬고 저장하고, 묻는 건 없어. 올드타운은 말이 많아, 귀를 열어 둬.']],
          hostile: [['Trouble-makers sleep outside.', '말썽꾸러기는 밖에서 자.']],
        },
      },
      {
        id: 'dave', name: ['Dave', '데이브'], job: ['Mechanic', '정비사'], look: { shirt: 0x2a4a8a, pants: 0x23262f, skin: 0xc68642, hair: 0x1a1a1a },
        where: () => { const g = G.world.garages[0]; return g?.door ? near({ x: g.door.x, z: g.door.z }, 2, 0) : null; },
        lines: {
          friendly: [['Good to see you! Your car looked rough last time. Let me fix it, no charge.', '반가워요! 지난번 차 상태가 별로던데. 공짜로 고쳐 드릴게요.']],
          neutral: [['Engines, tyres, paint. A garage can hide you from the police, you know. They never look inside.', '엔진, 타이어, 도색 다 해요. 차고는 경찰을 피해 숨기에도 좋죠. 안은 안 뒤져요.']],
          hostile: [['Take your trouble somewhere else.', '말썽은 다른 데서 일으켜요.']],
        },
        act: (g, t) => {
          if (t !== 'friendly') return null;
          const v = g.hideouts.garageVehicle ?? g.lastDriven;
          if (!v) return bi('Bring a car next time.', '다음엔 차를 가져오세요.');
          v.ctrl.hp = 1; v.fixTire();
          return bi('The car is as good as new.', '차가 새것처럼 됐어요.');
        },
      },
      {
        id: 'rosa', name: ['Rosa', '로사'], job: ['Nurse', '간호사'], look: { shirt: 0xe9f4ff, pants: 0x4a6b8a, skin: 0xe0ac69, hair: 0x3a2a1a },
        where: () => near(G.paramedic.spotOf(), 4, 4),
        lines: {
          friendly: [['The ambulance crews love you. Let me check you over.', '구급대원들이 당신을 좋아해요. 제가 살펴볼게요.']],
          neutral: [['Take the ambulance out on a shift - five patients and you earn a bonus. Real accidents get called in too.', '구급차로 근무를 나가 보세요. 환자 다섯 명이면 보너스예요. 실제 사고도 출동 요청이 와요.']],
          hostile: [['People like you keep me busy. I will not help you.', '당신 같은 사람 때문에 바빠요. 도와드리지 않을 거예요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.humans.player.hp = g.humans.player.maxHp; g.humans.armor = Math.max(g.humans.armor, 25); return bi('Patched up, with a little armour.', '치료받고 방어구도 조금 생겼어요.'); },
      },
      {
        id: 'pete', name: ['Old Pete', '올드 피트'], job: ['Fisherman', '낚시꾼'], look: { shirt: 0x6b8a4a, pants: 0x6b4f3a, skin: 0xe0ac69, hair: 0xe6e6e6 },
        where: () => water(),
        lines: {
          friendly: [['You are good people. I will let you in on my secret spot - the golden ones bite for the next few minutes.', '좋은 분이군요. 비밀 자리를 알려 드리죠. 앞으로 몇 분 동안 황금 물고기가 잘 물어요.']],
          neutral: [['Patience, young one. Cast, wait for the bite, then pull. The big ones are rare.', '인내심이 중요해요. 던지고, 입질을 기다렸다가, 당기세요. 큰 놈은 드물어요.']],
          hostile: [['You scare the fish. Go away.', '물고기 다 도망가요. 저리 가요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.fishing.luckUntil = performance.now() / 1000 + 300; return bi('Rare fish bite far more often for five minutes.', '5분 동안 희귀한 물고기가 훨씬 잘 물어요.'); },
      },
      {
        id: 'jay', name: ['Jay', '제이'], job: ['Street racer', '스트리트 레이서'], look: { shirt: 0xff7a1a, pants: 0x23262f, skin: 0xf1c27d, hair: 0x1a1a1a },
        where: () => near(G.race.startPoint(1), 4.5, 0),
        lines: {
          friendly: [['You drive like a legend. Take this: the next race pays 20% extra, my treat.', '전설 같은 운전이에요. 이거 받아요. 다음 레이스는 상금이 20% 더 나와요.']],
          neutral: [['The orange one cuts you off when you are in front of him. Stay ahead and he will crash into the white one.', '주황 차는 네가 앞에 있으면 들이받아. 앞서 가면 흰 차랑 부딪힐 거야.']],
          hostile: [['I do not race people who hurt others.', '남을 해치는 사람이랑은 안 달려요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.race.bonus = 1.2; return bi('Your next race pays 20% extra.', '다음 레이스 상금 20% 추가.'); },
      },
      {
        id: 'bonnie', name: ['Bonnie', '보니'], job: ['Bodyguard', '경호원'], look: { shirt: 0x14141f, pants: 0x1a1a24, skin: 0xc68642, hair: 0x0a0a0a },
        where: () => { const r = G.interiors.rooms.find((q) => q.id === 'gun'); return r ? { x: r.door.x + Math.cos(r.door.h) * -3, z: r.door.z + Math.sin(r.door.h) * 3 } : null; },
        lines: {
          friendly: [['For a friend of the neighbourhood, half price: $300. I will fight beside you until I am knocked out.', '동네 친구에게는 반값, $300이에요. 쓰러질 때까지 곁에서 같이 싸울게요.']],
          neutral: [['Need muscle? Six hundred dollars and I walk with you. I fight the gangs, not the little people.', '든든한 사람이 필요해요? $600이면 함께 다녀요. 갱단하고만 싸우고, 보통 사람은 안 건드려요.']],
          hostile: [['I have my standards. Not for you.', '저도 기준이 있어요. 당신은 안 돼요.']],
        },
        act: (g, t) => {
          if (g.buddy.hired) return bi('I am already with you!', '이미 함께하고 있잖아요!');
          if (!g.pay(t === 'friendly' ? 300 : 600)) return null;
          g.buddy.recruit(bi('Bonnie', '보니'));
          return bi('Bonnie joins you. She will fight the gangs beside you.', '보니가 합류했어요. 갱단과 함께 싸울 거예요.');
        },
      },
      {
        id: 'kane', name: ['Kane', '케인'], job: ['Informant', '정보원'], look: { shirt: 0x23262f, pants: 0x1a1a24, skin: 0xc68642, hair: 0x0a0a0a },
        where: () => { const z = G.gangs.zones[0]; return z ? { x: z.spots[0].x + 3, z: z.spots[0].z } : null; },
        lines: {
          friendly: [['For you, no charge. Here is what I know about the gangs.', '당신한텐 공짜예요. 갱단에 대해 아는 걸 알려 드리죠.']],
          neutral: [['Information costs $100. I can tell you where the gangs are weakest.', '정보는 $100이에요. 갱단이 어디가 약한지 알려 줄 수 있어요.']],
          hostile: [['You are bad for business. Walk away.', '당신은 장사에 안 좋아요. 가요.']],
        },
        act: (g, t) => {
          if (t === 'neutral' && !g.pay(100)) return null;
          const z = g.gangs.weakest();
          if (!z) return bi('The gangs are all yours already.', '갱단 구역은 이미 다 당신 거예요.');
          g.gangs.reveal(z, 90);
          return bi(`${z.name} are weakest right now - it is marked on your map.`, `지금은 ${z.nameKo}가 제일 약해요 - 지도에 표시했어요.`);
        },
      },

      {
        id: 'lou', name: ['Captain Lou', '캡틴 루'], job: ['Dockmaster', '부두 관리인'], look: { shirt: 0x2a4a6b, pants: 0x1a1a24, skin: 0xc68642, hair: 0x9a9a9a },
        where: () => roadside('harbor', 0),
        lines: {
          friendly: [['A friend of the harbour! My warehouse is open to you: the police will not look for you in there.', '항구의 친구시군요! 제 창고를 쓰세요. 경찰도 거기까진 안 찾아요.']],
          neutral: [['Ships come and go. If the police are on you, I can hide you in the warehouse for $150.', '배는 오고 가죠. 경찰에 쫓기면 $150에 창고에 숨겨 줄게요.']],
          hostile: [['No trouble on my docks. Get out.', '내 부두에서 소란은 안 돼요. 나가요.']],
        },
        act: (g, t) => {
          if (g.stars === 0) return bi('The police are not after you. Come back when they are.', '쫓기고 있지 않네요. 쫓길 때 다시 오세요.');
          if (t === 'neutral' && !g.pay(150)) return null;
          g.coolHeat(80, 0.4);
          return bi('You wait in the warehouse until the heat dies down.', '창고에 숨어 열기가 식기를 기다렸어요.');
        },
      },
      {
        id: 'may', name: ['Grandma May', '그랜마 메이'], job: ['Retired teacher', '은퇴한 교사'], look: { shirt: 0xb48ad6, pants: 0x4a3a5a, skin: 0xf1c27d, hair: 0xeeeeee },
        where: () => roadside('suburb', 0),
        lines: {
          friendly: [['Such a polite young person! Here, take some pocket money and a warm cookie.', '정말 예의 바른 젊은이네요! 용돈이랑 따뜻한 쿠키 받아요.']],
          neutral: [['In my day nobody ran around smashing things. Though... the shop owners could use a hand.', '내가 젊을 땐 아무도 물건을 부수고 다니지 않았어요. 그래도 가게 주인들은 도움이 필요하죠.']],
          hostile: [['I am calling the Watch on you!', '시티 워치에 신고할 거예요!']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.addCash(120, 'other'); g.humans.player.hp = g.humans.player.maxHp; return bi('+$120 and a warm cookie. You feel great.', '+$120와 따뜻한 쿠키. 기분이 좋아요.'); },
      },
      {
        id: 'kai', name: ['Kai', '카이'], job: ['Surfer', '서퍼'], look: { shirt: 0x2fd0ff, pants: 0xff7a1a, skin: 0xe0ac69, hair: 0xd6b56a },
        where: () => roadside('beach', 0),
        lines: {
          friendly: [['Dude, you are a legend! Let me show you my moves. Free training!', '와, 전설이네요! 제 기술을 알려 드릴게요. 무료 수업이에요!']],
          neutral: [['The waves are great, the sand is hot. Chill out, pal. Everything works out.', '파도 최고, 모래는 뜨겁고. 느긋하게 가요. 다 잘될 거예요.']],
          hostile: [['Bad vibes, man. Bad vibes.', '분위기 안 좋아요. 정말요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.skills.add('fighting', 60); g.skills.add('stealth', 30); return bi('Training session: fighting and stealth improved.', '훈련 완료: 격투와 은신 실력이 늘었어요.'); },
      },
      {
        id: 'leo', name: ['Leo', '레오'], job: ['Street musician', '거리 악사'], look: { shirt: 0xd62d3a, pants: 0x23262f, skin: 0xc68642, hair: 0x1a1a1a },
        where: () => roadside('plaza', 0),
        lines: {
          friendly: [['You always clap the loudest. Take the hat money - tonight was a good night.', '항상 제일 크게 박수 쳐 주시네요. 모자에 모인 돈 가져가세요. 오늘 밤은 잘 벌었어요.']],
          neutral: [['I play for tips and for the love of it. The plaza is the best stage in town.', '팁과 음악이 좋아서 연주해요. 광장이 이 도시 최고의 무대죠.']],
          hostile: [['I stop playing when you walk by.', '당신이 지나가면 연주를 멈춰요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.addCash(180, 'other'); return bi('+$180 from the hat.', '모자에서 +$180.'); },
      },
      {
        id: 'ted', name: ['Ranger Ted', '레인저 테드'], job: ['Park ranger', '공원 레인저'], look: { shirt: 0x4a7a3a, pants: 0x6b5a3a, skin: 0xf1c27d, hair: 0x6b4f3a },
        where: () => roadside('park', 0),
        lines: {
          friendly: [['The park thanks you. I will put in a good word with the City Watch.', '공원이 당신에게 고마워해요. 시티 워치에 좋게 말해 둘게요.']],
          neutral: [['Keep to the paths and mind the ducks. The Watch listens to people who help out.', '길로 다니고 오리를 조심하세요. 시티 워치는 돕는 사람 말을 들어줘요.']],
          hostile: [['Out of my park!', '내 공원에서 나가요!']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.factions.add('watch', 12); return bi('The City Watch thinks better of you.', '시티 워치가 당신을 더 좋게 봐요.'); },
      },
      {
        id: 'hale', name: ['Mayor Hale', '헤일 시장'], job: ['Mayor', '시장'], look: { shirt: 0x1a2a4a, pants: 0x1a1a24, skin: 0xf1c27d, hair: 0x3a3a3a },
        where: () => roadside('downtown', 0),
        lines: {
          friendly: [['The city owes you. One word from me and the police will drop this whole matter.', '이 도시는 당신에게 빚졌어요. 제가 한마디 하면 경찰이 이 일을 접을 거예요.']],
          neutral: [['Crime is down - officially. If you want to help, volunteer with the fire and police crews.', '범죄는 줄었어요. 공식적으로는요. 돕고 싶다면 소방대와 경찰 순찰에 자원해 보세요.']],
          hostile: [['My office will not receive you.', '제 사무실은 당신을 받지 않아요.']],
        },
        act: (g, t) => {
          if (t !== 'friendly') return null;
          if (g.stars === 0) return bi('Nothing to clear - for now.', '지울 게 없네요. 지금은요.');
          g.coolHeat(9999, 0);
          return bi('The mayor makes a call: your wanted level is cleared.', '시장이 전화를 걸었어요. 수배가 해제됐어요.');
        },
      },
    ];
    for (const def of defs) this.list.push({ def, human: null, pos: null, last: -999 });
  }

  get dialogOpen(): boolean { return !!this.dialog; }

  /** How many times you have chatted with somebody (grows slowly), and the friendship level it gives: 0, 1 (3 chats) or 2 (8 chats). */
  friendship(id: string): number { const f = this.game.save.friends; return f?.[id] ?? (id === 'donna' ? f?.mia ?? 0 : 0); } // (a save from the days of Mia carries over to Donna)
  level(id: string): number { const n = this.friendship(id); return n >= 8 ? 2 : n >= 3 ? 1 : 0; }
  friendList(): { name: string; level: number; count: number }[] {
    return this.list.filter((n) => this.friendship(n.def.id) > 0).map((n) => ({ name: bi(n.def.name[0], n.def.name[1]), level: this.level(n.def.id), count: this.friendship(n.def.id) }));
  }
  befriend(id: string, n: number): void {
    const f = (this.game.save.friends ??= {});
    const before = this.level(id);
    f[id] = this.friendship(id) + n;
    if (this.level(id) > before) {
      const d = this.list.find((q) => q.def.id === id)!.def;
      this.game.hud.toast(bi(`You and ${d.name[0]} are now ${this.level(id) === 2 ? 'best friends' : 'friends'}!`, `${d.name[1]}와(과) ${this.level(id) === 2 ? '단짝' : '친구'}가 됐어요!`), 3200);
    }
  }
  /** The map marker for the person an errand is for. */
  markers(): P2[] {
    if (!this.errand) return [];
    const to = this.list.find((q) => q.def.id === this.errand!.to);
    return to?.human ? [{ x: to.human.x, z: to.human.z }] : [];
  }

  /** Put the named people on the street the first time they are needed (the interiors and gangs exist by then). */
  private place(): void {
    const G = this.game;
    for (const n of this.list) {
      if (n.human || n.pos) continue;
      const p = n.def.where();
      if (!p) continue;
      n.pos = p;
      n.human = G.humans.spawnNamed(p.x, p.z, Math.random() * 6.28, { ...n.def.look, shoe: 0x333333, cap: false });
    }
  }

  nearest(): { def: NpcDef; human: Human } | null {
    const p = this.game.humans.player;
    let best: { def: NpcDef; human: Human } | null = null, bd = 3;
    for (const n of this.list) {
      if (!n.human || !n.human.active) continue;
      const d = Math.hypot(n.human.x - p.x, n.human.z - p.z);
      if (d < bd) { bd = d; best = { def: n.def, human: n.human }; }
    }
    return best;
  }

  prompt(n: { def: NpcDef }): string {
    const lvl = this.level(n.def.id);
    return `${bi('[F] Talk to', '[F] 대화:')} ${bi(n.def.name[0], n.def.name[1])} (${bi(n.def.job[0], n.def.job[1])})${lvl > 0 ? ' ' + '★'.repeat(lvl) : ''}`;
  }

  /** The person with this id (or null if they are not on the street yet), and the place they normally stand. */
  humanOf(id: string): Human | null { return this.list.find((q) => q.def.id === id)?.human ?? null; }
  homeOf(id: string): P2 | null { return this.list.find((q) => q.def.id === id)?.pos ?? null; }

  talk(n: { def: NpcDef; human: Human }): void {
    const G = this.game;
    // the story's opening: a face-to-face conversation with choices
    const st = G.story.talkFor(n.def.id);
    if (st) { G.dialogue.start(st.script, st.start, n.human, st.done); return; }
    const rec = this.list.find((q) => q.def === n.def)!;
    const tier = G.reputation.tier(n.human.x, n.human.z);
    const id = n.def.id;
    const lvl = this.level(id);
    let lines = n.def.lines[tier];
    if (tier !== 'hostile' && lvl > 0) lines = [[lvl === 2 ? 'My best friend! Always a pleasure.' : 'Good to see you again, friend.', lvl === 2 ? '단짝이 왔네요! 언제나 반가워요.' : '또 만났네요, 친구.'], ...lines];
    // an errand for this person?
    const delivering = tier !== 'hostile' && this.errand?.to === id;
    // or one to offer?
    const others = this.list.filter((q) => q.def.id !== id && q.human);
    const offer = tier !== 'hostile' && !this.errand && !delivering && this.clock > this.errandCd && others.length > 0 ? others[Math.floor(Math.random() * others.length)] : null;
    if (delivering) lines = [[`Ah, the parcel from ${this.list.find((q) => q.def.id === this.errand!.from)!.def.name[0]}! Thank you so much. Here is something for your trouble.`, `${this.list.find((q) => q.def.id === this.errand!.from)!.def.name[1]}에게서 온 소포군요! 정말 고마워요. 수고비예요.`]];
    else if (offer) lines = [...lines, [`Could you take this parcel to ${offer.def.name[0]} (${offer.def.job[0]})? I will make it worth your while.`, `이 소포를 ${offer.def.name[1]}(${offer.def.job[1]})에게 전해 줄래요? 사례는 할게요.`]];
    const ready = this.clock - rec.last > [300, 180, 90][lvl];
    if (this.clock - (this.lastTalk[id] ?? -999) > 45 && tier !== 'hostile') { this.lastTalk[id] = this.clock; this.befriend(id, 1); }
    const who = `${bi(n.def.name[0], n.def.name[1])} · ${bi(n.def.job[0], n.def.job[1])}`;
    this.dialog = {
      lines, i: 0, who,
      done: () => {
        if (delivering && this.errand) {
          const e = this.errand; this.errand = null; this.errandCd = this.clock + 90;
          const pay = Math.round(e.reward * G.factions.payMult());
          G.addCash(pay, 'other'); G.progress.add('quests'); this.befriend(e.from, 2); this.befriend(id, 2);
          G.bus.emit({ type: 'helped', x: n.human.x, z: n.human.z, amount: 3 });
          G.popups.spawn(n.human.x, 3, n.human.z, `+$${pay}`, '#7fe0ff'); G.audio.cash();
          G.hud.toast(`${bi('Parcel delivered', '소포 배달 완료')} +$${pay}`, 3000);
          return;
        }
        if (offer) {
          this.errand = { from: id, to: offer.def.id, reward: 200 + Math.floor(Math.random() * 100) };
          G.hud.toast(bi(`Errand: take the parcel to ${offer.def.name[0]} (blue marker).`, `심부름: ${offer.def.name[1]}에게 소포를 전해 주세요 (파란 마커).`), 3600);
        }
        if (tier === 'hostile' || !ready || !n.def.act) return;
        const msg = n.def.act(G, tier);
        if (msg) { rec.last = this.clock; G.hud.toast(msg, 3000); }
      },
    };
    n.human.heading = Math.atan2(G.humans.player.x - n.human.x, G.humans.player.z - n.human.z);
    this.show();
    G.setDialogOpen(true);
  }

  private show(): void {
    const d = this.dialog!;
    const l = d.lines[d.i];
    this.game.hud.showDialog(d.who, bi(l[0], l[1]), bi('Continue [F]', '계속 [F]'));
  }

  advance(): void {
    const d = this.dialog;
    if (!d) return;
    d.i++;
    if (d.i >= d.lines.length) {
      this.dialog = null;
      this.game.hud.hideDialog();
      this.game.setDialogOpen(false);
      d.done?.();
    } else this.show();
  }

  /** A yellow diamond over the person the story wants you to talk to. */
  private mark: THREE.Mesh | null = null;

  update(dt: number): void {
    this.clock += dt;
    this.place();
    const G = this.game;
    const q = G.story.questNpc();
    const h = q ? this.humanOf(q) : null;
    if (!this.mark) {
      this.mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.2).scale(1, 1.7, 1), new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false }));
      this.mark.visible = false;
      G.scene.add(this.mark);
    }
    if (h && h.active && !G.dialogue.active) {
      this.mark.visible = true;
      this.mark.position.set(h.x, h.y + 2.55 + Math.sin(this.clock * 3) * 0.1, h.z);
      this.mark.rotation.y = this.clock * 2;
    } else this.mark.visible = false;
  }
}
