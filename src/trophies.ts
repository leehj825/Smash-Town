import * as THREE from 'three';
import type { Game } from './game';
import type { Room } from './interiors';
import { MeshBuilder, paletteMaterial } from './geo';

/**
 * Trophies on the shelf in your house. Rebuilt each time you walk in, from what you have done: a gold star for every five you collected, a cup for each
 * race you won, a flag for each block you hold, and a golden statue once the story is finished. A handful of boxes and cylinders, nothing more.
 */
export class Trophies {
  private mesh: THREE.Mesh | null = null;

  constructor(private game: Game) {}

  /** How many of each, for the shelf (and the tests). */
  counts(): { stars: number; cups: number; flags: number; statue: boolean } {
    const G = this.game;
    return {
      stars: Math.min(4, Math.floor((G.save.collected?.length ?? 0) / 5)),
      cups: Math.min(3, (G.save.raceBest ?? []).filter((t) => t > 0).length),
      flags: Math.min(4, G.save.turf?.length ?? 0),
      statue: G.mode === 'story' && G.story.done,
    };
  }

  refresh(room: Room): void {
    const G = this.game;
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh = null; }
    const c = this.counts();
    const b = new MeshBuilder();
    const ox = room.ox, oz = room.oz - 4.55;
    b.box(7.4, 0.12, 0.7, ox - 2.2, 1.9, oz, 0x6b4a2e); // the shelf
    let x = ox - 5.4;
    for (let i = 0; i < c.stars; i++, x += 0.9) {
      b.box(0.12, 0.12, 0.12, x, 2.0, oz, 0x3a3a44);
      b.add(new THREE.OctahedronGeometry(0.28, 0), 0xffd23a, new THREE.Matrix4().makeTranslation(x, 2.4, oz));
    }
    for (let i = 0; i < c.cups; i++, x += 0.9) {
      b.cylinder(0.3, 0.2, 0.08, 8, x, 2.0, oz, 0x6b4a2e);
      b.cylinder(0.26, 0.1, 0.5, 8, x, 2.35, oz, 0xe6c14a);
      b.cylinder(0.05, 0.05, 0.25, 6, x, 2.15, oz, 0xe6c14a);
    }
    for (let i = 0; i < c.flags; i++, x += 0.9) {
      b.box(0.05, 0.9, 0.05, x, 2.5, oz, 0xdddddd);
      b.box(0.5, 0.3, 0.04, x + 0.28, 2.8, oz, 0xd62d3a);
    }
    if (c.statue) {
      b.box(0.5, 0.2, 0.5, ox + 1.0, 2.0, oz, 0x3a3a44);
      b.cylinder(0.12, 0.2, 0.6, 8, ox + 1.0, 2.4, oz, 0xffd23a);
      b.add(new THREE.IcosahedronGeometry(0.2, 0), 0xffd23a, new THREE.Matrix4().makeTranslation(ox + 1.0, 2.9, oz));
    }
    this.mesh = new THREE.Mesh(b.build(), paletteMaterial({ emissive: 0x221a00, emissiveIntensity: 0.5 }));
    G.interiors.group.add(this.mesh);
  }
}
