import * as THREE from 'three';
import { Beacon } from './beacon';
import type { Game } from './game';
import { bi, t } from './i18n';
import type { GameVehicle } from './vehicles';

// "Save Old Town": an eight-chapter story told through short conversations and simple objectives. The story never forces anything:
// the gold marker is a suggestion, and gigs, golden stars and free roaming stay available at all times.

import { ENDING, ARRIVAL, PARK as PARK_SCRIPT, DONNA as DONNA_SCRIPT, AMBUSH, BONNIE, PARK_CALL, SHOP_THUGS, CASHBOX, SIRENS, SG_THANKS, TEASERS } from './introscript';
import type { DScript } from './dialogue';
import type { ShopKind, Room } from './interiors';

type Pair = [string, string]; // [English, Korean]
export type SpotKey = 'donna' | 'motel' | 'hall' | 'gate' | 'crate0' | 'crate1' | 'crate2' | 'door:arcade' | 'door:gun' | 'door:clothes';
interface Line { who: Pair; text: Pair }
type Step =
  /** `walk`: you must be on foot to count (a car is not enough: get out and walk up). */
  | { k: 'goto'; spot: SpotKey; text: Pair; walk?: boolean }
  /** Go through the door of a story room. */
  | { k: 'enter'; room: ShopKind; text: Pair }
  /** Examine things inside a room (their ids are in the room's list); `notes` is what each one tells you. */
  | { k: 'inspect'; room: ShopKind; ids: string[]; notes: Record<string, Pair>; text: Pair }
  /** Step back out into the street. */
  | { k: 'leave'; room: ShopKind; text: Pair }
  | { k: 'dialog'; lines: Line[] }
  | { k: 'smash'; count: number; text: Pair }
  | { k: 'steal'; text: Pair }
  | { k: 'drive'; spot: SpotKey; text: Pair }
  /** Story mode's opening: a spoken scene that starts by itself (the arrival). */
  | { k: 'monologue'; script: DScript; start: string; text: Pair }
  /** Walk up to a person (marked with a yellow diamond) and talk face to face. */
  | { k: 'talk'; npc: string; script: DScript; start: string; text: Pair }
  /** Donna's first job: two orders on foot (the delivery job counts them); the Bigsby thugs and Bonnie turn up on the second leg. */
  | { k: 'deliver'; count: number; text: Pair }
  /** Get any kind of ride. */
  | { k: 'ride'; text: Pair }
  /** Three of the mayor's thugs are wrecking Donna's shop: they taunt you, then you fight them. */
  /** A fight: thugs stand at `at` (default: Donna's shop) and `count` of them (default 3); `taunt` is their line before it starts. */
  | { k: 'brawl'; text: Pair; at?: SpotKey; count?: number; taunt?: { script: DScript; start: string } }
  /** A thief runs off with something: catch them on foot. */
  | { k: 'runner'; text: Pair }
  /** The police are after you (`stars` of them): lose them. */
  | { k: 'escape'; stars: number; text: Pair };
export interface Chapter { title: Pair; reward: number; finale?: boolean; intro?: boolean; /** The reward is paid in full in the story mode (the others are a fraction: see Game.scaled). */ fixed?: boolean; steps: Step[] }
/** Chapters the story mode puts in front of the original eight (the opening and "Smash and Grab"). */
export const STORY_EXTRA = 2;

const DONNA: Pair = ['Donna', '도나'];
const PARK: Pair = ['Mr. Park', '미스터 파크'];
const ALLY: Pair = ['Ally', '앨리'];
const LEE: Pair = ['Captain Lee', '이 선장'];
const MAYOR: Pair = ['Mayor Bigsby', '빅스비 시장'];
const KIKI: Pair = ['Kiki', '키키'];
const GUNNY: Pair = ['Gunny', '거니'];

/** The opening of the story mode (a new game starts on foot with $20): face to face with Mr. Park and Donna, a first job with a fight on the way, a first ride. It is put in front of the chapters below. */
const INTRO: Chapter = {
  title: ['Broke in Sunset Bay', '선셋 베이에서 빈털터리'], reward: 100, intro: true,
  steps: [
    { k: 'monologue', script: ARRIVAL, start: 'a1', text: ['Look around', '주변을 둘러보세요'] },
    { k: 'talk', npc: 'park', script: PARK_SCRIPT, start: 'p1', text: ['Meet Mr. Park at the 24h Motel (yellow diamond)', '24시 모텔 앞에서 미스터 박을 만나세요 (노란 마름모)'] },
    { k: 'talk', npc: 'donna', script: DONNA_SCRIPT, start: 'd1', text: ["Talk to Donna at her donut shop (yellow diamond)", '도넛 가게의 도나와 대화하세요 (노란 마름모)'] },
    { k: 'deliver', count: 1, text: ["Deliver Donna's two orders (pink marker by her door) - on foot, or grab any car (F)", '도나의 주문 두 건을 배달하세요 (가게 문 옆 분홍 마커) - 걸어서, 또는 아무 차나 타고 (F)'] },
    { k: 'monologue', script: SIRENS, start: 'z0', text: ['Sirens!', '사이렌!'] },
    { k: 'escape', stars: 1, text: ['Somebody called the police about the fight - lose them!', '누군가 싸움을 신고했어요 - 경찰을 따돌리세요!'] },
    { k: 'ride', text: ['Get some wheels: a bike at the garage ($150), a scooter ($600), or borrow a parked car (F)', '탈것을 구하세요: 정비소의 자전거($150), 스쿠터($600), 아니면 세워진 차를 타세요 (F)'] },
  ],
};

/** The second chapter: a run of set pieces at Donna's (a phone call, a brawl, a chase on foot). */
const SMASHGRAB: Chapter = {
  title: ['Smash and Grab', '습격과 날치기'], reward: 150, fixed: true,
  steps: [
    { k: 'monologue', script: PARK_CALL, start: 'c1', text: ['Your phone is ringing', '전화가 울려요'] },
    { k: 'goto', spot: 'donna', text: ["Run to Donna's Donut Shop - the Bigsby crew is wrecking it!", '도나네 도넛 가게로 달려가세요 - 빅스비 패거리가 부수고 있어요!'] },
    { k: 'brawl', text: ["Beat the three thugs wrecking Donna's shop", '도나네 가게를 부수는 불량배 셋을 쓰러뜨리세요'] },
    { k: 'monologue', script: CASHBOX, start: 'x1', text: ['Donna is shouting', '도나가 외쳐요'] },
    { k: 'runner', text: ['Catch the thief with Donna\'s cash box (yellow marker) - sprint with Shift!', '도나의 돈 상자를 든 도둑을 잡으세요 (노란 마커) - Shift로 전력 질주!'] },
    { k: 'talk', npc: 'donna', script: SG_THANKS, start: 'g1', text: ['Return the cash box to Donna (yellow diamond)', '도나에게 돈 상자를 돌려주세요 (노란 마름모)'] },
  ],
};

