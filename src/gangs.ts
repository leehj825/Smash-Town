import { Beacon } from './beacon';
import type { Game } from './game';
import type { Human } from './humans';
import { bi } from './i18n';

interface Zone {
  name: string;
  nameKo: string;
  /** The gang's colour (shirts, map dot, ring). */
  color: number;
  css: string;
  x: number; z: number;
  /** Where the members stand: along the pavement either side of the road. */
  spots: { x: number; z: number }[];
  owner: 'gang' | 'player';
  /** The "you are on their turf" warning was shown (reset once you leave). */
  warned: boolean;
  /** Which kind of crew: the street gangs, or the tougher Mafia. */
  faction: 'gang' | 'mafia';
  reward: number; income: number; hp: number;
  members: Human[];
  ring: Beacon;
  away: number;
}

const RADIUS = 30;

/**
 * Gang turf. Three blocks belong to street gangs, each marked on the map in the gang's colour. Their members stand around on the pavement; walk up
 * to them and the whole crew turns on you. Knock them all out and the block is yours: it pays $120 a minute. Stay away too long and the gang
 * takes it back. Fighting gangs is not a crime, so it never raises your wanted level.
 */
export class Gangs {
  readonly zones: Zone[] = [];
  private revealUntil: Record<number, number> = {};
  private incomeT = 60;
  private gangs = [
    { name: 'The Reds', ko: '더 레즈', color: 0xd62d3a, css: '#d62d3a' },
    { name: 'The Violets', ko: '더 바이올렛츠', color: 0x8e44ad, css: '#b072d6' },
    { name: 'The Greens', ko: '더 그린즈', color: 0x2fb87a, css: '#35d68a' },
    { name: 'The Mafia', ko: '더 마피아', color: 0x2a2a33, css: '#c9ced9', mafia: true },
  ] as { name: string; ko: string; color: number; css: string; mafia?: boolean }[];

  constructor(private game: Game) {
    const segs = game.world.segments.filter((s) => s.len >= 44 && s.hw >= 6);
    const owned = new Set(game.save.turf ?? []);
    [0.3, 0.62, 0.95, 0.84].forEach((f, i) => {
      const s = segs[Math.min(segs.length - 1, Math.floor(segs.length * f))];
      if (!s) return;
      const g = this.gangs[i];
      const spots: { x: number; z: number }[] = [];
      for (let k = 0; k < 5; k++) {
        const side = k % 2 ? 1 : -1;
        const along = (k - 2) * 4.5;
        spots.push({ x: s.x + s.dx * along + -s.dz * side * (s.hw + 1.9), z: s.z + s.dz * along + s.dx * side * (s.hw + 1.9) });
      }
      const ring = new Beacon(g.color, 5);
      ring.setPosition(s.x, s.z);
      game.scene.add(ring.group);
      this.zones.push({ name: g.name, nameKo: g.ko, color: g.color, css: g.css, x: s.x, z: s.z, spots, owner: owned.has(i) ? 'player' : 'gang', warned: false, faction: g.mafia ? 'mafia' : 'gang', reward: g.mafia ? 1500 : 500, income: g.mafia ? 300 : 120, hp: g.mafia ? 130 : 70, members: [], ring, away: 0 });
    });
    game.bus.on('gangDown', () => this.check());
    // what turns a crew against you: your gunfire or a blast of yours close to them (hitting one of them does it in humans.ts)
    const provoke = (x: number, z: number, r: number) => {
      for (const zone of this.zones) {
        if (zone.owner !== 'gang') continue;
        if (zone.members.some((m) => m.active && Math.hypot(m.x - x, m.z - z) < r)) {
          for (const m of zone.members) m.hostile = true;
          game.hud.toast(bi(`${zone.name} turn on you!`, `${zone.nameKo}가 당신에게 덤벼요!`), 2200);
        }
      }
    };
    game.bus.on('gunshot', (e) => { if (!e.ambient) provoke(e.x, e.z, 30); });
    game.bus.on('explosion', (e) => { if (e.byPlayer) provoke(e.x, e.z, 30); });
  }

  /** The gang whose block is easiest to take: the one with the fewest members (or the nearest, if none are out yet). */
  weakest(): Zone | null {
    const open = this.zones.filter((z) => z.owner === 'gang');
    if (!open.length) return null;
    const G = this.game;
    return open.reduce((a, b) => (Math.hypot(a.x - G.focusX, a.z - G.focusZ) < Math.hypot(b.x - G.focusX, b.z - G.focusZ) ? a : b));
  }
  /** Make a zone flash on the map for a while. */
  reveal(z: Zone, seconds: number): void { this.revealUntil[this.zones.indexOf(z)] = performance.now() / 1000 + seconds; }

