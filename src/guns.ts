import * as THREE from 'three';
import type { Game } from './game';
import { St } from './combat';
import { Role, type Human } from './humans';
import { CLIPS } from './mocap';
import { bi } from './i18n';
import type { GameVehicle } from './vehicles';

// Guns: hitscan pistol / SMG / shotgun, a rocket launcher and a harmless paintball gun.
// Every gun stuns instead of killing while Kids Play is on (that is handled by the melee hit code they share).

export type GunId = 'pistol' | 'smg' | 'shotgun' | 'rocket' | 'paint' | 'grenade';
export interface GunDef {
  id: GunId;
  en: string; ko: string; icon: string;
  mag: number; rate: number; auto: boolean;
  dmg: number; pellets: number; spread: number; range: number;
  reload: number;
  price: number;
  /** Rounds in one ammo pack and its price. */
  pack: number; packPrice: number;
  /** Heat added per shot. */
  heat: number;
  /** Camera shake per shot. */
  kick: number;
  infinite?: boolean;
}

export const GUN_ORDER: GunId[] = ['pistol', 'smg', 'shotgun', 'rocket', 'paint', 'grenade'];
export const GUNS: Record<GunId, GunDef> = {
  pistol:  { id: 'pistol',  en: 'Pistol', ko: '권총', icon: '\u{1F52B}', mag: 12, rate: 0.28, auto: false, dmg: 26, pellets: 1, spread: 0.02, range: 60, reload: 1.1, price: 0, pack: 24, packPrice: 0, heat: 1.2, kick: 0.05, infinite: true },
  smg:     { id: 'smg',     en: 'SMG', ko: '기관단총', icon: '\u{1F4A5}', mag: 30, rate: 0.085, auto: true, dmg: 12, pellets: 1, spread: 0.07, range: 55, reload: 1.5, price: 2500, pack: 60, packPrice: 180, heat: 0.7, kick: 0.04 },
  shotgun: { id: 'shotgun', en: 'Shotgun', ko: '샷건', icon: '\u{1F4A2}', mag: 6, rate: 0.85, auto: false, dmg: 9, pellets: 8, spread: 0.16, range: 22, reload: 2.1, price: 3000, pack: 12, packPrice: 160, heat: 3, kick: 0.22 },
  rocket:  { id: 'rocket',  en: 'Rocket launcher', ko: '로켓 발사기', icon: '\u{1F680}', mag: 1, rate: 1.2, auto: false, dmg: 110, pellets: 1, spread: 0, range: 90, reload: 2.4, price: 8000, pack: 3, packPrice: 450, heat: 8, kick: 0.5 },
  grenade: { id: 'grenade', en: 'Grenades', ko: '수류탄', icon: '\u{1F4A3}', mag: 1, rate: 1.8, auto: false, dmg: 100, pellets: 1, spread: 0, range: 30, reload: 0.9, price: 1500, pack: 3, packPrice: 120, heat: 6, kick: 0.1 },
  paint:   { id: 'paint',   en: 'Paintball gun', ko: '페인트볼 총', icon: '\u{1F3A8}', mag: 30, rate: 0.12, auto: true, dmg: 0, pellets: 1, spread: 0.05, range: 40, reload: 1.2, price: 150, pack: 0, packPrice: 0, heat: 0, kick: 0.01, infinite: true },
};
/** Upgrade prices per level for [damage, magazine], times a tier for each gun (the grenade has no magazine upgrade, the paintball gun none at all). */
export const GUN_UP_PRICE: [number[], number[]] = [[1500, 3500, 7000], [1000, 2500, 5000]];
export const GUN_UP_TIER: Record<GunId, number> = { pistol: 0.5, smg: 1, shotgun: 1, rocket: 1.5, grenade: 1, paint: 0 };
export const SLOT_OF = (id: GunId): number => 3 + GUN_ORDER.indexOf(id);

interface Tracer { mesh: THREE.Mesh; life: number }
interface Grenade { mesh: THREE.Mesh; x: number; z: number; y: number; vx: number; vz: number; vy: number; life: number }
interface Rocket { mesh: THREE.Mesh; x: number; z: number; dx: number; dz: number; life: number; homing: boolean; d0: number }
interface Hit { t: number; kind: 'human' | 'vehicle' | 'box' | 'circle' | 'target'; target?: { x: number; z: number }; box?: { minX: number; maxX: number; minZ: number; maxZ: number }; human?: Human; vehicle?: GameVehicle; circle?: { x: number; z: number; r: number; smash?: unknown } }

