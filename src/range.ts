import * as THREE from 'three';
import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';
import { MeshBuilder, paletteMaterial } from './geo';

export interface RangeTarget { x: number; z: number; alive: boolean; mesh: THREE.Mesh }

/**
 * Target practice at the Gun Shop: walk into the marker with a gun out and eight bullseyes pop up on the street;
 * hit them all inside 45 seconds. Bullets, rockets and grenades all count. It runs only while nothing else is going on.
 */
export class RangeGig {
  readonly targets: RangeTarget[] = [];
  private beacon = new Beacon(0xff9a3d, 3.2);
  private spot: { x: number; z: number; dx: number; dz: number } | null = null;
  private time = 0;
  private cooldown = 0;
  private active = false;
  private geo: THREE.BufferGeometry;
  private mat = paletteMaterial();
  private hint = 0;

  constructor(private game: Game) {
    const b = new MeshBuilder();
    b.box(0.12, 2.0, 0.12, 0, 1.0, 0, 0x6b4a2e);
    b.cylinder(0.7, 0.7, 0.1, 14, 0, 1.55, 0, 0xffffff, Math.PI / 2, 0, 0);
    b.cylinder(0.5, 0.5, 0.11, 14, 0, 1.55, 0, 0xe0243c, Math.PI / 2, 0, 0);
    b.cylinder(0.3, 0.3, 0.12, 14, 0, 1.55, 0, 0xffffff, Math.PI / 2, 0, 0);
    b.cylinder(0.12, 0.12, 0.13, 14, 0, 1.55, 0, 0xe0243c, Math.PI / 2, 0, 0);
    this.geo = b.build();
    game.scene.add(this.beacon.group);
    this.beacon.visible = false;
  }

  /** Placed lazily: the interiors (and so the Gun Shop door) exist only after the game is built. */
  private ensureSpot(): void {
    if (this.spot) return;
    const G = this.game;
    const door = G.interiors.rooms.find((r) => r.id === 'gun')?.door;
    if (!door) return;
    let best = G.world.segments[0], bd = Infinity;
    for (const s of G.world.segments) { const d = Math.hypot(s.x - door.x, s.z - door.z); if (d < bd) { bd = d; best = s; } }
    // a spot 7 m along the road from the door, on the roadway
    const x = door.x + best.dx * 7, z = door.z + best.dz * 7;
    this.spot = { x, z, dx: best.dx, dz: best.dz };
    this.beacon.setPosition(x, z);
    this.beacon.visible = true;
  }

  get running(): boolean { return this.active; }

  markers(): { x: number; z: number; active: boolean }[] {
    this.ensureSpot();
    return this.spot && !this.active ? [{ x: this.spot.x, z: this.spot.z, active: false }] : this.targets.filter((t) => t.alive).map((t) => ({ x: t.x, z: t.z, active: true }));
  }

  private begin(): void {
    const G = this.game;
    const s = this.spot!;
    this.dispose();
    // eight bullseyes 10-26 m down the road either way, on open ground
    let tries = 0;
    while (this.targets.length < 8 && tries++ < 200) {
      const along = 10 + Math.random() * 16, side = (Math.random() - 0.5) * 9;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x = s.x + s.dx * along * dir + -s.dz * side, z = s.z + s.dz * along * dir + s.dx * side;
      if (G.world.boxes.some((b) => x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1)) continue;
      if (this.targets.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.set(x, 0.1, z);
      mesh.rotation.y = Math.atan2(s.dx * -dir, s.dz * -dir) + (Math.random() - 0.5) * 0.4;
      G.scene.add(mesh);
      this.targets.push({ x, z, alive: true, mesh });
    }
    this.active = true;
    this.time = 45;
    this.beacon.visible = false;
    G.hud.toast(bi('Target practice! Hit all 8 targets.', '사격 연습! 과녁 8개를 모두 맞히세요.'), 3000);
  }

  private dispose(): void {
    for (const t of this.targets) t.mesh.removeFromParent();
    this.targets.length = 0;
  }

  private finish(win: boolean): void {
    const G = this.game;
    this.active = false;
    this.dispose();
    this.cooldown = 60;
    G.hud.showGig(false);
    if (win) {
      const bonus = Math.round(this.time * 10);
      const pay = G.scaled(800 + bonus, 0.5);
      G.addCash(pay, 'gigs');
      G.progress.add('gigs');
      G.hud.toast(`${bi('Target practice complete!', '사격 연습 성공!')} +$${pay.toLocaleString('en-US')}`, 3200);
    } else G.hud.toast(bi('Time is up!', '시간 종료!'), 2400);
  }

  /** A bullet or blast hit a bullseye. */
  hit(t: { x: number; z: number }): void {
    const rt = this.targets.find((q) => q === t || (q.x === t.x && q.z === t.z));
    if (!rt || !rt.alive) return;
    rt.alive = false;
    rt.mesh.visible = false;
    const G = this.game;
    G.vfx.emitDebris(rt.x, 1.5, rt.z, 0, 0, 0xe0243c, 6);
    G.popups.spawn(rt.x, 2.4, rt.z, 'BULLSEYE', '#ffd23a');
    if (this.targets.every((q) => !q.alive)) this.finish(true);
  }
  blast(x: number, z: number, r: number): void {
    for (const t of this.targets) if (t.alive && Math.hypot(t.x - x, t.z - z) < r) this.hit(t);
  }

  update(dt: number): void {
    const G = this.game;
    this.ensureSpot();
    this.beacon.update(dt);
    if (!this.spot) return;
    if (this.active) {
      this.time -= dt;
      const left = this.targets.filter((t) => t.alive).length;
      G.hud.showGig(true, bi('TARGET PRACTICE', '사격 연습'), `${bi('Targets left', '남은 과녁')}: ${left}`, `${Math.ceil(this.time)}s`);
      if (this.time <= 0) this.finish(false);
      return;
    }
    if (this.cooldown > 0) { this.cooldown -= dt; this.beacon.visible = false; return; }
    this.beacon.visible = true;
    if (!G.onFoot || G.inside || G.state !== 'play') return;
    const pl = G.humans.player;
    if (Math.hypot(pl.x - this.spot.x, pl.z - this.spot.z) > 3.2) return;
    if (G.stars > 0 || G.gigs.active || G.roofDash.active || G.sideQuests.active) return;
    if (!G.guns.current()) {
      this.hint -= dt;
      if (this.hint <= 0) { this.hint = 4; G.hud.toast(bi('Bring a gun for target practice (buy one in the Gun Shop).', '사격 연습에는 총이 필요해요 (총기 상점에서 구매).'), 2600); }
      return;
    }
    this.begin();
  }
}
