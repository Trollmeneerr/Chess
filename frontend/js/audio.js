/**
 * Traditional Wooden Chess Audio Engine
 * High-fidelity wooden piece sound effects using Web Audio API synthesis
 * (move-self, capture, check, castle) with authentic low-pass filtered wooden thuds.
 */
const ChessAudio = {
  ctx: null,

  getContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  },

  play(type = 'move') {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'move') {
        this.playWoodThud(now, 240, 0.22, 0.08);
      } else if (type === 'capture') {
        // Dual wooden collision clack
        this.playWoodClack(now);
      } else if (type === 'check') {
        // Sharp wood knock + subtle harmonic alert
        this.playWoodThud(now, 280, 0.3, 0.09);
        this.playHarmonicPing(now + 0.02, 620, 0.15, 0.14);
      } else if (type === 'castle') {
        // Double move: King thud, then Rook tap
        this.playWoodThud(now, 220, 0.22, 0.07);
        this.playWoodThud(now + 0.11, 270, 0.18, 0.06);
      } else if (type === 'game_over') {
        this.playWoodThud(now, 180, 0.25, 0.22);
        this.playHarmonicPing(now + 0.06, 440, 0.15, 0.35);
      }
    } catch (e) {
      // AudioContext muted/unsupported
    }
  },

  /**
   * Crisp low-pass wooden piece thud
   */
  playWoodThud(time, baseFreq = 240, volume = 0.2, duration = 0.08) {
    const ctx = this.ctx;
    if (!ctx) return;

    // 1. Resonant wood body (sine with fast pitch drop)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + duration);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, time + duration);

    oscGain.gain.setValueAtTime(volume, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);

    // 2. High-frequency wooden surface click transient
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1200, time);
    noiseFilter.Q.setValueAtTime(2.5, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + 0.02);
  },

  /**
   * Heavy double-wood collision clack for captures
   */
  playWoodClack(time) {
    // First piece displacement / strike
    this.playWoodThud(time, 320, 0.28, 0.07);
    // Second secondary bounce / hollow clack
    this.playWoodThud(time + 0.015, 190, 0.24, 0.1);
  },

  playHarmonicPing(time, freq, volume, duration) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration);
  }
};

window.ChessAudio = ChessAudio;
