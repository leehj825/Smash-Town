import type { Game } from './game';
import { Game as GameClass } from './game';
import { bi } from './i18n';
import { OWNABLE, type OwnableShop } from './progress';
import type { Room } from './interiors';

/** What the counters and desks inside the shops do (buying, resting, the bank), kept apart from the game loop. */
export class Shops {
  constructor(private G: Game) {}

  // ---- the bank heist: crack the vault (the alarm goes off at once), stay put until it opens, then get out
  heist: { t: number } | null = null;
  private heistCooldown = 0;
  vaultNear(room: Room): boolean {
    const pl = this.G.humans.player;
    return !!room.vault && Math.hypot(pl.x - room.vault.x, pl.z - room.vault.z) < 2.6;
  }
  startHeist(): void {
    const G = this.G;
    if (this.heist) return;
    if (this.heistCooldown > 0) { G.hud.toast(bi('The vault was just emptied - come back later', '금고가 방금 털렸어요 - 나중에 다시 오세요'), 2400); return; }
    this.heist = { t: 18 };
    G.addHeat(180); // the alarm: three stars the moment you start
    G.hud.toast(bi('ALARM! Stay at the vault until it opens!', '경보! 금고가 열릴 때까지 버티세요!'), 2600);
  }
  /** Runs while you are inside the bank. */
  updateHeist(dt: number, room: Room): void {
    const G = this.G;
    this.heistCooldown = Math.max(0, this.heistCooldown - dt);
    if (!this.heist) return;
    if (!this.vaultNear(room)) { this.heist = null; G.hud.showGig(false); G.hud.toast(bi('You ran - the vault stayed shut', '도망쳐서 금고가 열리지 않았어요'), 2400); return; }
    this.heist.t -= dt;
    G.hud.showGig(true, bi('BANK HEIST', '은행 강도'), bi('Cracking the vault...', '금고 해제 중...'), `${Math.max(0, Math.ceil(this.heist.t))}s`);
    if (this.heist.t <= 0) {
      const loot = 3500 + Math.floor(Math.random() * 3000);
      this.heist = null;
      this.heistCooldown = 600;
      G.hud.showGig(false);
      G.addCash(loot, 'other');
      G.progress.add('gigs');
      const pl = G.humans.player;
      G.popups.spawn(pl.x, 3, pl.z, `+$${loot.toLocaleString('en-US')}`, '#ffd23a');
      G.hud.toast(bi('The vault is open! Grab the cash and get out!', '금고가 열렸어요! 돈을 챙겨 도망가세요!'), 3000);
      G.news.report('heist', true);
    }
  }

  action(room: Room): void {
    const pl = this.G.humans.player;
    switch (room.id) {
      case 'donut':
        if (pl.hp >= pl.maxHp) { this.G.hud.toast(bi('You are not hungry!', '배고프지 않아요!')); return; }
        if (!this.G.pay(this.G.mood.saved ? 5 : 10)) return;
        pl.hp = pl.maxHp; this.G.popups.spawn(pl.x, 3, pl.z, bi('Yum! Full HP', '냠! 체력 회복'), '#ff8fb8');
        break;
      case 'motel':
        if (!this.G.pay(40)) return;
        pl.hp = pl.maxHp; this.G.humans.armor = Math.max(this.G.humans.armor, 0);
        this.G.flushSave();
        this.G.hud.toast(bi('Rested and saved', '쉬었고 저장했어요'), 2000);
        break;
      case 'arcade': {
        if (!this.G.pay(50)) return;
        const roll = Math.random();
        const prize = roll < 0.45 ? 0 : roll < 0.75 ? 25 : roll < 0.92 ? 100 : roll < 0.985 ? 250 : 1000;
        if (prize > 0) { this.G.addCash(prize, 'other'); this.G.popups.spawn(pl.x, 3, pl.z, `+$${prize}`, '#35e0ff'); }
        else this.G.popups.spawn(pl.x, 3, pl.z, bi('Try again!', '다시 도전!'), '#9aa0ad');
        break;
      }
      case 'clothes': {
        if (!this.G.pay(100)) return;
        this.G.save.outfit = ((this.G.save.outfit ?? 0) + 1) % GameClass.OUTFITS.length;
        this.G.applyOutfit(this.G.save.outfit);
        this.G.popups.spawn(pl.x, 3, pl.z, bi('New look!', '새 옷!'), '#b084ff');
        break;
      }
      case 'bank': {
        const n = Math.floor(this.G.cash);
        if (n < 100) { this.G.hud.toast(bi('Bring at least $100 to deposit', '입금은 최소 $100부터예요')); return; }
        this.G.cash -= n; this.G.save.bank = (this.G.save.bank ?? 0) + n;
        this.G.popups.spawn(pl.x, 3, pl.z, bi(`Deposited $${n.toLocaleString('en-US')}`, `$${n.toLocaleString('en-US')} 입금`), '#ffd23a');
        this.G.flushSave();
        break;
      }
      case 'gun': this.G.openGarage('arms'); break;
      case 'garage': this.G.openGarageCounter(); break;
      case 'home': {
        pl.hp = pl.maxHp;
        this.G.flushSave();
        this.G.hud.toast(bi('Rested and saved', '쉬었고 저장했어요'), 2000);
        break;
      }
    }
  }

