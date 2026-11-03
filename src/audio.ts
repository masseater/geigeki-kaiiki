// 効果音は WebAudio でその場で合成する（音源ファイルなし）

export interface Listener {
  x: number;
  z: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** ユーザー操作の中で呼ぶ（ブラウザは操作前の再生を許さない） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private burst(vol: number, freq: number, dur: number, type: BiquadFilterType = 'lowpass'): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || vol <= 0.01) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.3), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, at = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private nearness(l: Listener, x: number, z: number): number {
    return Math.max(0, Math.min(1, 1 - Math.hypot(x - l.x, z - l.z) / 900));
  }

  gun(l: Listener, x: number, z: number, big: boolean): void {
    this.burst((big ? 0.9 : 0.55) * (0.25 + 0.75 * this.nearness(l, x, z)), big ? 700 : 1100, big ? 0.7 : 0.45);
  }

  boom(l: Listener, x: number, z: number, big: boolean): void {
    this.burst((big ? 1 : 0.6) * (0.3 + 0.7 * this.nearness(l, x, z)), big ? 380 : 600, big ? 1.4 : 0.8);
  }

  splash(l: Listener, x: number, z: number): void {
    const v = this.nearness(l, x, z);
    if (v > 0.55) this.burst(0.18 * v, 2200, 0.35, 'bandpass');
  }

  alarm(): void {
    this.tone(880, 0.12, 0.12);
    this.tone(660, 0.12, 0.12, 0.16);
    this.tone(880, 0.12, 0.12, 0.32);
  }

  lock(): void {
    this.tone(1320, 0.06, 0.06);
  }
}
