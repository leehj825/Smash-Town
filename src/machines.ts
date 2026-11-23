import * as THREE from 'three';
import { MeshBuilder, makeRng, paletteMaterial } from './geo';
import type { Game } from './game';
import { bi } from './i18n';

export type MachineKind = 'vending' | 'atm';
export interface Machine { kind: MachineKind; x: number; z: number; rot: number; cd: number }

function vendingGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(1.0, 1.85, 0.85, 0, 0.93, 0, 0xd62d3a);
  b.box(0.98, 0.14, 0.87, 0, 1.88, 0, 0xffffff);                              // lit header
  b.box(0.7, 1.05, 0.04, -0.1, 1.1, 0.43, 0x9fd6ff);                          // glass
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(0.16, 0.2, 0.05, -0.28 + c * 0.18, 0.78 + r * 0.26, 0.42, [0x2fd0ff, 0xffd23a, 0xff8f3a, 0x7dff6a][(r + c) % 4]);
  b.box(0.2, 0.7, 0.05, 0.38, 1.15, 0.43, 0x2a2d35);                          // panel
  for (let k = 0; k < 3; k++) b.box(0.12, 0.08, 0.04, 0.38, 1.35 - k * 0.12, 0.46, 0xeeeeee);
  b.box(0.7, 0.2, 0.06, -0.1, 0.35, 0.43, 0x15151a);                          // chute
  b.box(1.04, 0.05, 0.89, 0, 0.03, 0, 0x2a2d35);
  return b.build();
}
function atmGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.9, 1.7, 0.7, 0, 0.85, 0, 0x6d7280);
  b.box(0.7, 0.5, 0.05, 0, 1.3, 0.36, 0x2a6bd6);                              // screen
  b.box(0.6, 0.1, 0.06, 0, 1.12, 0.37, 0xffffff);
  b.box(0.5, 0.25, 0.14, 0, 0.88, 0.4, 0x2a2d35);                             // keypad
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b.box(0.08, 0.05, 0.05, -0.12 + c * 0.12, 0.8 + r * 0.07, 0.48, 0xdddddd);
  b.box(0.4, 0.06, 0.1, 0, 0.55, 0.38, 0x15151a);                             // cash slot
  b.box(0.95, 0.1, 0.8, 0, 1.75, 0, 0x2a6bd6);                                // sign
  b.box(0.8, 0.12, 0.04, 0, 1.75, 0.41, 0xffd23a);
  return b.build();
}

/** Street machines: vending machines (a drink restores health) and ATMs (take out money you saved at the bank). */
export class Machines {
  readonly list: Machine[] = [];
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private game: Game) {
    const rng = makeRng(31337);
    const EDGE = 1.4;
    for (const lot of game.world.lots) {
      const { x0, x1, z0, z1, district } = lot;
      if (district !== 'downtown' && district !== 'oldtown' && district !== 'plaza' && district !== 'harbor') continue;
      const top = rng() < 0.5;
      const z = top ? z0 + EDGE + 0.6 : z1 - EDGE - 0.6, rot = top ? 0 : Math.PI;
      if (rng() < 0.55) this.list.push({ kind: 'vending', x: x0 + 6 + rng() * (x1 - x0 - 12), z, rot, cd: 0 });
      if (district !== 'harbor' && rng() < 0.4) this.list.push({ kind: 'atm', x: x0 + 6 + rng() * (x1 - x0 - 12), z: top ? z1 - EDGE - 0.6 : z0 + EDGE + 0.6, rot: top ? Math.PI : 0, cd: 0 });
    }
    const mat = paletteMaterial();
    const dummy = new THREE.Object3D();
    for (const [kind, geo] of [['vending', vendingGeometry()], ['atm', atmGeometry()]] as const) {
      const items = this.list.filter((m) => m.kind === kind);
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      mesh.count = items.length;
      items.forEach((m, i) => { dummy.position.set(m.x, 0.14, m.z); dummy.rotation.set(0, m.rot, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      game.scene.add(mesh);
      this.meshes.push(mesh);
    }
    for (const m of this.list) game.world.circles.push({ x: m.x, z: m.z, r: 0.75 });
  }

  nearest(x: number, z: number, r = 2.2): Machine | null {
    let best: Machine | null = null, bd = r;
    for (const m of this.list) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  prompt(m: Machine): string {
    if (m.kind === 'vending') return bi('[F] Buy a soda - $5 (+25% health)', '[F] 음료수 구매 - $5 (체력 +25%)');
    const bank = Math.floor(this.game.save.bank ?? 0);
    return bank > 0
      ? `${bi('[F] ATM: withdraw', '[F] ATM 출금')} $${Math.min(500, bank).toLocaleString('en-US')} (${bi('fee', '수수료')} $10)`
      : bi('ATM: no savings (deposit at the Smash Bank)', 'ATM: 저축 없음 (스매시 뱅크에 입금하세요)');
  }

  use(m: Machine): void {
    const G = this.game;
    const pl = G.humans.player;
    if (m.kind === 'vending') {
      if (pl.hp >= pl.maxHp) { G.hud.toast(bi('You are not thirsty!', '목마르지 않아요!')); return; }
      if (!G.pay(5)) return;
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.25);
      G.popups.spawn(pl.x, 3, pl.z, bi('Glug! +HP', '꿀꺽! 체력 회복'), '#ff6b6b');
      return;
    }
    const bank = Math.floor(G.save.bank ?? 0);
    const n = Math.min(500, bank);
    if (n <= 0) { G.hud.toast(bi('No savings to withdraw', '출금할 저축이 없어요')); return; }
    G.save.bank = bank - n;
    G.addCash(n - 10, 'other');
    G.popups.spawn(pl.x, 3, pl.z, `+$${(n - 10).toLocaleString('en-US')}`, '#2a6bd6');
    G.flushSave();
  }
}
