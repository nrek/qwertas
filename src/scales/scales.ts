export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

export type ScaleId =
  | "major"
  | "natural_minor"
  | "harmonic_minor"
  | "phrygian"
  | "phrygian_dominant"
  | "dorian"
  | "minor_pentatonic"
  | "chromatic";

export type ScaleDef = { id: ScaleId; label: string; intervals: readonly number[] };

export const SCALES: Record<ScaleId, ScaleDef> = {
  major: { id: "major", label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  natural_minor: { id: "natural_minor", label: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonic_minor: { id: "harmonic_minor", label: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  phrygian: { id: "phrygian", label: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  phrygian_dominant: {
    id: "phrygian_dominant",
    label: "Phrygian Dominant",
    intervals: [0, 1, 4, 5, 7, 8, 10],
  },
  dorian: { id: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  minor_pentatonic: { id: "minor_pentatonic", label: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
  chromatic: { id: "chromatic", label: "Chromatic", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

export function rootIndex(root: NoteName): number {
  return NOTE_NAMES.indexOf(root);
}

/** MIDI note number for `root` in `octave` (C4 = 60). */
export function rootMidi(root: NoteName, octave: number): number {
  return (octave + 1) * 12 + rootIndex(root);
}

/** MIDI note for scale degree `degree` (0-based, may exceed scale length) above the root in `octave`. */
export function degreeToMidi(root: NoteName, scale: ScaleId, octave: number, degree: number): number {
  const steps = SCALES[scale].intervals;
  const len = steps.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi(root, octave) + oct * 12 + steps[idx]!;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!;
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function pitchClassName(midi: number): NoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12]!;
}

export function isInScale(midi: number, root: NoteName, scale: ScaleId): boolean {
  const pc = (((midi - rootIndex(root)) % 12) + 12) % 12;
  return SCALES[scale].intervals.includes(pc);
}

export type Chord = { midis: number[]; name: string; numeral: string };

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Triad stacked in thirds from the scale itself, so every chord tone stays in key. */
export function chordOnDegree(root: NoteName, scale: ScaleId, octave: number, degree: number): Chord {
  const len = SCALES[scale].intervals.length;
  let midis: number[];
  if (len === 12) {
    const base = degreeToMidi(root, scale, octave, degree);
    midis = [base, base + 4, base + 7];
  } else {
    midis = [0, 2, 4].map((step) => degreeToMidi(root, scale, octave, degree + step));
  }
  const [a, b, c] = midis as [number, number, number];
  const third = b - a;
  const fifth = c - a;
  let quality: "maj" | "min" | "dim" | "aug" | "sus";
  if (third === 4 && fifth === 7) quality = "maj";
  else if (third === 3 && fifth === 7) quality = "min";
  else if (third === 3 && fifth === 6) quality = "dim";
  else if (third === 4 && fifth === 8) quality = "aug";
  else quality = "sus";

  const scaleDegree = ((degree % len) + len) % len;
  const roman = ROMAN[scaleDegree] ?? String(scaleDegree + 1);
  const numeral =
    quality === "maj"
      ? roman
      : quality === "aug"
        ? `${roman}+`
        : quality === "min"
          ? roman.toLowerCase()
          : quality === "dim"
            ? `${roman.toLowerCase()}°`
            : `${roman.toLowerCase()}sus`;
  const suffix = { maj: "", min: "m", dim: "dim", aug: "aug", sus: "sus" }[quality];
  return { midis, name: `${pitchClassName(a)}${suffix}`, numeral };
}
