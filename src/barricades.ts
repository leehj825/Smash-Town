import * as THREE from 'three';
import type { Game } from './game';
import { MeshBuilder, paletteMaterial } from './geo';
import type { BoxCollider } from './world';

interface Barricade { box: BoxCollider; mesh: THREE.Mesh; x: number; z: number; broken: number; alongX: boolean }

/**
 * Wooden barricades across the edge of a park, plaza or beach, a few metres wide, striped yellow and black. On foot you cannot pass; a car at
 * speed (about 30 km/h or more) goes straight through, splintering them, and loses a little speed and health. Police cars do not smash them,
 * so a barricade makes a shortcut that only you can take. They are rebuilt after ninety seconds.
 */
export class Barricades {
  readonly list: Barricade[] = [];
  private geoX: THREE.BufferGeometry;
  private group = new THREE.Group();
  private built = false;

  constructor(private game: Game) {
    game.scene.add(this.group);
    const make = (w: number, d: number): THREE.BufferGeometry => {
      const b = new MeshBuilder();
      b.box(w, 0.12, d, 0, 0.6, 0, 0xb8864a);
      b.box(w, 0.12, d, 0, 0.95, 0, 0xb8864a);
      for (let i = 0; i < 6; i++) {
        const t = -w / 2 + (i + 0.5) * (w / 6), col = i % 2 ? 0x15151a : 0xffd23a;
        if (d > w) b.box(w + 0.02, 0.08, 0.45, 0, 0.7 + i * 0.02, -d / 2 + (i + 0.5) * (d / 6), col);
        else b.box(0.45, 0.08, d + 0.02, t, 0.7 + i * 0.02, 0, col);
      }
      b.box(0.14, 1.1, 0.14, -w / 2 + 0.1, 0.55, -d / 2 + 0.1, 0x4a3a28); b.box(0.14, 1.1, 0.14, w / 2 - 0.1, 0.55, d / 2 - 0.1, 0x4a3a28);
      return b.build();
    };
    this.geoX = make(6, 0.4);
  }

  private build(): void {
    const G = this.game;
    this.built = true;
    const mat = paletteMaterial();
    let n = 0;
    for (const l of G.world.lots) {
      if (n >= 8) break;
      if (l.district !== 'park' && l.district !== 'plaza' && l.district !== 'beach') continue;
      // the middle of the lot's north edge (just inside it)
      const x = (l.x0 + l.x1) / 2, z = l.z0 + 1.2;
      const box: BoxCollider = { minX: x - 3, maxX: x + 3, minZ: z - 0.3, maxZ: z + 0.3, h: 1.1 };
      if (G.world.boxes.some((b) => x + 3 > b.minX && x - 3 < b.maxX && z + 0.3 > b.minZ && z - 0.3 < b.maxZ)) continue;
      const mesh = new THREE.Mesh(this.geoX, mat);
      mesh.position.set(x, 0, z);
      mesh.castShadow = true;
      this.group.add(mesh);
      G.world.boxes.push(box);
      this.list.push({ box, mesh, x, z, broken: 0, alongX: true });
      n++;
    }
  }

  /** Splinter one (a car drove through it, or a test did). */
  smash(b: Barricade): void {
    const G = this.game;
    if (b.broken > 0) return;
    b.broken = 90;
    b.mesh.visible = false;
    const i = G.world.boxes.indexOf(b.box);
    if (i >= 0) G.world.boxes.splice(i, 1);
    G.vfx.emitDebris(b.x, 1, b.z, 0, 0, 0xb8864a, 12);
    G.vfx.emitDust(b.x, b.z, 0, 0, 6);
    if (G.nearPlayer(b.x, b.z, 70)) G.audio.smash();
  }

  update(dt: number): void {
    const G = this.game;
    if (!this.built && G.state === 'play') this.build();
    for (const b of this.list) {
      if (b.broken > 0) {
        b.broken -= dt;
        if (b.broken <= 0) { b.mesh.visible = true; b.broken = 0; G.world.boxes.push(b.box); }
        continue;
      }
      for (const v of G.vehicles) {
        if (v.ai !== 'player' || v.ctrl.speed < 8) continue;
        if (v.x > b.box.minX - 2.2 && v.x < b.box.maxX + 2.2 && v.z > b.box.minZ - 2.2 && v.z < b.box.maxZ + 2.2) {
          this.smash(b);
          v.ctrl.vx *= 0.75; v.ctrl.vz *= 0.75;
          v.ctrl.damage(0.03);
          break;
        }
      }
    }
  }
}
