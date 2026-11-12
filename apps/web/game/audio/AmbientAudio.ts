/**
 * Procedural ambience: there are no audio files. A looped noise buffer is
 * filtered into a low wind bed and, in the forest, a thin high "whisper";
 * an occasional distant howl is a swept sine tone.
 *
 * Browsers only allow audio after a user gesture, so nothing is created
 * until `unlock()` is called from one.
 */
export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private whisperGain: GainNode | null = null;
  private muted = false;
  private howlIn = 14;
  private time = 0;

  /** True once audio is running and not muted. */
  get audible(): boolean {
    return this.context?.state === "running" && !this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Start audio. Must be called from a user gesture; safe to call again. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    let context: AudioContext;
    try {
      context = new AudioContextClass();
    } catch {
      return;
    }
    this.context = context;

    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 1;
    master.connect(context.destination);
    this.master = master;

    // Two seconds of white noise, looped, feeds both layers.
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const windFilter = context.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 320;
    windFilter.Q.value = 0.6;
    const windGain = context.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(master);
    this.windFilter = windFilter;
    this.windGain = windGain;

    const whisperFilter = context.createBiquadFilter();
    whisperFilter.type = "bandpass";
    whisperFilter.frequency.value = 2600;
    whisperFilter.Q.value = 1.4;
    const whisperGain = context.createGain();
    whisperGain.gain.value = 0;
    noise.connect(whisperFilter).connect(whisperGain).connect(master);
    this.whisperGain = whisperGain;

    noise.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.context.currentTime,
        0.08,
      );
    }
  }

  /**
   * Blend the ambience for where the player is. `wild` runs from 0 in the
   * village to 1 deep in the forest.
   */
  update(dt: number, wild: number): void {
    const { context, windGain, windFilter, whisperGain } = this;
    if (!context || !windGain || !windFilter || !whisperGain) return;
    this.time += dt;
    const now = context.currentTime;

    // Slow gusts: two detuned sines swell the wind and open the filter.
    const gust =
      0.5 +
      0.3 * Math.sin(this.time * 0.37) +
      0.2 * Math.sin(this.time * 0.91 + 1.7);
    windGain.gain.setTargetAtTime((0.05 + 0.09 * wild) * (0.6 + gust), now, 0.4);
    windFilter.frequency.setTargetAtTime(240 + 260 * gust + 160 * wild, now, 0.4);
    whisperGain.gain.setTargetAtTime(
      0.012 * wild * (0.4 + Math.max(0, Math.sin(this.time * 0.23))),
      now,
      0.6,
    );

    if (wild > 0.6) {
      this.howlIn -= dt;
      if (this.howlIn <= 0) {
        this.howl();
        this.howlIn = 28 + Math.random() * 30;
      }
    }
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }

  /** A distant howl: a sine tone that rises, holds, and falls away. */
  private howl(): void {
    const { context, master } = this;
    if (!context || !master || this.muted) return;
    const now = context.currentTime;
    const base = 300 + Math.random() * 60;

    const tone = context.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(base, now);
    tone.frequency.linearRampToValueAtTime(base * 1.45, now + 0.7);
    tone.frequency.linearRampToValueAtTime(base * 1.38, now + 1.6);
    tone.frequency.linearRampToValueAtTime(base * 0.9, now + 2.4);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.035, now + 0.5);
    envelope.gain.linearRampToValueAtTime(0.028, now + 1.6);
    envelope.gain.linearRampToValueAtTime(0, now + 2.5);

    // Muffle it so it sounds far off.
    const distance = context.createBiquadFilter();
    distance.type = "lowpass";
    distance.frequency.value = 900;

    tone.connect(distance).connect(envelope).connect(master);
    tone.start(now);
    tone.stop(now + 2.6);
  }
}
