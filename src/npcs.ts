import type { Game } from './game';
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

  constructor(private game: Game) {
    const G = game;
    const water = (): P2 | null => {
      const l = G.world.lots.find((q) => q.district === 'water' && !q.river) ?? G.world.lots.find((q) => q.district === 'water');
      if (!l) return null;
      return { x: l.x0 + (l.rim ?? 0) * 0.5 - 2.2, z: (l.z0 + l.z1) / 2 };
    };
    const near = (p: P2 | null, dx: number, dz: number): P2 | null => (p ? { x: p.x + dx, z: p.z + dz } : null);
    const defs: NpcDef[] = [
      {
        id: 'mia', name: ['Mia', '미아'], job: ['Baker', '제빵사'], look: { shirt: 0xf7c6d9, pants: 0x6b4f3a, skin: 0xf1c27d, hair: 0x2a1a10 },
        where: () => { const r = G.interiors.rooms.find((q) => q.id === 'donut'); return r ? { x: r.door.x + Math.cos(r.door.h) * 2.6, z: r.door.z - Math.sin(r.door.h) * 2.6 } : null; },
        lines: {
          friendly: [['Oh, it is you! Everybody around here speaks well of you.', '어머, 당신이군요! 이 근방에선 다들 당신 칭찬이에요.'], ['Here, a donut on the house. Go on.', '자, 서비스 도넛이에요. 드세요.']],
          neutral: [['Fresh bread at dawn, donuts all day. Rumour has it the harbour crews are fighting over their blocks.', '새벽엔 빵, 낮엔 도넛이에요. 항구 쪽 갱들이 구역 때문에 싸운다는 소문이 있어요.']],
          hostile: [['I have nothing to say to you. Leave my shop alone.', '당신한테 할 말 없어요. 우리 가게에서 떨어져 주세요.']],
        },
        act: (g, t) => { if (t !== 'friendly') return null; g.humans.player.hp = g.humans.player.maxHp; return bi('You feel full again.', '체력이 가득 찼어요.'); },
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
    ];
    for (const def of defs) this.list.push({ def, human: null, pos: null, last: -999 });
  }

  get dialogOpen(): boolean { return !!this.dialog; }

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
    return `${bi('[F] Talk to', '[F] 대화:')} ${bi(n.def.name[0], n.def.name[1])} (${bi(n.def.job[0], n.def.job[1])})`;
  }

  talk(n: { def: NpcDef; human: Human }): void {
    const G = this.game;
    const rec = this.list.find((q) => q.def === n.def)!;
    const tier = G.reputation.tier(n.human.x, n.human.z);
    const lines = n.def.lines[tier];
    const ready = this.clock - rec.last > 300;
    const who = `${bi(n.def.name[0], n.def.name[1])} · ${bi(n.def.job[0], n.def.job[1])}`;
    this.dialog = {
      lines, i: 0, who,
      done: () => {
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

  update(dt: number): void {
    this.clock += dt;
    this.place();
  }
}