const WRAP = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Guns {
  readonly group = new THREE.Group();
  owned: GunId[];
  reserve: Record<GunId, number>;
  mag: Record<GunId, number>;
  /** Upgrade levels per gun: [damage, magazine], each 0-3 (bought in the Arms tab). */
  up: Record<GunId, [number, number]> = { pistol: [0, 0], smg: [0, 0], shotgun: [0, 0], rocket: [0, 0], paint: [0, 0], grenade: [0, 0] };
  maxMag(g: GunDef): number { return g.id === 'rocket' || g.id === 'grenade' || g.id === 'paint' ? g.mag : Math.round(g.mag * (1 + 0.25 * this.up[g.id][1])); }
  dmgOf(g: GunDef): number { return g.dmg * (1 + 0.1 * this.up[g.id][0]); }
  pow(id: GunId): number { return 1 + 0.1 * this.up[id][0]; }
  private cool = 0;
  private reloadT = 0;
  private reloading: GunId | null = null;
  private tracers: Tracer[] = [];
  private rockets: Rocket[] = [];
  private grenades: Grenade[] = [];
  /** Where the crosshair points right now (null when not aiming): the first thing the camera ray meets. */
  aimPoint: { x: number; y: number; z: number; t: number; hostile: boolean; heli: boolean; auto?: boolean } | null = null;
  /** A thrown grenade leaves the hand part-way into the throw clip. */
  private pendingThrow: { t: number; dx: number; dz: number } | null = null;
  private flash: THREE.PointLight;
  private flashT = 0;
  private flashMesh: THREE.Mesh;
  private marks: { mesh: THREE.Mesh; life: number }[] = [];
  private markNext = 0;

  constructor(private game: Game, owned: GunId[], reserve: Partial<Record<GunId, number>>, upgrades: Partial<Record<GunId, [number, number]>> = {}) {
    for (const k of GUN_ORDER) { const u = upgrades[k]; if (u) this.up[k] = [Math.max(0, Math.min(3, u[0] | 0)), Math.max(0, Math.min(3, u[1] | 0))]; }
    this.owned = Array.from(new Set<GunId>(['pistol', ...owned])).filter((g) => GUN_ORDER.includes(g));
    this.reserve = { pistol: 0, smg: 0, shotgun: 0, rocket: 0, paint: 0, grenade: 0, ...reserve };
    this.mag = { pistol: GUNS.pistol.mag, smg: GUNS.smg.mag, shotgun: GUNS.shotgun.mag, rocket: GUNS.rocket.mag, paint: GUNS.paint.mag, grenade: GUNS.grenade.mag };
    const tm = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, fog: false });
    const tg = new THREE.BoxGeometry(0.035, 0.035, 1);
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(tg, tm);
      mesh.visible = false;
      this.group.add(mesh);
      this.tracers.push({ mesh, life: 0 });
    }
    this.flash = new THREE.PointLight(0xffc860, 0, 9);
    this.group.add(this.flash);
    // a quick additive star at the muzzle, turned to face the camera
    this.flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.flashMesh.visible = false;
    this.group.add(this.flashMesh);
    // dark bullet marks on walls (a pool, the oldest is reused)
    const markMat = new THREE.MeshBasicMaterial({ color: 0x15151a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const markGeo = new THREE.CircleGeometry(0.09, 8);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(markGeo, markMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.marks.push({ mesh, life: 0 });
    }
  }

  /** Where shots start: the player on foot, or the car you are driving (drive-by). */
  private get org(): { x: number; z: number } {
    const G = this.game;
    return G.onFoot || !G.driving ? G.humans.player : { x: G.driving.x, z: G.driving.z };
  }

  flags(): boolean[] { return GUN_ORDER.map((g) => this.owned.includes(g)); }
  has(id: GunId): boolean { return this.owned.includes(id); }

  /** The gun currently in the player's hand (weapon slot 3..7), or null. */
  current(): GunDef | null {
    const w = this.game.humans.player.weapon;
    return w >= 3 && w <= 8 ? GUNS[GUN_ORDER[w - 3]] : null;
  }

  hudText(): string | null {
    const g = this.current();
    if (!g) return null;
    const res = g.infinite ? '∞' : String(this.reserve[g.id]);
    const r = this.reloading === g.id ? ` ${bi('RELOADING', '장전 중')}` : '';
    return `${g.icon} ${this.mag[g.id]} / ${res}${r}`;
  }
  /** Magazine is not full (the touch reload button shows only then). */
  needsReload(): boolean {
    const g = this.current();
    return !!g && !this.reloading && this.mag[g.id] < this.maxMag(g) && (g.infinite || this.reserve[g.id] > 0);
  }

  buyGun(id: GunId): boolean {
    if (this.has(id)) return false;
    this.owned.push(id);
    this.reserve[id] = GUNS[id].pack;
    return true;
  }
  addAmmo(id: GunId, n: number): void { this.reserve[id] = Math.min(GUNS[id].pack * 6, this.reserve[id] + n); }
  /** Busted or knocked out: you keep your guns but lose spare ammo. */
  loseAmmo(): void { for (const g of GUN_ORDER) if (!GUNS[g].infinite) this.reserve[g] = 0; }

  reload(): void {
    const g = this.current();
    if (!g || this.reloading || this.mag[g.id] >= this.maxMag(g)) return;
    if (!g.infinite && this.reserve[g.id] <= 0) { this.game.audio.click(); return; }
    this.reloading = g.id;
    this.reloadT = g.reload;
    this.game.audio.reload();
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, fireHeld: boolean, firePressed: boolean): void {
    const g = this.current();
    this.cool = Math.max(0, this.cool - dt);
    const pl = this.game.humans.player;
    // reloading: the rifle reload clip drives the arms of the long guns (reloadU = progress); a short dip does it for handguns
    const prog = this.reloading ? Math.min(1, Math.max(0, 1 - this.reloadT / GUNS[this.reloading].reload)) : -1;
    const clipReload = this.reloading === 'smg' || this.reloading === 'shotgun' || this.reloading === 'rocket';
    pl.reloadU = clipReload ? prog : -1;
    pl.reloadK = this.reloading && !clipReload && this.reloading !== 'grenade' ? Math.sin(Math.PI * prog) : 0;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const d = GUNS[this.reloading];
        const need = this.maxMag(d) - this.mag[d.id];
        const take = d.infinite ? need : Math.min(need, this.reserve[d.id]);
        this.mag[d.id] += take;
        if (!d.infinite) this.reserve[d.id] -= take;
        this.reloading = null;
      }
    }
    if (g && this.reloading && this.reloading !== g.id) { this.reloading = null; }
    if (g && !this.reloading && this.cool <= 0 && (g.auto ? fireHeld : firePressed)) this.fire(g);
    this.tick(dt);
  }

  /** Visual and projectile upkeep (also runs while the player is driving). */
  tick(dt: number): void {
    for (const t of this.tracers) { if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; } }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT > 0 ? 6 * (this.flashT / 0.06) : 0;
    this.flashMesh.visible = this.flashT > 0;
    if (this.flashT > 0) this.flashMesh.quaternion.copy(this.game.cameraRig.camera.quaternion);
    for (const m of this.marks) if (m.life > 0) { m.life -= dt; if (m.life <= 0) m.mesh.visible = false; }
    if (this.pendingThrow) {
      this.pendingThrow.t -= dt;
      if (this.pendingThrow.t <= 0) { this.release(this.pendingThrow.dx, this.pendingThrow.dz); this.pendingThrow = null; }
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.life -= dt;
      const hx = gr.vx * dt, hz = gr.vz * dt, hl = Math.hypot(hx, hz) || 1e-6;
      const hit = gr.y < 3 ? this.trace(gr.x, gr.z, hx / hl, hz / hl, hl + 0.3, this.game.driving) : null;
      gr.vy -= 18 * dt;
      gr.x += hx; gr.z += hz; gr.y += gr.vy * dt;
      gr.mesh.position.set(gr.x, Math.max(0.12, gr.y), gr.z);
      gr.mesh.rotation.x += dt * 9;
      if (hit || gr.y <= 0.12 || gr.life <= 0) {
        this.explode(gr.x, gr.z, 7, 0.85 * this.pow('grenade'));
        gr.mesh.removeFromParent();
        this.grenades.splice(i, 1);
      }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const step = 46 * dt;
      if (r.homing) {
        const hc = this.game.heli;
        if (!hc.active) { r.homing = false; }
        else {
          const hd = hc.distTo(r.x, r.z);
          if (hd < 5) { this.game.heliDown(); r.mesh.removeFromParent(); this.rockets.splice(i, 1); continue; }
          r.dx = (hc.x - r.x) / hd; r.dz = (hc.z - r.z) / hd;
          r.mesh.rotation.y = Math.atan2(r.dx, r.dz);
          r.x += r.dx * step; r.z += r.dz * step; r.life -= dt;
          r.mesh.position.set(r.x, 1.3 + (hc.y - 1.3) * Math.max(0, Math.min(1, 1 - hd / r.d0)), r.z);
          this.game.vfx.emitSmoke(r.x, r.mesh.position.y, r.z, false, 1);
          if (r.life <= 0) { this.explode(r.x, r.z, 8, this.pow('rocket')); r.mesh.removeFromParent(); this.rockets.splice(i, 1); }
          continue;
        }
      }
      const hit = this.trace(r.x, r.z, r.dx, r.dz, step + 0.6, this.game.driving);
      r.life -= dt;
      if (hit || r.life <= 0) {
        const d = hit ? hit.t : step;
        this.explode(r.x + r.dx * d, r.z + r.dz * d, 8, this.pow('rocket'));
        r.mesh.removeFromParent();
        this.rockets.splice(i, 1);
        continue;
      }
      r.x += r.dx * step; r.z += r.dz * step;
      r.mesh.position.set(r.x, 1.3, r.z);
      this.game.vfx.emitSmoke(r.x, 1.3, r.z, false, 1);
      this.game.vfx.emitSparks(r.x, 1.3, r.z, 1);
    }
  }

  // ------------------------------------------------------------------ shooting
  /** The camera ray through the centre of the screen against people, cars, props, buildings, the ground and the helicopter. */
  updateAim(): void {
    const G = this.game;
    const cam = G.cameraRig.camera;
    const o = cam.position;
    const d = this.camDir;
    cam.getWorldDirection(d);
    let bt = 90, hostile = false, heli = false;
    const near = (t: number, h: boolean, hl = false) => { if (t > 0.5 && t < bt) { bt = t; hostile = h; heli = hl; } };
    // a vertical cylinder at (cx, cz): the ray's distance along itself where it enters, if it is at a height inside [y0, y1]
    const cyl = (cx: number, cz: number, r: number, y0: number, y1: number): number => {
      const px = cx - o.x, pz = cz - o.z;
      const flat = Math.hypot(d.x, d.z) || 1e-6;
      const ux = d.x / flat, uz = d.z / flat;
      const proj = px * ux + pz * uz;
      if (proj < 0) return -1;
      const d2 = px * px + pz * pz - proj * proj;
      if (d2 > r * r) return -1;
      const th = Math.max(0, proj - Math.sqrt(r * r - d2)) / flat; // along the 3D ray
      const y = o.y + d.y * th;
      return y >= y0 && y <= y1 ? th : -1;
    };
    const pl = G.humans.player;
    for (const h of G.humans.list) {
      if (!h.active || h === pl || h.state === St.Dead) continue;
      const t = cyl(h.x, h.z, 0.5, h.y - 0.1, h.y + 1.9);
      if (t > 0) near(t, h.role === Role.Cop && h.state !== St.Down && !h.ko);
    }
    for (const v of G.vehicles) {
      if (v === G.driving || v.ctrl.wrecked) continue;
      const t = cyl(v.x, v.z, 1.8, 0, 1.8);
      if (t > 0) near(t, v.isPolice);
    }
    for (const c of G.world.circles) {
      if (c.dead || Math.abs(c.x - o.x) > 100 || Math.abs(c.z - o.z) > 100) continue;
      const t = cyl(c.x, c.z, c.r, 0, c.smash ? 1.3 : 7);
      if (t > 0) near(t, false);
    }
    for (const b of G.world.boxes) {
      if (b.maxX < o.x - 100 || b.minX > o.x + 100 || b.maxZ < o.z - 100 || b.minZ > o.z + 100) continue;
      let t0 = 0, t1 = 200, ok = true;
      for (const [oo, dd, lo, hi] of [[o.x, d.x, b.minX, b.maxX], [o.z, d.z, b.minZ, b.maxZ]] as const) {
        if (Math.abs(dd) < 1e-6) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
        let a = (lo - oo) / dd, c2 = (hi - oo) / dd;
        if (a > c2) [a, c2] = [c2, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c2);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && o.y + d.y * t0 < (b.h ?? 25)) near(t0, false); // a ray that clears the roof goes on
    }
    if (d.y < -0.001) near((0.1 - o.y) / d.y, false);
    const hc = G.heli;
    if (hc.active) {
      // a 3.4 m ball around the helicopter
      const px = hc.x - o.x, py = hc.y - o.y, pz = hc.z - o.z;
      const proj = px * d.x + py * d.y + pz * d.z;
      if (proj > 0) {
        const d2 = px * px + py * py + pz * pz - proj * proj;
        if (d2 < 3.4 * 3.4) near(Math.max(0.6, proj - Math.sqrt(3.4 * 3.4 - d2)), true, true);
      }
    }
    this.aimPoint = { x: o.x + d.x * bt, y: o.y + d.y * bt, z: o.z + d.z * bt, t: bt, hostile, heli };
  }
  private camDir = new THREE.Vector3();

  /**
   * Auto-aim: the closest hostile (a cop on foot, a police car, the helicopter) within `range` with a clear line of fire, in any
   * direction (behind you too). The result is an aim point like the crosshair's, so shooting treats both the same.
   */
  updateAutoAim(range: number): void {
    const G = this.game;
    const org = this.org;
    const cands: { x: number; y: number; z: number; d: number; heli: boolean }[] = [];
    for (const h of G.humans.list) {
      if (!h.active || h.role !== Role.Cop || h.state === St.Down || h.state === St.Dead || h.ko || h.leaving) continue;
      const d = Math.hypot(h.x - org.x, h.z - org.z);
      if (d < range && d > 1) cands.push({ x: h.x, y: h.y + 1.0, z: h.z, d, heli: false });
    }
    for (const v of G.vehicles) {
      if (!v.isPolice || v.ctrl.wrecked || v === G.driving) continue;
      const d = Math.hypot(v.x - org.x, v.z - org.z);
      if (d < range && d > 2) cands.push({ x: v.x, y: 0.9, z: v.z, d, heli: false });
    }
    const hc = G.heli;
    if (hc.active) {
      const d = hc.distTo(org.x, org.z);
      if (d < range + 10) cands.push({ x: hc.x, y: hc.y, z: hc.z, d, heli: true });
    }
    cands.sort((a, b) => a.d - b.d);
    this.aimPoint = null;
    for (const c of cands.slice(0, 6)) {
      if (!c.heli) {
        const dx = (c.x - org.x) / c.d, dz = (c.z - org.z) / c.d;
        // a wall, prop or car in the way: not a clear shot
        if (this.trace(org.x, org.z, dx, dz, c.d - 0.8, G.driving, 1.4, (c.y - 1.4) / c.d)) continue;
      }
      this.aimPoint = { x: c.x, y: c.y, z: c.z, t: c.d, hostile: true, heli: c.heli, auto: true };
      return;
    }
  }

  private aim(): { dx: number; dz: number } {
    const G = this.game;
    const org = this.org;
    // keyboard and mouse aim exactly where the crosshair points: the shot goes from the gun to the point under the crosshair
    if (this.aimPoint && (this.aimPoint.auto || (!G.input.padActive && !document.body.classList.contains('is-touch')))) {
      const ox = org.x, oz = org.z;
      const dx = this.aimPoint.x - ox, dz = this.aimPoint.z - oz;
      const L = Math.hypot(dx, dz);
      if (L > 2.5) return { dx: dx / L, dz: dz / L };
    }
    const f = new THREE.Vector3();
    G.cameraRig.camera.getWorldDirection(f);
    let dx = f.x, dz = f.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // soft aim assist toward the closest hostile in front of the camera
    const base = Math.atan2(dx, dz);
    let best: { a: number; d: number } | null = null;
    const consider = (x: number, z: number) => {
      const ox = x - org.x, oz = z - org.z;
      const d = Math.hypot(ox, oz);
      if (d < 2 || d > 45) return;
      const a = WRAP(Math.atan2(ox, oz) - base);
      if (Math.abs(a) > 0.5) return;
      const score = Math.abs(a) * 25 + d;
      if (!best || score < best.d) best = { a: base + a, d: score };
    };
    for (const h of G.humans.list) if (h.active && h.role === Role.Cop && h.state !== St.Down && h.state !== St.Dead && !h.ko) consider(h.x, h.z);
    for (const v of G.vehicles) if (v.isPolice && !v.ctrl.wrecked && v !== G.driving) consider(v.x, v.z);
    const ang = best ? (best as { a: number }).a : base;
    return { dx: Math.sin(ang), dz: Math.cos(ang) };
  }

  private fire(g: GunDef): void {
    const G = this.game;
    const pl = G.humans.player;
    const org = this.org;
    if (this.mag[g.id] <= 0) { if (g.infinite || this.reserve[g.id] > 0) this.reload(); else G.audio.click(); this.cool = 0.25; return; }
    this.mag[g.id]--;
    this.cool = g.rate;
    const aim = this.aim();
    pl.heading = Math.atan2(aim.dx, aim.dz);
    pl.aimYaw = pl.heading; pl.aimT = 1.6; pl.recoil = 1;
    if (g.heat) G.addHeat(g.heat);
    if (g.id === 'grenade') {
      // the throw clip plays and the grenade leaves the hand at its release frame
      const c = CLIPS.rifleGrenade;
      pl.throwDur = 1.5; pl.throwT = 1.5;
      this.pendingThrow = { t: (c.hit / c.d) * pl.throwDur, dx: aim.dx, dz: aim.dz };
      G.audio.click();
      return;
    }
    const ox = org.x + aim.dx * 0.7, oz = org.z + aim.dz * 0.7;
    this.curX = ox; this.curZ = oz;
    G.audio.gun(g.id as 'pistol' | 'smg' | 'shotgun' | 'rocket' | 'paint');
    G.cameraRig.shake(g.kick);
    G.input.rumble(0.4, 0.6, 70);
    this.flash.position.set(ox, 1.4, oz);
    this.flashT = 0.06;
    G.gunshot(ox, oz);
    this.flashMesh.position.set(ox, 1.4, oz);
    this.flashMesh.scale.setScalar((g.id === 'shotgun' ? 1.1 : g.id === 'smg' ? 0.55 : 0.75) * (0.8 + Math.random() * 0.4));
    G.vfx.emitSparks(ox, 1.3, oz, 3);
    // a brass case flips out to the right of the gun
    if (g.id === 'pistol' || g.id === 'smg' || g.id === 'shotgun') {
      const rx = aim.dz, rz = -aim.dx;
      G.vfx.emitDebris(ox - aim.dx * 0.4 + rx * 0.25, 1.25, oz - aim.dz * 0.4 + rz * 0.25, rx * 3.5, rz * 3.5, 0xe0b84a, 1);
      if (g.id !== 'smg' || Math.random() < 0.3) window.setTimeout(() => G.audio.tink(), 260);
    }

    if (g.id === 'rocket') {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
      mesh.rotation.y = Math.atan2(aim.dx, aim.dz);
      mesh.position.set(ox, 1.3, oz);
      this.group.add(mesh);
      // a rocket aimed near the police helicopter locks on to it
      const hc = G.heli;
      let homing = false, d0 = 1;
      if (hc.active) {
        const hd = hc.distTo(ox, oz);
        const da = Math.abs(WRAP(Math.atan2(hc.x - ox, hc.z - oz) - Math.atan2(aim.dx, aim.dz)));
        if ((hd < 85 && da < 0.5) || (this.aimPoint?.heli && hd < 130)) { homing = true; d0 = Math.max(10, hd); }
      }
      this.rockets.push({ mesh, x: ox, z: oz, dx: aim.dx, dz: aim.dz, life: g.range / 46 + 0.5, homing, d0 });
      return;
    }
    const base = Math.atan2(aim.dx, aim.dz);
    // the bullet climbs or falls from the gun to the point under the crosshair
    const apt = this.aimPoint;
    const slope = apt && (apt.auto || (!G.input.padActive && !document.body.classList.contains('is-touch'))) ? (apt.y - 1.4) / Math.max(2, Math.hypot(apt.x - ox, apt.z - oz)) : 0;
    for (let i = 0; i < g.pellets; i++) {
      const a = base + (Math.random() - 0.5) * 2 * g.spread;
      const dx = Math.sin(a), dz = Math.cos(a);
      const hit = this.trace(ox, oz, dx, dz, g.range, G.driving, 1.4, slope);
      let len = hit ? hit.t : g.range;
      if (hit && hit.kind === 'box' && hit.box) this.mark(ox + dx * hit.t, 1.4 + slope * hit.t, oz + dz * hit.t, hit.box);
      // the helicopter is above the flat shot: the crosshair ray decides whether a bullet reaches it
      const ap = this.aimPoint;
      if (ap && ap.heli && g.dmg > 0 && (!hit || ap.t * 0.99 < hit.t + 8)) {
        const hcd = G.heli.distTo(ox, oz);
        if (hcd < g.range + 20) {
          len = Math.min(len, Math.max(1, hcd));
          G.heli.hp -= this.dmgOf(g);
          G.hud.hitMarker();
          G.vfx.emitSparks(G.heli.x, G.heli.y, G.heli.z, 3);
          if (G.heli.hp <= 0) G.heliDown();
        }
      }
      this.tracer(ox, oz, dx, dz, len, g.id === 'paint' ? 0xff4dd2 : 0xffe9a0);
      if (hit) this.impact(hit, dx, dz, g);
    }
  }

  /** The grenade leaves the hand: a short arc, then a blast where it lands or hits something. */
  private release(dx: number, dz: number): void {
    const org = this.org;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3f5a2a }));
    mesh.position.set(org.x + dx * 0.6, 1.6, org.z + dz * 0.6);
    this.group.add(mesh);
    this.grenades.push({ mesh, x: org.x + dx * 0.6, z: org.z + dz * 0.6, y: 1.6, vx: dx * 20, vz: dz * 20, vy: 7, life: 3 });
    this.game.audio.whoosh(false);
  }

  /** A dark spot on the wall face the bullet struck. */
  private mark(x: number, y: number, z: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    const d = [Math.abs(x - b.minX), Math.abs(x - b.maxX), Math.abs(z - b.minZ), Math.abs(z - b.maxZ)];
    const f = d.indexOf(Math.min(...d));
    const m = this.marks[this.markNext];
    this.markNext = (this.markNext + 1) % this.marks.length;
    const e = 0.03;
    if (f === 0) { m.mesh.position.set(b.minX - e, y, z); m.mesh.rotation.set(0, -Math.PI / 2, 0); }
    else if (f === 1) { m.mesh.position.set(b.maxX + e, y, z); m.mesh.rotation.set(0, Math.PI / 2, 0); }
    else if (f === 2) { m.mesh.position.set(x, y, b.minZ - e); m.mesh.rotation.set(0, Math.PI, 0); }
    else { m.mesh.position.set(x, y, b.maxZ + e); m.mesh.rotation.set(0, 0, 0); }
    m.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    m.mesh.visible = true;
    m.life = 25;
  }

  private tracer(ox: number, oz: number, dx: number, dz: number, len: number, color: number): void {
    const t = this.tracers.find((q) => q.life <= 0);
    if (!t) return;
    const m = t.mesh;
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.position.set(ox + dx * len * 0.5, 1.3, oz + dz * len * 0.5);
    m.scale.set(1, 1, Math.max(0.3, len));
    m.rotation.set(0, Math.atan2(dx, dz), 0);
    m.visible = true;
    t.life = 0.07;
  }

  /** Nearest thing along a flat ray: humans, vehicles, buildings and props. */
  /** `y0` and `slope` give the shot's height along the ray (a bullet fired from the chest at the crosshair rises or falls), so it can pass over low props and roofs. */
  private trace(ox: number, oz: number, dx: number, dz: number, range: number, ignore: GameVehicle | null, y0 = 1.3, slope = 0): Hit | null {
    const G = this.game;
    let best: Hit | null = null;
    const yAt = (t: number) => y0 + slope * t;
    const take = (t: number, h: Omit<Hit, 't'>) => { if (t >= 0 && t < range && (!best || t < best.t)) best = { t, ...h }; };
    const circle = (cx: number, cz: number, r: number): number => {
      const px = cx - ox, pz = cz - oz;
      const proj = px * dx + pz * dz;
      if (proj < -r) return -1;
      const d2 = px * px + pz * pz - proj * proj;
      if (d2 > r * r) return -1;
      return Math.max(0, proj - Math.sqrt(r * r - d2));
    };
    for (const h of G.humans.list) {
      if (!h.active || h.role === Role.Player || h.state === St.Dead || h.state === St.Down || h.ko) continue;
      const t = circle(h.x, h.z, 0.5);
      if (t >= 0 && yAt(t) >= h.y - 0.2 && yAt(t) <= h.y + 1.9) take(t, { kind: 'human', human: h });
    }
    for (const v of G.vehicles) {
      if (v === ignore || v.ctrl.wrecked) continue;
      const t = circle(v.x, v.z, 1.8);
      if (t >= 0 && yAt(t) <= 1.8) take(t, { kind: 'vehicle', vehicle: v });
    }
    for (const rt of G.range.targets) {
      if (!rt.alive) continue;
      const t = circle(rt.x, rt.z, 0.7);
      if (t >= 0 && yAt(t) <= 2.2) take(t, { kind: 'target', target: rt });
    }
    for (const c of G.world.circles) {
      if (c.dead) continue;
      if (Math.abs(c.x - ox) > range + 2 || Math.abs(c.z - oz) > range + 2) continue;
      const t = circle(c.x, c.z, c.r);
      if (t >= 0 && yAt(t) <= (c.smash ? 1.3 : 7)) take(t, { kind: 'circle', circle: c });
    }
    for (const b of G.world.boxes) {
      if (b.maxX < Math.min(ox, ox + dx * range) - 1 || b.minX > Math.max(ox, ox + dx * range) + 1) continue;
      if (b.maxZ < Math.min(oz, oz + dz * range) - 1 || b.minZ > Math.max(oz, oz + dz * range) + 1) continue;
      let t0 = 0, t1 = range;
      let okk = true;
      for (const [o, d, lo, hi] of [[ox, dx, b.minX, b.maxX], [oz, dz, b.minZ, b.maxZ]] as const) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { okk = false; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) { okk = false; break; }
      }
      if (okk && yAt(t0) <= (b.h ?? 25)) take(t0, { kind: 'box', box: b });
    }
    return best;
  }

  private impact(hit: Hit, dx: number, dz: number, g: GunDef): void {
    const G = this.game;
    const px = this.lastX(hit, dx), pz = this.lastZ(hit, dz);
    if (hit.kind === 'human' && hit.human) {
      const h = hit.human;
      if (g.dmg > 0) {
        G.hud.hitMarker();
        const wasCop = h.role === Role.Cop;
        G.humans.gunHit(G.humans.player, h, this.dmgOf(g), dx, dz, g.dmg >= 20 && g.pellets === 1);
        G.addHeat(wasCop ? 6 : 3);
        G.vfx.emitSparks(h.x, 1.2, h.z, 4);
      } else {
        G.popups.spawn(h.x, 2.2, h.z, 'SPLAT', '#ff4dd2');
        G.vfx.emitDebris(h.x, 1.2, h.z, dx * 2, dz * 2, 0xff4dd2, 6);
        h.fleeing = true;
      }
    } else if (hit.kind === 'vehicle' && hit.vehicle) {
      const v = hit.vehicle;
      if (g.dmg > 0) {
        G.hud.hitMarker();
        v.ctrl.damage(this.dmgOf(g) * 0.004);
        if (v.isPolice) G.addHeat(2);
        // a lucky hit can burst a tyre: slower and less grip
        if (Math.random() < 0.07 && v !== G.driving && v.popTire()) { G.popups.spawn(v.x, 2, v.z, bi('FLAT TIRE', '타이어 펑크'), '#ffd23a'); }
        G.vfx.emitSparks(px, 1, pz, 5);
      } else G.vfx.emitDebris(px, 1, pz, dx, dz, 0xff4dd2, 5);
    } else if (hit.kind === 'target' && hit.target) {
      G.range.hit(hit.target);
      G.hud.hitMarker();
    } else if (hit.kind === 'circle' && hit.circle) {
      const c = hit.circle as { x: number; z: number; r: number; smash?: unknown; dead?: boolean };
      if (c.smash && g.dmg > 0) G.smashProp(c as never, dx * 8, dz * 8, 14, true);
      G.vfx.emitDebris(px, 1, pz, dx, dz, g.id === 'paint' ? 0xff4dd2 : 0xb0b0b0, 3);
    } else {
      G.vfx.emitDust(px, pz, dx, dz, 3);
      G.vfx.emitSparks(px, 1.2, pz, 2);
    }
  }
  private lastX(h: Hit, dx: number): number { return this.curX + dx * h.t; }
  private lastZ(h: Hit, dz: number): number { return this.curZ + dz * h.t; }
  private curX = 0;
  private curZ = 0;

  private explode(x: number, z: number, R = 8, power = 1): void {
    const G = this.game;
    G.vfx.explosion(x, z);
    G.range.blast(x, z, R);
    G.audio.explosion();
    G.cameraRig.shake(0.9);
    G.input.rumble(1, 1, 260);
    G.addHeat(6);
    for (const v of G.vehicles) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > R) continue;
      const k = 1 - d / R;
      v.ctrl.damage((0.9 * k + 0.1) * power);
      const nx = (v.x - x) / (d || 1), nz = (v.z - z) / (d || 1);
      v.ctrl.vx += nx * 14 * k; v.ctrl.vz += nz * 14 * k;
      if (v.isPolice) G.addHeat(4);
    }
    for (const h of G.humans.list) {
      if (!h.active || h.role === Role.Player || h.state === St.Dead) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (d > R) continue;
      const k = 1 - d / R;
      G.humans.ignoreShield = true;
      G.humans.gunHit(G.humans.player, h, (110 * k + 10) * power, (h.x - x) / (d || 1), (h.z - z) / (d || 1), true);
      G.humans.ignoreShield = false;
    }
    for (const c of G.world.circles) {
      if (!c.smash || c.dead) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < R) G.smashProp(c, ((c.x - x) / (d || 1)) * 10, ((c.z - z) / (d || 1)) * 10, 18, true);
    }
  }

  /** Called by `fire` before tracing so impact points are computed from the right origin. */
  setOrigin(x: number, z: number): void { this.curX = x; this.curZ = z; }
}
