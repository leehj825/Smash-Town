import * as THREE from 'three';
import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import { MeshBuilder } from './geo';
import type { GameVehicle } from './vehicles';

type Phase = 'idle' | 'count' | 'run';
type P2 = { x: number; z: number };

interface Rival {
  v: GameVehicle;
  name: string;
  color: string;
  idx: number;
  skill: number;
  routeT: number;
  route: P2[] | null;
  stuck: number;
  rev: number;
  done: boolean;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * Street races: drive into an orange start marker and two rival cars line up beside you. After the countdown everybody races through seven
 * checkpoints along the roads. You are guided by glowing chevrons painted on the road along the route, a floating arrow above your car, the
 * guide arrow and route line on the HUD and the map, and your position (1st, 2nd, 3rd) is shown all the time. First across the line pays most.
 */
export class StreetRace {
  private phase: Phase = 'idle';
  private starts: (P2 & { dx: number; dz: number })[] = [];
  private startBeacons: Beacon[] = [];
  private cp: P2[] = [];
  private beacon = new Beacon(0xff9a3d, 7.5);
  private beacon2 = new Beacon(0xffffff, 4.5);
  private idx = 0;
  private time = 0;
  private count = 0;
  private cooldown = 0;
  private done = 0;
  /** Best winning time per start, in seconds (saved). */
  readonly best: Record<number, number> = {};
  private which = 0;
  private elapsed = 0;
  private rivals: Rival[] = [];
  private finishedBefore = 0;
  private graceT = 0;
  // guidance
  private route: P2[] = [];
  private routeT = 0;
  private trail: THREE.InstancedMesh;
  private arrow = new THREE.Group();
  private bob = 0;
  private tmp = new THREE.Object3D();

