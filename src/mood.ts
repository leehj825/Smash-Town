import * as THREE from 'three';
import type { Game } from './game';
import { MeshBuilder, paletteMaterial } from './geo';

const FLAGS = [0xff4d6d, 0xffd23a, 0x4dd2ff, 0x7dff6a, 0xc77dff];

/** The town reacts to the story: after "Save the Day" the plaza fills with flags and bunting and fireworks go off now and then. */
export class Mood {
  private group: THREE.Group | null = null;
  private fwT = 6;

  constructor(private game: Game) {}

  /** The first arc is finished (the town is saved). */
  get saved(): boolean { return this.game.story.ch >= 5; }

  private build(): THREE.Group {
    const g = this.game;
    const h = g.world.landmarks.story.hall;
    const b = new MeshBuilder();
    const rng = (() => { let s = 77; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = h.x + Math.cos(a) * 11, z = h.z + Math.sin(a) * 11;
      b.box(0.18, 6, 0.18, x, 3, z, 0xdddddd);
      b.box(1.6, 0.9, 0.06, x + 0.9, 5.4, z, FLAGS[i % FLAGS.length]);
      // bunting to the next pole
      const a2 = ((i + 1) / 10) * Math.PI * 2;
      const x2 = h.x + Math.cos(a2) * 11, z2 = h.z + Math.sin(a2) * 11;
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        b.box(0.35, 0.35, 0.05, x + (x2 - x) * t, 5.6 - Math.sin(t * Math.PI) * 0.8, z + (z2 - z) * t, FLAGS[(i + k) % FLAGS.length]);
      }
    }
    void rng;
    const mesh = new THREE.Mesh(b.build(), paletteMaterial());
    const grp = new THREE.Group();
    grp.add(mesh);
    g.scene.add(grp);
    return grp;
  }

  update(dt: number): void {
    const g = this.game;
    if (!this.saved) { if (this.group) this.group.visible = false; return; }
    if (!this.group) this.group = this.build();
    this.group.visible = true;
    // occasional fireworks over the plaza while the player is around
    const h = g.world.landmarks.story.hall;
    if (Math.hypot(g.focusX - h.x, g.focusZ - h.z) < 140) {
      this.fwT -= dt;
      if (this.fwT <= 0) {
        this.fwT = 7 + Math.random() * 6;
        const x = h.x + (Math.random() - 0.5) * 40, z = h.z + (Math.random() - 0.5) * 40, y = 18 + Math.random() * 10;
        const colors = [0xff4d6d, 0xffd23a, 0x4dd2ff, 0x7dff6a, 0xc77dff];
        g.vfx.emitDebris(x, y, z, 0, 0, colors[Math.floor(Math.random() * colors.length)], 12);
        g.vfx.emitSparks(x, y, z, 6);
      }
    }
  }
}
