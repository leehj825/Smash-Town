import { Beacon } from './beacon';
import type { Game } from './game';
import { bi } from './i18n';

type P2 = { x: number; z: number };

/**
 * Delivery runs: step into the pink marker at Donna's Donuts to pick up three orders, then bring each one to its address before the time is up.
 * Works on foot, by bike or by car; bikes are the quick way through traffic. Every drop pays by distance, and the last one adds a bonus.
 */
export class DeliveryJob {
  private phase: 'idle' | 'run' = 'idle';
  private pickup = new Beacon(0xff8fb8, 3.6);
  private drop = new Beacon(0xff8fb8, 5);
  private stops: P2[] = [];
  private i = 0;
  private time = 0;
  private legStart: P2 = { x: 0, z: 0 };
  private cooldown = 5;
  private spot: P2 | null = null;
  private earned = 0;
  private count = 0;
  /** The story's first job has two orders and pays less: it sets these while it is the goal. */
  stopsLimit = 3;
  /** The story's opening wants short walks: the distance range (metres) of an order from the last stop. null = the normal long ones. */
  range: [number, number] | null = null;
  payScale = 1;
  /** No clock (the story's opening): the order never goes cold. */
  untimed = false;
  /** Bad weather pays better: +25% in rain, +40% in a storm (not during the story opening, whose pay is fixed). */
  weatherMul(): number { const G = this.game; if (G.mode === 'story' && !G.sideOpen) return 1; return G.weatherKind === 'storm' ? 1.4 : G.weatherKind === 'rain' ? 1.25 : 1; }

  constructor(private game: Game) {
    game.scene.add(this.pickup.group, this.drop.group);
    this.pickup.visible = false; this.drop.visible = false;
  }

  get active(): boolean { return this.phase === 'run'; }
  get completed(): number { return this.count; }
  /** Which order you are on (0 = the first) and where it goes, while a run is on. */
  get leg(): number { return this.phase === 'run' ? this.i : -1; }
  dropPos(): P2 | null { return this.phase === 'run' ? this.stops[this.i] ?? null : null; }

  markers(): { x: number; z: number; flash: boolean }[] {
    if (this.phase === 'run') return this.stops[this.i] ? [{ ...this.stops[this.i], flash: true }] : [];
    return this.spot ? [{ ...this.spot, flash: false }] : [];
  }

  private roadPoint(from: P2, minD: number, maxD: number): P2 | null {
    const segs = this.game.world.segments.filter((s) => s.len >= 34 && s.hw >= 5.5);
    for (let tries = 0; tries < 60; tries++) {
      const s = segs[Math.floor(Math.random() * segs.length)];
      const d = Math.hypot(s.x - from.x, s.z - from.z);
      if (d >= minD && d <= maxD) return { x: s.x + s.dx * (Math.random() - 0.5) * s.len * 0.4, z: s.z + s.dz * (Math.random() - 0.5) * s.len * 0.4 };
    }
    return null;
  }

  private stop(msg?: string): void {
    this.phase = 'idle';
    this.drop.visible = false;
    this.game.hud.showGig(false);
    this.cooldown = 25;
    if (msg) this.game.hud.toast(msg, 2600);
  }

  update(dt: number): void {
    const G = this.game;
    this.pickup.update(dt); this.drop.update(dt);
    if (!this.spot) {
      const room = G.interiors.rooms.find((r) => r.id === 'donut');
      if (room) { this.spot = { x: room.door.x + Math.cos(room.door.h) * 4, z: room.door.z - Math.sin(room.door.h) * 4 }; this.pickup.setPosition(this.spot.x, this.spot.z); } // a few metres along the pavement from the shop door
    }
    // (the story's opening uses this job; otherwise it waits for the open world)
    if (this.phase === 'idle' && !G.sideOpen && !G.story.deliveryStep()) { this.pickup.visible = false; return; }
    if (!this.spot || G.inside || G.state !== 'play') return;
    const px = G.driving && !G.onFoot ? G.driving.x : G.humans.player.x;
    const pz = G.driving && !G.onFoot ? G.driving.z : G.humans.player.z;
    if (this.phase === 'run' && G.stars > 0) { this.stop(bi('Delivery cancelled - the police are after you', '경찰이 쫓아와서 배달이 취소됐어요')); return; }
    if (this.phase === 'idle') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.pickup.visible = this.cooldown <= 0;
      if (this.cooldown > 0 || G.stars > 0 || G.gigs.active || G.taxi.active || G.race.active || G.range.running) return;
      if (Math.hypot(this.spot.x - px, this.spot.z - pz) < 3.6) {
        this.stops = [];
        let cur: P2 = this.spot;
        let total = 0;
        for (let n = 0; n < this.stopsLimit; n++) {
          const p = this.range ? this.roadPoint(cur, this.range[0], this.range[1] + n * 25) : this.roadPoint(cur, 90, 300 + n * 40);
          if (!p) break;
          total += Math.hypot(p.x - cur.x, p.z - cur.z);
          this.stops.push(p); cur = p;
        }
        if (!this.stops.length) return;
        this.i = 0; this.earned = 0;
        this.time = 35 + total / 6.5;
        this.legStart = { ...this.spot };
        this.phase = 'run';
        this.pickup.visible = false;
        this.drop.setPosition(this.stops[0].x, this.stops[0].z); this.drop.visible = true;
        G.audio.cash();
        G.hud.toast(bi(`${this.stops.length} orders to deliver - hurry, they are hot!`, `배달 ${this.stops.length}건 - 식기 전에 서두르세요!`), 3000);
      }
      return;
    }
    if (!this.untimed) this.time -= dt; else this.time = 60;
    const s = this.stops[this.i];
    const left = Math.hypot(s.x - px, s.z - pz);
    G.hud.showGig(true, bi('DELIVERY', '배달'), `${bi('Order', '주문')} ${this.i + 1}/${this.stops.length} · ${Math.round(left)} m`, this.untimed ? '' : `${Math.max(0, Math.ceil(this.time))}s`);
    if (left < 7.5 && !G.story.blocksDelivery()) {
      const dist = Math.hypot(s.x - this.legStart.x, s.z - this.legStart.z);
      const pay = Math.round((120 + dist * 0.35) * this.payScale * this.weatherMul());
      this.earned += pay;
      G.addCash(pay, 'gigs');
      G.popups.spawn(px, 3, pz, `+$${pay}`, '#ff8fb8');
      G.audio.cash();
      this.legStart = { ...s };
      this.i++;
      if (this.i >= this.stops.length) {
        const bonus = Math.round((150 + Math.max(0, this.time) * 4) * this.payScale * this.weatherMul());
        G.addCash(bonus, 'gigs');
        G.progress.add('gigs');
        G.progress.add('deliveries');
        G.stampCard();
        G.bus.emit({ type: 'helped', x: px, z: pz, amount: 2 });
        this.count++;
        G.hud.toast(`${bi('All delivered!', '배달 완료!')} $${this.earned + bonus} (${bi('bonus', '보너스')} $${bonus})`, 3200);
        this.stop();
        this.cooldown = 40;
        return;
      }
      this.drop.setPosition(this.stops[this.i].x, this.stops[this.i].z);
    }
    if (this.time <= 0) this.stop(bi('Too slow - the food went cold!', '너무 늦었어요 - 음식이 식었어요!'));
  }
}
