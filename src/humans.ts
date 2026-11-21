import type { Roof } from './world';
import * as THREE from 'three';
import { CharacterRenderer, J, type Look } from './characters';
import { AnimPlayer, CLIPS, sampleClip } from './mocap';
import {
  ATTACKS, DODGE, GRAVITY, JUMP_VY, PUNCH_COMBO, SPRINT_SPEED, SWING_COMBO, St, WALK_SPEED, type Attack,
} from './combat';
import { makeRng } from './geo';
import type { Input } from './input';
import type { GameVehicle } from './vehicles';
import type { CircleCollider, Lot, World } from './world';

export const Role = { Civ: 0, Cop: 1, Player: 2 } as const;
const N = 56;
const COP_FIRST = 1, COP_LAST = 10;
const GROUND = 0.1;
const SHIRTS = [0xe85a4f, 0x3b82f6, 0x2fb87a, 0xf2a73b, 0x8a5cd6, 0xf4a7b9, 0x66d1c9, 0xeceff4];
const PANTS = [0x2c3e50, 0x4a4e59, 0x6b4f3a, 0x1f2d3d, 0x7f8c8d, 0x3b5a8c];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIRS = [0x2a1a10, 0x5a3a1a, 0xc9a24a, 0x1a1a1a, 0x8a3a1a];

const AXIS_X = new THREE.Vector3(1, 0, 0);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const TWO_PI = Math.PI * 2;

export class Human {
  active = false;
  role: number = Role.Civ;
  x = 0; y = GROUND; z = 0; vy = 0; heading = 0;
  vx = 0; vz = 0; // external velocity (knockback, dodge, lunge)
  mvx = 0; mvz = 0; // locomotion velocity
  grounded = true;
  state: number = St.Idle;
  stateT = 0; stateDur = 0.3;
  hp = 100; maxHp = 100;
  weapon = 0;
  comboStep = 0;
  attack: Attack | null = null;
  atkT = 0; atkPhase = 0; atkU = 0; atkScale = 1;
  buffered = 0; // 0 none, 1 attack, 2 kick
  hitIds = new Int32Array(16); hitCount = 0;
  invuln = 0; dodgeCd = 0; flash = 0; flashed = false;
  phase = 0; speed = 0; fleeing = false;
  scale = 1;
  look: Look = { shirt: 0xffffff, pants: 0x222222, skin: 0xf1c27d, shoe: 0x222222, hair: 0x222222, cap: false };
  anim = new AnimPlayer();
  /** Normalized phase of the current looping clip. */
  clipU = 0;
  downT = 0; airT = 0; prevState = -1;
  rendered = false;
  prevWeapon = 0; equipT = 0;
  /** Knocked out (Kids Play): can't be hit again, gets up and walks away. */
  ko = false;
  /** The roof this human stands on (null at street level) and the highest point of the current fall. */
  roof: Roof | null = null;
  peak = 0;
  /** Riot officer: carries a shield that blocks most hits from the front. */
  riot = false;
  /** Gun handling (player): seconds the weapon stays raised after a shot, where it points, how raised it is now, and shot / reload kicks. */
  aimT = 0; aimYaw = 0; aimBlend = 0; recoil = 0; reloadK = 0;
  /** Reload progress 0..1 while the rifle reload clip is driving the arms (-1 = not reloading) and the grenade throw timer. */
  reloadU = -1; throwT = 0; throwDur = 1;
  /** Which knock-out clip a bullet hit picked (empty = the ordinary fall). */
  fallClip = '';
  /** Seconds left of free-running (a driver who just got out of a hijacked car), instead of following a sidewalk loop. */
  freeT = 0;
  lastStepSign = 1;
  // civilian path
  lot!: Lot; s = 0; dir = 1; pathSpeed = 1.6;
  // cop ai
  cd = 0; slotAngle = 0; leaving = false; leaveT = 0;
  constructor(readonly slot: number) {}
}

export interface HumanHooks {
  onHit: (att: Human, tgt: Human, atk: Attack, x: number, y: number, z: number, killed: boolean) => void;
  onSmash: (c: CircleCollider, vx: number, vz: number) => void;
  onVehicleHit: (att: Human, v: GameVehicle, ix: number, iz: number, atk: Attack) => void;
  onPlayerHurt: (dmg: number) => void;
  onCopDown: (h: Human) => void;
  onSwing: (att: Human, atk: Attack) => void;
  onPickup: () => void;
  onStep: () => void;
  onWhiff: (att: Human) => void;
}

export interface HumanCtx {
  input: Input;
  camYaw: number;
  vehicles: GameVehicle[];
  wantCops: number;
  /** How many of the foot cops should be riot officers. */
  wantRiot: number;
  playerActive: boolean;
  playerCarX: number; playerCarZ: number; playerCarSpeed: number;
  policeCars: { x: number; z: number }[];
  time: number;
}

interface Pickup { active: boolean; x: number; z: number; t: number; mesh: THREE.Mesh }

/** All humans: the player, foot cops and civilians, as pooled slots drawn through instanced rig parts. */
export class Humans {
  readonly group = new THREE.Group();
  readonly renderer = new CharacterRenderer(N);
  readonly list: Human[] = [];
  readonly player: Human;
  unlockedBaton = false;
  /** Which guns the player owns (pistol, SMG, shotgun, rocket, paintball). */
  guns: boolean[] = [true, false, false, false, false, false];
  /** Kids Play: nobody dies. Defeated cops and the player are only knocked out. */
  kids = true;
  copsDefeated = 0;
  combatTimer = 0;

  private rng = makeRng(4242);
  private walkLots: Lot[];
  private copSpawnT = 0;
  readonly pickups: Pickup[] = [];
  private ctx!: HumanCtx;
  private time = 0;

