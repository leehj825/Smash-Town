import type { AudioEngine } from './audio';

/** A tiny procedural radio with three stations, each played by a step sequencer on Web Audio (no assets). */
interface Station { id: number; en: string; ko: string; step: number; chords: { root: number; notes: number[] }[] }
const bpm = (b: number) => 60 / b / 2; // eighth notes

export const STATIONS: Station[] = [
  { id: 0, en: 'Beach Chill', ko: '비치 칠', step: bpm(96), chords: [
    { root: 45, notes: [57, 60, 64, 67] }, { root: 41, notes: [53, 57, 60, 64] }, { root: 48, notes: [60, 64, 67, 71] }, { root: 43, notes: [55, 59, 62, 66] },
  ] },
  { id: 1, en: 'Downtown Synth', ko: '다운타운 신스', step: bpm(112), chords: [
    { root: 38, notes: [62, 65, 69, 72] }, { root: 34, notes: [58, 62, 65, 69] }, { root: 41, notes: [57, 60, 65, 69] }, { root: 36, notes: [60, 64, 67, 71] },
  ] },
  { id: 2, en: 'Harbor Industrial', ko: '하버 인더스트리얼', step: bpm(92), chords: [
    { root: 33, notes: [45, 52, 57] }, { root: 33, notes: [45, 51, 57] }, { root: 31, notes: [43, 50, 55] }, { root: 29, notes: [41, 48, 53] },
  ] },
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
  /** Current station index (0-2). */
  station = 0;

  constructor(private audio: AudioEngine) {}

  get enabled(): boolean { return this.on; }
  get name(): string { return STATIONS[this.station].en; }
  get nameKo(): string { return STATIONS[this.station].ko; }

  setStation(i: number): void { this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length; this.step = 0; }

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
    while (this.nextT < ctx.currentTime + 0.25) {
      this.play(this.step, this.nextT);
      this.nextT += STATIONS[this.station].step;
      this.step = (this.step + 1) % 64;
    }
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

  private hat(t: number, vol: number, hp = 7000, dur = 0.05): void {
    const ctx = this.audio.context!;
    const s = ctx.createBufferSource(); s.buffer = this.noise!;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus!);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /** Band-passed noise: claps and metallic clanks. */
  private clank(t: number, vol: number, freq: number, dur: number): void {
    const ctx = this.audio.context!;
    const s = ctx.createBufferSource(); s.buffer = this.noise!;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.bus!);
    s.start(t); s.stop(t + dur + 0.02);
  }

  private play(step: number, t: number): void {
    const st = STATIONS[this.station];
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = st.chords[bar];
    const L = st.step;
    if (this.station === 0) {
      if (s === 0) for (const n of ch.notes) this.tone(mtof(n), t, L * 15, 'triangle', 0.045, 0.35, 1400); // pad
      if (s === 0 || s === 6 || s === 10) this.tone(mtof(ch.root - 12), t, L * 2.4, 'sine', 0.28, 0.01); // bass
      if (s === 0 || s === 8) this.tone(60, t, 0.16, 'sine', 0.35, 0.002); // soft kick
      if (s % 2 === 1) this.hat(t, 0.05);
      if (s === 4 || s === 12) this.hat(t, 0.09);
      const arp = [0, 2, 1, 3, 2, 1, 3, 2];
      if (s % 2 === 0) this.tone(mtof(ch.notes[arp[(s / 2) % 8]] + 12), t, L * 1.6, 'square', 0.03, 0.005, 2200);
    } else if (this.station === 1) {
      // four on the floor, off-beat saw bass, sparkling arpeggio and a clap on 2 and 4
      if (s % 4 === 0) this.tone(55, t, 0.18, 'sine', 0.42, 0.002);
      if (s % 2 === 1) this.tone(mtof(ch.root), t, L * 0.9, 'sawtooth', 0.12, 0.005, 700);
      if (s === 4 || s === 12) this.clank(t, 0.16, 1700, 0.12);
      if (s % 2 === 0) this.hat(t + L * 0.5, 0.04, 9000, 0.03);
      const pat = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
      this.tone(mtof(ch.notes[pat[s] % ch.notes.length] + 12), t, L * 1.3, 'sawtooth', 0.028, 0.004, 3000);
      if (s === 0) for (const n of ch.notes.slice(0, 3)) this.tone(mtof(n), t, L * 15, 'sawtooth', 0.014, 0.4, 1100);
    } else {
      // heavy, slow and metallic
      if (s === 0 || s === 6 || s === 10) this.tone(48, t, 0.28, 'sine', 0.55, 0.003);
      if (s === 0) { this.tone(mtof(ch.root), t, L * 16, 'sawtooth', 0.07, 0.6, 260); this.tone(mtof(ch.root) * 1.005, t, L * 16, 'sawtooth', 0.07, 0.6, 260); }
      if (s === 2 || s === 7 || s === 11 || s === 14) this.clank(t, 0.14, 2400 + (s % 3) * 600, 0.1);
      if (s % 4 === 2) this.hat(t, 0.06, 5000, 0.07);
      if (s === 8 || s === 15) this.tone(mtof(ch.notes[(s + bar) % ch.notes.length] + 24), t, L * 2, 'triangle', 0.035, 0.005, 1800);
    }
  }
}
