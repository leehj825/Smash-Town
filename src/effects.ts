import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

/** Cached procedural comic-burst texture for a word (e.g. POW!, SMASH!). */
function burstTexture(word: string, color: string): THREE.CanvasTexture {
  const key = word + color;
  let tex = cache.get(key);
  if (tex) return tex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  // starburst
  g.translate(S / 2, S / 2);
  g.beginPath();
  const spikes = 12;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 120 : 76;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = color; g.fill();
  g.lineWidth = 8; g.strokeStyle = '#1a1a24'; g.stroke();
  g.rotate(-0.12);
  g.font = '900 54px Montserrat, "Noto Sans KR", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#1a1a24'; g.strokeText(word, 0, 4);
  g.fillStyle = '#ffffff'; g.fillText(word, 0, 4);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

interface Pop { sprite: THREE.Sprite; t: number; life: number; y0: number }

/** Pooled world-space billboard popups with a bouncy scale-in. */
export class Popups {
  readonly group = new THREE.Group();
  private pool: Pop[] = [];
  private next = 0;

  constructor(n = 8) {
    for (let i = 0; i < n; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(sprite);
      this.pool.push({ sprite, t: 0, life: 0, y0: 0 });
    }
  }

  spawn(x: number, y: number, z: number, word: string, color = '#ff3b3b'): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const mat = p.sprite.material as THREE.SpriteMaterial;
    mat.map = burstTexture(word, color);
    mat.needsUpdate = true;
    mat.opacity = 1;
    p.sprite.position.set(x, y, z);
    p.sprite.visible = true;
    p.t = 0;
    p.life = 0.75;
    p.y0 = y;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      if (p.t >= p.life) { p.sprite.visible = false; continue; }
      const u = p.t / p.life;
      // overshoot-and-settle scale
      const k = p.t < 0.2 ? Math.sin((p.t / 0.2) * Math.PI * 0.5) * 1.25 : 1.25 - 0.25 * Math.min(1, (p.t - 0.2) / 0.12);
      const sc = 1.7 * k * (u > 0.7 ? 1 - (u - 0.7) / 0.3 * 0.3 : 1);
      p.sprite.scale.set(sc, sc, 1);
      p.sprite.position.y = p.y0 + u * 0.7;
      (p.sprite.material as THREE.SpriteMaterial).opacity = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    }
  }
}

/** Curved flat slash ribbon that fades over 0.14 s. */
export class SlashTrail {
  readonly mesh: THREE.Mesh;
  private t = 1;

  constructor() {
    const geo = new THREE.RingGeometry(1.0, 2.1, 20, 1, 0, Math.PI * 0.72);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: 0xfff1a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }),
    );
    this.mesh.visible = false;
  }

  /** Sweep arc centred on the facing direction. */
  fire(x: number, y: number, z: number, heading: number): void {
    this.mesh.position.set(x, y, z);
    // ring arc spans angle 0..0.72*PI (centre 0.36*PI); rotate so that centre faces `heading`
    this.mesh.rotation.set(0, heading - Math.PI / 2 - Math.PI * 0.36, 0);
    this.mesh.visible = true;
    this.t = 0;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt;
    const u = this.t / 0.14;
    if (u >= 1) { this.mesh.visible = false; return; }
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u);
  }
}
