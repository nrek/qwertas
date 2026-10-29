import type { NoteName, ScaleId } from "../scales/scales";
import { degreeToMidi, midiToName, rootMidi, SCALES } from "../scales/scales";
import { ROW_KEYS, type RowId } from "./zones";

/** Keyboard → pitch strategies. Live input only; stored music carries its own pitches. */
export type MappingId = "legacy" | "dvorasqwertas" | "qwertoras";

export const MAPPING_VERSION = 1;

export const MAPPINGS: { id: MappingId; label: string; blurb: string }[] = [
  {
    id: "dvorasqwertas",
    label: "DVORAQWERTAS",
    blurb: "Default. Home row is the primary register; three melodic rows are contiguous chromatic steps.",
  },
  {
    id: "qwertoras",
    label: "QWERTORAS",
    blurb: "Optional ergonomic layout. Scale-aware placement that favors short hand travel — never auto-enabled.",
  },
  {
    id: "legacy",
    label: "Classic (scale rows)",
    blurb: "Original prototype: each row is an octave of scale degrees. Kept for A/B and old habits.",
  },
];

export type MelodicRow = "qwerty" | "home" | "bottom";

/** Home row is the primary register; upper/lower are adjacent octaves of chromatic pitch. */
const DVORA_OCTAVE: Record<MelodicRow, number> = { qwerty: 4, home: 3, bottom: 2 };

/**
 * Chromatic MIDI for a key index on a DVORAQWERTAS row.
 * Number row stays reserved for chords/FX elsewhere; melodic surface is Q/A/Z blocks.
 */
export function dvorasMidi(root: NoteName, row: MelodicRow, index: number, octaveOffset: number): number {
  return rootMidi(root, DVORA_OCTAVE[row] + octaveOffset) + index;
}

/** Deterministic scale-aware ergonomic remapping of the three melodic rows. */
export function qwertorasMidi(
  root: NoteName,
  scale: ScaleId,
  row: MelodicRow,
  index: number,
  octaveOffset: number,
): number {
  const keys = ROW_KEYS[row];
  const steps = SCALES[scale].intervals;
  // Prefer home-row center (F/G/H/J) for tonic neighbourhood; outer keys climb the scale.
  const homeCenterBias = row === "home" ? 0 : row === "qwerty" ? steps.length : -steps.length;
  const degree = Math.max(0, index + homeCenterBias + Math.floor((keys.length - 1) / 2) - 4);
  const baseOct = DVORA_OCTAVE.home + octaveOffset;
  return degreeToMidi(root, scale, baseOct, degree);
}

export function melodicLabel(midi: number): string {
  return midiToName(midi);
}

export function isMelodicRow(row: RowId): row is MelodicRow {
  return row === "qwerty" || row === "home" || row === "bottom";
}
