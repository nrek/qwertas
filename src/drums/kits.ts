export type DrumId =
  | "kick"
  | "kick2"
  | "snare"
  | "clap"
  | "rim"
  | "hat_closed"
  | "hat_open"
  | "crash"
  | "ride"
  | "tom";

export const DRUM_LABELS: Record<DrumId, string> = {
  kick: "Kick",
  kick2: "Kick 2",
  snare: "Snare",
  clap: "Clap",
  rim: "Rim",
  hat_closed: "Hat",
  hat_open: "Open Hat",
  crash: "Crash",
  ride: "Ride",
  tom: "Tom",
};

export const DRUM_SHORT: Record<DrumId, string> = {
  kick: "KCK",
  kick2: "KK2",
  snare: "SNR",
  clap: "CLP",
  rim: "RIM",
  hat_closed: "HAT",
  hat_open: "OHT",
  crash: "CRS",
  ride: "RDE",
  tom: "TOM",
};

export type KitId = "909_dark" | "808_deep" | "industrial" | "tight";

export type KitDef = {
  id: KitId;
  label: string;
  /** Multiplier on all drum pitches. */
  pitch: number;
  /** Multiplier on all decays. */
  decay: number;
  /** Saturation applied to the kit bus, 0..1. */
  drive: number;
  /** Brightness of noise-based voices, multiplier on filter cutoffs. */
  tone: number;
  reverbSend: number;
};

export const KITS: Record<KitId, KitDef> = {
  "909_dark": { id: "909_dark", label: "909 Dark", pitch: 0.95, decay: 1, drive: 0.25, tone: 0.9, reverbSend: 0.12 },
  "808_deep": { id: "808_deep", label: "808 Deep", pitch: 0.8, decay: 1.8, drive: 0.1, tone: 0.8, reverbSend: 0.1 },
  industrial: { id: "industrial", label: "Industrial", pitch: 0.85, decay: 0.8, drive: 0.75, tone: 1.2, reverbSend: 0.3 },
  tight: { id: "tight", label: "Tight", pitch: 1.1, decay: 0.6, drive: 0.15, tone: 1.15, reverbSend: 0.06 },
};

export const KIT_IDS = Object.keys(KITS) as KitId[];

/** Choke groups: a hit in a group silences ringing hits from the same group. */
export const CHOKE_GROUP: Partial<Record<DrumId, string>> = {
  hat_closed: "hat",
  hat_open: "hat",
};