export const CHAPTERS: Chapter[] = [
  {
    title: ['Welcome to Sunset Bay', '선셋 베이에 온 걸 환영해'], reward: 1000,
    steps: [
      { k: 'goto', spot: 'donna', text: ["Head to Donna's Donut Shop in Old Town", '올드타운의 도나네 도넛 가게로 가세요'] },
      { k: 'dialog', lines: [
        { who: DONNA, text: ["Hi there, newcomer! I'm Donna. Welcome to Sunset Bay!", '안녕, 새내기! 난 도나야. 선셋 베이에 온 걸 환영해!'] },
        { who: DONNA, text: ['But Old Town is in trouble. Mayor Bigsby wants to knock it all down and build a giant Mega Mall!', '그런데 올드타운이 위기야. 빅스비 시장이 전부 부수고 거대한 메가몰을 지으려 해!'] },
        { who: DONNA, text: ['His crew dumped junk all over our streets. Smash 6 things - hydrants, benches, trash cans, anything - to clear the way!', '시장 일꾼들이 거리에 쓰레기를 잔뜩 버렸어. 소화전, 벤치, 쓰레기통 뭐든 6개를 부숴서 길을 치워줘!'] },
      ] },
      { k: 'smash', count: 6, text: ['Smash street props', '거리의 물건 부수기'] },
      { k: 'goto', spot: 'donna', text: ['Go back to Donna', '도나에게 돌아가기'] },
      { k: 'dialog', lines: [
        { who: DONNA, text: ['Wow, the street looks great! Here is something for your trouble.', '와, 거리가 깨끗해졌네! 수고비야.'] },
        { who: DONNA, text: ["Mr. Park at the 24h Motel needs help too. Explore as much as you like first - he isn't going anywhere!", '24시 모텔의 미스터 파크도 도움이 필요해. 먼저 마음껏 구경해도 돼. 사장님은 어디 안 가니까!'] },
      ] },
    ],
  },
  {
    title: ['Smash for Good', '부수는 건 좋은 일'], reward: 1500,
    steps: [
      { k: 'goto', spot: 'motel', text: ['Meet Mr. Park at the 24h Motel', '24시 모텔에서 미스터 파크 만나기'] },
      { k: 'dialog', lines: [
        { who: PARK, text: ['Ah, the new helper! The mall crew left their demolition crates all over town.', '오, 새로 온 도우미군! 철거 상자들을 온 동네에 버려놨어.'] },
        { who: PARK, text: ["Smash 12 more things and I'll sign this petition to save Old Town.", '12개를 더 부숴주면 올드타운을 지키는 청원서에 서명하겠네.'] },
      ] },
      { k: 'smash', count: 12, text: ['Smash street props', '거리의 물건 부수기'] },
      { k: 'goto', spot: 'hall', text: ['Take the petition to City Hall (the plaza downtown)', '청원서를 시청(시내 광장)으로 가져가기'] },
      { k: 'dialog', lines: [
        { who: ALLY, text: ["I'm Ally from Sunset News. This petition will be on TV tonight!", '난 선셋 뉴스의 앨리야. 이 청원서는 오늘 밤 뉴스에 나갈 거야!'] },
        { who: ALLY, text: ['But I heard the Mayor keeps the secret mall plans in his limo. Interested?', '그런데 시장이 비밀 설계도를 자기 리무진에 보관한다고 들었어. 관심 있어?'] },
      ] },
    ],
  },
  {
    title: ['Inside Job', '내부 작전'], reward: 2500,
    steps: [
      { k: 'steal', text: ["Borrow Mayor Bigsby's black limo (marked on the map)", '빅스비 시장의 검은 리무진 빌리기 (지도에 표시됨)'] },
      { k: 'drive', spot: 'gate', text: ['Drive the limo to the Harbor gate - keep it in one piece!', '리무진을 항구 입구까지 몰고 가기 - 망가뜨리지 마세요!'] },
      { k: 'dialog', lines: [
        { who: LEE, text: ["Ahoy! Captain Lee here. Nice driving - you didn't even scratch it!", '어이! 이 선장이다. 운전 솜씨 좋군. 흠집 하나 없어!'] },
        { who: LEE, text: ["The plans say the mall's secret blueprints are hidden in three crates around the harbor.", '설계도를 보니 비밀 청사진이 항구 곳곳의 상자 세 개에 숨겨져 있어.'] },
      ] },
    ],
  },
  {
    title: ['The Big Shipment', '대형 화물'], reward: 3000,
    steps: [
      { k: 'goto', spot: 'crate0', text: ['Find crate 1 of 3', '상자 3개 중 1번 찾기'] },
      { k: 'goto', spot: 'crate1', text: ['Find crate 2 of 3', '상자 3개 중 2번 찾기'] },
      { k: 'goto', spot: 'crate2', text: ['Find crate 3 of 3', '상자 3개 중 3번 찾기'] },
      { k: 'dialog', lines: [
        { who: LEE, text: ['That is all three! The blueprints prove the Mega Mall would flood Old Town.', '세 개 다 찾았구나! 청사진을 보니 메가몰이 올드타운을 물에 잠기게 할 거야.'] },
        { who: LEE, text: ['Bring them to the town plaza - everyone is gathering for a meeting.', '마을 광장으로 가져가 줘. 다들 모여서 회의를 하고 있어.'] },
      ] },
      { k: 'goto', spot: 'hall', text: ['Bring the blueprints to the town plaza', '청사진을 마을 광장으로 가져가기'] },
    ],
  },
  {
    title: ['Save the Day', '마을을 구하자'], reward: 10000, finale: true,
    steps: [
      { k: 'dialog', lines: [
        { who: DONNA, text: ["You made it! The Mayor's trucks are rolling in with more mall junk!", '왔구나! 시장의 트럭들이 또 쓰레기를 싣고 오고 있어!'] },
        { who: ALLY, text: ["Smash 10 more props and the whole town will see he can't win!", '10개만 더 부수면 시장이 이길 수 없다는 걸 모두가 보게 될 거야!'] },
      ] },
      { k: 'smash', count: 10, text: ['Smash the mall junk', '메가몰 쓰레기 부수기'] },
      { k: 'dialog', lines: [
        { who: ALLY, text: ['It worked! The Mega Mall is cancelled!', '성공이야! 메가몰은 취소됐어!'] },
        { who: DONNA, text: ["Old Town is saved! Let's have a festival - fireworks are on me!", '올드타운은 무사해! 축제를 열자 - 불꽃놀이는 내가 쏜다!'] },
        { who: MAYOR, text: ['Humph... maybe a park would be nicer than a mall.', '흠... 몰보다는 공원이 더 좋을지도 모르겠군.'] },
      ] },
    ],
  },
  // ---------------------------------------------------------------- arc two: the Mayor's comeback
  {
    title: ['Arcade Rumors', '오락실 소문'], reward: 4000,
    steps: [
      { k: 'goto', spot: 'door:arcade', text: ['Visit Kiki at the Arcade (walk to the door)', '오락실의 키키를 만나기 (문 앞으로 걸어가기)'] },
      { k: 'dialog', lines: [
        { who: KIKI, text: ["Psst! The Mayor is back. He's hiring thugs to put the junk right back on our streets.", '쉿! 시장이 돌아왔어. 깡패들을 고용해서 거리에 쓰레기를 다시 버리게 하고 있어.'] },
        { who: KIKI, text: ["Smash 15 of the new junk and I'll tell you where his crew is hiding.", '새 쓰레기를 15개 부수면 그들이 어디 숨었는지 알려줄게.'] },
      ] },
      { k: 'smash', count: 15, text: ["Smash the Mayor's new junk", '시장의 새 쓰레기 부수기'] },
      { k: 'goto', spot: 'door:arcade', text: ['Report back to Kiki', '키키에게 돌아가기'] },
      { k: 'dialog', lines: [
        { who: KIKI, text: ['Nice work! His crew keeps a stash of crates at the harbor.', '잘했어! 그들은 항구에 상자를 쌓아두고 있어.'] },
        { who: KIKI, text: ['Talk to Gunny at the Gun Shop - he knows what is inside them.', '총기 상점의 거니에게 가봐 - 안에 뭐가 있는지 알고 있어.'] },
      ] },
    ],
  },
  {
    title: ['The Harbor Stash', '항구의 비밀 창고'], reward: 5000,
    steps: [
      { k: 'goto', spot: 'door:gun', text: ['Meet Gunny at the Gun Shop', '총기 상점에서 거니 만나기'] },
      { k: 'dialog', lines: [
        { who: GUNNY, text: ['Kiki sent you? Good. The crates hold fireworks - the Mayor wants to ruin the festival.', '키키가 보냈구나? 좋아. 상자 안엔 불꽃놀이 장비가 있어 - 시장은 축제를 망치려 해.'] },
        { who: GUNNY, text: ["Find them at the harbor, then bring the news to Donna. I'd suggest not showing up empty-handed.", '항구에서 찾아서 도나에게 알려줘. 빈손으로 가지는 마.'] },
      ] },
      { k: 'goto', spot: 'crate1', text: ['Find the stash at the harbor (crate 1)', '항구의 창고 찾기 (상자 1)'] },
      { k: 'goto', spot: 'crate2', text: ['Check the second stash (crate 2)', '두 번째 창고 확인하기 (상자 2)'] },
      { k: 'steal', text: ["Borrow the Mayor's limo once more (marked on the map)", '시장의 리무진을 다시 빌리기 (지도에 표시됨)'] },
      { k: 'drive', spot: 'donna', text: ["Drive the limo to Donna's shop - in one piece!", '리무진을 도나의 가게로 몰고 가기 - 망가뜨리지 마세요!'] },
      { k: 'dialog', lines: [
        { who: DONNA, text: ['You saved the fireworks! Tonight we celebrate for real.', '불꽃놀이를 지켜냈구나! 오늘 밤은 진짜 축제야.'] },
      ] },
    ],
  },
  {
    title: ['Festival Night', '축제의 밤'], reward: 20000, finale: true,
    steps: [
      { k: 'goto', spot: 'hall', text: ['Join the festival at the town plaza', '마을 광장의 축제에 참가하기'] },
      { k: 'dialog', lines: [
        { who: MAYOR, text: ["I... may have been wrong. Old Town has more heart than any mall.", '내가... 틀렸을지도 모르겠군. 올드타운에는 어떤 몰보다 따뜻한 마음이 있어.'] },
        { who: DONNA, text: ['Help us clean up the last of the junk and the party can start!', '남은 쓰레기를 치우면 파티를 시작할 수 있어!'] },
      ] },
      { k: 'smash', count: 20, text: ['Clear the last junk for the festival', '축제를 위해 마지막 쓰레기 치우기'] },
      { k: 'dialog', lines: [
        { who: ALLY, text: ['The whole city is here. Old Town will never be the same!', '온 도시가 모였어. 올드타운은 이제 예전 같지 않을 거야!'] },
        { who: DONNA, text: ["Thank you, hero. The Monster Truck in the garage is yours - it's the town's gift.", '고마워, 영웅. 차고의 몬스터 트럭은 네 거야 - 마을의 선물이야.'] },
      ] },
    ],
  },
];