  constructor(private world: World, private hooks: HumanHooks) {
    this.walkLots = world.lots.filter((l) => l.district !== 'harbor' && l.district !== 'water');
    this.group.add(this.renderer.group);
    for (let i = 0; i < N; i++) {
      const h = new Human(i);
      h.lot = this.walkLots[0];
      this.list.push(h);
    }
    this.player = this.list[0];
    this.player.role = Role.Player;
    this.player.look = { shirt: 0xd93636, pants: 0x2a4a8a, skin: 0xe0ac69, shoe: 0xffffff, hair: 0x2a1a10, cap: false };
    this.player.weapon = 0;
    this.player.atkScale = 0.75; // punches, kicks and swings play ~30 % slower than the raw GDD frame data
    this.renderer.setLook(0, this.player.look); // bright red hoodie, jeans, white sneakers
    for (let i = COP_LAST + 1; i < N; i++) this.initCivilian(this.list[i]);
    const baton = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6).rotateZ(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(baton, new THREE.MeshLambertMaterial({ color: 0x16161c, emissive: 0x3344ff, emissiveIntensity: 0.6, flatShading: true }));
      mesh.visible = false;
      this.group.add(mesh);
      this.pickups.push({ active: false, x: 0, z: 0, t: 0, mesh });
    }
  }

  // ------------------------------------------------------------------ setup helpers
  private pick<T>(a: readonly T[]): T { return a[Math.floor(this.rng() * a.length)]; }

  private perim(lot: Lot) {
    const inset = 2.3;
    const x0 = lot.x0 + inset, z0 = lot.z0 + inset;
    const w = lot.x1 - lot.x0 - inset * 2, d = lot.z1 - lot.z0 - inset * 2;
    return { w, d, x0, z0, P: 2 * (w + d) };
  }
  private pointOn(p: { w: number; d: number; x0: number; z0: number; P: number }, s: number): [number, number] {
    s = ((s % p.P) + p.P) % p.P;
    if (s < p.w) return [p.x0 + s, p.z0];
    s -= p.w;
    if (s < p.d) return [p.x0 + p.w, p.z0 + s];
    s -= p.d;
    if (s < p.w) return [p.x0 + p.w - s, p.z0 + p.d];
    s -= p.w;
    return [p.x0, p.z0 + p.d - s];
  }

  private initCivilian(h: Human): void {
    h.role = Role.Civ;
    h.look = { shirt: this.pick(SHIRTS), pants: this.pick(PANTS), skin: this.pick(SKINS), shoe: 0x2a2a30, hair: this.pick(HAIRS), cap: false };
    h.scale = 0.92 + this.rng() * 0.16;
    this.renderer.setLook(h.slot, h.look);
    this.assign(h, -9999, -9999);
  }

  private assign(h: Human, avoidX: number, avoidZ: number): void {
    for (let tries = 0; tries < 12; tries++) {
      const lot = this.walkLots[Math.floor(this.rng() * this.walkLots.length)];
      const p = this.perim(lot);
      const s = this.rng() * p.P;
      const [x, z] = this.pointOn(p, s);
      if (Math.hypot(x - avoidX, z - avoidZ) < 45 && tries < 11) continue;
      h.lot = lot; h.s = s; h.dir = this.rng() < 0.5 ? 1 : -1;
      break;
    }
    const [x, z] = this.pointOn(this.perim(h.lot), h.s);
    h.x = x; h.z = z; h.y = GROUND; h.vy = 0; h.vx = h.vz = 0; h.grounded = true;
    h.pathSpeed = 1.3 + this.rng() * 0.8;
    h.phase = this.rng() * 6.28;
    h.state = St.Walk; h.hp = h.maxHp = 30; h.active = true; h.fleeing = false;
  }

  private hide(h: Human): void {
    this.renderer.hide(h.slot);
    h.rendered = false;
  }

  // ------------------------------------------------------------------ player control
  setPlayerActive(active: boolean, x: number, z: number, heading: number): void {
    const p = this.player;
    p.active = active;
    if (!active) { this.hide(p); return; }
    p.roof = null; p.peak = GROUND;
    p.x = x; p.z = z; p.heading = heading; p.y = GROUND; p.vy = 0; p.vx = p.vz = p.mvx = p.mvz = 0;
    p.state = St.Idle; p.attack = null; p.grounded = true; p.invuln = 0.4;
    if (p.hp <= 0) p.hp = p.maxHp * 0.5;
  }

  /** Garage training: melee damage and run speed multipliers for the player (health sets maxHp). */
  bodyPower = 1;
  /** Armor absorbs damage before health (0..50). */
  armor = 0;
  bodySpeed = 1;
  setBody(health: number, power: number, speed: number): void {
    this.player.maxHp = 100 + 20 * health;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    this.bodyPower = 1 + 0.15 * power;
    this.bodySpeed = 1 + 0.05 * speed;
  }

  healPlayer(): void { this.player.hp = this.player.maxHp; }

  ownedFlags(): boolean[] { return [0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => this.weaponOwned(s)); }

  weaponOwned(slot: number): boolean {
    if (slot === 2) return this.unlockedBaton;
    if (slot >= 3) return !!this.guns[slot - 3];
    return true;
  }

  /** A bullet or blast hit: reuses the melee hit pipeline (knock-back, Kids Play knock-outs, popups) with a synthetic attack. */
  /** Explosions set this so blasts ignore riot shields. */
  ignoreShield = false;
  gunHit(att: Human, t: Human, dmg: number, nx: number, nz: number, heavy: boolean): boolean {
    if (!t.active || t.state === St.Dead) return false;
    const a: Attack = { ...ATTACKS.cross, dmg, push: heavy ? 7 : 3, up: heavy ? 2 : 0, heavy, popup: heavy ? 'wham' : 'pow', gun: true };
    const bp = this.bodyPower;
    this.bodyPower = 1;
    const r = this.applyHit(att, t, a, nx, nz);
    this.bodyPower = bp;
    return r;
  }

  equip(slot: number): void {
    if (!this.weaponOwned(slot)) return;
    this.player.weapon = slot;
  }

  private combatContext(): boolean {
    return this.combatTimer > 0 || this.player.state === St.Attack || this.player.state === St.Hit;
  }

  private updatePlayer(h: Human, dt: number): void {
    const inp = this.ctx.input;
    h.invuln = Math.max(0, h.invuln - dt);
    h.dodgeCd = Math.max(0, h.dodgeCd - dt);
    h.flash = Math.max(0, h.flash - dt);
    h.aimT = Math.max(0, h.aimT - dt);
    h.throwT = Math.max(0, h.throwT - dt);
    h.recoil = Math.max(0, h.recoil - dt * 7);
    this.combatTimer = Math.max(0, this.combatTimer - dt);

    // weapon switching: 1 fists, 2 bat, 3 baton; wheel / V cycle
    if (inp.wasPressed('Digit1')) this.equip(0);
    if (inp.wasPressed('Digit2')) this.equip(1);
    if (inp.wasPressed('Digit3')) this.equip(2);
    for (let k = 4; k <= 9; k++) if (inp.wasPressed('Digit' + k)) this.equip(k - 1);
    const cycle = (d: number) => {
      const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((s) => this.weaponOwned(s));
      this.player.weapon = slots[(slots.indexOf(this.player.weapon) + d + slots.length) % slots.length];
    };
    if (inp.wasPressed('WheelUp')) cycle(1);
    if (inp.wasPressed('WheelDown') || inp.wasPressed('KeyV')) cycle(-1 + (inp.wasPressed('KeyV') ? 2 : 0));

    // with a gun in hand the attack button fires (handled by the gun system) instead of starting a melee combo
    const wantAttack = h.weapon < 3 && (inp.wasPressed('Attack') || inp.wasPressed('KeyJ'));
    const wantKick = inp.wasPressed('Kick') || inp.wasPressed('KeyK') || inp.wasPressed('KeyQ');
    const space = inp.wasPressed('Space');
    const wantJump = inp.wasPressed('KeyC') || (space && !this.combatContext());
    const wantDodge = inp.wasPressed('ControlLeft') || inp.wasPressed('AltLeft') || (space && this.combatContext());

    // camera-relative movement vector
    const yaw = this.ctx.camYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rxv = -Math.cos(yaw), rzv = Math.sin(yaw);
    let mx = fx * inp.throttle + rxv * inp.steer;
    let mz = fz * inp.throttle + rzv * inp.steer;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }

    const free = h.state === St.Idle || h.state === St.Walk || h.state === St.Run;
    if (free) {
      if (wantDodge && h.dodgeCd <= 0 && h.grounded) this.startDodge(h, mag > 0.1 ? mx / Math.max(mag, 1e-4) : Math.sin(h.heading), mag > 0.1 ? mz / Math.max(mag, 1e-4) : Math.cos(h.heading), DODGE.dur);
      else if (wantAttack) this.beginCombo(h, true);
      else if (wantKick) this.beginAttack(h, ATTACKS.kick);
      else if (wantJump && h.grounded) { h.vy = JUMP_VY; h.grounded = false; }
    } else if (h.state === St.Attack) {
      const a = h.attack!;
      const total = a.wind + a.act + a.rec;
      if (h.atkT >= total - 0.12) {
        if (wantAttack) h.buffered = 1;
        else if (wantKick) h.buffered = 2;
      }
    }

    // locomotion
    if (free || !h.grounded) {
      const sprint = inp.nitro && h.grounded;
      const max = (sprint ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, mag) * (h.role === Role.Player ? this.bodySpeed : 1);
      const dvx = (mag > 0.05 ? (mx / Math.max(mag, 1e-4)) * max : 0) - h.mvx;
      const dvz = (mag > 0.05 ? (mz / Math.max(mag, 1e-4)) * max : 0) - h.mvz;
      const dl = Math.hypot(dvx, dvz);
      const step = 35 * dt;
      if (dl <= step) { h.mvx += dvx; h.mvz += dvz; } else { h.mvx += (dvx / dl) * step; h.mvz += (dvz / dl) * step; }
      // In a fight (a cop within 12 m) the character stays facing the enemy and strafes / backpedals with the
      // stick; otherwise it turns toward the direction of travel (camera-relative run).
      const foe = this.nearestCop(h, 12);
      if (h.weapon >= 3 && h.aimT > 0) {
        // a raised gun points where it is aimed, so the body strafes and backpedals instead of turning to run
        const d = wrap(h.aimYaw - h.heading);
        h.heading += Math.max(-16 * dt, Math.min(16 * dt, d));
      } else if (foe && (this.combatTimer > 0 || Math.hypot(foe.x - h.x, foe.z - h.z) < 9)) {
        const d = wrap(Math.atan2(foe.x - h.x, foe.z - h.z) - h.heading);
        h.heading += Math.max(-11 * dt, Math.min(11 * dt, d));
      } else if (mag > 0.1) {
        const want = Math.atan2(mx, mz);
        const d = wrap(want - h.heading);
        h.heading += Math.max(-14 * dt, Math.min(14 * dt, d));
      }
    } else {
      h.mvx *= Math.exp(-10 * dt); h.mvz *= Math.exp(-10 * dt);
    }
    h.speed = Math.hypot(h.mvx, h.mvz);
    const stillFree = h.state === St.Idle || h.state === St.Walk || h.state === St.Run;
    if (free && stillFree) h.state = h.speed > 6.2 ? St.Run : h.speed > 0.4 ? St.Walk : St.Idle;
  }

  private nearestCop(h: Human, range: number): Human | null {
    let best: Human | null = null, bd = range;
    for (let i = COP_FIRST; i <= COP_LAST; i++) {
      const c = this.list[i];
      if (!c.active || c.leaving || c.state === St.Down || c.state === St.Dead) continue;
      const d = Math.hypot(c.x - h.x, c.z - h.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Start (or continue) the unarmed / weapon combo. */
  private beginCombo(h: Human, fresh: boolean): void {
    if (fresh) h.comboStep = 0;
    const seq = h.weapon > 0 ? SWING_COMBO : PUNCH_COMBO;
    this.assist(h);
    this.beginAttack(h, ATTACKS[seq[h.comboStep % seq.length]]);
  }

  /** Aim assist: snap toward the nearest hostile in front. */
  private assist(h: Human): void {
    let best: Human | null = null, bd = 3.4;
    for (const t of this.list) {
      if (!t.active || t === h || t.state === St.Dead || t.state === St.Down) continue;
      if (h.role === Role.Cop && t.role !== Role.Player) continue;
      const d = Math.hypot(t.x - h.x, t.z - h.z);
      if (d > bd) continue;
      const ang = Math.abs(wrap(Math.atan2(t.x - h.x, t.z - h.z) - h.heading));
      if (ang > 1.5) continue;
      bd = d; best = t;
    }
    if (best) h.heading = Math.atan2(best.x - h.x, best.z - h.z);
  }

  private beginAttack(h: Human, atk: Attack): void {
    h.state = St.Attack;
    h.attack = atk;
    h.atkT = 0; h.atkPhase = 0; h.atkU = 0; h.buffered = 0; h.hitCount = 0;
    h.mvx *= 0.3; h.mvz *= 0.3;
    if (h.role === Role.Player) this.combatTimer = 2.5;
  }

  private startDodge(h: Human, dx: number, dz: number, dur: number): void {
    h.state = St.Dodge;
    h.stateDur = h.stateT = dur;
    h.invuln = DODGE.iframes;
    h.dodgeCd = DODGE.cooldown + dur;
    h.heading = Math.atan2(dx, dz);
    h.vx = dx * DODGE.speed; h.vz = dz * DODGE.speed;
    h.mvx = h.mvz = 0;
  }

  // ------------------------------------------------------------------ attack resolution
  private updateAttack(h: Human, dt: number): void {
    const a = h.attack!;
    const prev = h.atkPhase;
    h.atkT += dt * h.atkScale;
    const total = a.wind + a.act + a.rec;
    if (h.atkT < a.wind) { h.atkPhase = 0; h.atkU = h.atkT / a.wind; }
    else if (h.atkT < a.wind + a.act) { h.atkPhase = 1; h.atkU = (h.atkT - a.wind) / a.act; }
    else { h.atkPhase = 2; h.atkU = Math.min(1, (h.atkT - a.wind - a.act) / a.rec); }

    if (h.atkPhase === 1) {
      if (prev !== 1) { h.hitCount = 0; this.hooks.onSwing(h, a); }
      const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
      h.vx = fx * a.lunge; h.vz = fz * a.lunge;
      this.strike(h, a);
    }
    if (h.atkT >= total) {
      h.attack = null;
      if (h.role === Role.Player && h.buffered) {
        const kick = h.buffered === 2;
        h.buffered = 0;
        if (kick) { this.beginAttack(h, ATTACKS.kick); return; }
        const seqLen = (h.weapon > 0 ? SWING_COMBO : PUNCH_COMBO).length;
        h.comboStep = (h.comboStep + 1) % seqLen;
        this.beginCombo(h, false);
        return;
      }
      h.state = St.Idle;
      h.comboStep = 0;
      h.cd = h.role === Role.Cop ? 1.1 + this.rng() * 1.1 : h.cd;
    }
  }

  private already(h: Human, id: number): boolean {
    for (let i = 0; i < h.hitCount; i++) if (h.hitIds[i] === id) return true;
    return false;
  }
  private record(h: Human, id: number): void {
    if (h.hitCount < h.hitIds.length) h.hitIds[h.hitCount++] = id;
  }

  private strike(h: Human, a: Attack): void {
    const fx = Math.sin(h.heading), fz = Math.cos(h.heading);
    const cosArc = Math.cos((a.arc * Math.PI) / 360);
    let landed = false;
    for (const t of this.list) {
      if (!t.active || t === h || t.state === St.Dead || t.ko) continue;
      if (h.role === Role.Cop && t.role !== Role.Player) continue;
      if (h.role === Role.Civ) continue;
      const dx = t.x - h.x, dz = t.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > a.reach + 0.4) continue;
      if (d > 0.05 && (dx * fx + dz * fz) / d < cosArc) continue;
      if (this.already(h, 1000 + t.slot)) continue;
      this.record(h, 1000 + t.slot);
      if (this.applyHit(h, t, a, d > 0.05 ? dx / d : fx, d > 0.05 ? dz / d : fz)) landed = true;
    }
    if (h.role === Role.Player) {
      if (a.smash) {
        for (const c of this.world.circles) {
          if (!c.smash || c.dead) continue;
          const dx = c.x - h.x, dz = c.z - h.z;
          const d = Math.hypot(dx, dz);
          if (d > a.reach + c.r + 0.3) continue;
          if (d > 0.1 && (dx * fx + dz * fz) / d < cosArc) continue;
          this.hooks.onSmash(c, fx * 9, fz * 9);
          landed = true;
        }
      }
      for (const v of this.ctx.vehicles) {
        if (v.ai === 'player') continue;
        const dx = v.x - h.x, dz = v.z - h.z;
        const d = Math.hypot(dx, dz);
        if (d > a.reach + v.ctrl.collisionRadius + 0.6) continue;
        if (d > 0.1 && (dx * fx + dz * fz) / d < cosArc * 0.6) continue;
        if (this.already(h, 2000 + v.id)) continue;
        this.record(h, 2000 + v.id);
        this.hooks.onVehicleHit(h, v, dx / Math.max(d, 0.1), dz / Math.max(d, 0.1), a);
        landed = true;
      }
    }
    void landed;
  }

  private applyHit(att: Human, t: Human, a: Attack, nx: number, nz: number): boolean {
    if (t.invuln > 0) { if (t.role === Role.Player) this.hooks.onWhiff(att); return false; }
    // a riot shield soaks most hits that come from the front
    const blocked = t.riot && !this.ignoreShield && Math.sin(t.heading) * -nx + Math.cos(t.heading) * -nz > 0.25;
    const dmg = (att.role === Role.Cop ? 8 : a.dmg * (att.role === Role.Player ? this.bodyPower : 1)) * (blocked ? 0.2 : 1);
    let take = dmg;
    if (t.role === Role.Player && this.armor > 0) { const a2 = Math.min(this.armor, take); this.armor -= a2; take -= a2; }
    t.hp -= take;
    t.flash = 0.14;
    let killed = t.hp <= 0;
    if (t.role === Role.Civ && killed) { t.hp = 1; killed = false; }
    // Kids Play: a defeated cop is knocked out (hp stays above 0 so they get up and leave); nobody ever enters the Dead state
    if (this.kids && killed && t.role === Role.Cop) t.hp = 1, t.ko = true;
    const heavy = (a.heavy && !blocked) || killed;
    t.attack = null; t.buffered = 0;
    // a bullet knocks you out the way it hit: facing the shooter, back turned, or from the side
    const faced = Math.sin(t.heading) * -nx + Math.cos(t.heading) * -nz;
    t.fallClip = '';
    t.heading = Math.atan2(-nx, -nz);
    if (a.gun && heavy) {
      if (faced < -0.35) { t.fallClip = 'proDieBack'; t.heading = Math.atan2(nx, nz); }
      else if (faced < 0.35) { t.fallClip = 'proDieRight'; t.heading = Math.atan2(-nx, -nz) + Math.PI / 2; }
      else t.fallClip = 'proDieFront';
    }
    if (heavy) {
      t.state = killed && t.role !== Role.Civ && !this.kids ? St.Dead : St.Down;
      t.stateDur = t.stateT = killed ? 2.4 : 1.4;
      t.vx = nx * a.push; t.vz = nz * a.push;
      t.vy = Math.max(a.up, 2.6);
      t.grounded = false;
    } else {
      t.state = St.Hit;
      t.stateDur = t.stateT = 0.28;
      t.vx = nx * a.push * 0.8; t.vz = nz * a.push * 0.8;
    }
    if (t.role === Role.Player) { t.invuln = 0.45; this.hooks.onPlayerHurt(dmg); }
    if (t.role === Role.Civ) t.fleeing = true;
    const hx = (att.x + t.x) / 2, hz = (att.z + t.z) / 2;
    this.hooks.onHit(att, t, a, hx, t.y + 1.2, hz, killed);
    if (killed && t.role === Role.Cop) { this.copsDefeated++; this.hooks.onCopDown(t); this.dropBaton(t.x, t.z); }
    return true;
  }

  /** A vehicle ran over this human. Returns the human hit or null. */
  hitByVehicle(cx: number, cz: number, r: number, vx: number, vz: number): Human | null {
    for (const t of this.list) {
      if (!t.active || t.role === Role.Player || t.state === St.Down || t.state === St.Dead) continue;
      if (Math.abs(t.x - cx) > r + 0.7 || Math.abs(t.z - cz) > r + 0.7) continue;
      if (Math.hypot(t.x - cx, t.z - cz) > r + 0.45) continue;
      t.attack = null;
      const killed = t.role === Role.Cop && (t.hp -= 40) <= 0;
      if (this.kids && killed) { t.hp = 1; t.ko = true; }
      t.state = killed && !this.kids ? St.Dead : St.Down;
      t.stateDur = t.stateT = killed ? 2.4 : 2.0;
      // Kids Play: cars only bump people over gently
      const k = this.kids ? 0.5 : 1.05;
      t.vx = vx * k + (this.rng() - 0.5) * 3;
      t.vz = vz * k + (this.rng() - 0.5) * 3;
      t.vy = this.kids ? 3 : 5 + this.rng() * 3;
      t.grounded = false;
      t.flash = 0.14;
      t.fleeing = true;
      if (killed) { this.copsDefeated++; this.hooks.onCopDown(t); this.dropBaton(t.x, t.z); }
      return t;
    }
    return null;
  }

  private dropBaton(x: number, z: number): void {
    if (this.unlockedBaton) return;
    const p = this.pickups.find((q) => !q.active);
    if (!p) return;
    p.active = true; p.x = x; p.z = z; p.t = 0; p.mesh.visible = true;
  }

  // ------------------------------------------------------------------ cops
  private spawnCop(count: number): void {
    const ctx = this.ctx;
    let slot: Human | null = null;
    for (let i = COP_FIRST; i <= COP_LAST; i++) if (!this.list[i].active) { slot = this.list[i]; break; }
    if (!slot) return;
    const px = this.player.x, pz = this.player.z;
    let x = px, z = pz;
    let ok = false;
    let nearest = 70;
    for (const c of ctx.policeCars) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < nearest) { nearest = d; x = c.x + 2.6; z = c.z; ok = true; }
    }
    for (let i = 0; i < 14 && !ok; i++) {
      const lot = this.walkLots[Math.floor(this.rng() * this.walkLots.length)];
      const p = this.perim(lot);
      const [qx, qz] = this.pointOn(p, this.rng() * p.P);
      const d = Math.hypot(qx - px, qz - pz);
      if (d > 20 && d < 42) { x = qx; z = qz; ok = true; }
    }
    if (!ok) { const a = this.rng() * TWO_PI; x = px + Math.sin(a) * 26; z = pz + Math.cos(a) * 26; }
    const h = slot;
    h.active = true; h.role = Role.Cop; h.ko = false;
    h.x = x; h.z = z; h.y = GROUND; h.vy = 0; h.vx = h.vz = h.mvx = h.mvz = 0; h.grounded = true;
    h.riot = count < this.ctx.wantRiot;
    h.state = St.Idle; h.hp = h.maxHp = h.riot ? 110 : 60; h.weapon = 2; h.leaving = false; h.cd = 0.6 + this.rng();
    h.atkScale = 0.55; h.scale = h.riot ? 1.12 : 1.03; h.attack = null; h.invuln = 0;
    h.heading = Math.atan2(px - x, pz - z);
    h.slotAngle = (count * TWO_PI) / Math.max(3, this.ctx.wantCops) + this.rng() * 0.4;
    h.look = { shirt: h.riot ? 0x23262f : 0x1e3a8a, pants: 0x1a1a24, skin: this.pick(SKINS), shoe: 0x111111, hair: 0x222222, cap: true };
    this.renderer.setLook(h.slot, h.look);
  }

  /**
   * The driver of a hijacked car climbs out on the driver's (left) side. Civilians run away; police officers get out too
   * (and fight you if you stay on foot). Uses a free pooled slot, so no allocation.
   */
  ejectDriver(carX: number, carZ: number, carHeading: number, isCop: boolean): void {
    const x = carX + Math.cos(carHeading) * 1.9;
    const z = carZ - Math.sin(carHeading) * 1.9;
    let h: Human | null = null;
    if (isCop) {
      for (let i = COP_FIRST; i <= COP_LAST; i++) if (!this.list[i].active) { h = this.list[i]; break; }
      if (!h) return;
      h.active = true; h.role = Role.Cop; h.ko = false; h.freeT = 0; h.riot = false;
      h.hp = h.maxHp = 60; h.weapon = 2; h.atkScale = 0.55; h.scale = 1.03; h.cd = 1.2 + this.rng();
      h.slotAngle = this.rng() * TWO_PI;
      h.look = { shirt: 0x1e3a8a, pants: 0x1a1a24, skin: this.pick(SKINS), shoe: 0x111111, hair: 0x222222, cap: true };
    } else {
      // the civilian farthest from the car takes the driver's place
      let far = -1;
      for (let i = COP_LAST + 1; i < N; i++) {
        const c = this.list[i];
        if (c.state === St.Down || c.state === St.Hit || c.freeT > 0) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d > far) { far = d; h = c; }
      }
      if (!h) return;
      h.freeT = 5; h.fleeing = true; h.ko = false;
      h.look = { shirt: this.pick(SHIRTS), pants: this.pick(PANTS), skin: this.pick(SKINS), shoe: 0x2a2a30, hair: this.pick(HAIRS), cap: false };
    }
    h.x = x; h.z = z; h.y = GROUND; h.vy = 0; h.vx = h.vz = h.mvx = h.mvz = 0; h.grounded = true;
    h.heading = Math.atan2(Math.cos(carHeading), -Math.sin(carHeading)); // facing away from the car's side
    h.attack = null; h.invuln = 0; h.leaving = false; h.speed = 0;
    h.state = St.GetUp; h.stateDur = h.stateT = 0.7; // tumbles out of the car, then stands up
    this.renderer.setLook(h.slot, h.look);
  }

  private manageCops(dt: number): void {
    const want = this.ctx.playerActive ? this.ctx.wantCops : 0;
    let alive = 0;
    for (let i = COP_FIRST; i <= COP_LAST; i++) {
      const c = this.list[i];
      if (c.active && !c.leaving && c.state !== St.Dead) alive++;
    }
    this.copSpawnT -= dt;
    if (alive < want && this.copSpawnT <= 0) { this.spawnCop(alive); this.copSpawnT = 1.0; }
    else if (alive > want) {
      let far: Human | null = null, fd = -1;
      for (let i = COP_FIRST; i <= COP_LAST; i++) {
        const c = this.list[i];
        if (!c.active || c.leaving || c.state === St.Dead) continue;
        const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
        if (d > fd) { fd = d; far = c; }
      }
      if (far) { far.leaving = true; far.leaveT = 5; }
    }
  }

  private updateCop(h: Human, dt: number): void {
    h.cd -= dt;
    h.flash = Math.max(0, h.flash - dt);
    const p = this.player;
    const free = h.state === St.Idle || h.state === St.Walk || h.state === St.Run;
    if (!free) return;
    const dx = p.x - h.x, dz = p.z - h.z;
    const dist = Math.hypot(dx, dz);
    if (h.leaving || !this.ctx.playerActive || p.state === St.Dead) {
      h.leaveT -= dt;
      const a = Math.atan2(-dx, -dz);
      h.heading += wrap(a - h.heading) * Math.min(1, dt * 6);
      h.mvx = Math.sin(h.heading) * 3.2; h.mvz = Math.cos(h.heading) * 3.2;
      h.speed = 3.2; h.state = St.Walk;
      if (h.leaveT <= 0 || dist > 70) { h.active = false; this.hide(h); }
      return;
    }
    h.heading += wrap(Math.atan2(dx, dz) - h.heading) * Math.min(1, dt * 9);
    const gx = p.x + Math.sin(h.slotAngle) * 1.6, gz = p.z + Math.cos(h.slotAngle) * 1.6;
    if (dist > 2.2) {
      const tx = gx - h.x, tz = gz - h.z;
      const tl = Math.max(0.001, Math.hypot(tx, tz));
      const sp = dist > 4 ? 5.4 : 3.4;
      h.mvx = (tx / tl) * sp; h.mvz = (tz / tl) * sp;
      h.speed = sp; h.state = sp > 6.2 ? St.Run : St.Walk;
      if (sp > 5) h.state = St.Run;
    } else {
      h.mvx *= Math.exp(-8 * dt); h.mvz *= Math.exp(-8 * dt);
      h.speed = Math.hypot(h.mvx, h.mvz); h.state = h.speed > 0.4 ? St.Walk : St.Idle;
      if (h.cd <= 0 && dist < 2.4 && p.invuln <= 0) {
        h.heading = Math.atan2(dx, dz);
        this.beginAttack(h, ATTACKS.swing1);
      }
    }
  }

  // ------------------------------------------------------------------ shared update
  private resolveStatics(h: Human, r: number): void {
    for (const box of this.world.boxes) {
      if (h.roof && box === h.roof.box && h.y >= h.roof.h - 0.35) continue; // on the roof you walk over your own building
      if (h.x < box.minX - r || h.x > box.maxX + r || h.z < box.minZ - r || h.z > box.maxZ + r) continue;
      const nx = Math.max(box.minX, Math.min(h.x, box.maxX));
      const nz = Math.max(box.minZ, Math.min(h.z, box.maxZ));
      const dx = h.x - nx, dz = h.z - nz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) {
        const ps = [h.x - box.minX, box.maxX - h.x, h.z - box.minZ, box.maxZ - h.z];
        const mi = ps.indexOf(Math.min(...ps));
        if (mi === 0) h.x = box.minX - r; else if (mi === 1) h.x = box.maxX + r; else if (mi === 2) h.z = box.minZ - r; else h.z = box.maxZ + r;
      } else { h.x += (dx / d) * (r - d); h.z += (dz / d) * (r - d); }
    }
    for (const c of this.world.circles) {
      if (c.dead) continue;
      const dx = h.x - c.x, dz = h.z - c.z;
      const rr = r + c.r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4) { h.x += (dx / d) * (rr - d); h.z += (dz / d) * (rr - d); }
    }
  }

  private resolveVehicles(h: Human): void {
    for (const v of this.ctx.vehicles) {
      const dxv = h.x - v.x, dzv = h.z - v.z;
      if (Math.abs(dxv) > 6 || Math.abs(dzv) > 6) continue;
      const fxv = Math.sin(v.ctrl.heading), fzv = Math.cos(v.ctrl.heading);
      const rr = v.ctrl.collisionRadius + 0.4;
      for (const off of v.ctrl.collisionOffsets) {
        const dx = h.x - (v.x + fxv * off), dz = h.z - (v.z + fzv * off);
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-4) { h.x += (dx / d) * (rr - d); h.z += (dz / d) * (rr - d); }
      }
    }
  }

  /** Height of the floor under a human: a roof when standing over one, otherwise the street. */
  private groundY(h: Human): number {
    const r = h.roof;
    if (r && h.x > r.minX && h.x < r.maxX && h.z > r.minZ && h.z < r.maxZ && h.y >= r.h - 0.35) return r.h;
    return GROUND;
  }

  private integrate(h: Human, dt: number, collide: boolean): void {
    h.x += (h.mvx + h.vx) * dt;
    h.z += (h.mvz + h.vz) * dt;
    const gy = this.groundY(h);
    if (h.y > gy + 0.05) h.grounded = false;
    if (!h.grounded || h.y > gy + 0.001) {
      h.peak = Math.max(h.peak, h.y);
      h.vy -= GRAVITY * dt;
      h.y += h.vy * dt;
      if (h.y <= gy) {
        h.y = gy; h.vy = 0; h.grounded = true;
        if (gy === GROUND) h.roof = null;
        const fall = h.peak - gy;
        h.peak = gy;
        if (h.role === Role.Player && fall > 5) {
          const dmg = (fall - 5) * 6;
          if (!this.kids) h.hp = Math.max(10, h.hp - dmg);
          this.hooks.onPlayerHurt(dmg);
        }
      }
    } else h.peak = h.y;
    if (h.state !== St.Dodge && !(h.state === St.Attack && h.atkPhase === 1)) h.vx *= Math.exp(-(h.grounded ? 7 : 1.2) * dt), h.vz *= Math.exp(-(h.grounded ? 7 : 1.2) * dt);
    if (collide) {
      this.resolveStatics(h, 0.4);
      if (h.role === Role.Player) this.resolveVehicles(h);
    }
  }

  private updateTimedStates(h: Human, dt: number): void {
    switch (h.state) {
      case St.Attack: this.updateAttack(h, dt); break;
      case St.Dodge:
        h.stateT -= dt;
        h.vx = Math.sin(h.heading) * DODGE.speed; h.vz = Math.cos(h.heading) * DODGE.speed;
        if (h.stateT <= 0) { h.state = St.Idle; h.vx *= 0.3; h.vz *= 0.3; }
        break;
      case St.Hit:
        h.stateT -= dt;
        if (h.stateT <= 0) h.state = St.Idle;
        break;
      case St.Down:
        if (h.grounded) h.stateT -= dt;
        if (h.stateT <= 0 && h.hp > 0) { h.state = St.GetUp; h.stateDur = h.stateT = 0.5; }
        break;
      case St.GetUp:
        h.stateT -= dt;
        if (h.stateT <= 0) {
          h.state = St.Idle;
          if (h.ko) { h.leaving = true; h.leaveT = 4; } // a knocked-out cop dusts themselves off and walks away
          if (h.role === Role.Civ) {
            h.hp = h.maxHp;
            if (h.freeT > 0) { h.state = St.Walk; h.fleeing = true; } // an ejected driver runs off the road
            else { this.assign(h, this.ctx.playerCarX, this.ctx.playerCarZ); h.fleeing = true; }
          }
        }
        break;
      case St.Dead:
        if (h.grounded) h.stateT -= dt;
        if (h.stateT <= 0) { h.active = false; this.hide(h); }
        break;
    }
  }

  private updateCivilian(h: Human, dt: number): void {
    h.flash = Math.max(0, h.flash - dt);
    if (h.state !== St.Walk) return;
    const ctx = this.ctx;
    if (h.freeT > 0) {
      // free-running: away from the hijacked car, then rejoin the crowd somewhere else
      h.freeT -= dt;
      const a = Math.atan2(h.x - ctx.playerCarX, h.z - ctx.playerCarZ);
      h.heading += wrap(a - h.heading) * Math.min(1, dt * 8);
      h.mvx = Math.sin(h.heading) * 5.2; h.mvz = Math.cos(h.heading) * 5.2;
      h.speed = 5.2; h.fleeing = true;
      if (h.freeT <= 0) { h.freeT = 0; this.assign(h, ctx.playerCarX, ctx.playerCarZ); }
      return;
    }
    const dxp = h.x - this.player.x, dzp = h.z - this.player.z;
    const near = (this.ctx.playerActive && dxp * dxp + dzp * dzp < 90 && this.combatTimer > 0)
      || ((h.x - ctx.playerCarX) ** 2 + (h.z - ctx.playerCarZ) ** 2 < 100 && ctx.playerCarSpeed > 9);
    if (near) h.fleeing = true; else if (h.fleeing && this.rng() < dt * 0.15) h.fleeing = false;
    const v = h.fleeing ? 5.2 : h.pathSpeed;
    const p = this.perim(h.lot);
    h.s += h.dir * v * dt;
    const [nx, nz] = this.pointOn(p, h.s);
    h.heading = Math.atan2(nx - h.x, nz - h.z);
    h.x = nx; h.z = nz;
    h.speed = v;
    h.mvx = h.mvz = 0;
  }

  update(dt: number, ctx: HumanCtx): void {
    this.ctx = ctx;
    this.time += dt;
    const p = this.player;
    this.manageCops(dt);
    for (const h of this.list) {
      if (!h.active) continue;
      // far-away civilians are frozen and not drawn
      if (h.role === Role.Civ && Math.abs(h.x - p.x) + Math.abs(h.z - p.z) > 190
        && Math.abs(h.x - ctx.playerCarX) + Math.abs(h.z - ctx.playerCarZ) > 190) {
        if (h.rendered) this.hide(h);
        continue;
      }
      h.invuln = Math.max(0, h.invuln - dt);
      if (h.role === Role.Player) this.updatePlayer(h, dt);
      else if (h.role === Role.Cop) this.updateCop(h, dt);
      else this.updateCivilian(h, dt);
      this.updateTimedStates(h, dt);
      if (!h.active) continue;
      const civWalking = h.role === Role.Civ && h.state === St.Walk && h.freeT <= 0;
      if (!civWalking) this.integrate(h, dt, true);
      this.animate(h, dt);
    }
    // separate overlapping cops
    for (let i = COP_FIRST; i <= COP_LAST; i++) {
      const a = this.list[i];
      if (!a.active) continue;
      for (let j = i + 1; j <= COP_LAST; j++) {
        const b = this.list[j];
        if (!b.active) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.75 && d > 1e-4) { const k = (0.75 - d) / 2; a.x += (dx / d) * k; a.z += (dz / d) * k; b.x -= (dx / d) * k; b.z -= (dz / d) * k; }
      }
    }
    this.updatePickups(dt);
    this.renderer.finish();
  }

  private updatePickups(dt: number): void {
    for (const k of this.pickups) {
      if (!k.active) continue;
      k.t += dt;
      k.mesh.position.set(k.x, 0.4 + Math.sin(k.t * 4) * 0.08, k.z);
      k.mesh.rotation.y = k.t * 2.2;
      if (this.ctx.playerActive && Math.hypot(this.player.x - k.x, this.player.z - k.z) < 1.5) {
        k.active = false; k.mesh.visible = false;
        this.unlockedBaton = true;
        this.hooks.onPickup();
      }
    }
  }

  // ------------------------------------------------------------------ mocap clip selection (model_check clips)
  /** Natural ground speed (m/s) of each locomotion clip, used to scale playback so feet don't slide. */
  private static readonly NATURAL: Record<string, number> = {
    walk: 1.5, walkCalm: 1.4, walkB: 1.3, run: 4.0, runCalm: 3.4, runB: 3.2,
    strafeWalkN: 1.2, strafeWalkP: 1.2, strafeRunN: 3.2, strafeRunP: 3.2,
  };

  /** Mocap clip for each attack. `weapon > 0` uses the sword slashes (the bat / baton swing). */
  private attackClip(_h: Human, a: Attack): string {
    switch (a.id) {
      case 'jab': return 'attack1';
      case 'cross': return 'attack2';
      case 'upper': return 'attack3';
      case 'kick': return 'kick';
      case 'swing1': return 'slash1';
      default: return 'slash3';
    }
  }

  private selName = 'idle';
  private selU = 0;
  private selFade = 0.15;

  private chooseClip(h: Human, dt: number): void {
    const civ = h.role === Role.Civ;
    this.selFade = 0.15;
    switch (h.state) {
      case St.Attack: {
        const a = h.attack ?? ATTACKS.jab;
        const name = this.attackClip(h, a);
        const c = CLIPS[name];
        const total = a.wind + a.act + a.rec;
        const center = a.wind + a.act / 2;
        // warp so the clip's strike frame lands in the middle of the GDD active window
        const hitT = a.id === 'kick' ? 0.6 : c.hit; // the kick clip's stored hit marker is early; its leg extends at ~0.6 s
        const t = h.atkT < center ? (h.atkT / center) * hitT : hitT + ((h.atkT - center) / Math.max(0.001, total - center)) * (c.d - hitT);
        this.selName = name; this.selU = t / c.d; this.selFade = 0.05;
        return;
      }
      case St.Dodge: {
        this.selName = 'dive'; this.selU = 1 - h.stateT / h.stateDur; this.selFade = 0.04;
        return;
      }
      case St.Hit:
        // hurt with a gun in hand: the rifle flinch
        this.selName = h.role === Role.Player && h.weapon >= 3 ? 'rifleHit' : h.slot % 2 ? 'impact2' : 'impact'; this.selU = 1 - h.stateT / h.stateDur; this.selFade = 0.03;
        return;
      case St.Down:
      case St.Dead:
        if (h.fallClip) { this.selName = h.fallClip; this.selU = Math.min(1, h.downT / 1.5); this.selFade = 0.05; return; } // a shot: the long fall, sped up
        this.selName = 'die'; this.selU = Math.min(1, h.downT / 0.9); this.selFade = 0.04;
        return;
      case St.GetUp:
        if (h.fallClip) { this.selName = h.fallClip; this.selU = Math.max(0, h.stateT / h.stateDur); this.selFade = 0.04; return; }
        this.selName = 'die'; this.selU = Math.max(0, h.stateT / h.stateDur); this.selFade = 0.04; // rise = the fall played backwards
        return;
    }
    if (h.role === Role.Player && h.weapon >= 3 && this.chooseGunClip(h, dt)) return;
    // airborne (jump): the Sword-and-Shield jump clip, apex at 0.5 s mapped to the physics apex
    if (!h.grounded) {
      this.selName = 'gsJump'; this.selU = Math.min(1, (h.airT * (0.5 / (JUMP_VY / GRAVITY))) / CLIPS.gsJump.d); this.selFade = 0.06;
      return;
    }
    const speed = h.speed;
    if (speed < 0.4) {
      this.selName = civ ? 'idleCalm' : h.role === Role.Cop ? 'idleAlert' : h.weapon > 0 ? 'idle' : 'idleEase';
      h.clipU += dt / CLIPS[this.selName].d;
      this.selU = h.clipU;
      return;
    }
    // locomotion direction relative to facing: forward / backward / strafe left or right
    const fwd = h.mvx * Math.sin(h.heading) + h.mvz * Math.cos(h.heading);
    const left = h.mvx * Math.cos(h.heading) - h.mvz * Math.sin(h.heading);
    const run = speed > 3.0 || (civ && h.fleeing);
    let name: string;
    if (civ || (Math.abs(left) < Math.abs(fwd) * 0.9 && fwd >= 0) || h.mvx * h.mvx + h.mvz * h.mvz < 0.01) {
      // unarmed characters (player with fists, civilians) use the relaxed Calm clips; armed ones the combat stance
      const calm = civ || (h.role === Role.Player && h.weapon === 0);
      name = calm ? (run ? 'runCalm' : 'walkCalm') : run ? 'run' : 'walk';
    } else if (Math.abs(fwd) >= Math.abs(left) * 0.9 && fwd < 0) name = run ? 'runB' : 'walkB';
    else name = left > 0 ? (run ? 'strafeRunP' : 'strafeWalkP') : (run ? 'strafeRunN' : 'strafeWalkN');
    const nat = Humans.NATURAL[name] ?? 1.5;
    const rate = Math.max(0.5, Math.min(2.4, speed / nat));
    h.clipU += (dt * rate) / CLIPS[name].d;
    this.selName = name; this.selU = h.clipU;
  }

  /** The player with a gun in hand: pistol-grip clips for handguns, the rifle set (eight directions) for long guns. */
  private chooseGunClip(h: Human, dt: number): boolean {
    const pistol = h.weapon === 3 || h.weapon === 7;
    const rocket = h.weapon === 6;
    if (h.throwT > 0) {
      // the grenade throw: the whole clip (pull the pin, wind up, throw), sped up to fit
      this.selName = 'rifleGrenade'; this.selU = 1 - h.throwT / h.throwDur; this.selFade = 0.06;
      return true;
    }
    if (!h.grounded) {
      // the three-part jump: take-off, a held loop in the air, then the landing pose as the fall ends
      const t = h.airT;
      if (t < 0.22) { this.selName = 'proJumpUp'; this.selU = t / 0.22; }
      else { this.selName = 'proJumpLoop'; this.selU = (t - 0.22) * 1.5; }
      this.selFade = 0.06;
      return true;
    }
    const aim = h.aimT > 0;
    if (h.speed < 0.4) {
      this.selName = pistol ? 'pistolIdle' : rocket ? (aim ? 'rifleAimIdle' : 'proIdle') : aim ? 'proIdleAim' : 'proIdle';
      h.clipU += dt / CLIPS[this.selName].d;
      this.selU = h.clipU;
      return true;
    }
    // direction of travel relative to where the body faces
    const fwd = h.mvx * Math.sin(h.heading) + h.mvz * Math.cos(h.heading);
    const left = h.mvx * Math.cos(h.heading) - h.mvz * Math.sin(h.heading);
    const run = h.speed > 3.0;
    let name: string;
    if (pistol) {
      if (Math.abs(left) > Math.abs(fwd) * 1.1) name = left > 0 ? 'pistolStrafeL' : 'pistolStrafeR';
      else if (fwd >= 0) name = run ? 'pistolRun' : 'pistolWalk';
      else name = run ? 'pistolRunB' : 'pistolWalkB';
    } else {
      // eight sectors around the body: F, FL, L, BL, B, BR, R, FR
      const a = Math.atan2(left, fwd); // 0 = straight ahead, + = to the left
      const sector = Math.round(a / (Math.PI / 4));
      const dir = ['F', 'FL', 'L', 'BL', 'B', 'BR', 'R', 'FR'][((sector % 8) + 8) % 8];
      name = (h.speed > 6.0 ? 'proSprint' : 'proRun') + dir;
    }
    const nat = CLIPS[name].speed || Humans.NATURAL[name] || 3;
    const rate = Math.max(0.5, Math.min(2.4, h.speed / nat));
    h.clipU += (dt * rate) / CLIPS[name].d;
    this.selName = name; this.selU = h.clipU; this.selFade = 0.12;
    return true;
  }

  private qa = new THREE.Quaternion();
  private qb = new THREE.Quaternion();
  private aimPose = new Float32Array(15 * 4 + 2);
  private static readonly UPPER = [J.torso, J.head, J.shL, J.elL, J.wrL, J.shR, J.elR, J.wrR];

  /** Layers the raised-gun arms over a moving clip, and adds the shot kick and the reload dip (the packs have neither). */
  private gunPose(h: Human, dt: number): void {
    const out = h.anim.out;
    const pistol = h.weapon === 3 || h.weapon === 7;
    const moving = h.speed >= 0.4 && h.grounded;
    const grenade = h.weapon === 8;
    const target = !pistol && !grenade && h.aimT > 0 && moving ? 1 : 0;
    h.aimBlend += (target - h.aimBlend) * Math.min(1, dt * 14);
    if (h.aimBlend > 0.02) {
      sampleClip(CLIPS[h.weapon === 6 ? 'rifleAimIdle' : 'proIdleAim'], 0, this.aimPose);
      for (const j of Humans.UPPER) {
        this.qa.fromArray(out, j * 4);
        this.qb.fromArray(this.aimPose, j * 4);
        this.qa.slerp(this.qb, h.aimBlend).toArray(out, j * 4);
      }
    }
    if (h.reloadU >= 0 && !pistol && !grenade && h.throwT <= 0) {
      // the rifle reload: its arms (and back and head) over whatever the legs are doing, faded in and out at the ends
      sampleClip(CLIPS.rifleReload, h.reloadU, this.aimPose);
      const w = Math.min(1, h.reloadU * 8, (1 - h.reloadU) * 8);
      for (const j of Humans.UPPER) {
        this.qa.fromArray(out, j * 4);
        this.qb.fromArray(this.aimPose, j * 4);
        this.qa.slerp(this.qb, Math.max(0, w)).toArray(out, j * 4);
      }
    }
    if (h.recoil > 0.01) {
      // the body kicks back and the arms rise a little
      this.rot(out, J.torso, -0.16 * h.recoil);
      this.rot(out, J.shR, -0.28 * h.recoil);
      this.rot(out, J.shL, -0.28 * h.recoil);
    }
    if (h.reloadK > 0.01) {
      // the gun comes down and the head looks at it
      this.rot(out, J.shR, 0.55 * h.reloadK);
      this.rot(out, J.shL, 0.4 * h.reloadK);
      this.rot(out, J.head, 0.25 * h.reloadK);
    }
  }
  private rot(pose: Float32Array, joint: number, angle: number): void {
    this.qa.fromArray(pose, joint * 4);
    this.qb.setFromAxisAngle(AXIS_X, angle);
    this.qa.multiply(this.qb).toArray(pose, joint * 4);
  }

  private animate(h: Human, dt: number): void {
    if (h.state !== h.prevState) { h.prevState = h.state; h.downT = 0; }
    if (h.state === St.Down || h.state === St.Dead) h.downT += dt;
    h.airT = h.grounded ? 0 : h.airT + dt;

    // footsteps from the player's stride
    if (h.role === Role.Player && h.speed > 0.4 && h.grounded && h.state !== St.Attack) {
      const sgn = Math.sin(h.clipU * Math.PI * 2) >= 0 ? 1 : -1;
      if (sgn !== h.lastStepSign) { h.lastStepSign = sgn; this.hooks.onStep(); }
    }

    this.chooseClip(h, dt);
    h.anim.play(this.selName, this.selU, dt, this.selFade);
    if (h.role === Role.Player && h.weapon >= 3) this.gunPose(h, dt);

    if (h.flash > 0) { this.renderer.setLook(h.slot, h.look, h.flash); h.flashed = true; }
    else if (h.flashed) { this.renderer.setLook(h.slot, h.look); h.flashed = false; }

    // quick 0.15 s equip pop when the weapon changes
    if (h.weapon !== h.prevWeapon) { h.prevWeapon = h.weapon; h.equipT = 0.15; }
    h.equipT = Math.max(0, h.equipT - dt);
    const pop = 1 + (h.equipT / 0.15) * 0.7;
    this.renderer.draw(h.slot, h.x, h.y, h.z, h.heading, h.scale, 0, h.anim.out, h.look.cap, h.weapon, pop, h.riot && h.role === Role.Cop);
    h.rendered = true;
  }

  /** Forward vector of the right-hand weapon (for slash trail placement). */
  socket(out: THREE.Vector3): THREE.Vector3 {
    return this.renderer.socketPosition(out);
  }
}
