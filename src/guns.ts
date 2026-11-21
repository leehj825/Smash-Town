import * as THREE from 'three';
import type { Game } from './game';
import { St } from './combat';
import { Role, type Human } from './humans';
import { bi } from './i18n';
import type { GameVehicle } from './vehicles';

// Guns: hitscan pistol / SMG / shotgun, a rocket launcher and a harmless paintball gun.
// Every gun stuns instead of killing while Kids Play is on (that is handled by the melee hit code they share).

export type GunId = 'pistol' | 'smg' | 'shotgun' | 'rocket' | 'paint';
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

export const GUN_ORDER: GunId[] = ['pistol', 'smg', 'shotgun', 'rocket', 'paint'];
export const GUNS: Record<GunId, GunDef> = {
  pistol:  { id: 'pistol',  en: 'Pistol', ko: '권총', icon: '\u{1F52B}', mag: 12, rate: 0.28, auto: false, dmg: 26, pellets: 1, spread: 0.02, range: 60, reload: 1.1, price: 0, pack: 24, packPrice: 0, heat: 1.2, kick: 0.05, infinite: true },
  smg:     { id: 'smg',     en: 'SMG', ko: '기관단총', icon: '\u{1F4A5}', mag: 30, rate: 0.085, auto: true, dmg: 12, pellets: 1, spread: 0.07, range: 55, reload: 1.5, price: 2500, pack: 60, packPrice: 180, heat: 0.7, kick: 0.04 },
  shotgun: { id: 'shotgun', en: 'Shotgun', ko: '샷건', icon: '\u{1F4A2}', mag: 6, rate: 0.85, auto: false, dmg: 9, pellets: 8, spread: 0.16, range: 22, reload: 2.1, price: 3000, pack: 12, packPrice: 160, heat: 3, kick: 0.22 },
  rocket:  { id: 'rocket',  en: 'Rocket launcher', ko: '로켓 발사기', icon: '\u{1F680}', mag: 1, rate: 1.2, auto: false, dmg: 110, pellets: 1, spread: 0, range: 90, reload: 2.4, price: 8000, pack: 3, packPrice: 450, heat: 8, kick: 0.5 },
  paint:   { id: 'paint',   en: 'Paintball gun', ko: '페인트볼 총', icon: '\u{1F3A8}', mag: 30, rate: 0.12, auto: true, dmg: 0, pellets: 1, spread: 0.05, range: 40, reload: 1.2, price: 150, pack: 0, packPrice: 0, heat: 0, kick: 0.01, infinite: true },
};
export const SLOT_OF = (id: GunId): number => 3 + GUN_ORDER.indexOf(id);

interface Tracer { mesh: THREE.Mesh; life: number }
interface Rocket { mesh: THREE.Mesh; x: number; z: number; dx: number; dz: number; life: number }
interface Hit { t: number; kind: 'human' | 'vehicle' | 'box' | 'circle'; human?: Human; vehicle?: GameVehicle; circle?: { x: number; z: number; r: number; smash?: unknown } }

