import { driveCurve } from "../audio/curves";
import type { DrumId, KitDef } from "./kits";

export type DrumBus = { ctx: AudioContext; out: AudioNode; reverb: AudioNode; noise: AudioBuffer };

export type DrumHit = { long: boolean; endsAt: number; choke: (t: number) => void };

const LONG_DRUMS = new Set<DrumId>(["hat_open", "crash", "ride"]);

/** 808-style metallic source: six detuned square waves. */
const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function envGain(ctx: AudioContext, t: number, peak: number, decay: number, attack = 0.001): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/**
 * Synthesized one-shot drums (no samples). Every node is scheduled at `t` and stops
 * itself, so a hit costs nothing once it has decayed.
 */
export function playDrumHit(
  bus: DrumBus,
  drum: DrumId,
  kit: KitDef,
  vel: number,
  pitchMul: number,
  t: number,
): DrumHit {
  const { ctx, noise } = bus;
  const p = kit.pitch * pitchMul;
  const d = kit.decay;
  const tone = kit.tone;

  const hitOut = ctx.createGain();
  hitOut.gain.value = 1;
  let dest: AudioNode = hitOut;
  if (kit.drive > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(kit.drive);
    hitOut.connect(shaper);
    dest = shaper;
  }
  dest.connect(bus.out);
  if (kit.reverbSend > 0) {
    const send = ctx.createGain();
    send.gain.value = kit.reverbSend;
    dest.connect(send).connect(bus.reverb);
  }

  const sources: AudioScheduledSourceNode[] = [];
  let length = 0.3;

  const osc = (type: OscillatorType, freq: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    sources.push(o);
    return o;
  };
  const noiseSrc = () => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    n.loopStart = Math.random();
    sources.push(n);
    return n;
  };
  const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(18000, freq);
    f.Q.value = q;
    return f;
  };
  const metal = (fundamental: number, into: AudioNode) => {
    const mix = ctx.createGain();
    mix.gain.value = 0.18;
    for (const r of METAL_RATIOS) osc("square", fundamental * r).connect(mix);
    mix.connect(into);
  };

  switch (drum) {
    case "kick": {
      length = 0.55 * d;
      const o = osc("sine", 165 * p);
      o.frequency.exponentialRampToValueAtTime(46 * p, t + 0.11);
      o.connect(envGain(ctx, t, vel * 1.1, length)).connect(hitOut);
      const click = noiseSrc();
      click.connect(filter("bandpass", 3200, 1)).connect(envGain(ctx, t, vel * 0.35, 0.008)).connect(hitOut);
      break;
    }
    case "kick2": {
      length = 0.3 * d;
      const o = osc("triangle", 230 * p);
      o.frequency.exponentialRampToValueAtTime(56 * p, t + 0.05);
      o.connect(envGain(ctx, t, vel * 1.1, length)).connect(hitOut);
      const sub = osc("sine", 58 * p);
      sub.connect(envGain(ctx, t, vel * 0.6, length * 1.2)).connect(hitOut);
      break;
    }
    case "snare": {
      length = 0.22 * d;
      noiseSrc().connect(filter("highpass", 1500 * tone)).connect(envGain(ctx, t, vel * 0.7, length)).connect(hitOut);
      const body = osc("triangle", 200 * p);
      body.frequency.exponentialRampToValueAtTime(150 * p, t + 0.08);
      body.connect(envGain(ctx, t, vel * 0.6, 0.11 * d)).connect(hitOut);
      break;
    }
    case "clap": {
      length = 0.25 * d;
      const src = noiseSrc();
      const bp = filter("bandpass", 1300 * tone, 1.1);
      src.connect(bp);
      for (const offset of [0, 0.011, 0.022]) {
        bp.connect(envGain(ctx, t + offset, vel * 0.8, 0.012)).connect(hitOut);
      }
      bp.connect(envGain(ctx, t + 0.03, vel * 0.7, 0.18 * d)).connect(hitOut);
      break;
    }
    case "rim": {
      length = 0.06;
      osc("triangle", 1750 * p).connect(envGain(ctx, t, vel * 0.5, 0.035)).connect(hitOut);
      osc("square", 820 * p).connect(filter("bandpass", 900 * p, 3)).connect(envGain(ctx, t, vel * 0.4, 0.03)).connect(hitOut);
      break;
    }
    case "hat_closed":
    case "hat_open": {
      length = (drum === "hat_open" ? 0.42 : 0.05) * d;
      const hp = filter("highpass", 7200 * tone);
      metal(40 * p, hp);
      noiseSrc().connect(filter("highpass", 8000 * tone)).connect(hp);
      hp.connect(envGain(ctx, t, vel * 0.55, length)).connect(hitOut);
      break;
    }
    case "crash": {
      length = 1.5 * d;
      const hp = filter("highpass", 4200 * tone);
      metal(52 * p, hp);
      noiseSrc().connect(hp);
      hp.connect(envGain(ctx, t, vel * 0.45, length, 0.003)).connect(hitOut);
      break;
    }
    case "ride": {
      length = 1.0 * d;
      const bp = filter("bandpass", 6200 * tone, 1.4);
      metal(60 * p, bp);
      const air = ctx.createGain();
      air.gain.value = 0.25;
      noiseSrc().connect(air).connect(bp);
      bp.connect(envGain(ctx, t, vel * 0.5, length)).connect(hitOut);
      break;
    }
    case "tom": {
      length = 0.38 * d;
      const o = osc("sine", 150 * p);
      o.frequency.exponentialRampToValueAtTime(92 * p, t + 0.25);
      o.connect(envGain(ctx, t, vel * 0.9, length)).connect(hitOut);
      break;
    }
  }

  const stopAt = t + length + 0.08;
  for (const s of sources) {
    s.start(t);
    s.stop(stopAt);
  }
  sources[0]!.onended = () => hitOut.disconnect();

  return {
    long: LONG_DRUMS.has(drum),
    endsAt: stopAt,
    choke: (at: number) => {
      hitOut.gain.cancelScheduledValues(at);
      hitOut.gain.setValueAtTime(hitOut.gain.value, at);
      hitOut.gain.linearRampToValueAtTime(0, at + 0.02);
    },
  };
}
