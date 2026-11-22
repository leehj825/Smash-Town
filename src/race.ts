import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';

type Phase = 'idle' | 'count' | 'run';

/**
 * Street races: drive into an orange start marker, wait out the countdown, then hit seven checkpoints along the roads before the clock runs
 * out. The marker blinks on the map. Faster finishes pay more, and the police ruin everything.
 */
export class StreetRace {
  private phase: Phase = 'idle';
  private starts: { x: number; z: number }[] = [];
  private startBeacons: Beacon[] = [];
  private cp: { x: number; z: number }[] = [];
  private beacon = new Beacon(0xff9a3d, 6.5);
  private beacon2 = new Beacon(0xffffff, 4);
  private idx = 0;
  private time = 0;
  private count = 0;
  private cooldown = 0;
  private done = 0;
  /** Best time of this session per start, in seconds. */
  readonly best: Record<number, number> = {};
  private which = 0;
  private elapsed = 0;

  constructor(private game: Game) {
    game.scene.add(this.beacon.group, this.beacon2.group);
    this.beacon.visible = false; this.beacon2.visible = false;
    const segs = game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    for (const f of [0.15, 0.5, 0.82]) {
      const s = segs[Math.floor(segs.length * f)];
      if (!s) continue;
      this.starts.push({ x: s.x, z: s.z });
      const b = new Beacon(0xff9a3d, 5.5);
      b.setPosition(s.x, s.z);
      game.scene.add(b.group);
      this.startBeacons.push(b);
    }
  }

  get active(): boolean { return this.phase !== 'idle'; }
  get completed(): number { return this.done; }

  markers(): { x: number; z: number; flash: boolean }[] {
    if (this.phase === 'idle') return this.starts.map((s) => ({ ...s, flash: false }));
    return this.cp[this.idx] ? [{ ...this.cp[this.idx], flash: true }] : [];
  }

  private plan(from: { x: number; z: number }): void {
    const segs = this.game.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    this.cp = [];
    let cur = from;
    for (let n = 0; n < 7; n++) {
      let best = null as null | { x: number; z: number }, bd = Infinity;
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

  private stop(msg?: string): void {
    this.phase = 'idle';
    this.beacon.visible = false; this.beacon2.visible = false;
    this.game.hud.showGig(false);
    this.cooldown = 20;
    if (msg) this.game.hud.toast(msg, 2600);
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
          this.phase = 'count'; this.count = 3.2; this.idx = 0; this.elapsed = 0;
          for (const b of this.startBeacons) b.visible = false;
          this.beacon.setPosition(this.cp[0].x, this.cp[0].z); this.beacon.visible = true;
          if (this.cp[1]) { this.beacon2.setPosition(this.cp[1].x, this.cp[1].z); this.beacon2.visible = true; }
          G.hud.toast(bi('Street race! Get ready...', '스트리트 레이스! 준비하세요...'), 2000);
          break;
        }
      }
      return;
    }
    if (this.phase === 'count') {
      this.count -= dt;
      G.hud.showGig(true, bi('STREET RACE', '스트리트 레이스'), bi('Get ready...', '준비...'), `${Math.max(1, Math.ceil(this.count))}`);
      if (this.count <= 0) {
        this.phase = 'run';
        let total = 0, cur = this.starts[this.which];
        for (const c of this.cp) { total += Math.hypot(c.x - cur.x, c.z - cur.z) * 1.25; cur = c; }
        this.time = 25 + total / 21;
        G.hud.toast(bi('GO!', '출발!'), 900);
      }
      return;
    }
    this.time -= dt; this.elapsed += dt;
    const c = this.cp[this.idx];
    G.hud.showGig(true, bi('STREET RACE', '스트리트 레이스'), `${bi('Checkpoint', '체크포인트')} ${this.idx + 1}/${this.cp.length} · ${Math.round(Math.hypot(c.x - d!.x, c.z - d!.z))} m`, `${Math.max(0, Math.ceil(this.time))}s`);
    if (Math.hypot(c.x - d!.x, c.z - d!.z) < 9) {
      this.idx++;
      G.audio.cash();
      if (this.idx >= this.cp.length) {
        const pay = Math.round(600 + Math.max(0, this.time) * 12);
        G.addCash(pay, 'gigs');
        G.progress.add('gigs');
        G.progress.add('races');
        this.done++;
        const prev = this.best[this.which];
        if (prev === undefined || this.elapsed < prev) this.best[this.which] = this.elapsed;
        G.popups.spawn(d!.x, 3, d!.z, `+$${pay}`, '#ff9a3d');
        G.hud.toast(`${bi('Race won!', '레이스 승리!')} $${pay} · ${this.elapsed.toFixed(1)}s`, 3200);
        this.stop();
        return;
      }
      this.beacon.setPosition(this.cp[this.idx].x, this.cp[this.idx].z);
      if (this.cp[this.idx + 1]) { this.beacon2.setPosition(this.cp[this.idx + 1].x, this.cp[this.idx + 1].z); this.beacon2.visible = true; } else this.beacon2.visible = false;
    }
    if (this.time <= 0) this.stop(bi('Out of time!', '시간 초과!'));
  }
}