  /** Savings earn 1% a minute of play, up to $300 a minute, and cannot be lost to a bust. */
  private bankTimer = 0;
  tickBank(dt: number): void {
    const b = this.G.save.bank ?? 0;
    if (b <= 0) return;
    this.bankTimer += dt;
    if (this.bankTimer >= 60) { this.bankTimer -= 60; this.G.save.bank = b + Math.min(300, Math.floor(b * 0.01)); }
  }

  deskNear(room: Room): boolean {
    const pl = this.G.humans.player;
    return !!room.desk && Math.hypot(pl.x - room.desk.x, pl.z - room.desk.z) < 2.4;
  }

  /** Buy the shop, or collect the income it has earned while you were away. */
  deskAction(room: Room): void {
    if (room.id === 'bank') {
      const b = this.G.save.bank ?? 0;
      if (b <= 0) { this.G.hud.toast(bi('Your account is empty', '계좌가 비어 있어요')); return; }
      this.G.save.bank = 0; this.G.addCash(b, 'other');
      this.G.popups.spawn(this.G.humans.player.x, 3, this.G.humans.player.z, `+$${b.toLocaleString('en-US')}`, '#ffd23a');
      this.G.flushSave();
      return;
    }
    const id = room.id as OwnableShop;
    const pl = this.G.humans.player;
    if (!this.G.progress.owned.includes(id)) {
      if (!this.G.pay(OWNABLE[id].price)) return;
      this.G.progress.buy(id);
      this.G.hud.toast(`${bi('You own', '소유')} ${bi(room.en, room.ko)}! +$${OWNABLE[id].perMin}/min`, 3200);
    } else {
      const n = this.G.progress.collect(id);
      if (n <= 0) { this.G.hud.toast(bi('Nothing to collect yet', '아직 받을 돈이 없어요')); return; }
      this.G.addCash(n, 'other');
      this.G.popups.spawn(pl.x, 3, pl.z, `+$${n.toLocaleString('en-US')}`, '#ffd23a');
    }
  }

  prompt(room: Room): string | null {
    const pl = this.G.humans.player;
    if (Math.hypot(pl.x - room.exit.x, pl.z - room.exit.z) < 2.4) return bi('[F] Leave', '[F] 나가기');
    if (room.id === 'bank' && this.vaultNear(room)) return this.heist ? bi('Cracking the vault - stay here!', '금고 해제 중 - 움직이지 마세요!') : bi('[F] Crack the vault (sets off the alarm!)', '[F] 금고 털기 (경보가 울립니다!)');
    if (this.deskNear(room)) {
      if (room.id === 'bank') return `${bi('[F] Withdraw all', '[F] 전액 출금')} - $${Math.floor(this.G.save.bank ?? 0).toLocaleString('en-US')}`;
      const id = room.id as OwnableShop;
      if (!this.G.progress.owned.includes(id)) return `${bi('[F] Buy this shop', '[F] 이 가게 사기')} - $${OWNABLE[id].price.toLocaleString('en-US')} (${bi('earns', '수입')} $${OWNABLE[id].perMin}/${bi('min', '분')})`;
      return `${bi('[F] Collect shop income', '[F] 가게 수입 받기')} - $${Math.floor(this.G.progress.pending[id]).toLocaleString('en-US')}`;
    }
    if (Math.hypot(pl.x - room.counter.x, pl.z - room.counter.z) < 3.4) {
      switch (room.id) {
        case 'donut': return this.G.mood.saved ? bi('[F] Buy a donut - $5 (hero discount!)', '[F] 도넛 구매 - $5 (영웅 할인!)') : bi('[F] Buy a donut - $10 (full HP)', '[F] 도넛 구매 - $10 (체력 회복)');
        case 'motel': return bi('[F] Rest and save - $40', '[F] 휴식 및 저장 - $40');
        case 'arcade': return bi('[F] Play a game - $50', '[F] 게임하기 - $50');
        case 'clothes': return bi('[F] Try a new outfit - $100', '[F] 새 옷 입어보기 - $100');
        case 'bank': return bi('[F] Deposit all cash (safe from busts, +1%/min)', '[F] 전액 입금 (체포 안전, 분당 +1%)');
        case 'gun': return bi('[F] Browse weapons', '[F] 무기 보기');
        case 'home': return this.G.stars > 0 ? bi('[F] Lie low here until the heat is gone', '[F] 수배가 풀릴 때까지 여기서 숨기') : bi('[F] Rest and save (free)', '[F] 쉬기와 저장 (무료)');
        case 'garage': return this.G.stars > 0 ? bi('[F] Garage - lie low here until the heat is gone', '[F] 차고 - 수배가 풀릴 때까지 숨어 있기') : bi('[F] Garage: repair, paint, vehicles', '[F] 차고: 수리, 도색, 차량');
      }
    }
    return null;
  }

}
