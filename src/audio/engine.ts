import { CHOKE_GROUP, KITS, type DrumId, type KitId } from "../drums/kits";
import { playDrumHit, type DrumHit } from "../drums/drumSynth";
import { VOICES, type VoiceId } from "../instruments/voices";
import { midiToFreq } from "../scales/scales";
import { driveCurve, filterMultiplier, velocityGain } from "./curves";
import { qualityConfig, type AudioQuality } from "./quality";

export type VoiceHandle = { id: number };

/**
 * Where a source's sound goes. Dry and both sends share one gain law so a muted
 * loop track also silences its reverb/delay contribution.
 */
export type Bus = { dry: GainNode; reverb: GainNode; delay: GainNode };

type ActiveVoice = {
  id: number;
  amp: GainNode;
  sources: AudioScheduledSourceNode[];
  release: number;
  startedAt: number;
  released: boolean;
};

/** `bass` / `mid` / `treble` are master EQ gains in dB (±12). */
export type MixSettings = {
  volume: number;
  reverb: number;
  drive: number;
  filter: number;
  bass: number;
  mid: number;
  treble: number;
};
export type FxId = "riser" | "downer" | "tom_fill" | "snare_roll";

const MAX_VOICES = 48;

/**
 * Owns the AudioContext and every node. Live keys call it directly from the key event;
 * text and loop playback call it with future `at` times from the transport scheduler.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private nextId = 1;
  private voices = new Map<number, ActiveVoice>();
  private ringing: { group: string; hit: DrumHit }[] = [];
  private mix: MixSettings = { volume: 0.8, reverb: 0.3, drive: 0.3, filter: 0.5, bass: 0, mid: 0, treble: 0 };

  private input!: GainNode;
  private shaper!: WaveShaperNode;
  private master!: GainNode;
  private eqLow!: BiquadFilterNode;
  private eqMid!: BiquadFilterNode;
  private eqHigh!: BiquadFilterNode;
  private reverbSend!: GainNode;
  private reverbReturn!: GainNode;
  private delaySend!: GainNode;
  private noise!: AudioBuffer;
  private mainBus!: Bus;
  private recordTap: MediaStreamAudioDestinationNode | null = null;
  private clickOut!: GainNode;
  private quality: AudioQuality = "high";
  private outputDeviceId = "";
  private limiter!: DynamicsCompressorNode;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Output latency estimate in ms (base + device), when the browser reports it. */
  latencyMs(): number | null {
    if (!this.ctx) return null;
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((this.ctx.baseLatency + out) * 1000);
  }

  async start(): Promise<void> {
    if (!this.ctx) this.build();
    if (this.ctx!.state !== "running") await this.ctx!.resume();
  }

  private build() {
    // A numeric hint of 0 asks for the smallest buffer the device allows; "interactive" is often larger on Windows.
    const ctx = new AudioContext({ latencyHint: 0 });
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = qualityConfig(this.quality).shaperOversample;
    const postDrive = ctx.createGain();
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    const limiter = this.limiter;

    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = "lowshelf";
    this.eqLow.frequency.value = 120;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = "peaking";
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.8;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = "highshelf";
    this.eqHigh.frequency.value = 6000;

    this.input.connect(this.shaper).connect(postDrive).connect(this.master);
    this.master.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh).connect(limiter).connect(ctx.destination);
    this.recordTap = ctx.createMediaStreamDestination();
    limiter.connect(this.recordTap);

    this.reverbSend = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(2.8, 2.6);
    this.reverbReturn = ctx.createGain();
    this.reverbSend.connect(convolver).connect(this.reverbReturn).connect(this.master);

    this.delaySend = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.36;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 3200;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.6;
    this.delaySend.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(delayOut).connect(this.master);
    delayOut.connect(this.reverbSend);

    // Metronome bypasses the master chain so it is never in a master recording.
    this.clickOut = ctx.createGain();
    this.clickOut.gain.value = 0.5;
    this.clickOut.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.mainBus = this.makeBus(1);
    this.applyMix();
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private makeBus(gain: number): Bus {
    const ctx = this.ctx!;
    const bus: Bus = { dry: ctx.createGain(), reverb: ctx.createGain(), delay: ctx.createGain() };
    bus.dry.connect(this.input);
    bus.reverb.connect(this.reverbSend);
    bus.delay.connect(this.delaySend);
    this.setBusGain(bus, gain, 0);
    return bus;
  }

  /** New independent output for a loop track. Requires a started engine. */
  createBus(gain = 1): Bus | null {
    return this.ctx ? this.makeBus(gain) : null;
  }

  setBusGain(bus: Bus, gain: number, smoothing = 0.015) {
    const t = this.now();
    for (const node of [bus.dry, bus.reverb, bus.delay]) {
      if (smoothing > 0) node.gain.setTargetAtTime(gain, t, smoothing);
      else node.gain.value = gain;
    }
  }

  disposeBus(bus: Bus) {
    this.setBusGain(bus, 0, 0.01);
    setTimeout(() => {
      bus.dry.disconnect();
      bus.reverb.disconnect();
      bus.delay.disconnect();
    }, 3000);
  }

  /** Final master output as a MediaStream (post-limiter, pre-metronome). */
  recordStream(): MediaStream | null {
    return this.recordTap?.stream ?? null;
  }

  setMix(partial: Partial<MixSettings>) {
    this.mix = { ...this.mix, ...partial };
    this.applyMix();
  }

  setQuality(q: AudioQuality) {
    this.quality = q;
    if (this.shaper) this.shaper.oversample = qualityConfig(q).shaperOversample;
  }

  getQuality(): AudioQuality {
    return this.quality;
  }

  /** Prefer a specific output device when Chromium exposes setSinkId; "" = default. */
  async setOutputDevice(deviceId: string): Promise<{ ok: boolean; reason?: string }> {
    this.outputDeviceId = deviceId;
    if (!this.ctx) return { ok: true };
    const ctx = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
    if (typeof ctx.setSinkId !== "function") {
      return { ok: false, reason: "This runtime cannot select an output device; use OS audio routing." };
    }
    try {
      await ctx.setSinkId(deviceId || "");
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  }

  getOutputDeviceId(): string {
    return this.outputDeviceId;
  }

  sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  private applyMix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.mix.volume, t, 0.02);
    this.reverbReturn.gain.setTargetAtTime(this.mix.reverb * 1.4, t, 0.05);
    this.shaper.curve = this.mix.drive > 0.001 ? driveCurve(this.mix.drive) : null;
    // Compensate perceived loudness gain from saturation.
    this.input.gain.setTargetAtTime(1 / (1 + this.mix.drive * 1.2), t, 0.02);
    this.eqLow.gain.setTargetAtTime(this.mix.bass, t, 0.03);
    this.eqMid.gain.setTargetAtTime(this.mix.mid, t, 0.03);
    this.eqHigh.gain.setTargetAtTime(this.mix.treble, t, 0.03);
  }

  private at(when?: number): number {
    const now = this.ctx!.currentTime;
    return when === undefined || when < now ? now : when;
  }

  noteOn(voiceId: VoiceId, midi: number, velocity: number, when?: number, bus?: Bus | null): VoiceHandle | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return null;
    const out = bus ?? this.mainBus;
    const def = VOICES[voiceId];
    const t = this.at(when);
    const freq = midiToFreq(midi);
    const vel = velocityGain(velocity);
    const qcfg = qualityConfig(this.quality);

    this.enforcePolyphony();

    const mixer = ctx.createGain();
    const sources: AudioScheduledSourceNode[] = [];

    if (def.engine === "fm" && def.fm) {
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = freq;
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = freq * def.fm.ratio;
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(def.fm.index * freq, t);
      modGain.gain.setTargetAtTime(0.001, t + 0.01, Math.max(0.02, def.fm.indexDecay / 3));
      mod.connect(modGain).connect(carrier.frequency);
      const g = ctx.createGain();
      g.gain.value = def.oscs[0]?.gain ?? 1;
      carrier.connect(g).connect(mixer);
      sources.push(carrier, mod);
    } else {
      for (const osc of def.oscs) {
        const g = ctx.createGain();
        g.gain.value = osc.gain;
        let src: AudioScheduledSourceNode;
        if (osc.type === "noise") {
          const n = ctx.createBufferSource();
          n.buffer = this.noise;
          n.loop = true;
          n.loopStart = Math.random();
          src = n;
        } else {
          const o = ctx.createOscillator();
          o.type = osc.type;
          o.frequency.value = freq * Math.pow(2, osc.octave ?? 0);
          o.detune.value = osc.detune ?? 0;
          src = o;
        }
        src.connect(g).connect(mixer);
        sources.push(src);
      }
    }

    const filter = ctx.createBiquadFilter();
    filter.type = def.filter.type;
    filter.Q.value = def.filter.q;
    const track = Math.pow(2, ((midi - 60) / 12) * (def.filter.keyTrack ?? 0));
    const base = Math.min(18000, def.filter.cutoff * filterMultiplier(this.mix.filter) * track);
    const peak = Math.min(18000, base + def.filter.envAmount * (0.4 + vel * 0.6));
    filter.frequency.setValueAtTime(peak, t);
    filter.frequency.setTargetAtTime(base, t + 0.002, Math.max(0.005, def.filter.envDecay / 3));

    const amp = ctx.createGain();
    const level = def.level * vel;
    const attack = Math.max(qcfg.attackFloor, def.amp.attack);
    const { decay, sustain, release } = def.amp;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(level, t + attack);
    amp.gain.setTargetAtTime(level * sustain, t + attack, Math.max(0.005, decay / 3));

    mixer.connect(filter);
    let tail: AudioNode = filter;
    if (def.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(def.drive);
      shaper.oversample = qcfg.shaperOversample;
      tail.connect(shaper);
      tail = shaper;
    }
    tail.connect(amp);
    amp.connect(out.dry);
    if (def.reverbSend > 0) {
      const s = ctx.createGain();
      s.gain.value = def.reverbSend;
      amp.connect(s).connect(out.reverb);
    }
    if (def.delaySend > 0) {
      const s = ctx.createGain();
      s.gain.value = def.delaySend;
      amp.connect(s).connect(out.delay);
    }

    for (const s of sources) s.start(t);

    const id = this.nextId++;
    const voice: ActiveVoice = { id, amp, sources, release, startedAt: t, released: false };
    this.voices.set(id, voice);
    sources[0]!.onended = () => {
      this.voices.delete(id);
      amp.disconnect();
    };
    return { id };
  }

  noteOff(handle: VoiceHandle | null, fast = false, when?: number) {
    if (!handle || !this.ctx) return;
    const voice = this.voices.get(handle.id);
    if (!voice || voice.released) return;
    voice.released = true;
    const t = Math.max(this.at(when), voice.startedAt);
    const release = fast ? 0.015 : voice.release;
    voice.amp.gain.cancelAndHoldAtTime(t);
    voice.amp.gain.setTargetAtTime(0, t, Math.max(0.004, release / 4));
    const stopAt = t + release * 1.6 + 0.05;
    for (const s of voice.sources) s.stop(stopAt);
  }

  private enforcePolyphony() {
    if (this.voices.size < MAX_VOICES) return;
    let oldest: ActiveVoice | null = null;
    for (const v of this.voices.values()) {
      if (!oldest || v.startedAt < oldest.startedAt) oldest = v;
    }
    if (oldest) this.noteOff({ id: oldest.id }, true);
  }

  playDrum(drum: DrumId, kitId: KitId, velocity: number, pitch = 1, when?: number, bus?: Bus | null) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const out = bus ?? this.mainBus;
    const kit = KITS[kitId];
    const t = this.at(when);
    const group = CHOKE_GROUP[drum];
    if (group) this.chokeGroup(group, t);

    const hit = playDrumHit(
      { ctx, out: out.dry, reverb: out.reverb, noise: this.noise },
      drum,
      kit,
      velocityGain(velocity),
      pitch,
      t,
    );
    if (hit.long) {
      this.ringing = this.ringing.filter((r) => r.hit.endsAt > ctx.currentTime);
      this.ringing.push({ group: group ?? drum, hit });
    }
  }

  private chokeGroup(group: string, t: number) {
    for (const r of this.ringing) {
      if (r.group === group) r.hit.choke(t);
    }
    this.ringing = this.ringing.filter((r) => r.group !== group);
  }

  /** Silence every ringing cymbal / open hat. */
  chokeAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const r of this.ringing) r.hit.choke(t);
    this.ringing = [];
  }

  /** One-shot performance FX bound to the arrow keys. */
  playFx(fx: FxId, kitId: KitId, velocity: number, when?: number, bus?: Bus | null) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const out = bus ?? this.mainBus;
    const t = this.at(when);
    const vel = velocityGain(velocity);
    if (fx === "tom_fill") {
      [1.6, 1.3, 1.05, 0.85].forEach((p, i) => this.playDrum("tom", kitId, velocity, p, t + i * 0.11, out));
      return;
    }
    if (fx === "snare_roll") {
      for (let i = 0; i < 8; i++) {
        this.playDrum("snare", kitId, velocity * (0.45 + (i / 7) * 0.55), 1, t + i * 0.06, out);
      }
      return;
    }

    const rising = fx === "riser";
    const dur = rising ? 2 : 1.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(rising ? 300 : 6000, t);
    bp.frequency.exponentialRampToValueAtTime(rising ? 9000 : 120, t + dur);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(rising ? 120 : 900, t);
    osc.frequency.exponentialRampToValueAtTime(rising ? 1600 : 35, t + dur);
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.25;
    const g = ctx.createGain();
    const peak = 0.6 * vel;
    if (rising) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.95);
      g.gain.linearRampToValueAtTime(0, t + dur);
    } else {
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(bp).connect(g);
    osc.connect(oscGain).connect(g);
    g.connect(out.dry);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(out.reverb);
    src.start(t);
    osc.start(t);
    src.stop(t + dur + 0.05);
    osc.stop(t + dur + 0.05);
  }

  /** Metronome / count-in tick. Routed straight to the speakers, never recorded. */
  click(when: number, accent: boolean) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = this.at(when);
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = accent ? 1760 : 1175;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(this.clickOut);
    o.start(t);
    o.stop(t + 0.05);
  }

  /** Stop every voice and ringing hit, from every source. */
  releaseAll() {
    for (const v of this.voices.values()) this.noteOff({ id: v.id }, true);
    this.chokeAll();
  }

  activeVoiceCount(): number {
    let n = 0;
    const now = this.now();
    for (const v of this.voices.values()) if (!v.released && v.startedAt <= now + 0.2) n++;
    return n;
  }
}

export const engine = new AudioEngine();
