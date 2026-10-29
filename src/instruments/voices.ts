export type VoiceId =
  | "dark_synth"
  | "bass"
  | "pad"
  | "lead"
  | "stabs"
  | "acid"
  | "fx"
  | "pristine_lead"
  | "pristine_sub"
  | "pristine_keys"
  | "fm_bell"
  | "fm_glass"
  | "spectral_pad"
  | "spectral_lead"
  | "transient_pluck";

export type OscDef = {
  type: OscillatorType | "noise";
  /** Octave shift relative to the played note. */
  octave?: number;
  /** Cents. */
  detune?: number;
  gain: number;
};

export type SynthEngine = "analog" | "fm" | "spectral";

export type VoiceDef = {
  id: VoiceId;
  label: string;
  family: "classic" | "pristine" | "harmonic" | "spectral" | "transient";
  engine: SynthEngine;
  oscs: OscDef[];
  /** FM only: modulator ratio relative to carrier, and index (modulation depth). */
  fm?: { ratio: number; index: number; indexDecay: number };
  filter: {
    type: BiquadFilterType;
    cutoff: number;
    q: number;
    envAmount: number;
    envDecay: number;
    keyTrack?: number;
  };
  amp: { attack: number; decay: number; sustain: number; release: number };
  drive: number;
  reverbSend: number;
  delaySend: number;
  level: number;
};

const analog = (
  partial: Omit<VoiceDef, "engine" | "family"> & { family?: VoiceDef["family"] },
): VoiceDef => ({
  engine: "analog",
  family: partial.family ?? "classic",
  ...partial,
});

