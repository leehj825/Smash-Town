import type { World } from './world';
import type { CarController } from './carController';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** DOM/canvas HUD: wanted stars, cash, combo bar, minimap, analog speedometer, nitro + HP. */
export class Hud {
  private stars = Array.from(document.querySelectorAll<HTMLElement>('#stars .star'));
  private cash = $('cash');
  private comboFill = $('combo-fill');
  private nitroFill = $('nitro-fill');
  private hpFill = $('hp-fill');
  private speedNum = $('speed-num');
  private mini = $<HTMLCanvasElement>('minimap');
  private miniCtx = this.mini.getContext('2d')!;
  private speedo = $<HTMLCanvasElement>('speedo');
  private speedoCtx = this.speedo.getContext('2d')!;
  private lastCash = -1;
  private lastStars = -1;

  constructor(private world: World) {
    this.setWanted(0);
    this.setCash(12450);
    this.setCombo(0);
  }

  setWanted(n: number): void {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.stars.forEach((s, i) => s.classList.toggle('on', i < n));
  }

  setCash(v: number): void {
    if (v === this.lastCash) return;
    this.lastCash = v;
    this.cash.textContent = '$' + v.toLocaleString('en-US');
  }

  setCombo(f: number): void {
    this.comboFill.style.width = `${Math.round(f * 100)}%`;
  }

  update(car: CarController): void {
    const kmh = Math.round(Math.abs(car.forwardSpeed) * 3.6);
    this.speedNum.textContent = String(kmh);
    this.nitroFill.style.width = `${Math.round(car.nitro * 100)}%`;
    this.nitroFill.classList.toggle('active', car.nitroActive);
    this.hpFill.style.width = `${Math.round(car.hp * 100)}%`;
    this.hpFill.classList.toggle('low', car.hp < 0.3);
    this.drawSpeedo(kmh);
    this.drawMinimap(car);
  }

  private drawSpeedo(kmh: number): void {
    const g = this.speedoCtx;
    const S = this.speedo.width;
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(14,18,28,0.72)';
    g.beginPath(); g.arc(c, c, c - 3, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, c - 6, 0, Math.PI * 2); g.stroke();
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const max = 220;
    g.lineWidth = 2;
    for (let v = 0; v <= max; v += 20) {
      const a = a0 + (v / max) * sweep;
      const r0 = c - 12, r1 = c - (v % 40 === 0 ? 24 : 18);
      g.strokeStyle = v >= 160 ? '#ff4d5e' : '#e8ecf5';
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
    const a = a0 + Math.min(1, kmh / max) * sweep;
    g.strokeStyle = '#ff3b3b'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(c - Math.cos(a) * 8, c - Math.sin(a) * 8);
    g.lineTo(c + Math.cos(a) * (c - 22), c + Math.sin(a) * (c - 22));
    g.stroke();
    g.fillStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, 6, 0, Math.PI * 2); g.fill();
  }

  private drawMinimap(car: CarController): void {
    const g = this.miniCtx;
    const S = this.mini.width;
    const c = S / 2;
    const metersVisible = 150; // diameter of the radar in metres
    const MM = 4; // px per metre in the pre-rendered map
    const scale = S / metersVisible;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2d3b4a'; g.fillRect(0, 0, S, S);
    g.translate(c, c);
    g.rotate(-Math.PI / 2 - Math.atan2(Math.cos(car.heading), Math.sin(car.heading)));
    g.scale(scale / MM, scale / MM);
    g.drawImage(this.world.minimapCanvas, -(car.position.x + 40) * MM, -(car.position.z + 40) * MM);
    g.restore();
    // frame
    g.lineWidth = 3; g.strokeStyle = '#e8ecf5';
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
    // player arrow (always pointing up)
    g.fillStyle = '#ffd500'; g.strokeStyle = '#1a1a24'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c + 6.5, c + 8); g.lineTo(c, c + 4); g.lineTo(c - 6.5, c + 8); g.closePath();
    g.fill(); g.stroke();
  }
}
