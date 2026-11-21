import type { AudioEngine } from './audio';

/** A tiny procedural radio: one mellow "Beach Chill" station played by a step sequencer on Web Audio (no assets). */
const STEP = 60 / 96 / 2; // eighth notes at 96 bpm
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 48, notes: [60, 64, 67, 71] }, // Cmaj7
  { root: 43, notes: [55, 59, 62, 66] }, // G6
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Radio {
  private on = false;
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private duck = 1;
  readonly name = 'Beach Chill';

  constructor(private audio: AudioEngine) {}

  get enabled(): boolean { return this.on; }

  setEnabled(on: boolean): void {
    this.on = on;
    const ctx = this.audio.context;
    if (!on || !ctx) { window.clearInterval(this.timer); this.timer = 0; if (this.bus && ctx) this.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.1); return; }
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.connect(this.audio.output!);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    this.bus.gain.setTargetAtTime(0.22 * this.duck, ctx.currentTime, 0.1);
    if (!this.timer) { this.nextT = ctx.currentTime + 0.1; this.timer = window.setInterval(() => this.pump(), 40); }
  }

  /** Lower the music under sirens (0 = silent, 1 = normal). */
  setDuck(v: number): void {
    this.duck = v;
    const ctx = this.audio.context;
    if (this.on && this.bus && ctx) this.bus.gain.setTargetAtTime(0.22 * v, ctx.currentTime, 0.15);
  }

  private pump(): void {
    const ctx = this.audio.context;
    if (!ctx || !this.on || ctx.state !== 'running') { if (ctx && ctx.state === 'suspended') this.nextT = ctx.currentTime + 0.1; return; }
    while (this.nextT < ctx.currentTime + 0.25) { this.play(this.step, this.nextT); this.nextT += STEP; this.step = (this.step + 1) % 64; }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack = 0.01, lp = 0): void {
    const ctx = this.audio.context!;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g); g.connect(this.bus!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.audio.context!;
    const s = ctx.createBufferSource(); s.buffer = this.noise!;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.bus!);
    s.start(t); s.stop(t + 0.07);
  }

  private play(step: number, t: number): void {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = CHORDS[bar];
    if (s === 0) for (const n of ch.notes) this.tone(mtof(n), t, STEP * 15, 'triangle', 0.045, 0.35, 1400); // pad
    if (s === 0 || s === 6 || s === 10) this.tone(mtof(ch.root - 12), t, STEP * 2.4, 'sine', 0.28, 0.01); // bass
    if (s === 0 || s === 8) this.tone(60, t, 0.16, 'sine', 0.35, 0.002); // soft kick
    if (s % 2 === 1) this.hat(t, 0.05);
    if (s === 4 || s === 12) this.hat(t, 0.09);
    const arp = [0, 2, 1, 3, 2, 1, 3, 2];
    if (s % 2 === 0) this.tone(mtof(ch.notes[arp[(s / 2) % 8]] + 12), t, STEP * 1.6, 'square', 0.03, 0.005, 2200);
  }
}