export const VOICES: Record<VoiceId, VoiceDef> = {
  dark_synth: analog({
    id: "dark_synth",
    label: "Dark Synth",
    oscs: [
      { type: "sawtooth", gain: 0.55 },
      { type: "sawtooth", detune: 9, gain: 0.35 },
      { type: "square", octave: -1, gain: 0.35 },
    ],
    filter: { type: "lowpass", cutoff: 900, q: 6, envAmount: 2600, envDecay: 0.35, keyTrack: 0.5 },
    amp: { attack: 0.004, decay: 0.25, sustain: 0.6, release: 0.25 },
    drive: 0.35,
    reverbSend: 0.25,
    delaySend: 0.08,
    level: 0.5,
  }),
  bass: analog({
    id: "bass",
    label: "Bass",
    oscs: [
      { type: "square", gain: 0.35 },
      { type: "sawtooth", gain: 0.35 },
      { type: "sine", octave: -1, gain: 0.6 },
    ],
    filter: { type: "lowpass", cutoff: 380, q: 4, envAmount: 1400, envDecay: 0.14 },
    amp: { attack: 0.002, decay: 0.18, sustain: 0.55, release: 0.09 },
    drive: 0.25,
    reverbSend: 0.04,
    delaySend: 0,
    level: 0.62,
  }),
  pad: analog({
    id: "pad",
    label: "Pad",
    oscs: [
      { type: "sawtooth", detune: -12, gain: 0.35 },
      { type: "sawtooth", detune: 12, gain: 0.35 },
      { type: "triangle", octave: 1, gain: 0.2 },
    ],
    filter: { type: "lowpass", cutoff: 1400, q: 1.5, envAmount: 600, envDecay: 1.2 },
    amp: { attack: 0.45, decay: 0.8, sustain: 0.8, release: 1.6 },
    drive: 0,
    reverbSend: 0.7,
    delaySend: 0.15,
    level: 0.38,
  }),
  lead: analog({
    id: "lead",
    label: "Lead",
    oscs: [
      { type: "sawtooth", gain: 0.5 },
      { type: "square", detune: 6, gain: 0.3 },
    ],
    filter: { type: "lowpass", cutoff: 2600, q: 3, envAmount: 2400, envDecay: 0.2, keyTrack: 0.3 },
    amp: { attack: 0.006, decay: 0.2, sustain: 0.7, release: 0.22 },
    drive: 0.15,
    reverbSend: 0.25,
    delaySend: 0.35,
    level: 0.42,
  }),
  stabs: analog({
    id: "stabs",
    label: "Stabs",
    oscs: [
      { type: "sawtooth", gain: 0.5 },
      { type: "sawtooth", detune: 14, gain: 0.4 },
    ],
    filter: { type: "lowpass", cutoff: 700, q: 5, envAmount: 4200, envDecay: 0.12 },
    amp: { attack: 0.002, decay: 0.22, sustain: 0.0, release: 0.12 },
    drive: 0.3,
    reverbSend: 0.4,
    delaySend: 0.2,
    level: 0.42,
  }),
  acid: analog({
    id: "acid",
    label: "Acid",
    oscs: [{ type: "sawtooth", gain: 0.7 }],
    filter: { type: "lowpass", cutoff: 420, q: 16, envAmount: 3800, envDecay: 0.18 },
    amp: { attack: 0.002, decay: 0.2, sustain: 0.5, release: 0.08 },
    drive: 0.55,
    reverbSend: 0.12,
    delaySend: 0.25,
    level: 0.45,
  }),
  fx: analog({
    id: "fx",
    label: "FX / Noise",
    oscs: [
      { type: "noise", gain: 0.45 },
      { type: "sine", octave: 1, gain: 0.25 },
    ],
    filter: { type: "bandpass", cutoff: 1200, q: 9, envAmount: 5000, envDecay: 0.6, keyTrack: 1 },
    amp: { attack: 0.02, decay: 0.5, sustain: 0.4, release: 0.6 },
    drive: 0.2,
    reverbSend: 0.6,
    delaySend: 0.4,
    level: 0.45,
  }),

  pristine_lead: analog({
    id: "pristine_lead",
    label: "Pristine Lead",
    family: "pristine",
    oscs: [
      { type: "sine", gain: 0.55 },
      { type: "triangle", detune: 3, gain: 0.35 },
    ],
    filter: { type: "lowpass", cutoff: 5200, q: 0.7, envAmount: 800, envDecay: 0.25, keyTrack: 0.4 },
    amp: { attack: 0.008, decay: 0.18, sustain: 0.75, release: 0.28 },
    drive: 0,
    reverbSend: 0.22,
    delaySend: 0.18,
    level: 0.48,
  }),
  pristine_sub: analog({
    id: "pristine_sub",
    label: "Pristine Sub",
    family: "pristine",
    oscs: [
      { type: "sine", gain: 0.85 },
      { type: "sine", octave: 1, gain: 0.15 },
    ],
    filter: { type: "lowpass", cutoff: 280, q: 0.5, envAmount: 200, envDecay: 0.1 },
    amp: { attack: 0.004, decay: 0.2, sustain: 0.85, release: 0.2 },
    drive: 0.05,
    reverbSend: 0.02,
    delaySend: 0,
    level: 0.7,
  }),
  pristine_keys: analog({
    id: "pristine_keys",
    label: "Pristine Keys",
    family: "pristine",
    oscs: [
      { type: "triangle", gain: 0.45 },
      { type: "sine", octave: 1, gain: 0.25 },
      { type: "sine", octave: 2, gain: 0.12 },
    ],
    filter: { type: "lowpass", cutoff: 3400, q: 1, envAmount: 1200, envDecay: 0.35 },
    amp: { attack: 0.004, decay: 0.4, sustain: 0.45, release: 0.55 },
    drive: 0,
    reverbSend: 0.35,
    delaySend: 0.1,
    level: 0.44,
  }),

  fm_bell: {
    id: "fm_bell",
    label: "FM Bell",
    family: "harmonic",
    engine: "fm",
    oscs: [{ type: "sine", gain: 1 }],
    fm: { ratio: 3.5, index: 4.5, indexDecay: 0.55 },
    filter: { type: "lowpass", cutoff: 8000, q: 0.7, envAmount: 0, envDecay: 0.1 },
    amp: { attack: 0.002, decay: 0.9, sustain: 0.15, release: 1.1 },
    drive: 0,
    reverbSend: 0.55,
    delaySend: 0.2,
    level: 0.4,
  },
  fm_glass: {
    id: "fm_glass",
    label: "FM Glass",
    family: "harmonic",
    engine: "fm",
    oscs: [{ type: "sine", gain: 1 }],
    fm: { ratio: 2.01, index: 2.2, indexDecay: 0.35 },
    filter: { type: "lowpass", cutoff: 7000, q: 1.2, envAmount: 1500, envDecay: 0.25 },
    amp: { attack: 0.01, decay: 0.35, sustain: 0.55, release: 0.45 },
    drive: 0.05,
    reverbSend: 0.45,
    delaySend: 0.25,
    level: 0.42,
  },

  spectral_pad: {
    id: "spectral_pad",
    label: "Spectral Pad",
    family: "spectral",
    engine: "spectral",
    oscs: [
      { type: "sine", gain: 0.35 },
      { type: "sine", octave: 1, gain: 0.28 },
      { type: "sine", octave: 2, detune: 7, gain: 0.18 },
      { type: "sine", octave: 3, detune: -5, gain: 0.1 },
      { type: "triangle", detune: 3, gain: 0.12 },
    ],
    filter: { type: "lowpass", cutoff: 1800, q: 0.8, envAmount: 900, envDecay: 1.8, keyTrack: 0.2 },
    amp: { attack: 0.6, decay: 1.0, sustain: 0.85, release: 2.2 },
    drive: 0,
    reverbSend: 0.75,
    delaySend: 0.2,
    level: 0.32,
  },
  spectral_lead: {
    id: "spectral_lead",
    label: "Spectral Lead",
    family: "spectral",
    engine: "spectral",
    oscs: [
      { type: "sine", gain: 0.4 },
      { type: "sine", octave: 1, gain: 0.3 },
      { type: "sine", octave: 2, gain: 0.18 },
      { type: "triangle", detune: 8, gain: 0.2 },
    ],
    filter: { type: "lowpass", cutoff: 4200, q: 2, envAmount: 2200, envDecay: 0.3, keyTrack: 0.35 },
    amp: { attack: 0.01, decay: 0.22, sustain: 0.65, release: 0.3 },
    drive: 0.08,
    reverbSend: 0.3,
    delaySend: 0.28,
    level: 0.4,
  },

  transient_pluck: analog({
    id: "transient_pluck",
    label: "Transient Pluck",
    family: "transient",
    oscs: [
      { type: "triangle", gain: 0.55 },
      { type: "noise", gain: 0.2 },
    ],
    filter: { type: "lowpass", cutoff: 2400, q: 4, envAmount: 5000, envDecay: 0.08, keyTrack: 0.5 },
    amp: { attack: 0.001, decay: 0.28, sustain: 0.05, release: 0.18 },
    drive: 0.12,
    reverbSend: 0.28,
    delaySend: 0.15,
    level: 0.46,
  }),
};

export const VOICE_IDS = Object.keys(VOICES) as VoiceId[];
