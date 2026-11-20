/** Procedural Web Audio: engine, tire screech, crash/smash thuds, siren, cash blip. Zero asset loading. */
export interface AudioState {
  inCar: boolean;
  speedRatio: number; // 0..1.5
  throttle: number;
  slip: number; // 0..1
  nitro: boolean;
  /** Distance to the nearest active siren (m), or null. */
  sirenDist: number | null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private o1!: OscillatorNode;
  private o2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private scrGain!: GainNode;
  private scrFilter!: BiquadFilterNode;
  private sirenOsc!: OscillatorNode;
  private sirenGain!: GainNode;
  private t = 0;
  enabled = true;
  volume = 0.8;

  /** Must be called from a user gesture (the PLAY button). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine: dual osc -> lowpass
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'triangle';
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.o1.connect(this.engFilter); this.o2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.o1.start(); this.o2.start();

    // tire screech: looping noise -> bandpass
    const scr = ctx.createBufferSource(); scr.buffer = this.noiseBuf; scr.loop = true;
    this.scrFilter = ctx.createBiquadFilter(); this.scrFilter.type = 'bandpass'; this.scrFilter.frequency.value = 1700; this.scrFilter.Q.value = 3;
    this.scrGain = ctx.createGain(); this.scrGain.gain.value = 0;
    scr.connect(this.scrFilter); this.scrFilter.connect(this.scrGain); this.scrGain.connect(this.master);
    scr.start();

    // siren
    this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(lp); lp.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  update(dt: number, s: AudioState): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.t += dt;
    const rpm = s.inCar ? 0.12 + Math.min(1.4, s.speedRatio) * 0.9 + s.throttle * 0.06 + (s.nitro ? 0.15 : 0) : 0;
    const base = 52 + rpm * 120;
    this.o1.frequency.setTargetAtTime(base, now, 0.05);
    this.o2.frequency.setTargetAtTime(base * 0.5, now, 0.05);
    this.engFilter.frequency.setTargetAtTime(260 + rpm * 900, now, 0.08);
    this.engGain.gain.setTargetAtTime(s.inCar ? 0.09 + Math.max(0, s.throttle) * 0.05 : 0, now, 0.1);

    this.scrGain.gain.setTargetAtTime(s.inCar ? Math.min(0.2, s.slip * 0.22) : 0, now, 0.05);
    this.scrFilter.frequency.setTargetAtTime(1400 + s.slip * 900, now, 0.1);

    if (s.sirenDist !== null) {
      const wail = 0.5 + 0.5 * Math.sin(this.t * 3.2);
      this.sirenOsc.frequency.setTargetAtTime(650 + wail * 520, now, 0.02);
      this.sirenGain.gain.setTargetAtTime(Math.max(0, 1 - s.sirenDist / 160) * 0.07, now, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.1);
    }
  }

  private burst(dur: number, freq: number, gain: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(ctx.currentTime, Math.random());
    src.stop(ctx.currentTime + dur + 0.05);
  }

  private thud(freq: number, dur: number, gain: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const pitch = 1 + (Math.random() - 0.5) * 0.2; // +/-10% variety
    o.frequency.setValueAtTime(freq * pitch, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35 * pitch, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ctx.currentTime + dur + 0.05);
  }

  crash(strength: number): void {
    const k = Math.min(1, strength / 20);
    this.burst(0.25 + k * 0.3, 2400, 0.25 + k * 0.4);
    this.thud(150, 0.3, 0.4 + k * 0.4);
  }
  smash(): void {
    this.burst(0.22, 3200, 0.3);
    this.thud(210, 0.18, 0.35);
  }
  thump(): void {
    this.thud(120, 0.25, 0.5);
  }
  explosion(): void {
    this.burst(0.9, 900, 0.7);
    this.thud(90, 0.7, 0.7);
  }
  /** Soft low-passed footstep tap. */
  step(): void {
    this.burst(0.07, 500 + Math.random() * 200, 0.07);
  }
  /** Fast-sweeping bandpass whoosh for punches, kicks and swings. */
  whoosh(heavy: boolean): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    const d = heavy ? 0.22 : 0.14;
    f.frequency.setValueAtTime(heavy ? 500 : 900, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(heavy ? 2600 : 3200, ctx.currentTime + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(heavy ? 0.28 : 0.18, ctx.currentTime + d * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(ctx.currentTime, Math.random()); src.stop(ctx.currentTime + d + 0.05);
  }
  /** Pitch-dropping thud + short noise snap; the bat gets a higher, crisper crack. */
  impact(kind: 'punch' | 'kick' | 'bat'): void {
    const bat = kind === 'bat';
    this.thud(bat ? 180 : kind === 'kick' ? 95 : 130, bat ? 0.14 : 0.2, bat ? 0.4 : 0.55);
    this.burst(bat ? 0.09 : 0.07, bat ? 5200 : 2600, bat ? 0.4 : 0.3);
  }
  cash(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const [f, d] of [[880, 0], [1320, 0.07]] as const) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.18);
      o.connect(g); g.connect(this.master);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.2);
    }
  }
}
