import type { World } from './world';
import type { Followable } from './cameraRig';
import { t, tf, type I18nKey } from './i18n';
import { PLAYER_ROSTER, STATS, type VehicleKind } from './vehicle';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface Blip { x: number; z: number; color: string; flash?: boolean; size?: number }

export interface GarageModel {
  cash: number;
  repairCost: number;
  unlocked: Set<VehicleKind>;
  selected: VehicleKind;
}
export interface GarageHandlers {
  onRepair: () => void;
  onBuy: (k: VehicleKind) => void;
  onSelect: (k: VehicleKind) => void;
  onClose: () => void;
}

/** DOM/canvas HUD: wanted stars, cash, combo, minimap, speedometer, nitro/HP, gigs, toasts, garage. */
export class Hud {
  private stars = Array.from(document.querySelectorAll<HTMLElement>('#stars .star'));
  private cash = $('cash');
  private comboFill = $('combo-fill');
  private comboMult = $('combo-mult');
  private nitroFill = $('nitro-fill');
  private hpFill = $('hp-fill');
  private speedNum = $('speed-num');
  private mini = $<HTMLCanvasElement>('minimap');
  private miniCtx = this.mini.getContext('2d')!;
  private speedo = $<HTMLCanvasElement>('speedo');
  private speedoCtx = this.speedo.getContext('2d')!;
  private toastEl = $('toast');
  private gigEl = $('gig');
  private gigTitle = $('gig-title');
  private gigObj = $('gig-obj');
  private gigTime = $('gig-time');
  private promptEl = $('prompt');
  private overlayEl = $('overlay-msg');
  private garageEl = $('garage');
  private lastCash = -1;
  private lastStars = -1;
  private toastTimer = 0;
  private garageModel: GarageModel | null = null;
  private garageHandlers: GarageHandlers | null = null;
  private flash = 0;
  private telemetry = $('telemetry');
  private pHealth = $('phealth-fill');
  private wantedBanner = $('wanted-banner');
  private slots = Array.from(document.querySelectorAll<HTMLElement>('#weapon-slots .slot'));
  private lastFoot: boolean | null = null;

  constructor(private world: World) {
    this.setWanted(0);
    this.setCombo(0, 1);
  }

  setWanted(n: number): void {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.stars.forEach((s, i) => s.classList.toggle('on', i < n));
  }

  setCash(v: number): void {
    if (v === this.lastCash) return;
    this.lastCash = v;
    this.cash.textContent = '$' + Math.round(v).toLocaleString('en-US');
  }

  setCombo(frac: number, mult: number): void {
    this.comboFill.style.width = `${Math.round(frac * 100)}%`;
    this.comboMult.textContent = mult > 1 ? `x${mult}` : '';
    this.comboMult.classList.toggle('hot', mult >= 5);
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showGig(show: boolean, title = '', obj = '', time = ''): void {
    this.gigEl.hidden = !show;
    if (!show) return;
    this.gigTitle.textContent = title;
    this.gigObj.textContent = obj;
    this.gigTime.textContent = time;
  }

  setPrompt(text: string | null): void {
    this.promptEl.hidden = text === null;
    if (text !== null) this.promptEl.textContent = text;
  }

  /** Big center message (BUSTED / WRECKED). */
  setOverlay(key: I18nKey | null, sub = ''): void {
    this.overlayEl.hidden = key === null;
    if (key) this.overlayEl.innerHTML = `<b>${t(key)}</b><small>${sub}</small>`;
  }

  setTelemetryVisible(_v: boolean): void { /* superseded by setFootMode */ }

  /** Bottom-right context: speedometer/nitro when driving, weapon slots + combat hints on foot. */
  setFootMode(foot: boolean, weapon: number, batonUnlocked: boolean): void {
    if (foot !== this.lastFoot) {
      this.lastFoot = foot;
      this.telemetry.classList.toggle('foot', foot);
      document.body.classList.toggle('foot-mode', foot);
    }
    this.slots.forEach((el, i) => {
      el.classList.toggle('sel', i === weapon);
      el.classList.toggle('locked', i === 2 && !batonUnlocked);
    });
  }

  setPlayerHp(frac: number): void {
    this.pHealth.style.width = `${Math.round(frac * 100)}%`;
    this.pHealth.classList.toggle('low', frac < 0.3);
  }

  setWantedBanner(on: boolean): void {
    this.wantedBanner.hidden = !on;
  }

  update(f: Followable, hp: number, nitro: number, nitroActive: boolean, blips: Blip[], dt: number): void {
    this.flash += dt;
    const kmh = Math.round(Math.abs(f.forwardSpeed) * 3.6);
    this.speedNum.textContent = String(kmh);
    this.nitroFill.style.width = `${Math.round(nitro * 100)}%`;
    this.nitroFill.classList.toggle('active', nitroActive);
    this.hpFill.style.width = `${Math.round(hp * 100)}%`;
    this.hpFill.classList.toggle('low', hp < 0.3);
    this.drawSpeedo(kmh);
    this.drawMinimap(f, blips);
  }

  private drawSpeedo(kmh: number): void {
    const g = this.speedoCtx;
    const S = this.speedo.width;
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(14,18,28,0.72)';
    g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, c - 6, 0, Math.PI * 2); g.stroke();
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const max = 220;
    g.lineWidth = 2;
    for (let v = 0; v <= max; v += 20) {
      const a = a0 + (v / max) * sweep;
      const r0 = c - 12, r1 = c - (v % 40 === 0 ? 24 : 18);
      g.strokeStyle = v >= 160 ? '#ff4d5e' : '#e8ecf5';
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
    const a = a0 + Math.min(1, kmh / max) * sweep;
    g.strokeStyle = '#ff3b3b'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(c - Math.cos(a) * 8, c - Math.sin(a) * 8);
    g.lineTo(c + Math.cos(a) * (c - 22), c + Math.sin(a) * (c - 22));
    g.stroke();
    g.fillStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, 6, 0, Math.PI * 2); g.fill();
  }

