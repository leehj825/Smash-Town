import * as THREE from 'three';
import type { Game } from './game';
import { bi } from './i18n';
import { MeshBuilder, paletteMaterial } from './geo';
import { GUNS, GUN_ORDER } from './guns';
import { GEAR_STAGE } from './progression';

export type GearId = 'smoke' | 'c4' | 'spikes' | 'donut' | 'vest';
interface GearDef { id: GearId; en: string; ko: string; icon: string; price: number; max: number; tool: boolean }
export const GEAR: GearDef[] = [
  { id: 'smoke', en: 'Smoke grenade', ko: '연막탄', icon: '\u{1F32B}', price: 150, max: 6, tool: true },
  { id: 'c4', en: 'C4 charge', ko: 'C4 폭탄', icon: '\u{1F9E8}', price: 300, max: 4, tool: true },
  { id: 'spikes', en: 'Spike strip', ko: '스파이크 스트립', icon: '\u{1F4CC}', price: 250, max: 4, tool: true },
  { id: 'donut', en: 'Donut (+60% health)', ko: '도넛 (체력 +60%)', icon: '\u{1F369}', price: 40, max: 9, tool: false },
  { id: 'vest', en: 'Body armour (+50)', ko: '방탄복 (+50)', icon: '\u{1F9BA}', price: 200, max: 5, tool: false },
];
const BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g])) as Record<GearId, GearDef>;

interface Cloud { x: number; z: number; t: number }
interface Strip { x: number; z: number; t: number; mesh: THREE.Mesh }
interface Charge { x: number; z: number; mesh: THREE.Mesh }

/**
 * Gear: what a criminal carries. Tools to throw or place (a smoke grenade that hides you from the police, a C4 charge you set off by hand, a
 * spike strip that shreds the tyres of the car behind you) and two things to use at once (a donut for health, body armour). Buy them in the
 * Arms tab of the gun shop; they are saved.
 *
 *   Z  use the chosen tool        G  open the quick wheel (slow motion; pick a weapon or a tool, G again to close)
 *   U  eat a donut                I  put on body armour
 */
export class Gear {
  sel: GearId = 'smoke';
  readonly clouds: Cloud[] = [];
  readonly strips: Strip[] = [];
  readonly charges: Charge[] = [];
  private group = new THREE.Group();
  private stripGeo: THREE.BufferGeometry;
  private chargeGeo: THREE.BufferGeometry;
  private wheel: HTMLElement | null = null;
  wheelOpen = false;
  private badge: HTMLElement | null = null;
  private smokeT = 0;

  constructor(private game: Game) {
    game.scene.add(this.group);
    const s = new MeshBuilder();
    s.box(5.6, 0.06, 0.7, 0, 0.05, 0, 0x23262f);
    for (let i = 0; i < 12; i++) s.box(0.06, 0.2, 0.06, -2.6 + i * 0.47, 0.17, 0, 0xd8dde6);
    this.stripGeo = s.build();
    const c = new MeshBuilder();
    c.box(0.5, 0.14, 0.34, 0, 0.1, 0, 0x5b6a3a); c.box(0.1, 0.05, 0.1, 0.1, 0.2, 0, 0xff2a3a);
    this.chargeGeo = c.build();
    this.badge = document.getElementById('gear');
  }

  count(id: GearId): number { return this.game.save.gear?.[id] ?? 0; }
  /** Use up one of something. */
  spend(id: GearId): void { this.add(id, -1); }
  private add(id: GearId, n: number): void {
    const g = (this.game.save.gear ??= {});
    g[id] = Math.max(0, (g[id] ?? 0) + n);
    this.game.saveDirty = true;
  }
  /** The rows of the shop. */
  shopList(): { id: GearId; en: string; ko: string; icon: string; price: number; have: number; max: number; need: number; open: boolean }[] {
    return GEAR.map((d) => ({ id: d.id, en: d.en, ko: d.ko, icon: d.icon, price: d.price, have: this.count(d.id), max: d.max, need: GEAR_STAGE[d.id], open: this.game.progression.allows(GEAR_STAGE[d.id]) }));
  }
  buy(id: GearId): boolean {
    const d = BY_ID[id];
    if (!this.game.progression.allows(GEAR_STAGE[id])) { this.game.progression.refuse(GEAR_STAGE[id]); return false; }
    if (this.count(id) >= d.max) { this.game.hud.toast(bi('You cannot carry more of those', '더는 들고 다닐 수 없어요')); return false; }
    if (!this.game.pay(d.price)) return false;
    this.add(id, 1);
    return true;
  }

