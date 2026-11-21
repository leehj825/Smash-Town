import { BODY_DESC, BODY_KEYS, BODY_NAMES, BODY_PRICES, MAX_LEVEL, NEONS, NEON_PRICE, PAINTS, PAINT_PRICE, UP_DESC, UP_KEYS, UP_NAMES, UP_PRICES, type BodyProgress, type CarProgress } from './upgrades';
import type { World } from './world';
import type { Followable } from './cameraRig';
import { bi, t, tf, type I18nKey } from './i18n';
import { PLAYER_ROSTER, STATS, type VehicleKind } from './vehicle';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface Blip { x: number; z: number; color: string; flash?: boolean; size?: number }

export interface GarageModel {
  cash: number;
  repairCost: number;
  respray: { cost: number; state: 'none' | 'ok' | 'police' };
  unlocked: Set<VehicleKind>;
  selected: VehicleKind;
  car: CarProgress;
  body: BodyProgress;
}
export interface GarageHandlers {
  onRepair: () => void;
  onRespray: () => void;
  onBuy: (k: VehicleKind) => void;
  onSelect: (k: VehicleKind) => void;
  onUpgrade: (i: number) => void;
  onPaint: (color: number) => void;
  onNeon: (color: number) => void;
  onBody: (i: number) => void;
  onClose: () => void;
}
type GarageTab = 'cars' | 'tune' | 'look' | 'body';

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
  private garageTab: GarageTab = 'cars';
  private flash = 0;
  private telemetry = $('telemetry');
  private pHealth = $('phealth-fill');
  private pArmor = $('parmor-fill');
  private wantedBanner = $('wanted-banner');
  private slots = Array.from(document.querySelectorAll<HTMLElement>('#weapon-slots .slot'));
  private lastFoot: boolean | null = null;
  private dialogEl = $('dialog');
  private dlgWho = $('dlg-who');
  private dlgText = $('dlg-text');
  private dlgHint = $('dlg-hint');
  private storyPill = $('story-pill');
  private storyTitle = $('story-title');
  private storyText = $('story-text');
  private storyNav = $('story-nav');
  private navArrow = $('nav-arrow');
  private navDist = $('nav-dist');
  private route: { x: number; z: number }[] | null = null;
  private starCount = $('stars-count');
  private storyProgress = $('story-progress');
  private lastStory = '';
  private lastProgress = '';

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

  /** The story objective pill (top centre). */
  setStory(info: { title: string; text: string } | null): void {
    const key = info ? info.title + '|' + info.text : '';
    if (key === this.lastStory) return;
    this.lastStory = key;
    this.storyPill.hidden = !info;
    if (info) { this.storyTitle.textContent = info.title; this.storyText.textContent = info.text; }
  }

  /** Guide arrow in the story pill: `angle` is clockwise from straight ahead (radians); null hides it. */
  setNav(angle: number | null, text: string): void {
    this.storyNav.hidden = angle === null && !text;
    if (angle === null) this.navArrow.style.visibility = 'hidden';
    else { this.navArrow.style.visibility = 'visible'; this.navArrow.style.transform = `rotate(${angle.toFixed(3)}rad)`; }
    if (this.navDist.textContent !== text) this.navDist.textContent = text;
  }

  /** The road route to the objective, drawn on the minimap. */
  setRoute(pts: { x: number; z: number }[] | null): void { this.route = pts; }

  pulseStory(): void {
    this.storyPill.classList.remove('pulse');
    void this.storyPill.offsetWidth;
    this.storyPill.classList.add('pulse');
  }

  setStoryProgress(text: string): void {
    if (text === this.lastProgress) return;
    this.lastProgress = text;
    this.storyProgress.textContent = text;
  }

  setCollectibles(n: number, total: number): void {
    this.starCount.textContent = `\u2605 ${n}/${total}`;
  }

  showDialog(who: string, text: string, hint: string): void {
    this.dialogEl.hidden = false;
    document.body.classList.add('dialog-open');
    this.dlgWho.textContent = who;
    this.dlgText.textContent = text;
    this.dlgHint.textContent = hint;
  }

  hideDialog(): void {
    this.dialogEl.hidden = true;
    document.body.classList.remove('dialog-open');
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

  setPlayerArmor(frac: number): void { this.pArmor.style.width = `${Math.round(frac * 100)}%`; }

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
    const { scale: MM, pad: PAD } = this.world.minimap;
    const scale = S / metersVisible;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(f.heading), Math.sin(f.heading));
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2d3b4a'; g.fillRect(0, 0, S, S);
    g.translate(c, c);
    g.rotate(rot);
    g.scale(scale / MM, scale / MM);
    g.drawImage(this.world.minimap.canvas, -(f.position.x + PAD) * MM, -(f.position.z + PAD) * MM);
    if (this.route && this.route.length > 1) {
      // route to the story goal, in the same rotated frame as the map image
      g.lineJoin = 'round'; g.lineCap = 'round';
      const trace = () => {
        g.beginPath();
        this.route!.forEach((p, k) => { const px = (p.x - f.position.x) * MM, pz = (p.z - f.position.z) * MM; if (k === 0) g.moveTo(px, pz); else g.lineTo(px, pz); });
        g.stroke();
      };
      g.strokeStyle = 'rgba(20,20,30,.85)'; g.lineWidth = 6.5 * MM / scale; trace();
      g.strokeStyle = '#ffd23a'; g.lineWidth = 3.5 * MM / scale; trace();
    }
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
    const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
    const stars = (lv: number) => '●'.repeat(lv) + '○'.repeat(MAX_LEVEL - lv);
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const tabs: [GarageTab, string][] = [['cars', bi('Cars', '차량')], ['tune', bi('Tune-up', '튜닝')], ['look', bi('Paint & neon', '도색·네온')], ['body', bi('Training', '훈련')]];
    let body = '';
    if (this.garageTab === 'cars') {
      body = '<div class="vgrid">' + PLAYER_ROSTER.map((k) => {
        const st = STATS[k];
        const owned = m.unlocked.has(k);
        const sel = m.selected === k;
        const label = sel ? t('ui.garage.selected') : owned ? t('ui.garage.select') : `${t('ui.garage.unlock')} ${money(st.price)}`;
        const stat = (v: number, max: number) => `<i style="width:${Math.min(100, Math.round((v / max) * 100))}%"></i>`;
        return `<div class="vcard ${sel ? 'sel' : ''}">
          <div class="vname">${t(st.name as I18nKey)}</div>
          <div class="vbars"><span class="vb">${stat(st.maxSpeed, 46)}</span><span class="vb">${stat(st.accel, 38)}</span><span class="vb">${stat(st.grip, 11)}</span></div>
          <button class="seg vbtn" data-k="${k}" ${sel ? 'disabled' : ''}>${label}</button>
        </div>`;
      }).join('') + '</div>';
    } else if (this.garageTab === 'tune') {
      body = `<div class="gsub">${t(STATS[m.selected].name as I18nKey)}</div><div class="ulist">` + UP_KEYS.map((k, i) => {
        const lv = m.car.up[i];
        const price = lv < MAX_LEVEL ? UP_PRICES[k][lv] : 0;
        return `<div class="urow"><div><b>${bi(UP_NAMES[k][0], UP_NAMES[k][1])}</b> <span class="lv">${stars(lv)}</span><small>${bi(UP_DESC[k][0], UP_DESC[k][1])}</small></div>
          <button class="seg up" data-i="${i}" ${lv >= MAX_LEVEL ? 'disabled' : ''}>${lv >= MAX_LEVEL ? bi('MAX', '최대') : money(price)}</button></div>`;
      }).join('') + '</div>';
    } else if (this.garageTab === 'look') {
      const sw = (c: number, cls: string, cur: boolean) => `<button class="swatch ${cls} ${cur ? 'sel' : ''}" data-c="${c}" style="background:${c ? hex(c) : '#555'}" aria-label="${c ? hex(c) : 'default'}">${c ? '' : '✕'}</button>`;
      body = `<div class="gsub">${t(STATS[m.selected].name as I18nKey)}</div>
        <h3>${bi('Paint', '도색')} - ${money(PAINT_PRICE)}</h3>
        <div class="swatches">${sw(0, 'paint', m.car.paint === 0)}${PAINTS.map((c) => sw(c, 'paint', m.car.paint === c)).join('')}</div>
        <h3>${bi('Neon underglow', '네온 언더글로우')} - ${money(NEON_PRICE)}</h3>
        <div class="swatches">${sw(0, 'neon', m.car.neon === 0)}${NEONS.map((c) => sw(c, 'neon', m.car.neon === c)).join('')}</div>`;
    } else {
      body = '<div class="ulist">' + BODY_KEYS.map((k, i) => {
        const lv = m.body[k];
        return `<div class="urow"><div><b>${bi(BODY_NAMES[k][0], BODY_NAMES[k][1])}</b> <span class="lv">${stars(lv)}</span><small>${bi(BODY_DESC[k][0], BODY_DESC[k][1])}</small></div>
          <button class="seg bup" data-i="${i}" ${lv >= MAX_LEVEL ? 'disabled' : ''}>${lv >= MAX_LEVEL ? bi('MAX', '최대') : money(BODY_PRICES[k][lv])}</button></div>`;
      }).join('') + '</div>';
    }
    const rs = m.respray;
    const resprayLabel = rs.state === 'none' ? bi('Quick Respray (no heat)', '빠른 도색 (수배 없음)')
      : rs.state === 'police' ? bi('Quick Respray - police too close', '빠른 도색 - 경찰이 너무 가까움')
      : `${bi('Quick Respray: clear heat', '빠른 도색: 수배 해제')} - ${money(rs.cost)}`;
    this.garageEl.innerHTML = `<div class="panel garage-panel">
      <h2>${t('ui.garage.title')}</h2>
      <div class="gcash">${t('ui.garage.cash')}: <b>${money(m.cash)}</b></div>
      <div class="gactions">
        <button class="big small" id="g-repair">${t('ui.garage.repair')} - ${money(m.repairCost)}</button>
        <button class="big small warnbtn" id="g-respray" ${rs.state === 'none' ? 'disabled' : ''}>${resprayLabel}</button>
      </div>
      <div class="gtabs">${tabs.map(([id, label]) => `<button class="seg gtab ${this.garageTab === id ? 'sel' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="gbody">${body}</div>
      <button class="big small ghost" id="g-close">${t('ui.garage.close')}</button>
    </div>`;
    const q = (sel: string) => this.garageEl.querySelectorAll<HTMLElement>(sel);
    this.garageEl.querySelector('#g-repair')!.addEventListener('click', () => h.onRepair());
    this.garageEl.querySelector('#g-respray')!.addEventListener('click', () => h.onRespray());
    this.garageEl.querySelector('#g-close')!.addEventListener('click', () => h.onClose());
    q('.gtab').forEach((b) => b.addEventListener('click', () => { this.garageTab = b.dataset.tab as GarageTab; this.renderGarage(); }));
    q('.vbtn').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k as VehicleKind;
      if (m.unlocked.has(k)) h.onSelect(k); else h.onBuy(k);
    }));
    q('button.up').forEach((b) => b.addEventListener('click', () => h.onUpgrade(Number(b.dataset.i))));
    q('button.bup').forEach((b) => b.addEventListener('click', () => h.onBody(Number(b.dataset.i))));
    q('.swatch.paint').forEach((b) => b.addEventListener('click', () => h.onPaint(Number(b.dataset.c))));
    q('.swatch.neon').forEach((b) => b.addEventListener('click', () => h.onNeon(Number(b.dataset.c))));
  }

  /** Session earnings lines on the pause screen. */
  setEarnings(rows: [string, number][]): void {
    const el = document.getElementById('earnings');
    if (!el) return;
    const total = rows.reduce((a, r) => a + r[1], 0);
    el.innerHTML = `<h3>${bi('EARNED THIS SESSION', '이번 플레이 수입')}: <b>$${total.toLocaleString('en-US')}</b></h3>` +
      rows.map(([l, n]) => `<div class="erow"><span>${l}</span><b>$${n.toLocaleString('en-US')}</b></div>`).join('');
  }

  tf = tf;
}