  constructor(private game: Game) {
    (game.save.raceBest ?? []).forEach((t, i) => { if (t > 0) this.best[i] = t; });
    game.scene.add(this.beacon.group, this.beacon2.group);
    this.beacon.visible = false; this.beacon2.visible = false;
    const segs = game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    for (const f of [0.15, 0.5, 0.82]) {
      const s = segs[Math.floor(segs.length * f)];
      if (!s) continue;
      this.starts.push({ x: s.x, z: s.z, dx: s.dx, dz: s.dz });
      const b = new Beacon(0xff9a3d, 5.5);
      b.setPosition(s.x, s.z);
      game.scene.add(b.group);
      this.startBeacons.push(b);
    }
    // chevrons painted on the road along the racing line (a V pointing the way to go)
    const cb = new MeshBuilder();
    cb.rotatedBox(0.45, 0.05, 2.1, -0.75, 0, -0.4, 0, 0.65, 0, 0xffffff);
    cb.rotatedBox(0.45, 0.05, 2.1, 0.75, 0, -0.4, 0, -0.65, 0, 0xffffff);
    this.trail = new THREE.InstancedMesh(
      cb.build(),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      48,
    );
    this.trail.count = 0; this.trail.frustumCulled = false; this.trail.visible = false;
    game.scene.add(this.trail);
    // a floating arrow above your car that points at where to drive next
    const am = new THREE.MeshBasicMaterial({ color: 0xff9a3d, fog: false, depthTest: false, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 1.5), am); shaft.position.z = -0.4;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.1, 4).rotateX(Math.PI / 2), am); head.position.z = 0.9;
    shaft.renderOrder = 20; head.renderOrder = 20;
    this.arrow.add(shaft, head);
    this.arrow.visible = false;
    game.scene.add(this.arrow);
  }

  get active(): boolean { return this.phase !== 'idle'; }
  get completed(): number { return this.done; }

  markers(): { x: number; z: number; flash: boolean; color: string }[] {
    if (this.phase === 'idle') return this.starts.map((s) => ({ ...s, flash: false, color: '#ff9a3d' }));
    const out: { x: number; z: number; flash: boolean; color: string }[] = [];
    if (this.cp[this.idx]) out.push({ ...this.cp[this.idx], flash: true, color: '#ff9a3d' });
    for (const r of this.rivals) out.push({ x: r.v.x, z: r.v.z, flash: false, color: r.color });
    return out;
  }

  /** The top pill during a race: the course, your position and the best time. */
  pillInfo(): { title: string; text: string } {
    const best = this.best[this.which];
    const bestTxt = best !== undefined ? ` · ${bi('Best', '최고')} ${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')}` : '';
    const place = this.game.driving ? this.rank(this.game.driving) : 1;
    const ord = ['1st', '2nd', '3rd'][place - 1] ?? `${place}th`;
    return { title: `${bi('STREET RACE', '스트리트 레이스')} · ${bi('Course', '코스')} ${this.which + 1}${bestTxt}`, text: `${bi('Checkpoint', '체크포인트')} ${Math.min(this.idx + 1, this.cp.length)}/${this.cp.length} · ${ord}/${this.rivals.length + 1}` };
  }

  /** Where the HUD guide arrow and the minimap route should lead (the next checkpoint) while a race is on. */
  guideGoal(): { x: number; z: number; label: string; prop?: boolean } | null {
    const c = this.cp[this.idx];
    return this.phase !== 'idle' && c ? { x: c.x, z: c.z, label: 'race', prop: false } : null;
  }

  private plan(from: P2): void {
    const segs = this.game.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    this.cp = [];
    let cur = from;
    for (let n = 0; n < 7; n++) {
      let best = null as null | P2, bd = Infinity;
      for (let tries = 0; tries < 30; tries++) {
        const s = segs[Math.floor(Math.random() * segs.length)];
        const p = { x: s.x, z: s.z };
        const d = Math.hypot(p.x - cur.x, p.z - cur.z);
        if (d < 90 || d > 260 || this.cp.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 60)) continue;
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) { const s = segs[Math.floor(Math.random() * segs.length)]; best = { x: s.x, z: s.z }; }
      this.cp.push(best);
      cur = best;
    }
  }

  private clearRivals(): void {
    for (const r of this.rivals) this.game.removeVehicle(r.v);
    this.rivals = [];
  }

  private stop(msg?: string): void {
    this.phase = 'idle';
    this.beacon.visible = false; this.beacon2.visible = false;
    this.trail.visible = false; this.arrow.visible = false;
    this.clearRivals();
    this.game.hud.showGig(false);
    this.cooldown = 20;
    if (msg) this.game.hud.toast(msg, 2600);
  }

  private spawnRivals(d: GameVehicle): void {
    void d;
    const G = this.game;
    // line the rivals up along the road itself (the player may be facing any way), pointing toward the first checkpoint
    const st = this.starts[this.which], c0 = this.cp[0];
    const sgn = (c0.x - st.x) * st.dx + (c0.z - st.z) * st.dz >= 0 ? 1 : -1;
    const fx = st.dx * sgn, fz = st.dz * sgn, rx = fz, rz = -fx;
    const h = Math.atan2(fx, fz);
    const specs: { kind: 'sports' | 'muscle'; color: number; css: string; name: string; skill: number; side: number; back: number }[] = [
      { kind: 'sports', color: 0xff7a1a, css: '#ff7a1a', name: 'ORANGE', skill: 0.9, side: -2.6, back: 3.5 },
      { kind: 'muscle', color: 0xf2f2f2, css: '#ffffff', name: 'WHITE', skill: 0.84, side: 2.6, back: 7 },
    ];
    for (const s of specs) {
      const v = G.spawnVehicle(s.kind, s.color, st.x + rx * s.side - fx * s.back, st.z + rz * s.side - fz * s.back, h, 'parked', true);
      v.isGigTarget = true; // keeps the car from being cleaned up as an abandoned parked car
      v.control.handbrake = true;
      this.rivals.push({ v, name: s.name, color: s.css, idx: 0, skill: s.skill, routeT: 0, route: null, stuck: 0, rev: 0, done: false });
    }
  }

  /** The AI racers follow the road route to the next checkpoint (the same roads the guide shows you) as fast as they dare. */
  private driveRival(r: Rival, dt: number): void {
    const G = this.game;
    const v = r.v, c = v.ctrl, ctl = v.control;
    if (r.done || !this.cp[r.idx]) { ctl.throttle = 0; ctl.handbrake = true; return; }
    const cp = this.cp[r.idx];
    r.routeT -= dt;
    if (r.routeT <= 0 || !r.route) { r.routeT = 0.7; r.route = G.nav.route(v.x, v.z, cp.x, cp.z).pts; }
    let tx = cp.x, tz = cp.z;
    const pts = r.route!;
    for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - v.x, pts[k].z - v.z) > 15) { tx = pts[k].x; tz = pts[k].z; break; }
    const diff = wrap(Math.atan2(tx - v.x, tz - v.z) - c.heading);
    ctl.steer = clamp(-diff * 2.6, -1, 1);
    ctl.nitro = false;
    ctl.handbrake = Math.abs(diff) > 1.3 && c.speed > 14;
    if (r.rev > 0) { r.rev -= dt; ctl.throttle = -1; ctl.steer = -ctl.steer; ctl.handbrake = false; return; }
    let want = c.stats.maxSpeed * r.skill;
    const a = Math.abs(diff);
    if (a > 1.0) want = Math.min(want, 8); else if (a > 0.6) want = Math.min(want, 14); else if (a > 0.3) want = Math.min(want, 24);
    // keep a little distance from whatever is in front (traffic, other racers)
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    for (const o of G.vehicles) {
      if (o === v) continue;
      const rx = o.x - v.x, rz = o.z - v.z;
      const ahead = rx * fx + rz * fz;
      if (ahead < 0 || ahead > 12) continue;
      if (Math.abs(rx * fz - rz * fx) < 2.4) want = Math.min(want, Math.max(4, (ahead - 5) * 2.2));
    }
    ctl.throttle = c.forwardSpeed < want ? 1 : c.forwardSpeed > want + 3 ? -1 : 0;
    if (c.speed < 1 && this.phase === 'run') { r.stuck += dt; if (r.stuck > 1.6) { r.stuck = 0; r.rev = 1.1; } } else r.stuck = Math.max(0, r.stuck - dt);
    if (Math.hypot(cp.x - v.x, cp.z - v.z) < 13) {
      r.idx++; r.route = null;
      if (r.idx >= this.cp.length) {
        r.done = true;
        this.finishedBefore++;
        if (this.finishedBefore === 1) {
          this.graceT = 25;
          G.hud.toast(bi(`${r.name} wins! Finish fast for second place.`, `${r.name} 우승! 빨리 들어와서 2등을 노리세요.`), 2800);
        }
      }
    }
  }

  /** Called after the other cars have had their controls set for the frame: the rivals hold on the line, then race. */
  drive(dt: number): void {
    if (this.phase === 'idle') return;
    for (const r of this.rivals) {
      if (this.phase === 'count') { r.v.control.throttle = 0; r.v.control.steer = 0; r.v.control.handbrake = true; }
      else this.driveRival(r, dt);
    }
  }

  /** 1 = leading. Racers are ranked by checkpoints passed, then by how close they are to the next one. */
  private rank(d: GameVehicle): number {
    const me = this.idx * 100000 - Math.hypot(this.cp[this.idx]?.x - d.x, this.cp[this.idx]?.z - d.z || 0);
    let place = 1;
    for (const r of this.rivals) {
      const c = this.cp[r.idx];
      const sc = r.done ? 1e9 : r.idx * 100000 - (c ? Math.hypot(c.x - r.v.x, c.z - r.v.z) : 0);
      if (sc > me) place++;
    }
    return place;
  }

  /** Chevrons on the road from the player to the next checkpoint, an arrow over the car, and the HUD route. */
  private guide(dt: number, d: GameVehicle): void {
    const G = this.game;
    const c = this.cp[this.idx];
    if (!c) return;
    this.routeT -= dt;
    if (this.routeT <= 0 || !this.route.length) { this.routeT = 0.35; this.route = G.nav.route(d.x, d.z, c.x, c.z).pts; }
    const pts = this.route;
    // walk along the route laying a chevron every 5 m for the next 200 m
    const poly: P2[] = [{ x: d.x, z: d.z }, ...pts.slice(1)];
    let n = 0, carry = 4;
    const col = new THREE.Color();
    for (let k = 0; k < poly.length - 1 && n < 48; k++) {
      const a = poly[k], b = poly[k + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (seg < 0.01) continue;
      const dx = (b.x - a.x) / seg, dz = (b.z - a.z) / seg;
      while (carry < seg && n < 48) {
        const px = a.x + dx * carry, pz = a.z + dz * carry;
        this.tmp.position.set(px, 0.09, pz);
        this.tmp.rotation.set(0, Math.atan2(dx, dz), 0);
        this.tmp.updateMatrix();
        this.trail.setMatrixAt(n, this.tmp.matrix);
        // fade toward the far end so the nearest ones are boldest
        col.setRGB(1, 0.82 - n * 0.004, 0.2 + n * 0.005);
        this.trail.setColorAt(n, col);
        n++; carry += 5;
      }
      carry -= seg;
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
    this.trail.visible = n > 0;
    // the point to head for: about 22 m along the route
    let tx = c.x, tz = c.z;
    for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k].x - d.x, pts[k].z - d.z) > 22) { tx = pts[k].x; tz = pts[k].z; break; }
    this.bob += dt;
    this.arrow.visible = true;
    this.arrow.position.set(d.x, 3.6 + Math.sin(this.bob * 4) * 0.15, d.z);
    this.arrow.rotation.y = Math.atan2(tx - d.x, tz - d.z);
  }

  update(dt: number): void {
    const G = this.game;
    for (const b of this.startBeacons) b.update(dt);
    this.beacon.update(dt); this.beacon2.update(dt);
    const d = G.driving;
    const driving = !!d && !G.onFoot && !G.inside && G.state === 'play';
    if (this.phase !== 'idle') {
      if (!driving) { this.stop(bi('Race cancelled', '레이스가 취소됐어요')); return; }
      if (G.stars > 0) { this.stop(bi('Race over - the police got involved', '경찰이 개입해서 레이스가 끝났어요')); return; }
    }
    if (this.phase === 'idle') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      for (const b of this.startBeacons) b.visible = this.cooldown <= 0;
      if (!driving || this.cooldown > 0 || G.stars > 0 || G.gigs.active || G.taxi.active || G.range.running) return;
      for (let i = 0; i < this.starts.length; i++) {
        const s = this.starts[i];
        if (Math.hypot(s.x - d!.x, s.z - d!.z) < 6.5 && d!.ctrl.speed < 12) {
          this.which = i;
          this.plan(s);
          this.phase = 'count'; this.count = 3.2; this.idx = 0; this.elapsed = 0; this.finishedBefore = 0; this.graceT = 0;
          this.route = []; this.routeT = 0;
          for (const b of this.startBeacons) b.visible = false;
          this.beacon.setPosition(this.cp[0].x, this.cp[0].z); this.beacon.visible = true;
          if (this.cp[1]) { this.beacon2.setPosition(this.cp[1].x, this.cp[1].z); this.beacon2.visible = true; }
          this.spawnRivals(d!);
          G.hud.toast(bi('Street race! Two rivals line up beside you.', '스트리트 레이스! 라이벌 두 대가 옆에 섰어요.'), 2400);
          break;
        }
      }
      return;
    }
    if (this.phase === 'count') {
      this.count -= dt;
      this.guide(dt, d!);
      G.hud.showGig(true, bi('STREET RACE', '스트리트 레이스'), bi('Follow the yellow arrows on the road!', '도로의 노란 화살표를 따라가세요!'), `${Math.max(1, Math.ceil(this.count))}`);
      if (this.count <= 0) {
        this.phase = 'run';
        let total = 0, cur: P2 = this.starts[this.which];
        for (const c of this.cp) { total += Math.hypot(c.x - cur.x, c.z - cur.z) * 1.25; cur = c; }
        this.time = 30 + total / 20;
        for (const r of this.rivals) r.v.control.handbrake = false;
        G.hud.toast(bi('GO!', '출발!'), 900);
      }
      return;
    }
    this.time -= dt; this.elapsed += dt;
    this.guide(dt, d!);
    const c = this.cp[this.idx];
    const place = this.rank(d!);
    const ord = ['1st', '2nd', '3rd'][place - 1] ?? `${place}th`;
    G.hud.showGig(true, bi('STREET RACE', '스트리트 레이스'), `${bi('Checkpoint', '체크포인트')} ${this.idx + 1}/${this.cp.length} · ${Math.round(Math.hypot(c.x - d!.x, c.z - d!.z))} m · ${bi('POS', '순위')} ${ord}/${this.rivals.length + 1}`, `${Math.max(0, Math.ceil(this.time))}s`);
    if (Math.hypot(c.x - d!.x, c.z - d!.z) < 9) {
      this.idx++;
      G.audio.cash();
      if (this.idx >= this.cp.length) {
        const placeAtFinish = this.finishedBefore + 1;
        const share = [1, 0.55, 0.3][placeAtFinish - 1] ?? 0.2;
        const pay = Math.round((600 + Math.max(0, this.time) * 12) * share);
        G.addCash(pay, 'gigs');
        G.progress.add('gigs');
        if (placeAtFinish === 1) { G.progress.add('races'); this.done++; }
        const prev = this.best[this.which];
        if (placeAtFinish === 1 && (prev === undefined || this.elapsed < prev)) {
          this.best[this.which] = this.elapsed;
          const arr = (G.save.raceBest ??= []);
          arr[this.which] = this.elapsed;
          G.flushSave();
          if (prev !== undefined) G.hud.toast(bi('New course record!', '코스 신기록!'), 2400);
        }
        G.popups.spawn(d!.x, 3, d!.z, `+$${pay}`, '#ff9a3d');
        const ordF = ['1st', '2nd', '3rd'][placeAtFinish - 1] ?? `${placeAtFinish}th`;
        G.hud.toast(`${placeAtFinish === 1 ? bi('You won the race!', '레이스 우승!') : `${ordF} ${bi('place', '등')}`} $${pay} · ${this.elapsed.toFixed(1)}s`, 3400);
        this.stop();
        return;
      }
      this.beacon.setPosition(this.cp[this.idx].x, this.cp[this.idx].z);
      if (this.cp[this.idx + 1]) { this.beacon2.setPosition(this.cp[this.idx + 1].x, this.cp[this.idx + 1].z); this.beacon2.visible = true; } else this.beacon2.visible = false;
    }
    if (this.graceT > 0) { this.graceT -= dt; if (this.graceT <= 0) this.stop(bi('The race is over - you did not finish in time', '레이스 종료 - 제한 시간 안에 들어오지 못했어요')); }
    else if (this.time <= 0) this.stop(bi('Out of time!', '시간 초과!'));
  }
}
