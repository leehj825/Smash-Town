import type { Game } from './game';
import { bi } from './i18n';
import { TRUCK_STAGE } from './progression';

interface Service { id: string; en: string; ko: string; cost: number; need?: string; run: () => boolean | void }

/**
 * The phone (O). People you have made friends with become services you can call from anywhere: the mechanic brings your car to the nearest road,
 * the informant marks the weakest gang block, the nurse patches you up, and your bodyguard follows you or covers a spot. Each costs a little and
 * cools down for half a minute. Friends at level 1 (three chats) are listed; the rest show who to befriend first.
 */
export class Phone {
  private el: HTMLElement | null = null;
  open = false;
  private last: Record<string, number> = {};
  private clock = 0;

  constructor(private game: Game) {}

  private services(): Service[] {
    const G = this.game;
    if (G.mode === 'kids') return [
      { id: 'kids-next', en: 'Change car (U)', ko: '차 바꾸기 (U)', cost: 0, run: () => { G.kidsMode.nextCar(1); } },
      { id: 'kids-prev', en: 'Change car: back', ko: '차 바꾸기: 이전', cost: 0, run: () => { G.kidsMode.nextCar(-1); } },
    ];
    const sb = G.sandbox;
    const sandbox: Service[] = G.mode !== 'sandbox' ? [] : [
      { id: 'sb-stars', en: `Sandbox: wanted level ${G.stars}\u2605 > next`, ko: `샌드박스: 수배 ${G.stars}\u2605 > 다음`, cost: 0, run: () => { sb.cycleStars(); } },
      { id: 'sb-freeze', en: `Sandbox: hold the wanted level (${sb.frozen !== null ? 'ON' : 'off'})`, ko: `샌드박스: 수배 고정 (${sb.frozen !== null ? '켜짐' : '꺼짐'})`, cost: 0, run: () => { sb.toggleFreeze(); } },
      { id: 'sb-time', en: 'Sandbox: next time of day', ko: '샌드박스: 다음 시간대', cost: 0, run: () => { G.sandboxHooks?.time(); } },
      { id: 'sb-weather', en: 'Sandbox: next weather', ko: '샌드박스: 다음 날씨', cost: 0, run: () => { G.hud.toast(G.sandboxHooks?.weather() ?? '', 1400); } },
      { id: 'sb-car', en: 'Sandbox: spawn the next car', ko: '샌드박스: 다음 차 소환', cost: 0, run: () => { sb.spawnCar(); } },
      { id: 'sb-god', en: `Sandbox: god mode (${sb.god ? 'ON' : 'off'})`, ko: `샌드박스: 무적 (${sb.god ? '켜짐' : '꺼짐'})`, cost: 0, run: () => { sb.toggleGod(); } },
    ];
    return [
      ...sandbox,
      { id: 'dave', en: 'Mechanic Dave: bring my car', ko: '정비사 데이브: 내 차 가져다줘요', cost: 80, need: 'dave', run: () => this.bringCar() },
      { id: 'kane', en: 'Informant Kane: gang intel', ko: '정보원 케인: 갱단 정보', cost: 100, need: 'kane', run: () => {
        const z = G.gangs.weakest();
        if (!z) { G.hud.toast(bi('The gangs are all yours already.', '갱단 구역은 이미 다 당신 거예요.'), 2200); return false; }
        G.gangs.reveal(z, 90);
        G.hud.toast(bi(`${z.name} are weakest right now - marked on your map.`, `지금은 ${z.nameKo}가 제일 약해요 - 지도에 표시했어요.`), 3000);
      } },
      { id: 'kane-truck', en: 'Informant Kane: cash truck tip', ko: '정보원 케인: 현금 수송차 제보', cost: 150, need: 'kane', run: () => { if (!G.progression.allows(TRUCK_STAGE)) { G.progression.refuse(TRUCK_STAGE); return false; } if (G.truckHeist.active) { G.hud.toast(bi('You are already on a job.', '이미 작전 중이에요.'), 1800); return false; } return G.truckHeist.start(true); } },
      { id: 'rosa', en: 'Nurse Rosa: house call', ko: '간호사 로사: 왕진', cost: 120, need: 'rosa', run: () => {
        const pl = G.humans.player;
        pl.hp = pl.maxHp; G.humans.armor = Math.max(G.humans.armor, 25);
        G.popups.spawn(pl.x, 3, pl.z, bi('Patched up', '치료 완료'), '#5ec4ff');
      } },
      { id: 'survival', en: 'Challenge: five-star survival', ko: '도전: 5성 생존', cost: 0, need: '*', run: () => G.challenge.startSurvival() },
      { id: 'chaos-rockets', en: `Chaos: endless rockets (${G.challenge.chaos.rockets ? 'ON' : 'off'})`, ko: `카오스: 무한 로켓 (${G.challenge.chaos.rockets ? '켜짐' : '꺼짐'})`, cost: 0, need: '*', run: () => G.challenge.toggleChaos('rockets') },
      { id: 'chaos-moon', en: `Chaos: moon gravity (${G.challenge.chaos.moon ? 'ON' : 'off'})`, ko: `카오스: 달 중력 (${G.challenge.chaos.moon ? '켜짐' : '꺼짐'})`, cost: 0, need: '*', run: () => G.challenge.toggleChaos('moon') },
      { id: 'bonnie-follow', en: 'Bonnie: follow me', ko: '보니: 따라와', cost: 0, run: () => this.command(false) },
      { id: 'bonnie-hold', en: 'Bonnie: cover this spot', ko: '보니: 여기서 엄호해', cost: 0, run: () => this.command(true) },
    ];
  }