  private pos(): { x: number; z: number; h: number } {
    const G = this.game;
    if (G.driving && !G.onFoot) return { x: G.driving.x, z: G.driving.z, h: G.driving.ctrl.heading };
    const p = G.humans.player;
    return { x: p.x, z: p.z, h: p.heading };
  }

  // ------------------------------------------------------------ the tools
  cycle(): void {
    const tools = GEAR.filter((g) => g.tool);
    this.sel = tools[(tools.findIndex((g) => g.id === this.sel) + 1) % tools.length].id;
    this.game.hud.toast(`${bi('Tool', '도구')}: ${bi(BY_ID[this.sel].en, BY_ID[this.sel].ko)} ×${this.count(this.sel)}`, 1200);
  }

  /** Use the chosen tool. Returns true if something happened. */
  useTool(): boolean {
    const G = this.game;
    const id = this.sel;
    if (id === 'c4' && this.charges.length) { this.detonate(); return true; }
    if (this.count(id) <= 0) { G.hud.toast(`${bi(BY_ID[id].en, BY_ID[id].ko)}: ${bi('none left - buy more at the gun shop', '없어요 - 총기 상점에서 사세요')}`, 1800); return false; }
    const p = this.pos();
    if (id === 'smoke') {
      this.add(id, -1);
      const x = p.x + Math.sin(p.h) * 4, z = p.z + Math.cos(p.h) * 4;
      this.clouds.push({ x, z, t: 16 });
      G.audio.thump();
      G.hud.toast(bi('Smoke! The police lose you inside the cloud.', '연막! 구름 안에서는 경찰이 당신을 놓쳐요.'), 1800);
    } else if (id === 'spikes') {
      this.add(id, -1);
      const x = p.x - Math.sin(p.h) * 6, z = p.z - Math.cos(p.h) * 6;
      const mesh = new THREE.Mesh(this.stripGeo, paletteMaterial());
      mesh.position.set(x, 0, z); mesh.rotation.y = p.h + Math.PI / 2;
      this.group.add(mesh);
      this.strips.push({ x, z, t: 90, mesh });
      G.hud.toast(bi('Spike strip laid behind you.', '뒤쪽에 스파이크 스트립을 깔았어요.'), 1600);
    } else if (id === 'c4') {
      this.add(id, -1);
      const x = p.x + Math.sin(p.h) * 1.5, z = p.z + Math.cos(p.h) * 1.5;
      const mesh = new THREE.Mesh(this.chargeGeo, paletteMaterial());
      mesh.position.set(x, 0, z);
      this.group.add(mesh);
      this.charges.push({ x, z, mesh });
      G.hud.toast(bi('C4 planted. Back off and press Z to detonate.', 'C4 설치 완료. 물러나서 Z를 눌러 폭파하세요.'), 2400);
    }
    return true;
  }

  private detonate(): void {
    const G = this.game;
    for (const c of this.charges.splice(0)) {
      c.mesh.removeFromParent();
      G.guns.explode(c.x, c.z, 9, 1.4);
    }
  }