  get ownedCount(): number { return this.zones.filter((z) => z.owner === 'player').length; }

  markers(): { x: number; z: number; color: string; flash: boolean }[] {
    if (this.game.mode === 'kids') return [];
    const now = performance.now() / 1000;
    return this.zones.map((z, i) => ({ x: z.x, z: z.z, color: z.owner === 'player' ? '#ffd23a' : z.css, flash: (z.owner === 'gang' && z.members.some((m) => m.hostile)) || (this.revealUntil[i] ?? 0) > now }));
  }

  private alive(z: Zone): Human[] {
    return z.members.filter((m) => m.active && m.gang && !m.ko && m.hp > 0 && m.state !== 6 && m.state !== 7 && m.state !== 8); // not down, getting up or dead
  }

  /** Called when a gang member goes down: was that the last of a crew? */
  private check(): void {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.owner !== 'gang' || !z.members.length) continue;
      if (this.alive(z).length > 0) continue;
      this.capture(i);
    }
  }

  capture(i: number): void {
    const G = this.game;
    const z = this.zones[i];
    z.owner = 'player';
    z.away = 0;
    (G.save.turf ??= []);
    if (!G.save.turf.includes(i)) G.save.turf.push(i);
    G.addCash(z.reward, 'other');
    G.progress.add('turfs');
    G.popups.spawn(z.x, 3, z.z, bi(`${z.name} turf is yours! +$${z.reward}`, `${z.nameKo} 구역을 차지했어요! +$${z.reward}`), '#ffd23a');
    G.hud.toast(bi(`You took over the block from ${z.name}. It pays $${z.income} a minute.`, `${z.nameKo}에게서 구역을 빼앗았어요. 분당 $${z.income}이 들어와요.`), 3600);
    G.audio.cash();
    G.flushSave();
    G.bus.emit({ type: 'turfCaptured', zone: i });
    for (const m of z.members) G.humans.removeGangLater(m);
    z.members = [];
  }

  private spawnCrew(z: Zone): void {
    const G = this.game;
    z.members = [];
    z.spots.forEach((p, k) => {
      const m = G.humans.spawnGang(p.x, p.z, z.color, k % 2 === 0);
      if (m) { m.hp = m.maxHp = z.hp; z.members.push(m); }
    });
  }

  update(dt: number): void {
    if (this.game.mode === 'kids') { for (const z of this.zones) z.ring.visible = false; return; } // no gangs in Kids Play
    const G = this.game;
    if (G.state !== 'play' || G.inside) return;
    const px = G.focusX, pz = G.focusZ;
    this.incomeT -= dt;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      z.ring.update(dt);
      z.ring.visible = true;
      const d = Math.hypot(z.x - px, z.z - pz);
      if (z.owner === 'gang') {
        if (d < 120 && !z.members.length) this.spawnCrew(z);
        else if (d > 170 && z.members.length) { for (const m of z.members) G.humans.removeGang(m); z.members = []; }
        // walking in is not a crime: they watch you. They only turn on you when you start something (see provoke below)
        if (d < RADIUS && z.members.length && !z.warned && G.humans.player.hp > 0) {
          z.warned = true;
          G.hud.toast(bi(`${z.name} turf. They are watching - do not start anything.`, `${z.nameKo} 구역이에요. 지켜보고 있어요 - 먼저 시비 걸지 마세요.`), 2600);
        } else if (d > RADIUS + 25) z.warned = false;
      } else {
        // the gang wants it back if you stay away for five minutes of play
        z.away = d > 250 ? z.away + dt : Math.max(0, z.away - dt * 2);
        if (z.away > 300) {
          z.owner = 'gang'; z.away = 0;
          G.save.turf = (G.save.turf ?? []).filter((n) => n !== i);
          G.hud.toast(bi(`${z.name} took their turf back!`, `${z.nameKo}가 구역을 되찾아 갔어요!`), 3200);
          G.bus.emit({ type: 'turfLost', zone: i });
        }
      }
    }
    if (this.incomeT <= 0) {
      this.incomeT = 60;
      const inc = Math.round(this.zones.filter((z) => z.owner === 'player').reduce((a, z) => a + z.income, 0) * G.factions.incomeMult());
      if (inc > 0) { G.addCash(inc, 'other'); G.hud.toast(bi(`Turf income: $${inc}`, `구역 수입: $${inc}`), 2200); }
    }
  }
}