  private command(hold: boolean): boolean {
    const G = this.game;
    if (!G.buddy.hired) { G.hud.toast(bi('Hire Bonnie at the gun shop first.', '먼저 총기 상점에서 보니를 고용하세요.'), 2200); return false; }
    G.buddy.setHold(hold);
    G.hud.toast(hold ? bi('Bonnie holds this spot and covers you.', '보니가 이 자리에서 엄호해요.') : bi('Bonnie follows you again.', '보니가 다시 따라와요.'), 2200);
    return true;
  }

  /** Put the player's last car (or a fresh one of the selected kind) on the nearest road a short way off, facing along it. */
  private bringCar(): boolean {
    const G = this.game;
    const p = G.humans.player;
    let best: { x: number; z: number; dx: number; dz: number } | null = null, bd = 1e9;
    for (const s of G.world.segments) {
      if (s.len < 20) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d > 22 && d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    const old = G.lastDriven;
    let kind = old && G.vehicles.includes(old) && !old.ctrl.wrecked ? old.kind : G.save.selected;
    if (old && G.vehicles.includes(old) && !old.ctrl.wrecked && old !== G.driving) G.removeVehicle(old);
    const v = G.spawnVehicle(kind, G.paintOf(kind), best.x, best.z, Math.atan2(best.dx, best.dz), 'parked');
    v.owned = true;
    G.lastDriven = v;
    G.hud.toast(bi('Dave dropped your car off. Look for it on the map.', '데이브가 차를 가져다 놨어요. 지도에서 찾아보세요.'), 2800);
    return true;
  }

  toggle(): void { if (this.open) this.close(); else this.show(); }

  show(): void {
    const G = this.game;
    if (G.state !== 'play' || G.inside || G.gear.wheelOpen) return;
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'phone'; document.body.appendChild(this.el); }
    this.render();
    this.el.classList.add('open');
    this.open = true;
    try { document.exitPointerLock?.(); } catch { /* optional */ }
  }
  close(): void { this.el?.classList.remove('open'); this.open = false; }

  private render(): void {
    const G = this.game;
    const el = this.el!;
    el.innerHTML = `<div class="phone-panel"><h3>${bi('PHONE', '휴대폰')}</h3><div class="phone-cash">$${Math.floor(G.cash).toLocaleString('en-US')}</div></div>`;
    const panel = el.firstElementChild as HTMLElement;
    for (const s of this.services()) {
      const lvl = s.need === '*' ? (G.challenge.unlocked ? 9 : 0) : s.need ? G.npcs.level(s.need) : 9;
      const cd = Math.max(0, 30 - (this.clock - (this.last[s.id] ?? -999)));
      const b = document.createElement('button');
      b.className = 'phone-item';
      const locked = lvl < 1;
      b.disabled = locked || cd > 0;
      b.innerHTML = `<span>${bi(s.en, s.ko)}</span><small>${locked ? (s.need === '*' ? bi('unlocks after the story or 50% city completion', '스토리 완료 또는 도시 완성도 50% 후 열려요') : bi('make friends first (3 chats)', '먼저 친구가 되세요 (대화 3번)')) : cd > 0 ? `${Math.ceil(cd)}s` : s.cost ? `$${s.cost}` : bi('free', '무료')}</small>`;
      b.addEventListener('click', () => {
        if (s.cost && !G.pay(s.cost)) return;
        const r = s.run();
        if (r === false) { G.cash += s.cost; G.hud.setCash(G.cash); } else this.last[s.id] = this.clock;
        this.render();
      });
      panel.appendChild(b);
    }
    const x = document.createElement('button');
    x.className = 'phone-close';
    x.textContent = bi('Close (O)', '닫기 (O)');
    x.addEventListener('click', () => this.close());
    panel.appendChild(x);
  }

  update(dt: number): void {
    const G = this.game;
    this.clock += dt;
    if (G.state !== 'play' || G.inside) { if (this.open) this.close(); return; }
    if (G.input.wasPressed('KeyO')) this.toggle();
    if (G.input.wasPressed('KeyY')) { if (G.buddy.hired) this.command(!G.buddy.holding); }
  }
}