  /** Eat a donut / put on armour. */
  quick(id: 'donut' | 'vest'): boolean {
    const G = this.game;
    if (this.count(id) <= 0) { G.hud.toast(`${bi(BY_ID[id].en, BY_ID[id].ko)}: ${bi('none left', '없어요')}`, 1400); return false; }
    const pl = G.humans.player;
    if (id === 'donut') {
      if (pl.hp >= pl.maxHp) { G.hud.toast(bi('You are not hurt', '다치지 않았어요'), 1200); return false; }
      this.add(id, -1);
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.6);
      G.popups.spawn(pl.x, 3, pl.z, bi('Yum!', '냠!'), '#ff8fb8');
    } else {
      if (G.humans.armor >= 50) { G.hud.toast(bi('Armour is full', '방탄복이 가득이에요'), 1200); return false; }
      this.add(id, -1);
      G.humans.armor = Math.min(50, G.humans.armor + 50);
      G.popups.spawn(pl.x, 3, pl.z, bi('Armour on', '방탄복 착용'), '#8fb0ff');
    }
    G.audio.tink();
    return true;
  }

  // ------------------------------------------------------------ the wheel
  private buildWheel(): void {
    const G = this.game;
    if (!this.wheel) {
      this.wheel = document.createElement('div');
      this.wheel.id = 'wheel';
      document.body.appendChild(this.wheel);
    }
    const items: { label: string; sub: string; pick: () => void }[] = [];
    const slotName = ['Fists', 'Bat', 'Baton'], slotKo = ['맨손', '배트', '경찰봉'];
    for (let s = 0; s < 3; s++) if (G.humans.weaponOwned(s)) items.push({ label: bi(slotName[s], slotKo[s]), sub: '', pick: () => { G.humans.player.weapon = s; } });
    for (const id of GUN_ORDER) {
      if (!G.guns.has(id)) continue;
      const g = GUNS[id];
      items.push({ label: `${g.icon} ${bi(g.en, g.ko)}`, sub: g.infinite ? '∞' : String(G.guns.reserve[id]), pick: () => { G.humans.player.weapon = 3 + GUN_ORDER.indexOf(id); } });
    }
    for (const d of GEAR.filter((x) => x.tool)) items.push({ label: `${d.icon} ${bi(d.en, d.ko)}`, sub: `×${this.count(d.id)}`, pick: () => { this.sel = d.id; G.hud.toast(`${bi('Tool', '도구')}: ${bi(d.en, d.ko)}`, 1000); } });
    this.wheel.innerHTML = '';
    const n = items.length;
    items.forEach((it, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement('button');
      b.className = 'wheel-item';
      b.style.left = `calc(50% + ${Math.cos(a) * 128}px)`;
      b.style.top = `calc(50% + ${Math.sin(a) * 128}px)`;
      b.innerHTML = `<span>${it.label}</span><small>${it.sub}</small>`;
      b.addEventListener('click', (e) => { e.preventDefault(); it.pick(); this.closeWheel(); });
      this.wheel!.appendChild(b);
    });
    const hint = document.createElement('div');
    hint.className = 'wheel-hint';
    hint.textContent = bi('Pick one (G to close)', '하나를 고르세요 (G로 닫기)');
    this.wheel.appendChild(hint);
  }

  openWheel(): void {
    const G = this.game;
    if (G.state !== 'play' || G.inside || this.wheelOpen) return;
    this.buildWheel();
    this.wheel!.classList.add('open');
    this.wheelOpen = true;
    G.timeScale = 0.15;
    try { document.exitPointerLock?.(); } catch { /* optional */ }
  }
  closeWheel(): void {
    this.wheel?.classList.remove('open');
    if (this.wheelOpen) this.game.timeScale = 1;
    this.wheelOpen = false;
  }

  // ------------------------------------------------------------ per frame
  update(dt: number): void {
    const G = this.game;
    const input = G.input;
    if (G.state !== 'play' || G.inside) { if (this.wheelOpen) this.closeWheel(); return; }
    if (input.wasPressed('KeyG')) { if (this.wheelOpen) this.closeWheel(); else this.openWheel(); }
    if (input.wasPressed('KeyZ')) this.useTool();
    if (input.wasPressed('KeyU')) this.quick('donut');
    if (input.wasPressed('KeyI')) this.quick('vest');
    const real = dt / Math.max(0.05, G.timeScale);
    // smoke clouds: puffs, and the police lose track of you inside
    this.smokeT -= real;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= real;
      if (c.t <= 0) { this.clouds.splice(i, 1); continue; }
      if (this.smokeT <= 0) G.vfx.emitSmoke(c.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, c.z + (Math.random() - 0.5) * 6, false, 2);
      if (Math.hypot(c.x - G.focusX, c.z - G.focusZ) < 8 && G.stars > 0) G.coolHeat(14 * dt, 1);
    }
    if (this.smokeT <= 0) this.smokeT = 0.25;
    // spike strips: they shred the tyres of the first police car that crosses one
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i];
      s.t -= real;
      let used = s.t <= 0;
      if (!used) {
        for (const v of G.vehicles) {
          if (v.ai !== 'police' || v.ctrl.wrecked) continue;
          if (Math.hypot(v.x - s.x, v.z - s.z) < 3.2 && v.popTire()) {
            G.vfx.emitSparks(v.x, 0.3, v.z, 14);
            if (G.nearPlayer(v.x, v.z, 80)) G.audio.crash(14);
            G.popups.spawn(v.x, 2.5, v.z, bi('Tyres shredded!', '타이어 펑크!'), '#ffd23a');
            used = true;
            break;
          }
        }
      }
      if (used) { s.mesh.removeFromParent(); this.strips.splice(i, 1); }
    }
    // the on-screen badge
    if (this.badge) {
      const d = BY_ID[this.sel];
      const text = `Z ${d.icon}×${this.count(this.sel)} · U \u{1F369}×${this.count('donut')} · I \u{1F9BA}×${this.count('vest')}`;
      if (this.badge.textContent !== text) this.badge.textContent = text;
    }
  }
}
