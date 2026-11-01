/** Fully synthesized soundscape — no external assets. */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this.alarmOn = false;
    this.alarmT = 0;
    this.laserBudget = 0;
    this.lowT = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.comp.connect(this.master);

    this.noiseBuf = this.makeNoise(2.5);
    this.buildAmbient();
    this.ready = true;
  }

  async resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  buildAmbient() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.5;
    bus.connect(this.comp);

    // deep engine drone
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 2.2;
    filter.connect(bus);

    const g = ctx.createGain();
    g.gain.value = 0.055;
    g.connect(filter);

    for (const [freq, det, type, amp] of [
      [41.2, 0, 'sawtooth', 1],
      [55, 4, 'sawtooth', 0.55],
      [82.4, -6, 'sine', 0.4],
      [110, 3, 'triangle', 0.16],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start();
    }

    // slow filter sweep
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.035;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // airy noise bed
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 620;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    noise.connect(nf).connect(ng).connect(bus);
    noise.start();

    // shimmer
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 1180;
    const sg = ctx.createGain();
    sg.gain.value = 0.0035;
    const trem = ctx.createOscillator();
    trem.frequency.value = 0.11;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.0025;
    trem.connect(tremG).connect(sg.gain);
    trem.start();
    shimmer.connect(sg).connect(bus);
    shimmer.start();

    this.ambientBus = bus;
    this.ambientFilter = filter;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, t, 0.06);
    }
  }

  setAlarm(on) {
    this.alarmOn = on;
    if (!on) this.alarmT = 0;
  }

  setThreat(v) {
    if (!this.ambientFilter) return;
    const t = this.ctx.currentTime;
    this.ambientFilter.frequency.setTargetAtTime(190 + v * 420, t, 1.5);
    this.ambientBus.gain.setTargetAtTime(0.45 + v * 0.35, t, 1.5);
  }

  update(dt) {
    if (!this.ready || this.muted) return;
    this.laserBudget = Math.max(0, this.laserBudget - dt * 9);
    if (this.alarmOn) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) {
        this.alarmT = 1.65;
        this.siren();
      }
      this.lowT -= dt;
      if (this.lowT <= 0) {
        this.lowT = 2.1;
        this.thump();
      }
    }
  }

  /* ------------------------------------------------------------------ sfx */
  siren() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    o.connect(f).connect(g).connect(this.comp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.frequency.setValueAtTime(392, t);
    o.frequency.linearRampToValueAtTime(523, t + 0.32);
    o.frequency.linearRampToValueAtTime(392, t + 0.66);
    o.start(t);
    o.stop(t + 0.78);
  }

  thump() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 0.62);
  }

  laser() {
    if (!this.ready || this.muted || this.laserBudget > 5) return;
    this.laserBudget += 1;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    o.frequency.setValueAtTime(1500 + Math.random() * 900, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(f).connect(g).connect(p).connect(this.comp);
    o.start(t);
    o.stop(t + 0.15);
  }

  impact() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(f).connect(g).connect(this.comp);
    src.start(t, Math.random());
    src.stop(t + 0.32);
  }

  explosion(big = false) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 4200 : 2200, t);
    f.frequency.exponentialRampToValueAtTime(80, t + (big ? 1.8 : 0.7));
    const g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.42 : 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 2.0 : 0.8));
    src.connect(f).connect(g).connect(this.comp);
    src.start(t, Math.random());
    src.stop(t + (big ? 2.1 : 0.9));

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 70 : 95, t);
    o.frequency.exponentialRampToValueAtTime(28, t + (big ? 1.4 : 0.5));
    const og = ctx.createGain();
    og.gain.setValueAtTime(big ? 0.3 : 0.1, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.5 : 0.55));
    o.connect(og).connect(this.comp);
    o.start(t);
    o.stop(t + (big ? 1.6 : 0.6));
  }

  shield() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.34);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 0.44);
  }

  ui() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 0.1);
  }

  repair() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.comp);
      o.start(t);
      o.stop(t + 0.36);
    });
  }

  boss() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(36, t);
      o.detune.value = det;
      o.frequency.exponentialRampToValueAtTime(24, t + 2.2);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(f).connect(g).connect(this.comp);
      o.start(t);
      o.stop(t + 2.5);
    }
    this.explosion(false);
  }

  victory() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.12;
      for (const [type, amp, mult] of [['sine', 0.07, 1], ['triangle', 0.035, 2]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.connect(g).connect(this.comp);
        o.start(t);
        o.stop(t + 1.45);
      }
    });
  }

  type() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2100 + Math.random() * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.006, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.comp);
    o.start(t);
    o.stop(t + 0.035);
  }
}