export interface StorySave { ch: number; step: number; prog: number }
const GANG_DOWN = (s: number) => s === 6 || s === 7 || s === 8; // down, getting up or dead
const FIREWORK_COLORS = [0xff4d6d, 0xffd23a, 0x4dd2ff, 0x7dff6a, 0xc77dff, 0xffffff];

export class StoryManager {
  ch: number;
  step: number;
  prog: number;
  done: boolean;
  private game: Game;
  private beacon = new Beacon(0xffd23a, 5.5);
  private limo: GameVehicle | null = null;
  private waiting = false;
  private dialog: { lines: Line[]; i: number } | null = null;
  private celebrateT = 0;
  private introShown = false;
  private idleT = 0;
  private announced = '';
  private base: number | null = null;
  private thugs: import('./humans').Human[] = [];
  /** The fight on the second leg of Donna's job: nothing yet, thugs standing in the street, their taunt, the fight, Bonnie's visit, done. */
  private ambush: 'idle' | 'staged' | 'talk' | 'fight' | 'bonnie' | 'done' = 'idle';
  private bonnieMode: 'wait' | 'walk' | 'talk' = 'wait';
  private bonnieT = 0;
  private batAt: { x: number; z: number } | null = null;
  private monoStarted = false;
  private carHint = false;
  private walkHint = false;
  private marks: THREE.Mesh[] = [];
  private brawl: 'idle' | 'staged' | 'talk' | 'fight' = 'idle';
  private runnerT = 0;
  private escapeT = 0;
  private pendingTeaser: DScript | null = null;
  private pendingEnding = false;

  constructor(game: Game, scene: THREE.Scene, saved?: StorySave) {
    this.game = game;
    // the story mode starts with the intro; a story saved before the intro existed skips it (every chapter moves up one place)
    if (game.mode === 'story' && !CHAPTERS.includes(INTRO)) CHAPTERS.unshift(INTRO, SMASHGRAB);
    // (saves from before the opening: +1; saves from before "Smash and Grab": +1 more if they were past the opening)
    const v = game.save.storyV ?? 1;
    let shift = 0;
    if (game.mode === 'story' && saved) { if (v < 2) shift += 1; if (v < 3 && (saved.ch ?? 0) + shift >= 1) shift += 1; }
    this.ch = (saved?.ch ?? 0) + shift;
    this.step = saved?.step ?? 0;
    this.prog = saved?.prog ?? 0;
    // (an opening saved by an earlier version had more steps)
    if (game.mode === 'story' && this.ch === 0 && this.step >= INTRO.steps.length) this.step = INTRO.steps.length - 1;
    this.done = this.ch >= CHAPTERS.length;
    scene.add(this.beacon.group);
    this.beacon.visible = false;
  }

