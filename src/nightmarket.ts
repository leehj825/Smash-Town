import * as THREE from 'three';
import type { Game } from './game';
import { MeshBuilder, paletteMaterial } from './geo';
import { bi } from './i18n';

const RUMORS: [string, string][] = [
  ['Psst. A man in a grey coat buys patrol schedules. Pays in new bills.', '쉿. 회색 코트 남자가 순찰 일정을 사 간대요. 새 돈으로 낸대요.'],
  ['They say the Harbor Stash has a back door. Ask the dockmaster.', '항구 창고에 뒷문이 있대요. 부두 관리인에게 물어봐요.'],
  ['The mayor never eats here. Maybe he knows what we know.', '시장은 여기선 절대 안 먹어요. 우리가 아는 걸 알아서일지도요.'],
];

/**
 * A night market. After dark a few small stalls open inside the plazas and the park: well away from the roads, so nothing here gets in the way of
 * a chase. Walk up on foot: a skewer for $8 brings your health back, otherwise the stall keeper passes on a rumour (the first one is a clue about G).
 * Each stall serves you once every minute.
 */
export class NightMarket {
  private stalls: { x: number; z: number; cd: number }[] = [];
  private group = new THREE.Group();
  private built = false;
  private t = 0;

  constructor(private game: Game) {
    game.scene.add(this.group);
    this.group.visible = false;
  }

  /** Stall spots: inside each plaza or park lot, in a short row at its centre, only if the lot is big enough to keep clear of the edges. */
  private build(): void {
    this.built = true;
    const G = this.game;
    const b = new MeshBuilder();
    const lots = G.world.lots.filter((l) => (l.district === 'plaza' || l.district === 'park') && !l.river).slice(0, 4);
    const colors = [0xff5db1, 0x35e0ff, 0xffd23a];
    for (const l of lots) {
      const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
      if (l.x1 - l.x0 < 26 || l.z1 - l.z0 < 26) continue;
      for (let k = 0; k < 3; k++) {
        const x = cx + (k - 1) * 5, z = cz;
        this.stalls.push({ x, z, cd: 0 });
        b.box(2.4, 1.0, 1.2, x, 0.5, z, 0x6b4a2e);                              // counter
        for (const sx of [-1, 1]) b.box(0.12, 2.4, 0.12, x + sx * 1.1, 1.2, z - 0.5, 0x3a3a44); // posts
        b.box(2.8, 0.1, 1.9, x, 2.45, z - 0.2, colors[k % colors.length]);        // awning
        b.box(0.6, 0.35, 0.5, x, 1.18, z, 0xffe9a8);                              // lantern on the counter
      }
    }
    if (!b.isEmpty) this.group.add(new THREE.Mesh(b.build(), paletteMaterial({ emissive: 0x332211, emissiveIntensity: 0.6 })));
  }

  get stallCount(): number { return this.stalls.length; }

  update(dt: number): void {
    const G = this.game;
    if (G.mode === 'kids') { this.group.visible = false; return; }
    if (!this.built) { this.t -= dt; if (this.t > 0) return; this.t = 5; if (G.world.lots.length) this.build(); else return; }
    const open = G.env.night > 0.55;
    this.group.visible = open && this.stalls.length > 0;
    for (const s of this.stalls) s.cd = Math.max(0, s.cd - dt);
    if (!open || G.state !== 'play' || G.inside || !G.onFoot || G.stars > 0) return;
    const p = G.humans.player;
    for (const s of this.stalls) {
      if (s.cd > 0 || Math.hypot(s.x - p.x, s.z - p.z) > 2.6) continue;
      s.cd = 60;
      if (p.hp < p.maxHp * 0.9 && G.cash >= 8) {
        G.cash -= 8; G.hud.setCash(G.cash); G.saveDirty = true;
        p.hp = Math.min(p.maxHp, p.hp + 35);
        G.popups.spawn(s.x, 3, s.z, bi('Skewer! -$8, +health', '꼬치! -$8, 체력 회복'), '#ffb23d');
      } else {
        const i = Math.floor(Math.random() * RUMORS.length);
        G.popups.spawn(s.x, 3.4, s.z, bi(RUMORS[i][0], RUMORS[i][1]), '#ffe9a8');
        if (G.mode === 'story' && G.sideOpen) G.addClue('market');
      }
      break;
    }
  }
}
