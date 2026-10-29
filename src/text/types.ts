import type { DrumId } from "../drums/kits";
import type { LayerId } from "../mappings/layers";
import type { ProfileId } from "../mappings/profiles";
import type { NoteName, ScaleId } from "../scales/scales";

export type TokenKind = "key" | "rest" | "sustain" | "bar" | "drum" | "layer" | "directive" | "space" | "error";

/** Every character of the source belongs to exactly one token, so the editor can mirror it. */
export type Token = {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  /** `KeyboardEvent.code` for `key` tokens. */
  code?: string;
  drum?: DrumId;
  layer?: LayerId;
  durationUnits?: number;
  directive?: string;
  value?: string;
  line: number;
  column: number;
  /** Human-readable problem for `error` tokens. */
  error?: string;
  warning?: string;
};

export type ScoreEvent = {
  index: number;
  startUnit: number;
  type: "note" | "drum" | "rest" | "modifier" | "bar";
  /** Physical key code for notes. */
  physicalKey?: string;
  token?: string;
  durationUnits: number;
  layer?: LayerId;
  drum?: DrumId;
  /** Source range [start, end) for the playback cursor. */
  source: { start: number; end: number };
};

export type Grid = 4 | 8 | 16 | 32;
export const GRIDS: Grid[] = [4, 8, 16, 32];

export type ScoreMetadata = {
  title?: string;
  tempo: number;
  grid: Grid;
  root?: NoteName;
  scale?: ScaleId;
  profile?: ProfileId;
  filename?: string;
  /** Directives the current player does not understand, retained for future versions. */
  unknown: Record<string, string>;
};

export type QwertasScore = {
  metadata: ScoreMetadata;
  events: ScoreEvent[];
  /** Total length in grid units. */
  units: number;
  errors: Token[];
  warnings: Token[];
  directives: Set<string>;
};

/** Backward-compatible names for callers that only need the normalized score. */
export type SequenceEvent = ScoreEvent;
export type Sequence = QwertasScore;