  toSave(): StorySave { return { ch: this.ch, step: this.step, prog: this.prog }; }
  private get chapter(): Chapter | null { return this.ch < CHAPTERS.length ? CHAPTERS[this.ch] : null; }
  private get current(): Step | null { return this.chapter ? this.chapter.steps[this.step] ?? null : null; }

  private spot(key: SpotKey): { x: number; z: number } {
    const s = this.game.world.landmarks.story;
    if (key === 'donna') return s.donna;
    if (key === 'motel') return s.motel;
    if (key === 'hall') return s.hall;
    if (key === 'gate') return s.gate;
    if (key.startsWith('door:')) { const r = this.game.interiors.rooms.find((q) => q.id === key.slice(5)); if (r) return r.door; }
    return s.crates[Number(key.slice(5))];
  }

  private persist(): void { this.game.saveStory(this.toSave()); }

  private next(): void {
    const c = this.chapter;
    if (!c) return;
    this.step++;
    this.prog = 0;
    this.idleT = 0;
    this.base = null;
    this.monoStarted = false;
    this.brawl = 'idle'; this.escapeT = 0; this.runnerT = 0; this.carHint = false; this.walkHint = false;
    this.game.delivery.untimed = false;
    this.game.delivery.stopsLimit = 3; this.game.delivery.payScale = 1; this.game.delivery.range = null; // Donna's small first job is over
    if (this.step >= c.steps.length) this.completeChapter(c);
    this.persist();
  }

  private completeChapter(c: Chapter): void {
    const g = this.game;
    const reward = c.intro || c.fixed ? c.reward : g.scaled(c.reward, 0.3);
    g.addCash(reward, 'story');
    g.hud.toast(`${bi('Chapter complete!', '챕터 완료!')} +$${reward.toLocaleString('en-US')}`, 3600);
    if (g.mode === 'story' && TEASERS[c.title[0]]) this.pendingTeaser = TEASERS[c.title[0]];
    if (g.mode === 'story' && this.ch === CHAPTERS.length - 1) this.pendingEnding = true; // the last chapter: you decide what happens to Bigsby
    if (c.finale) {
      const last = this.ch === CHAPTERS.length - 1;
      g.unlockVehicle(last ? 'monster' : 'supercar');
      this.celebrateT = 9;
      g.hud.toast(last ? bi('Festival night! You unlocked the Monster Truck!', '축제의 밤! 몬스터 트럭이 해금됐어요!') : bi('Old Town is saved! You unlocked the Supercar!', '올드타운을 지켰어요! 슈퍼카가 해금됐어요!'), 5200);
    }
    this.ch++;
    this.step = 0;
    this.prog = 0;
    if (this.ch >= CHAPTERS.length) this.done = true;
    this.beacon.visible = false;
  }

  /** A prop was smashed. Returns true when it counted for the goal (smashing the junk is the job, so it is no crime). */
  onSmash(): boolean {
    const s = this.current;
    if (s && s.k === 'smash' && !this.dialog) { this.prog++; this.idleT = 0; return true; }
    return false;
  }

  // ------------------------------------------------------------------ dialogue
  private openDialog(lines: Line[]): void {
    this.dialog = { lines, i: 0 };
    this.showLine();
    this.game.setDialogOpen(true);
  }
  private showLine(): void {
    const d = this.dialog!;
    const l = d.lines[d.i];
    this.game.hud.showDialog(bi(l.who[0], l.who[1]), bi(l.text[0], l.text[1]), t('ui.dialog.continue'));
  }
  /** Called when the player presses F / Enter / Space or taps the dialogue box. */
  advanceDialog(): void {
    const d = this.dialog;
    if (!d) return;
    d.i++;
    if (d.i >= d.lines.length) {
      this.dialog = null;
      this.game.hud.hideDialog();
      this.game.setDialogOpen(false);
      this.next();
    } else this.showLine();
  }
  get dialogOpen(): boolean { return !!this.dialog; }

  // ------------------------------------------------------------------ the mayor's limo
  private ensureLimo(): GameVehicle {
    const g = this.game;
    if (this.limo && g.vehicles.includes(this.limo) && !this.limo.ctrl.wrecked) return this.limo;
    const p = g.world.landmarks.story.limo;
    const v = g.spawnVehicle('sedan', 0x14141f, p.x, p.z, p.h, 'parked');
    v.isGigTarget = true;
    this.limo = v;
    return v;
  }

