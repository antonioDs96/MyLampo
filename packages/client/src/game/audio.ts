/** Sound effects and a quiet musical bed, all synthesised with WebAudio (no audio files). */

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
  attack?: number;
  delay?: number;
  detune?: number;
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  from: number;
  to?: number;
  q?: number;
  type?: BiquadFilterType;
  attack?: number;
  delay?: number;
}

export type SoundId =
  | 'swing' | 'swingHeavy' | 'shoot' | 'cast' | 'hit' | 'hitHeavy' | 'kill' | 'block' | 'parry' | 'pdodge' | 'dodge'
  | 'hurt' | 'hurtRed' | 'gbreak' | 'down' | 'revive' | 'heal' | 'ability' | 'ult' | 'broken' | 'exec'
  | 'warnBlue' | 'warnRed' | 'slam' | 'drum' | 'silence' | 'spawn' | 'wave' | 'clear' | 'victory' | 'defeat'
  | 'ui' | 'uiBack' | 'deny' | 'charge' | 'chargeFull' | 'mutation' | 'roar' | 'pop' | 'bolt';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicNodes: AudioNode[] = [];
  private mood: 'off' | 'calm' | 'battle' | 'boss' = 'off';
  private beatTimer = 0;
  private beat = 0;
  private readonly last = new Map<string, number>();
  muted = false;

  /** Must be called from a user gesture so the browser allows sound. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 8;
    this.master.connect(limiter).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startDrone();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private hiss(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.from, t0);
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + o.dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }

  /** Metallic ring made of inharmonic partials. */
  private clang(base: number, dur: number, gain: number, delay = 0): void {
    for (const [ratio, g] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]] as const) {
      this.tone({ type: 'sine', from: base * ratio, dur: dur / Math.sqrt(ratio), gain: gain * g, delay });
    }
  }

  play(id: SoundId, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    // Identical sounds landing in the same instant only add loudness, not information.
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < 0.035) return;
    this.last.set(id, now);
    const v = volume;
    switch (id) {
      case 'swing':
        this.hiss({ dur: 0.16, from: 900, to: 2600, gain: 0.16 * v, q: 1.4 });
        break;
      case 'swingHeavy':
        this.hiss({ dur: 0.3, from: 350, to: 1500, gain: 0.26 * v, q: 1.1 });
        break;
      case 'shoot':
        this.hiss({ dur: 0.12, from: 2600, to: 700, gain: 0.15 * v, q: 2 });
        this.tone({ type: 'triangle', from: 880, to: 300, dur: 0.12, gain: 0.08 * v });
        break;
      case 'cast':
        this.tone({ type: 'sine', from: 520, to: 1040, dur: 0.22, gain: 0.1 * v });
        this.hiss({ dur: 0.2, from: 3000, to: 6000, gain: 0.05 * v, q: 3 });
        break;
      case 'hit':
        this.hiss({ dur: 0.09, from: 1800, to: 500, gain: 0.3 * v, q: 0.8 });
        this.tone({ type: 'triangle', from: 190, to: 70, dur: 0.11, gain: 0.26 * v });
        break;
      case 'hitHeavy':
        this.hiss({ dur: 0.16, from: 1400, to: 250, gain: 0.38 * v, q: 0.7 });
        this.tone({ type: 'sine', from: 130, to: 42, dur: 0.24, gain: 0.45 * v });
        break;
      case 'kill':
        this.hiss({ dur: 0.3, from: 900, to: 150, gain: 0.25 * v, q: 0.8 });
        this.tone({ type: 'sawtooth', from: 220, to: 55, dur: 0.3, gain: 0.1 * v });
        break;
      case 'block':
        this.clang(310, 0.16, 0.12 * v);
        this.hiss({ dur: 0.07, from: 1200, gain: 0.2 * v, q: 0.8 });
        break;
      case 'parry':
        this.clang(1180, 0.6, 0.2 * v);
        this.clang(1770, 0.5, 0.1 * v, 0.02);
        this.hiss({ dur: 0.08, from: 5200, gain: 0.25 * v, q: 0.7 });
        break;
      case 'pdodge':
        this.hiss({ dur: 0.34, from: 500, to: 4200, gain: 0.2 * v, q: 1.2 });
        this.tone({ type: 'sine', from: 660, to: 1320, dur: 0.3, gain: 0.12 * v, delay: 0.04 });
        this.tone({ type: 'sine', from: 990, to: 1980, dur: 0.3, gain: 0.07 * v, delay: 0.09 });
        break;
      case 'dodge':
        this.hiss({ dur: 0.2, from: 600, to: 1500, gain: 0.11 * v, q: 0.9 });
        break;
      case 'hurt':
        this.tone({ type: 'sawtooth', from: 160, to: 60, dur: 0.2, gain: 0.2 * v });
        this.hiss({ dur: 0.12, from: 800, to: 250, gain: 0.3 * v, q: 0.7 });
        break;
      case 'hurtRed':
        this.tone({ type: 'sawtooth', from: 120, to: 38, dur: 0.38, gain: 0.3 * v });
        this.hiss({ dur: 0.25, from: 600, to: 120, gain: 0.4 * v, q: 0.6 });
        break;
      case 'gbreak':
        this.clang(180, 0.4, 0.2 * v);
        this.hiss({ dur: 0.3, from: 2400, to: 300, gain: 0.3 * v, q: 0.6 });
        break;
      case 'down':
        this.tone({ type: 'sine', from: 330, to: 55, dur: 0.9, gain: 0.3 * v });
        this.tone({ type: 'triangle', from: 247, to: 41, dur: 1.1, gain: 0.18 * v, delay: 0.05 });
        break;
      case 'revive':
        for (const [i, f] of [392, 494, 587, 784].entries()) this.tone({ type: 'sine', from: f, dur: 0.5, gain: 0.13 * v, delay: i * 0.08 });
        break;
      case 'heal':
        this.tone({ type: 'sine', from: 660, to: 990, dur: 0.3, gain: 0.08 * v });
        break;
      case 'ability':
        this.tone({ type: 'triangle', from: 300, to: 900, dur: 0.28, gain: 0.14 * v });
        this.hiss({ dur: 0.35, from: 1200, to: 5000, gain: 0.1 * v, q: 1.5 });
        break;
      case 'ult':
        this.tone({ type: 'sawtooth', from: 70, to: 280, dur: 0.7, gain: 0.2 * v });
        this.tone({ type: 'sine', from: 220, to: 880, dur: 0.8, gain: 0.16 * v, delay: 0.05 });
        this.hiss({ dur: 0.9, from: 300, to: 6000, gain: 0.2 * v, q: 0.8 });
        this.tone({ type: 'sine', from: 60, to: 30, dur: 0.9, gain: 0.4 * v, delay: 0.35 });
        break;
      case 'broken':
        this.clang(520, 0.5, 0.16 * v);
        this.tone({ type: 'square', from: 180, to: 90, dur: 0.2, gain: 0.08 * v });
        break;
      case 'exec':
        this.hiss({ dur: 0.22, from: 3000, to: 300, gain: 0.4 * v, q: 0.7 });
        this.tone({ type: 'sine', from: 100, to: 34, dur: 0.5, gain: 0.5 * v });
        this.clang(880, 0.5, 0.12 * v, 0.03);
        break;
      case 'warnBlue':
        this.tone({ type: 'sine', from: 1320, dur: 0.22, gain: 0.1 * v });
        this.tone({ type: 'sine', from: 1980, dur: 0.18, gain: 0.05 * v, delay: 0.03 });
        break;
      case 'warnRed':
        this.tone({ type: 'sawtooth', from: 196, to: 233, dur: 0.34, gain: 0.13 * v });
        this.tone({ type: 'sawtooth', from: 277, to: 330, dur: 0.34, gain: 0.09 * v });
        break;
      case 'slam':
        this.tone({ type: 'sine', from: 90, to: 28, dur: 0.6, gain: 0.6 * v });
        this.hiss({ dur: 0.5, from: 500, to: 80, gain: 0.45 * v, q: 0.5, type: 'lowpass' });
        break;
      case 'drum':
        this.tone({ type: 'sine', from: 150, to: 40, dur: 0.7, gain: 0.7 * v });
        this.hiss({ dur: 0.12, from: 900, gain: 0.25 * v, q: 0.6 });
        this.tone({ type: 'sine', from: 75, to: 30, dur: 1.2, gain: 0.3 * v, delay: 0.05 });
        break;
      case 'silence':
        this.tone({ type: 'sine', from: 880, to: 110, dur: 0.9, gain: 0.16 * v });
        this.hiss({ dur: 0.9, from: 5000, to: 200, gain: 0.14 * v, q: 2 });
        break;
      case 'spawn':
        this.hiss({ dur: 0.5, from: 150, to: 700, gain: 0.12 * v, q: 1.5 });
        break;
      case 'wave':
        this.tone({ type: 'sawtooth', from: 110, dur: 0.7, gain: 0.1 * v, attack: 0.1 });
        this.tone({ type: 'sawtooth', from: 165, dur: 0.7, gain: 0.07 * v, attack: 0.15 });
        break;
      case 'clear':
        for (const [i, f] of [523, 659, 784].entries()) this.tone({ type: 'triangle', from: f, dur: 0.4, gain: 0.1 * v, delay: i * 0.09 });
        break;
      case 'victory':
        for (const [i, f] of [392, 523, 659, 784, 1047].entries()) {
          this.tone({ type: 'triangle', from: f, dur: 0.9, gain: 0.14 * v, delay: i * 0.14 });
          this.tone({ type: 'sine', from: f / 2, dur: 0.9, gain: 0.1 * v, delay: i * 0.14 });
        }
        break;
      case 'defeat':
        for (const [i, f] of [392, 349, 294, 196].entries()) this.tone({ type: 'sawtooth', from: f, dur: 0.9, gain: 0.09 * v, delay: i * 0.22 });
        break;
      case 'ui':
        this.tone({ type: 'sine', from: 720, to: 960, dur: 0.07, gain: 0.07 * v });
        break;
      case 'uiBack':
        this.tone({ type: 'sine', from: 620, to: 420, dur: 0.08, gain: 0.07 * v });
        break;
      case 'deny':
        this.tone({ type: 'square', from: 150, to: 110, dur: 0.12, gain: 0.06 * v });
        break;
      case 'charge':
        this.tone({ type: 'sine', from: 180, to: 520, dur: 0.75, gain: 0.07 * v, attack: 0.3 });
        break;
      case 'chargeFull':
        this.tone({ type: 'sine', from: 1040, dur: 0.16, gain: 0.1 * v });
        break;
      case 'mutation':
        this.tone({ type: 'sawtooth', from: 440, to: 55, dur: 1.2, gain: 0.12 * v });
        this.tone({ type: 'sawtooth', from: 466, to: 58, dur: 1.2, gain: 0.12 * v });
        this.hiss({ dur: 1.2, from: 4000, to: 200, gain: 0.2 * v, q: 1 });
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', from: 95, to: 60, dur: 1.1, gain: 0.3 * v, attack: 0.08 });
        this.tone({ type: 'sawtooth', from: 143, to: 88, dur: 1.1, gain: 0.2 * v, attack: 0.08 });
        this.hiss({ dur: 1.1, from: 700, to: 300, gain: 0.3 * v, q: 0.8, attack: 0.1 });
        break;
      case 'pop':
        this.tone({ type: 'sine', from: 420, to: 120, dur: 0.14, gain: 0.16 * v });
        this.hiss({ dur: 0.1, from: 2000, to: 600, gain: 0.14 * v });
        break;
      case 'bolt':
        this.hiss({ dur: 0.25, from: 6000, to: 800, gain: 0.3 * v, q: 0.5 });
        this.tone({ type: 'square', from: 90, to: 40, dur: 0.2, gain: 0.12 * v });
        break;
    }
  }

  // ---------------------------------------------------------------- music

  private startDrone(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    filter.connect(this.music);
    // D minor drone: root, fifth and octave, slightly detuned so it shimmers.
    for (const [f, type, g] of [[73.42, 'sawtooth', 0.22], [110, 'sawtooth', 0.12], [146.83, 'triangle', 0.16], [147.6, 'sine', 0.12], [220.3, 'sine', 0.05]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = g;
      osc.connect(gain).connect(filter);
      osc.start();
      this.musicNodes.push(osc, gain);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 160;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start();
    this.musicNodes.push(filter, lfo, depth);
  }

  setMood(mood: 'off' | 'calm' | 'battle' | 'boss'): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.beat = 0;
    this.beatTimer = 0;
    if (this.ctx && this.music) {
      const level = mood === 'off' ? 0 : mood === 'calm' ? 0.1 : 0.14;
      this.music.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
    }
  }

  /** Drives the war-drum pulse that plays under fights. */
  update(dt: number): void {
    if (!this.ctx || this.muted || this.mood === 'off' || this.mood === 'calm') return;
    const step = this.mood === 'boss' ? 0.3 : 0.36;
    this.beatTimer -= dt;
    if (this.beatTimer > 0) return;
    this.beatTimer += step;
    const b = this.beat++ % 8;
    const pattern = this.mood === 'boss' ? [1, 0, 0.5, 1, 0, 0.5, 1, 0.7] : [1, 0, 0, 0.5, 1, 0, 0.6, 0];
    const hit = pattern[b]!;
    if (hit > 0) {
      this.tone({ type: 'sine', from: 96, to: 44, dur: 0.3, gain: 0.2 * hit });
      this.hiss({ dur: 0.05, from: 500, gain: 0.05 * hit, q: 0.7 });
    }
    if (b % 2 === 1) this.hiss({ dur: 0.04, from: 6500, gain: 0.02, q: 1.5, type: 'highpass' });
  }
}
