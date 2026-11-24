import { PoliceBrain, TrafficBrain, type PoliceRole } from './ai';
import type { Game } from './game';
import { STORY_EXTRA } from './story';
import { bi } from './i18n';
import { STATS, type VehicleKind } from './vehicle';
import type { GameVehicle } from './vehicles';

/** Which cars come at each star level. */
export const COMPOSITION: Record<number, [PoliceRole, number][]> = {
  // total police cars: 1, 3, 5, 8, 10
  1: [['cruiser', 1]],
  2: [['cruiser', 3]],
  3: [['cruiser', 3], ['interceptor', 2]],
  4: [['cruiser', 4], ['interceptor', 2], ['swat', 2]],
  5: [['cruiser', 4], ['interceptor', 2], ['swat', 2], ['armored', 2]],
};

/** What the police pay out when you beat them (small: fighting the law is a risk, not a job). */
export const POLICE_PAY = { copKO: 20, car: 40, hunter: 400, heli: 400, survival: 0.25, dropCash: 30 };
export const ROLE_KIND: Record<PoliceRole, VehicleKind> = { cruiser: 'police', interceptor: 'interceptor', swat: 'swat', armored: 'armored' };

/**
 * The police response to a wanted level: which cars come, when reinforcements are sent, roadblocks, spike strips, and the bounty hunter who
 * joins a four-star chase. (The heat, the stars and the busting itself still live in the game; this is the fleet.)
 */
export class Police {
  /** The black muscle car that joins a chase at four stars. Wreck it for a bounty (see POLICE_PAY). */
  hunter: GameVehicle | null = null;
  hunterTimer = 20;
  /** Seconds until the next cruiser is sent. */
  spawnTimer = 0;

  constructor(private G: Game) {}

  /** The cars that are chasing you right now. */
  vehicles(): GameVehicle[] {
    return this.G.vehicles.filter((v) => v.ai === 'police' && !v.ctrl.wrecked);
  }

  /** Cops stop chasing: chasers become ordinary patrols, roadblocks are removed. */
  standDown(): void {
    const G = this.G;
    for (const v of G.vehicles) {
      if (v.ai === 'police') {
        v.ai = 'traffic';
        v.police = null;
        v.traffic = new TrafficBrain(G.rng);
        v.traffic.attachNearest(v.x, v.z, v.ctrl.heading);
        v.despawnT = 6 + G.rng() * 6; // they drive off and are removed once out of sight, so police never pile up in the traffic
      }
    }
    for (const rb of [...G.roadblocks]) G.removeRoadblock(rb);
  }

  private spawnPoint(minDist: number, maxDist: number): { x: number; z: number; heading: number } {
    const G = this.G;
    const px = G.focusX, pz = G.focusZ;
    let p = TrafficBrain.randomPlacement(G.rng, px, pz, minDist);
    for (let i = 0; i < 8 && Math.hypot(p.x - px, p.z - pz) > maxDist; i++) p = TrafficBrain.randomPlacement(G.rng, px, pz, minDist);
    return { x: p.x, z: p.z, heading: Math.atan2(px - p.x, pz - p.z) };
  }

  spawn(role: PoliceRole): void {
    const G = this.G;
    const p = this.spawnPoint(110, 220);
    const kind = ROLE_KIND[role];
    const v = G.spawnVehicle(kind, STATS[kind].color, p.x, p.z, p.heading, 'police');
    v.police = new PoliceBrain(role, G.rng);
  }

  spawnHunter(): void {
    const G = this.G;
    const p = this.spawnPoint(90, 200);
    const v = G.spawnVehicle('muscle', 0x0d0d12, p.x, p.z, p.heading, 'police');
    v.police = new PoliceBrain('interceptor', G.rng);
    v.ctrl.stats = { ...v.ctrl.stats, maxSpeed: v.ctrl.stats.maxSpeed * 0.97 };
    this.hunter = v;
    G.hud.toast(G.mode === 'story' && G.story.ch >= STORY_EXTRA + 3 ? bi("Bigsby's bounty hunter is after you!", '빅스비의 현상금 사냥꾼이 쫓아와요!') : bi('A bounty hunter is after you!', '현상금 사냥꾼이 쫓아와요!'), 2600);
    G.bus.emit({ type: 'hunterSpawned' });
  }

  /** Each frame while wanted: send the cars for this star level, the hunter, roadblocks, and watch the spike strips. */
  manage(dt: number): void {
    const G = this.G;
    if (G.stars === 0) { this.hunterTimer = Math.max(this.hunterTimer, 15); return; }
    if (this.hunter && (!G.vehicles.includes(this.hunter) || this.hunter.ctrl.wrecked || this.hunter.ai !== 'police')) this.hunter = null;
    // in the story, once Bigsby has put a price on your head (three chapters in), his hunters come from two stars
    const huntStars = G.mode === 'story' && G.story.ch >= STORY_EXTRA + 3 ? 2 : 4;
    if (G.stars >= huntStars && !this.hunter) { this.hunterTimer -= dt; if (this.hunterTimer <= 0) { this.hunterTimer = 90; this.spawnHunter(); } }
    const comp = COMPOSITION[G.stars];
    // while you are evading (police exist but are far behind) no reinforcements are sent, so a clean getaway is possible
    const evading = G.vehicles.some((v) => v.ai === 'police') && G.unseen > 2;
    const have: Record<string, number> = {};
    for (const v of this.vehicles()) have[v.police!.role] = (have[v.police!.role] ?? 0) + 1;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !evading) {
      for (const [role, n] of comp) {
        if ((have[role] ?? 0) < n) { this.spawn(role); this.spawnTimer = 2.5; break; }
      }
    }
    // roadblocks from 3 stars
    if (G.stars >= 3) {
      G.roadblockTimer -= dt;
      if (G.roadblockTimer <= 0 && G.roadblocks.length < 1) { G.spawnRoadblock(); G.roadblockTimer = 25; }
    }
    this.checkSpikes();
    for (const rb of [...G.roadblocks]) {
      if (Math.hypot(rb.x - G.focusX, rb.z - G.focusZ) > 210) G.removeRoadblock(rb);
    }
  }

  /** The player's car shredding its tyres on a spike strip. */
  checkSpikes(): void {
    const G = this.G;
    const d = G.driving;
    if (!d || G.onFoot) return;
    for (const rb of G.roadblocks) {
      const s = rb.strip;
      if (!s || s.used) continue;
      const rx = d.x - s.x, rz = d.z - s.z;
      const along = rx * s.dx + rz * s.dz;
      const cross = -rx * s.dz + rz * s.dx;
      if (Math.abs(along) < 1.8 && Math.abs(cross) < s.half) {
        s.used = true;
        s.mesh.visible = false;
        if (d.popTire()) {
          G.hud.toast(bi('Spike strip! Tires shredded - repair at a garage', '스파이크! 타이어 파손 - 차고에서 수리하세요'), 3200);
          G.vfx.emitSparks(d.x, 0.3, d.z, 16);
          G.audio.crash(14);
          G.input.rumble(0.8, 0.5, 200);
        }
      }
    }
  }
}
