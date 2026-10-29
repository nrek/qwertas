export type TrackState = "empty" | "armed" | "recording" | "playing" | "stopped";

export type Quantize = "off" | "1/4" | "1/8" | "1/16";
export const QUANTIZE_OPTIONS: Quantize[] = ["off", "1/4", "1/8", "1/16"];

export type TrackView = {
  id: number;
  name: string;
  state: TrackState;
  muted: boolean;
  volume: number;
  eventCount: number;
  lengthMs: number;
  /** Audio time recording starts (armed) or ends (recording a fixed cycle). */
  recStart: number;
  recEnd: number | null;
  /** Hidden by the track-count slider; content retained in-session. */
  inactive: boolean;
};

/** Active sequencer lanes the user can see/play. Inactive higher ids stay in memory. */
export const TRACK_MIN = 2;
export const TRACK_MAX = 8;
export const TRACK_DEFAULT = 4;