  private drawMinimap(f: Followable, blips: Blip[]): void {
    const g = this.miniCtx;
    const S = this.mini.width;
    const c = S / 2;
    const metersVisible = 150;
    const MM = 4;
    const scale = S / metersVisible;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(f.heading), Math.sin(f.heading));
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2d3b4a'; g.fillRect(0, 0, S, S);
    g.translate(c, c);
    g.rotate(rot);
    g.scale(scale / MM, scale / MM);
    g.drawImage(this.world.minimapCanvas, -(f.position.x + 40) * MM, -(f.position.z + 40) * MM);
    g.restore();

    // blips (rotated into the radar frame, clamped to the rim)
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rim = c - 9;
    const on = Math.floor(this.flash * 6) % 2 === 0;
    for (const b of blips) {
      let dx = (b.x - f.position.x) * scale;
      let dz = (b.z - f.position.z) * scale;
      let rx = dx * cs - dz * sn;
      let ry = dx * sn + dz * cs;
      const d = Math.hypot(rx, ry);
      if (d > rim) { rx = (rx / d) * rim; ry = (ry / d) * rim; }
      dx = rx; dz = ry;
      g.fillStyle = b.flash ? (on ? '#ff2a3a' : '#2a7bff') : b.color;
      g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(c + dx, c + dz, b.size ?? 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    g.lineWidth = 3; g.strokeStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffd500'; g.strokeStyle = '#1a1a24'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c + 6.5, c + 8); g.lineTo(c, c + 4); g.lineTo(c - 6.5, c + 8); g.closePath();
    g.fill(); g.stroke();
  }

  // ---------------------------------------------------------------- garage (Pay & Spray)
  get garageOpen(): boolean { return !this.garageEl.hidden; }

  openGarage(model: GarageModel, handlers: GarageHandlers): void {
    this.garageModel = model;
    this.garageHandlers = handlers;
    this.garageEl.hidden = false;
    this.renderGarage();
  }

  closeGarage(): void {
    this.garageEl.hidden = true;
    this.garageModel = null;
  }

  refreshGarage(model: GarageModel): void {
    this.garageModel = model;
    if (!this.garageEl.hidden) this.renderGarage();
  }

  private renderGarage(): void {
    const m = this.garageModel!;
    const h = this.garageHandlers!;
    const cards = PLAYER_ROSTER.map((k) => {
      const st = STATS[k];
      const owned = m.unlocked.has(k);
      const sel = m.selected === k;
      const label = sel ? t('ui.garage.selected') : owned ? t('ui.garage.select') : `${t('ui.garage.unlock')} $${st.price.toLocaleString('en-US')}`;
      const stat = (v: number, max: number) => `<i style="width:${Math.round((v / max) * 100)}%"></i>`;
      return `<div class="vcard ${sel ? 'sel' : ''}">
        <div class="vname">${t(st.name as I18nKey)}</div>
        <div class="vbars"><span class="vb">${stat(st.maxSpeed, 46)}</span><span class="vb">${stat(st.accel, 38)}</span><span class="vb">${stat(st.grip, 11)}</span></div>
        <button class="seg vbtn" data-k="${k}" ${sel ? 'disabled' : ''}>${label}</button>
      </div>`;
    }).join('');
    this.garageEl.innerHTML = `<div class="panel garage-panel">
      <h2>${t('ui.garage.title')}</h2>
      <div class="gcash">${t('ui.garage.cash')}: <b>$${Math.round(m.cash).toLocaleString('en-US')}</b></div>
      <button class="big small" id="g-repair">${t('ui.garage.repair')} - $${m.repairCost.toLocaleString('en-US')}</button>
      <h3>${t('ui.garage.vehicles')}</h3>
      <div class="vgrid">${cards}</div>
      <button class="big small ghost" id="g-close">${t('ui.garage.close')}</button>
    </div>`;
    this.garageEl.querySelector('#g-repair')!.addEventListener('click', () => h.onRepair());
    this.garageEl.querySelector('#g-close')!.addEventListener('click', () => h.onClose());
    this.garageEl.querySelectorAll<HTMLElement>('.vbtn').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.k as VehicleKind;
        if (m.unlocked.has(k)) h.onSelect(k);
        else h.onBuy(k);
      }),
    );
  }

  tf = tf;
}