const WRAP = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Guns {
  readonly group = new THREE.Group();
  owned: GunId[];
  reserve: Record<GunId, number>;
  mag: Record<GunId, number>;
  private cool = 0;
  private reloadT = 0;
  private reloading: GunId | null = null;
  private tracers: Tracer[] = [];
  private rockets: Rocket[] = [];
  private flash: THREE.PointLight;
  private flashT = 0;

  constructor(private game: Game, owned: GunId[], reserve: Partial<Record<GunId, number>>) {
    this.owned = Array.from(new Set<GunId>(['pistol', ...owned])).filter((g) => GUN_ORDER.includes(g));
    this.reserve = { pistol: 0, smg: 0, shotgun: 0, rocket: 0, paint: 0, ...reserve };
    this.mag = { pistol: GUNS.pistol.mag, smg: GUNS.smg.mag, shotgun: GUNS.shotgun.mag, rocket: GUNS.rocket.mag, paint: GUNS.paint.mag };
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
  }

  flags(): boolean[] { return GUN_ORDER.map((g) => this.owned.includes(g)); }
  has(id: GunId): boolean { return this.owned.includes(id); }

  /** The gun currently in the player's hand (weapon slot 3..7), or null. */
  current(): GunDef | null {
    const w = this.game.humans.player.weapon;
    return w >= 3 && w <= 7 ? GUNS[GUN_ORDER[w - 3]] : null;
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
    return !!g && !this.reloading && this.mag[g.id] < g.mag && (g.infinite || this.reserve[g.id] > 0);
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
    if (!g || this.reloading || this.mag[g.id] >= g.mag) return;
    if (!g.infinite && this.reserve[g.id] <= 0) { this.game.audio.click(); return; }
    this.reloading = g.id;
    this.reloadT = g.reload;
    this.game.audio.reload();
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, fireHeld: boolean, firePressed: boolean): void {
    const g = this.current();
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const d = GUNS[this.reloading];
        const need = d.mag - this.mag[d.id];
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
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const step = 46 * dt;
      const hit = this.trace(r.x, r.z, r.dx, r.dz, step + 0.6, this.game.driving);
      r.life -= dt;
      if (hit || r.life <= 0) {
        const d = hit ? hit.t : step;
        this.explode(r.x + r.dx * d, r.z + r.dz * d);
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
  private aim(): { dx: number; dz: number } {
    const G = this.game;
    const pl = G.humans.player;
    const f = new THREE.Vector3();
    G.cameraRig.camera.getWorldDirection(f);
    let dx = f.x, dz = f.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    // soft aim assist toward the closest hostile in front of the camera
    const base = Math.atan2(dx, dz);
    let best: { a: number; d: number } | null = null;
    const consider = (x: number, z: number) => {
      const ox = x - pl.x, oz = z - pl.z;
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
    if (this.mag[g.id] <= 0) { if (g.infinite || this.reserve[g.id] > 0) this.reload(); else G.audio.click(); this.cool = 0.25; return; }
    this.mag[g.id]--;
    this.cool = g.rate;
    const aim = this.aim();
    pl.heading = Math.atan2(aim.dx, aim.dz);
    const ox = pl.x + aim.dx * 0.7, oz = pl.z + aim.dz * 0.7;
    this.curX = ox; this.curZ = oz;
    G.audio.gun(g.id);
    G.cameraRig.shake(g.kick);
    G.input.rumble(0.4, 0.6, 70);
    this.flash.position.set(ox, 1.4, oz);
    this.flashT = 0.06;
    G.vfx.emitSparks(ox, 1.3, oz, 3);
    if (g.heat) G.addHeat(g.heat);

    if (g.id === 'rocket') {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
      mesh.rotation.y = Math.atan2(aim.dx, aim.dz);
      mesh.position.set(ox, 1.3, oz);
      this.group.add(mesh);
      this.rockets.push({ mesh, x: ox, z: oz, dx: aim.dx, dz: aim.dz, life: g.range / 46 });
      return;
    }
    const base = Math.atan2(aim.dx, aim.dz);
    for (let i = 0; i < g.pellets; i++) {
      const a = base + (Math.random() - 0.5) * 2 * g.spread;
      const dx = Math.sin(a), dz = Math.cos(a);
      const hit = this.trace(ox, oz, dx, dz, g.range, G.driving);
      const len = hit ? hit.t : g.range;
      this.tracer(ox, oz, dx, dz, len, g.id === 'paint' ? 0xff4dd2 : 0xffe9a0);
      if (hit) this.impact(hit, dx, dz, g);
    }
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
  private trace(ox: number, oz: number, dx: number, dz: number, range: number, ignore: GameVehicle | null): Hit | null {
    const G = this.game;
    let best: Hit | null = null;
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
      take(circle(h.x, h.z, 0.5), { kind: 'human', human: h });
    }
    for (const v of G.vehicles) {
      if (v === ignore || v.ctrl.wrecked) continue;
      take(circle(v.x, v.z, 1.8), { kind: 'vehicle', vehicle: v });
    }
    for (const c of G.world.circles) {
      if (c.dead) continue;
      if (Math.abs(c.x - ox) > range + 2 || Math.abs(c.z - oz) > range + 2) continue;
      take(circle(c.x, c.z, c.r), { kind: 'circle', circle: c });
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
      if (okk) take(t0, { kind: 'box' });
    }
    return best;
  }

  private impact(hit: Hit, dx: number, dz: number, g: GunDef): void {
    const G = this.game;
    const px = this.lastX(hit, dx), pz = this.lastZ(hit, dz);
    if (hit.kind === 'human' && hit.human) {
      const h = hit.human;
      if (g.dmg > 0) {
        const wasCop = h.role === Role.Cop;
        G.humans.gunHit(G.humans.player, h, g.dmg, dx, dz, g.dmg >= 20 && g.pellets === 1);
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
        v.ctrl.damage(g.dmg * 0.004);
        if (v.isPolice) G.addHeat(2);
        // a lucky hit can burst a tyre: slower and less grip
        if (!v.flat && Math.random() < 0.07 && v !== G.driving) { v.flat = true; v.ctrl.stats = { ...v.ctrl.stats, maxSpeed: v.ctrl.stats.maxSpeed * 0.55, grip: v.ctrl.stats.grip * 0.7 }; G.popups.spawn(v.x, 2, v.z, bi('FLAT TIRE', '타이어 펑크'), '#ffd23a'); }
        G.vfx.emitSparks(px, 1, pz, 5);
      } else G.vfx.emitDebris(px, 1, pz, dx, dz, 0xff4dd2, 5);
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

  private explode(x: number, z: number): void {
    const G = this.game;
    const R = 8;
    G.vfx.explosion(x, z);
    G.audio.explosion();
    G.cameraRig.shake(0.9);
    G.input.rumble(1, 1, 260);
    G.addHeat(6);
    for (const v of G.vehicles) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > R) continue;
      const k = 1 - d / R;
      v.ctrl.damage(0.9 * k + 0.1);
      const nx = (v.x - x) / (d || 1), nz = (v.z - z) / (d || 1);
      v.ctrl.vx += nx * 14 * k; v.ctrl.vz += nz * 14 * k;
      if (v.isPolice) G.addHeat(4);
    }
    for (const h of G.humans.list) {
      if (!h.active || h.role === Role.Player || h.state === St.Dead) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (d > R) continue;
      const k = 1 - d / R;
      G.humans.gunHit(G.humans.player, h, 110 * k + 10, (h.x - x) / (d || 1), (h.z - z) / (d || 1), true);
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
