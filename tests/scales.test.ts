import {
  chordOnDegree,
  degreeToMidi,
  isInScale,
  midiToName,
  NOTE_NAMES,
  pitchClassName,
  SCALE_IDS,
  SCALES,
} from "../src/scales/scales";

describe("scales", () => {
  it("maps the bottom row example from the plan: F# Phrygian Dominant", () => {
    const names = [0, 1, 2, 3, 4, 5, 6].map((d) => pitchClassName(degreeToMidi("F#", "phrygian_dominant", 2, d)));
    expect(names).toEqual(["F#", "G", "A#", "B", "C#", "D", "E"]);
  });

  it("wraps degrees into the next octave", () => {
    expect(degreeToMidi("C", "major", 4, 0)).toBe(60);
    expect(degreeToMidi("C", "major", 4, 7)).toBe(72);
    expect(degreeToMidi("A", "minor_pentatonic", 3, 5)).toBe(degreeToMidi("A", "minor_pentatonic", 4, 0));
  });

  it("names midi notes", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(42)).toBe("F#2");
  });

  it("builds diatonic triads that stay in key", () => {
    for (const scale of SCALE_IDS) {
      for (const root of NOTE_NAMES) {
        for (let d = 0; d < 11; d++) {
          const chord = chordOnDegree(root, scale, 3, d);
          if (scale !== "chromatic") {
            for (const m of chord.midis) expect(isInScale(m, root, scale)).toBe(true);
          }
          expect(chord.midis).toHaveLength(3);
        }
      }
    }
  });

  it("labels natural minor chords with roman numerals", () => {
    const numerals = [0, 1, 2, 3, 4, 5, 6].map((d) => chordOnDegree("A", "natural_minor", 3, d).numeral);
    expect(numerals).toEqual(["i", "ii°", "III", "iv", "v", "VI", "VII"]);
  });

  it("defines every scale starting on the root", () => {
    for (const id of SCALE_IDS) expect(SCALES[id].intervals[0]).toBe(0);
  });
});