  private inRange(spot: { x: number; z: number }): boolean {
    const g = this.game;
    return Math.hypot(spot.x - g.focusX, spot.z - g.focusZ) < 8;
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    const g = this.game;
    this.beacon.update(dt);
    if (this.celebrateT > 0) this.fireworks(dt);
    if (!this.introShown && g.state === 'play') {
      this.introShown = true;
      if (this.ch === 0 && this.step === 0) g.hud.toast(bi('New story: Save Old Town! Follow the gold marker - or just explore.', '새 이야기: 올드타운을 지켜라! 금색 표시를 따라가거나 자유롭게 돌아다녀요.'), 6000);
    }
    if (this.pendingEnding && g.state === 'play' && !g.dialogue.active && !this.dialog && g.stars === 0 && !g.truckHeist.active) {
      this.pendingEnding = false;
      const n = g.save.clues?.length ?? 0;
      if (n >= 2) {
        const e0: DScript = {
          ...ENDING,
          e0: { id: 'e0', who: ['Festival Night', '축제의 밤'], text: n >= 5
            ? ['You pieced it together: the grey coat, the leaked patrol times, the Harbor Stash, the letter G. Bigsby was only the mask. When he kneels, he whispers the name you already knew.', '당신은 퍼즐을 맞췄어요. 회색 코트, 새어 나간 순찰 시간, 항구 창고, 그리고 글자 G. 빅스비는 가면일 뿐이었죠. 그가 무릎을 꿇자 당신이 이미 아는 이름을 속삭여요.']
            : ['You have a few pieces of the puzzle: the letter G keeps turning up. Bigsby kneels, and for a moment he looks at the crowd as if waiting for somebody else.', '퍼즐 조각이 몇 개 모였어요. 글자 G가 계속 나타나요. 빅스비는 무릎을 꿇고 누군가를 기다리는 듯 군중을 둘러봐요.'], next: 'e1' },
        };
        g.dialogue.start(e0, 'e0', null);
      } else g.dialogue.start(ENDING, 'e1', null);
    }
    // a call from the stranger after some chapters, once nothing else is going on
    if (this.pendingTeaser && g.state === 'play' && !g.dialogue.active && !this.dialog && g.stars === 0 && !g.jobOnDuty(null) && !g.truckHeist.active) {
      const t = this.pendingTeaser; this.pendingTeaser = null;
      g.hud.toast(bi('Your phone rings: unknown number', '전화가 울려요: 모르는 번호'), 2400);
      g.dialogue.start(t, 'x1', null);
    }
    g.interiors.open.clear();
    this.hideMarks();
    const s = this.current;
    if (!s || this.dialog) { if (!s) this.beacon.visible = false; this.idleT = 0; return; }
    this.waiting = false;
    if (g.state === 'play') this.guide(dt, s);
    switch (s.k) {
      case 'goto': {
        const p = this.spot(s.spot);
        this.beacon.setPosition(p.x, p.z); this.beacon.visible = true;
        if (g.state === 'play' && this.inRange(p)) {
          if (g.stars > 0) this.waiting = true;
          else if (s.walk && !g.onFoot) { if (!this.walkHint) { this.walkHint = true; g.hud.toast(bi('Park and get out (F), then walk up.', '차를 세우고 내린 뒤(F) 걸어서 다가가세요.'), 3200); } }
          else this.next();
        }
        break;
      }
      case 'enter':
      case 'inspect': {
        const room = g.interiors.rooms.find((r) => r.id === s.room);
        if (room) { g.interiors.open.add(room.id); this.beacon.setPosition(room.door.x, room.door.z); this.beacon.visible = true; }
        break;
      }
      case 'leave':
        this.beacon.visible = false;
        if (!g.inside) this.next();
        break;
      case 'dialog':
        this.beacon.visible = false;
        if (g.state === 'play') {
          if (g.stars > 0) this.waiting = true;
          else this.openDialog(s.lines);
        }
        break;
      case 'smash':
        this.beacon.visible = false;
        if (this.prog >= s.count) this.next();
        break;
      case 'steal': {
        const limo = this.ensureLimo();
        this.beacon.setPosition(limo.x, limo.z); this.beacon.visible = true;
        if (g.driving === limo && !g.onFoot) this.next();
        break;
      }
      case 'monologue':
        this.beacon.visible = false;
        if (g.state === 'play' && !g.dialogue.active && !this.monoStarted && g.stars === 0) {
          this.monoStarted = true;
          g.dialogue.start(s.script, s.start, null, () => this.next());
        }
        break;
      case 'talk':
        this.beacon.visible = false; // the person carries a yellow diamond instead (see npcs.ts)
        break;
      case 'deliver': {
        this.beacon.visible = false;
        g.delivery.untimed = true; // no clock on the opening: take your time
        g.delivery.stopsLimit = 2; g.delivery.payScale = 0.4; g.delivery.range = [30, 60]; // short walks: the whole job fits in a couple of blocks of Old Town
        if (this.base === null) this.base = g.delivery.completed;
        this.ambushUpdate(dt);
        if (this.batAt && !g.humans.batOwned) { this.beacon.setPosition(this.batAt.x, this.batAt.z); this.beacon.visible = true; }
        if (g.delivery.completed - this.base >= s.count) this.next();
        break;
      }
      case 'brawl': {
        this.beacon.visible = false;
        this.brawlUpdate();
        break;
      }
      case 'runner': {
        this.beacon.visible = false;
        if (this.base === null) { this.base = g.thieves.caught; this.runnerT = 0.5; }
        if (g.thieves.caught > this.base) { this.next(); break; }
        if (g.onFoot && !this.carHint && g.thieves.active && this.thiefFar()) { this.carHint = true; g.hud.toast(bi('Too slow on foot? Grab any parked car (F) and run him down!', '걸어서 따라잡기 힘든가요? 근처 아무 차나 타세요 (F) - 차로 쫓으면 돼요!'), 4200); }
        if (!g.thieves.active && g.state === 'play') {
          this.runnerT -= dt;
          if (this.runnerT <= 0) { const donut = g.npcs.homeOf('donna') ?? { x: g.focusX, z: g.focusZ }; this.runnerT = g.thieves.start(donut, true) ? 0 : 3; }
        }
        break;
      }
      case 'escape': {
        this.beacon.visible = false;
        if (this.escapeT === 0) { // the police arrive
          this.escapeT = 0.001;
          let guard = 0;
          while (g.stars < s.stars && guard++ < 40) g.addHeat(25);
        }
        this.escapeT += dt;
        if (g.onFoot && !this.carHint && this.escapeT > 6 && g.stars > 0) { this.carHint = true; g.hud.toast(bi('Cops on your tail? Steal a car (F) - nobody is going to stop you.', '경찰이 쫓아오나요? 차를 훔쳐 타세요 (F) - 아무도 말리지 않아요.'), 4200); }
        if (this.escapeT > 4 && g.stars === 0 && g.state === 'play') this.next();
        break;
      }
      case 'ride': {
        const gd = g.world.garages[0];
        if (gd?.door) { this.beacon.setPosition(gd.door.x, gd.door.z); this.beacon.visible = !g.driving; } else this.beacon.visible = false;
        if (g.driving && !g.onFoot) this.next();
        break;
      }
      case 'drive': {
        const limo = this.limo;
        if (!limo || !g.vehicles.includes(limo) || limo.ctrl.wrecked) {
          g.hud.toast(bi('The limo was wrecked! A fresh one is waiting for you.', '리무진이 망가졌어요! 새 리무진이 기다리고 있어요.'), 3500);
          this.limo = null;
          const ci = this.chapter!.steps.findIndex((q) => q.k === 'steal');
          this.step = Math.max(0, ci); this.persist();
          break;
        }
        const p = this.spot(s.spot);
        if (g.driving === limo && !g.onFoot) {
          this.beacon.setPosition(p.x, p.z); this.beacon.visible = true;
          if (g.state === 'play' && this.inRange(p)) {
            if (g.stars > 0) this.waiting = true;
            else { limo.isGigTarget = false; this.limo = null; this.next(); }
          }
        } else { this.beacon.setPosition(limo.x, limo.z); this.beacon.visible = true; }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ the opening's fight and Bonnie
  /** Is the story holding the delivery back (thugs in the street, Bonnie talking) so it cannot finish yet? */
  blocksDelivery(): boolean {
    const s = this.current;
    return !!s && s.k === 'deliver' && this.ambush !== 'done' && (this.ambush !== 'idle' || this.game.delivery.leg === 1);
  }

  /** Is Donna's first job the current goal? (It is the one side job that works before the opening is over.) */
  deliveryStep(): boolean { const s = this.current; return !!s && s.k === 'deliver'; }

  // ------------------------------------------------------------------ inside the story rooms
  private hideMarks(): void { for (const m of this.marks) m.visible = false; }

  /** The thing you are standing next to (and have not examined yet), if the current step asks for it in this room. */
  inspectNear(room: Room): NonNullable<Room['inspects']>[number] | null {
    const s = this.current;
    if (!s || s.k !== 'inspect' || s.room !== room.id || this.dialog || this.game.dialogue.active) return null;
    const p = this.game.humans.player;
    for (const it of room.inspects ?? []) {
      const bit = s.ids.indexOf(it.id);
      if (bit < 0 || (this.prog & (1 << bit))) continue;
      if (Math.hypot(it.x - p.x, it.z - p.z) < 2.6) return it;
    }
    return null;
  }

  inspectPrompt(room: Room): string | null {
    const it = this.inspectNear(room);
    return it ? `${bi('[F] Examine', '[F] 살펴보기')}: ${bi(it.en, it.ko)}` : null;
  }

  /** Examine what is in front of you: it tells you something, and when everything is found the step is done. */
  inspect(room: Room): void {
    const s = this.current;
    const it = this.inspectNear(room);
    if (!s || s.k !== 'inspect' || !it) return;
    this.prog |= 1 << s.ids.indexOf(it.id);
    const note = s.notes[it.id];
    this.game.audio.cash();
    this.game.popups.spawn(it.x, 2.4, it.z, bi(note[0], note[1]), '#ffe9a8');
    this.game.hud.toast(bi(note[0], note[1]), 5200);
    const all = s.ids.every((_, i) => this.prog & (1 << i));
    if (all) this.next(); else this.persist();
  }

  /** Called every frame while the player is inside a room (the street is frozen, so only the steps that happen indoors run). */
  updateInside(dt: number): void {
    const g = this.game;
    const s = this.current;
    const room = g.inside;
    if (!room) return;
    for (const m of this.marks) m.rotation.y += dt * 2;
    if (!s || this.dialog) return;
    switch (s.k) {
      case 'enter':
        if (room.id === s.room) this.next();
        break;
      case 'inspect': {
        if (room.id !== s.room) break;
        while (this.marks.length < s.ids.length) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.2).scale(1, 1.7, 1), new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false }));
          g.scene.add(m);
          this.marks.push(m);
        }
        s.ids.forEach((id, i) => {
          const it = room.inspects?.find((q) => q.id === id);
          const m = this.marks[i];
          m.visible = !!it && !(this.prog & (1 << i));
          if (it) m.position.set(it.x, 2.2 + Math.sin(g.time * 3 + i) * 0.1, it.z);
        });
        break;
      }
      case 'monologue':
        if (g.state === 'play' && !g.dialogue.active && !this.monoStarted) {
          this.monoStarted = true;
          g.dialogue.start(s.script, s.start, null, () => this.next());
        }
        break;
    }
    if (s.k !== 'inspect') this.hideMarks();
  }

  /** The person the story wants you to talk to now (they get a yellow diamond). */
  questNpc(): string | null {
    const s = this.current;
    return s && s.k === 'talk' && !this.dialog ? s.npc : null;
  }

  /** If the current step is a talk with this person: the conversation to start, and what to do when it ends. */
  talkFor(id: string): { script: DScript; start: string; done: () => void } | null {
    const s = this.current;
    if (!s || s.k !== 'talk' || s.npc !== id || this.dialog || this.game.stars > 0) return null;
    return { script: s.script, start: s.start, done: () => this.next() };
  }

  private freeSpot(x: number, z: number, from: number): { x: number; z: number } {
    const g = this.game;
    for (let k = 0; k < 16; k++) {
      const a = from + (k / 16) * Math.PI * 2;
      for (const r of [11, 8, 6]) {
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (!g.world.boxes.some((b) => px > b.minX - 1 && px < b.maxX + 1 && pz > b.minZ - 1 && pz < b.maxZ + 1)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  /** Two thugs between you and the second drop, a few metres from it. */
  private spawnThugs(drop: { x: number; z: number }): void {
    const g = this.game;
    // the street gangs share the same few slots: stand a nearby crew down for the scene (they return when you come back)
    for (const m of g.humans.gangMembers()) if (!m.hostile) g.humans.removeGang(m);
    const dx = g.focusX - drop.x, dz = g.focusZ - drop.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    for (let k = 0; k < 2; k++) {
      const side = (k - 0.5) * 3.2;
      const x = drop.x + ux * 7 - uz * side, z = drop.z + uz * 7 + ux * side;
      const h = g.humans.spawnGang(x, z, 0x7a3a3a, false);
      if (h) { h.hp = h.maxHp = 40; this.thugs.push(h); }
    }
  }

  /** The thugs at Donna's door: three of them, a few metres from the shop. */
  private brawlUpdate(): void {
    const g = this.game;
    if (this.brawl === 'idle') {
      for (const m of g.humans.gangMembers()) if (!m.hostile) g.humans.removeGang(m);
      const cur = this.current;
      const at = cur && cur.k === 'brawl' ? cur.at : undefined;
      const n = cur && cur.k === 'brawl' ? cur.count ?? 3 : 3;
      const room = at ? null : g.interiors.rooms.find((r) => r.id === 'donut');
      const d = at ? this.spot(at) : room ? room.door : this.spot('donna');
      const h0 = room ? room.door.h : 0;
      for (let k = 0; k < n; k++) {
        const along = 5 + k * 1.8, side = (k - 1) * 2.2;
        const x = d.x + Math.cos(h0) * along + Math.sin(h0) * side, z = d.z - Math.sin(h0) * along + Math.cos(h0) * side;
        const h = g.humans.spawnGang(x, z, 0x7a3a3a, false);
        if (h) { h.hp = h.maxHp = 40; this.thugs.push(h); }
      }
      this.brawl = this.thugs.length ? 'staged' : 'idle';
      if (!this.thugs.length) { this.next(); }
      return;
    }
    if (this.brawl === 'talk') return;
    const alive = this.aliveThugs();
    if (this.brawl === 'staged') {
      if (alive.length === 0) { this.clearThugs(); this.next(); return; }
      if (alive.some((h) => h.hostile)) { this.brawl = 'fight'; return; }
      if (g.state === 'play' && !g.dialogue.active && Math.hypot(alive[0].x - g.focusX, alive[0].z - g.focusZ) < 12) {
        this.brawl = 'talk';
        const tc = this.current && this.current.k === 'brawl' ? this.current.taunt : undefined;
        g.dialogue.start(tc ? tc.script : SHOP_THUGS, tc ? tc.start : 's1', alive[0], () => { for (const h of this.aliveThugs()) h.hostile = true; this.brawl = 'fight'; g.slowMo(0.9); });
      }
      return;
    }
    if (this.brawl === 'fight' && alive.length === 0) {
      for (const h of this.thugs) g.humans.removeGangLater(h);
      this.thugs = [];
      this.next();
    }
  }

  private thiefFar(): boolean {
    const m = this.game.thieves.markers()[0];
    return !!m && Math.hypot(m.x - this.game.focusX, m.z - this.game.focusZ) > 25;
  }

  private clearThugs(): void {
    for (const h of this.thugs) this.game.humans.removeGang(h);
    this.thugs = [];
  }

  private aliveThugs(): import('./humans').Human[] {
    return this.thugs.filter((h) => h.active && !h.ko && h.hp > 0 && !GANG_DOWN(h.state));
  }

  private ambushUpdate(dt: number): void {
    const g = this.game;
    if (this.ambush === 'done') return;
    const drop = g.delivery.dropPos();
    if (this.ambush === 'idle') {
      if (drop && g.delivery.leg === 1 && Math.hypot(drop.x - g.focusX, drop.z - g.focusZ) < 55) {
        this.spawnThugs(drop);
        this.ambush = this.thugs.length ? 'staged' : 'done';
      }
      return;
    }
    if (this.ambush === 'bonnie') { this.bonnieUpdate(dt); return; }
    if (this.ambush === 'talk') return; // the taunt is on screen
    // the run was dropped (police, out of time): stand the scene down, it starts again on the next run
    if (!g.delivery.active) { this.clearThugs(); this.ambush = 'idle'; return; }
    const alive = this.aliveThugs();
    if (this.ambush === 'staged') {
      if (alive.length === 0) { this.afterFight(); return; }
      if (alive.some((h) => h.hostile)) { this.ambush = 'fight'; return; } // somebody hit one of them
      const t0 = alive[0];
      if (g.state === 'play' && !g.dialogue.active && Math.hypot(t0.x - g.focusX, t0.z - g.focusZ) < 9) {
        this.ambush = 'talk';
        g.dialogue.start(AMBUSH, 't1', t0, () => { for (const h of this.aliveThugs()) h.hostile = true; this.ambush = 'fight'; g.slowMo(0.9); });
      }
      return;
    }
    if (this.ambush === 'fight' && alive.length === 0) this.afterFight();
  }

  /** The thugs are down: the bat lies in the street, and a moment later Bonnie walks up. */
  private afterFight(): void {
    const g = this.game;
    const last = this.thugs[this.thugs.length - 1];
    const x = last ? last.x : g.focusX, z = last ? last.z : g.focusZ;
    g.humans.dropBat(x, z);
    this.batAt = { x, z };
    for (const h of this.thugs) g.humans.removeGangLater(h);
    this.thugs = [];
    this.ambush = 'bonnie'; this.bonnieMode = 'wait'; this.bonnieT = 1.2;
    g.hud.toast(bi('They dropped a baseball bat - pick it up!', '방망이를 떨어뜨렸어요 - 주우세요!'), 3200);
  }

  private bonnieUpdate(dt: number): void {
    const g = this.game, pl = g.humans.player;
    const b = g.npcs.humanOf('bonnie');
    if (!b || !b.active) { this.ambush = 'done'; return; }
    if (this.bonnieMode === 'wait') {
      if (g.state !== 'play') return;
      this.bonnieT -= dt;
      if (this.bonnieT <= 0) {
        const p = this.freeSpot(pl.x, pl.z, pl.heading + Math.PI);
        b.x = p.x; b.z = p.z;
        this.bonnieMode = 'walk';
      }
      return;
    }
    if (this.bonnieMode === 'walk') {
      if (g.state !== 'play' && !g.dialogue.active) return;
      const dx = pl.x - b.x, dz = pl.z - b.z, d = Math.hypot(dx, dz);
      if (d > 2.4) {
        b.heading = Math.atan2(dx, dz);
        b.mvx = Math.sin(b.heading) * 3.4; b.mvz = Math.cos(b.heading) * 3.4; b.speed = 3.4;
      } else {
        b.mvx = b.mvz = 0; b.speed = 0;
        this.bonnieMode = 'talk';
        g.dialogue.start(BONNIE, 'b1', b, () => {
          g.fadeThen(() => { // she goes back to the gun shop
            const home = g.npcs.homeOf('bonnie');
            if (home) { b.x = home.x; b.z = home.z; }
            b.mvx = b.mvz = 0; b.speed = 0;
            this.ambush = 'done';
          });
        });
      }
    }
  }

  private fireworks(dt: number): void {
    const g = this.game;
    this.celebrateT -= dt;
    if (Math.random() < dt * 7) {
      const h = g.world.landmarks.story.hall;
      const x = h.x + (Math.random() - 0.5) * 50, z = h.z + (Math.random() - 0.5) * 50, y = 16 + Math.random() * 12;
      const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      g.vfx.emitDebris(x, y, z, 0, 0, color, 12);
      g.vfx.emitSparks(x, y, z, 6);
    }
  }


  // ------------------------------------------------------------------ guidance
  private stepText(s: Step): string {
    if (s.k === 'dialog') return bi('Talk with ', '대화: ') + bi(s.lines[0].who[0], s.lines[0].who[1]);
    return bi(s.text[0], s.text[1]);
  }

  /** Announce each new goal, and nudge the player if they have wandered off for a while. */
  private guide(dt: number, s: Step): void {
    const g = this.game;
    const key = `${this.ch}:${this.step}`;
    if (key !== this.announced) {
      const first = this.announced === '' ;
      this.announced = key;
      if (!first && s.k !== 'dialog' && s.k !== 'monologue') g.hud.toast(`${bi('New goal', '새 목표')}: ${this.stepText(s)}`, 3800);
      return;
    }
    if (g.gigs.active) { this.idleT = 0; return; }
    this.idleT += dt;
    if (this.idleT > 100) {
      this.idleT = 0;
      g.hud.toast(`${bi('Story', '스토리')}: ${this.stepText(s)} - ${t('ui.hint.map')}`, 5000);
      g.hud.pulseStory();
    }
  }

  /** Where the player should go next (null while a conversation is the next step). Smash steps point at the nearest unbroken prop. */
  objective(): { x: number; z: number; label: string; prop?: boolean } | null {
    const s = this.current;
    if (!s || this.dialog) return null;
    const g = this.game;
    const label = this.stepText(s);
    switch (s.k) {
      case 'goto': { const p = this.spot(s.spot); return { x: p.x, z: p.z, label }; }
      case 'enter': case 'inspect': { if (g.inside) return null; const r = g.interiors.rooms.find((q) => q.id === s.room); return r ? { x: r.door.x, z: r.door.z, label } : null; }
      case 'monologue': return null;
      case 'brawl': { const t0 = this.aliveThugs()[0]; return t0 ? { x: t0.x, z: t0.z, label } : null; }
      case 'runner': { const m = g.thieves.markers()[0]; return m ? { x: m.x, z: m.z, label } : null; }
      case 'escape': return null;
      case 'talk': { const h = g.npcs.humanOf(s.npc); const p = h ?? g.npcs.homeOf(s.npc); return p ? { x: p.x, z: p.z, label } : null; }
      case 'deliver': {
        if (this.batAt && !g.humans.batOwned) return { x: this.batAt.x, z: this.batAt.z, label: bi('Pick up the baseball bat', '야구방망이를 줍으세요') };
        const t0 = this.aliveThugs()[0];
        if (t0) return { x: t0.x, z: t0.z, label: bi('Deal with the Bigsby thugs', '빅스비 패거리를 상대하세요') };
        const m = g.delivery.markers()[0]; return m ? { x: m.x, z: m.z, label } : null;
      }
      case 'ride': { const gd = g.world.garages[0]; return gd?.door ? { x: gd.door.x, z: gd.door.z, label } : null; }
      case 'steal': return this.limo ? { x: this.limo.x, z: this.limo.z, label } : (() => { const p = g.world.landmarks.story.limo; return { x: p.x, z: p.z, label }; })();
      case 'drive': {
        if (g.driving === this.limo && this.limo) { const p = this.spot(s.spot); return { x: p.x, z: p.z, label }; }
        if (this.limo) return { x: this.limo.x, z: this.limo.z, label: bi('Get back into the limo!', '리무진에 다시 타세요!') };
        return null;
      }
      case 'smash': {
        let best: { x: number; z: number } | null = null, bd = Infinity;
        for (const c of g.world.circles) {
          if (!c.smash || c.dead) continue;
          const d = Math.hypot(c.x - g.focusX, c.z - g.focusZ);
          if (d < bd) { bd = d; best = c; }
        }
        return best ? { x: best.x, z: best.z, label, prop: true } : null;
      }
      default: return null;
    }
  }

  /** The chapter checklist for the map: every chapter, and the steps of the current one. */
  checklist(): { chapters: { title: string; state: 'done' | 'now' | 'todo' }[]; steps: { text: string; state: 'done' | 'now' | 'todo' }[] } {
    const chapters = CHAPTERS.map((c, i) => ({ title: bi(c.title[0], c.title[1]), state: (i < this.ch || this.done ? 'done' : i === this.ch ? 'now' : 'todo') as 'done' | 'now' | 'todo' }));
    const c = this.chapter;
    const steps = c ? c.steps.map((st, i) => {
      let text = this.stepText(st);
      if (st.k === 'smash') text += ` (${i === this.step ? Math.min(this.prog, st.count) : i < this.step ? st.count : 0}/${st.count})`;
      return { text, state: (i < this.step ? 'done' : i === this.step ? 'now' : 'todo') as 'done' | 'now' | 'todo' };
    }) : [];
    return { chapters, steps };
  }

  // ------------------------------------------------------------------ HUD helpers
  /** The objective pill: chapter title, what to do now, and progress. */
  hudInfo(): { title: string; text: string } | null {
    const c = this.chapter;
    if (!c) return { title: bi('Story complete!', '스토리 완료!'), text: bi('Keep exploring: side jobs and golden stars are still waiting.', '계속 즐겨요: 부업과 황금 별이 아직 기다리고 있어요.') };
    const s = this.current;
    const title = `${t('ui.story')} · ${bi('Chapter', '챕터')} ${this.ch + 1}/${CHAPTERS.length}: ${bi(c.title[0], c.title[1])}`;
    if (!s) return { title, text: '' };
    if (this.waiting) return { title, text: t('ui.story.wait') };
    switch (s.k) {
      case 'goto': return { title, text: bi(s.text[0], s.text[1]) };
      case 'smash': return { title, text: `${bi(s.text[0], s.text[1])} (${Math.min(this.prog, s.count)}/${s.count})` };
      case 'steal': return { title, text: bi(s.text[0], s.text[1]) };
      case 'brawl': return { title, text: bi(s.text[0], s.text[1]) };
      case 'runner': return { title, text: bi(s.text[0], s.text[1]) };
      case 'escape': return { title, text: bi(s.text[0], s.text[1]) };
      case 'monologue': return { title, text: bi(s.text[0], s.text[1]) };
      case 'talk': return { title, text: bi(s.text[0], s.text[1]) };
      case 'deliver': return { title, text: this.batAt && !this.game.humans.batOwned ? bi('Pick up the baseball bat', '야구방망이를 줍으세요') : this.aliveThugs().length ? bi('Fight off the Bigsby thugs', '빅스비 패거리와 싸우세요') : bi(s.text[0], s.text[1]) };
      case 'ride': return { title, text: bi(s.text[0], s.text[1]) };
      case 'drive': return { title, text: this.game.driving === this.limo && this.limo ? bi(s.text[0], s.text[1]) : bi('Get back into the limo!', '리무진에 다시 타세요!') };
      case 'dialog': return { title, text: bi('Talk to them', '대화하기') };
      case 'enter': case 'leave': return { title, text: bi(s.text[0], s.text[1]) };
      case 'inspect': return { title, text: `${bi(s.text[0], s.text[1])} (${s.ids.filter((_, i) => this.prog & (1 << i)).length}/${s.ids.length})` };
    }
  }

  /** Kind of the current step ('goto', 'dialog', 'smash', 'steal', 'drive') or null when the story is finished. */
  stepKind(): string | null { return this.current ? this.current.k : null; }
  get limoCar(): GameVehicle | null { return this.limo; }

  progressText(): string {
    if (this.done) return bi('Story complete', '스토리 완료');
    const c = this.chapter;
    return c ? `${bi('Chapter', '챕터')} ${this.ch + 1}/${CHAPTERS.length}: ${bi(c.title[0], c.title[1])}` : '';
  }

  /** Where the current objective is (for the minimap). */
  blips(push: (x: number, z: number, color: string, flash?: boolean, size?: number) => void): void {
    const s = this.current;
    if (!s || this.dialog) return;
    if (s.k === 'goto') { const p = this.spot(s.spot); push(p.x, p.z, '#ffd23a', false, 6.5); }
    else if (s.k === 'brawl') { for (const h of this.aliveThugs()) push(h.x, h.z, '#ffd23a', true, 6); }
    else if (s.k === 'runner') { for (const m of this.game.thieves.markers()) push(m.x, m.z, '#ffd23a', true, 6); }
    else if (s.k === 'talk') { const p = this.game.npcs.humanOf(s.npc) ?? this.game.npcs.homeOf(s.npc); if (p) push(p.x, p.z, '#ffd23a', false, 6.5); }
    else if (s.k === 'deliver') {
      for (const h of this.aliveThugs()) push(h.x, h.z, '#ffd23a', true, 6);
      if (this.batAt && !this.game.humans.batOwned) push(this.batAt.x, this.batAt.z, '#ffd23a', true, 6);
    }
    else if (s.k === 'ride') { const gd = this.game.world.garages[0]; if (gd?.door && !this.game.driving) push(gd.door.x, gd.door.z, '#ffd23a', false, 6.5); }
    else if (s.k === 'steal' && this.limo) push(this.limo.x, this.limo.z, '#ffd23a', false, 6.5);
    else if (s.k === 'drive') {
      if (this.game.driving === this.limo) { const p = this.spot(s.spot); push(p.x, p.z, '#ffd23a', false, 6.5); }
      else if (this.limo) push(this.limo.x, this.limo.z, '#ffd23a', false, 6.5);
    }
  }
}
