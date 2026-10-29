import type { KitId } from "../drums/kits";
import type { VoiceId } from "../instruments/voices";
import type { NoteName, ScaleId } from "../scales/scales";
import type { LayerId } from "./layers";
import type { HybridVoices, PlayMode } from "./zones";

/** A layer either swaps the melodic instrument or turns the main rows into an alternate drum kit. */
export type LayerTarget = { voice: VoiceId } | { kit: KitId };

export type ProfileId = "dark_techno" | "goa_psy" | "industrial" | "ambient" | "basic_minor" | "drum_machine";

export type Profile = {
  id: ProfileId;
  name: string;
  root: NoteName;
  scale: ScaleId;
  mode: PlayMode;
  chordMode: boolean;
  layers: Record<LayerId, LayerTarget>;
  hybrid: HybridVoices;
  kit: KitId;
  fx: { reverb: number; drive: number };
};

export const PROFILES: Record<ProfileId, Profile> = {
  dark_techno: {
    id: "dark_techno",
    name: "Dark Techno",
    root: "F#",
    scale: "phrygian_dominant",
    mode: "hybrid",
    chordMode: true,
    layers: {
      base: { voice: "dark_synth" },
      shift: { voice: "lead" },
      ctrl: { voice: "bass" },
      alt: { voice: "stabs" },
      shift_ctrl: { voice: "pad" },
      shift_alt: { voice: "fx" },
      ctrl_alt: { kit: "industrial" },
    },
    hybrid: { number: "lead", qwerty: "dark_synth", home: "stabs", bottom: "bass" },
    kit: "909_dark",
    fx: { reverb: 0.3, drive: 0.3 },
  },
  goa_psy: {
    id: "goa_psy",
    name: "Goa / Psy",
    root: "E",
    scale: "phrygian",
    mode: "hybrid",
    chordMode: false,
    layers: {
      base: { voice: "acid" },
      shift: { voice: "lead" },
      ctrl: { voice: "bass" },
      alt: { voice: "stabs" },
      shift_ctrl: { voice: "pad" },
      shift_alt: { voice: "fx" },
      ctrl_alt: { kit: "tight" },
    },
    hybrid: { number: "lead", qwerty: "acid", home: "dark_synth", bottom: "bass" },
    kit: "tight",
    fx: { reverb: 0.25, drive: 0.35 },
  },
  industrial: {
    id: "industrial",
    name: "Industrial",
    root: "D",
    scale: "harmonic_minor",
    mode: "hybrid",
    chordMode: true,
    layers: {
      base: { voice: "dark_synth" },
      shift: { voice: "acid" },
      ctrl: { voice: "bass" },
      alt: { voice: "stabs" },
      shift_ctrl: { voice: "pad" },
      shift_alt: { voice: "fx" },
      ctrl_alt: { kit: "909_dark" },
    },
    hybrid: { number: "fx", qwerty: "dark_synth", home: "stabs", bottom: "bass" },
    kit: "industrial",
    fx: { reverb: 0.35, drive: 0.7 },
  },
  ambient: {
    id: "ambient",
    name: "Ambient",
    root: "D",
    scale: "dorian",
    mode: "instrument",
    chordMode: true,
    layers: {
      base: { voice: "spectral_pad" },
      shift: { voice: "pristine_lead" },
      ctrl: { voice: "pristine_sub" },
      alt: { voice: "fm_glass" },
      shift_ctrl: { voice: "fm_bell" },
      shift_alt: { voice: "pristine_keys" },
      ctrl_alt: { kit: "808_deep" },
    },
    hybrid: { number: "spectral_lead", qwerty: "spectral_pad", home: "pristine_keys", bottom: "pristine_sub" },
    kit: "808_deep",
    fx: { reverb: 0.75, drive: 0.05 },
  },
  basic_minor: {
    id: "basic_minor",
    name: "Basic Minor",
    root: "A",
    scale: "natural_minor",
    mode: "hybrid",
    chordMode: true,
    layers: {
      base: { voice: "lead" },
      shift: { voice: "dark_synth" },
      ctrl: { voice: "bass" },
      alt: { voice: "stabs" },
      shift_ctrl: { voice: "pad" },
      shift_alt: { voice: "fx" },
      ctrl_alt: { kit: "tight" },
    },
    hybrid: { number: "lead", qwerty: "lead", home: "pad", bottom: "bass" },
    kit: "909_dark",
    fx: { reverb: 0.3, drive: 0.15 },
  },
  drum_machine: {
    id: "drum_machine",
    name: "Drum Machine",
    root: "C",
    scale: "minor_pentatonic",
    mode: "drum",
    chordMode: false,
    layers: {
      base: { voice: "dark_synth" },
      shift: { voice: "lead" },
      ctrl: { voice: "bass" },
      alt: { voice: "stabs" },
      shift_ctrl: { voice: "pad" },
      shift_alt: { voice: "fx" },
      ctrl_alt: { kit: "industrial" },
    },
    hybrid: { number: "lead", qwerty: "dark_synth", home: "stabs", bottom: "bass" },
    kit: "808_deep",
    fx: { reverb: 0.15, drive: 0.25 },
  },
};

export const PROFILE_IDS = Object.keys(PROFILES) as ProfileId[];
