import { readFileSync } from "node:fs";
import { PROFILES } from "../src/mappings/profiles";
import { resolveKey } from "../src/mappings/resolve";
import { parseSequence, sequenceToPerformance, stepSeconds } from "../src/text/parser";
import { tokenize } from "../src/text/tokenizer";

describe("tokenizer", () => {
  it("covers every character so the editor mirror matches the text", () => {
    const src = "{shift} q..w | <KICK> - ?\n<NOPE> {weird} <oops";
    const tokens = tokenize(src);
    expect(tokens.map((t) => t.text).join("")).toBe(src);
    expect(tokens.filter((t) => t.kind === "error").map((t) => t.text)).toEqual(["?", "<NOPE>", "{weird}", "<"]);
  });

  it("maps characters to physical keys case-insensitively", () => {
    const codes = tokenize("zQ1,/;'[]=").map((t) => t.code);
    expect(codes).toEqual([
      "KeyZ",
      "KeyQ",
      "Digit1",
      "Comma",
      "Slash",
      "Semicolon",
      "Quote",
      "BracketLeft",
      "BracketRight",
      "Equal",
    ]);
  });
});

describe("parser", () => {
  it("plays the typed beat from the plan on consecutive steps", () => {
    const seq = parseSequence("<KICK> . <HAT> . <SNARE> . <HAT> .");
    expect(seq.units).toBe(8);
    const sounding = seq.events.filter((e) => e.type === "drum").map((e) => [e.startUnit, e.drum]);
    expect(sounding).toEqual([
      [0, "kick"],
      [2, "hat_closed"],
      [4, "snare"],
      [6, "hat_closed"],
    ]);
  });

  it("treats whitespace and bars as zero-time grouping", () => {
    expect(parseSequence("z x c v | z x c v").units).toBe(8);
    expect(parseSequence("zxcv|zxcv").units).toBe(8);
  });

  it("sustain extends the previous note and consumes time", () => {
    const seq = parseSequence("z--- x");
    const notes = seq.events.filter((e) => e.type === "note");
    expect(notes[0]).toMatchObject({ physicalKey: "KeyZ", startUnit: 0, durationUnits: 4 });
    expect(notes[1]).toMatchObject({ physicalKey: "KeyX", startUnit: 4, durationUnits: 1 });
    expect(seq.units).toBe(5);
  });

  it("rests are silent steps: q..w..e..r", () => {
    const seq = parseSequence("q..w..e..r");
    expect(seq.events.filter((e) => e.type === "note").map((e) => e.startUnit)).toEqual([0, 3, 6, 9]);
    expect(seq.units).toBe(10);
  });

  it("layer tokens apply to following keys", () => {
    const seq = parseSequence("{base} z {shift} q {ctrl} z {shift+ctrl} a");
    const layers = seq.events.filter((e) => e.type === "note").map((e) => e.layer);
    expect(layers).toEqual(["base", "shift", "ctrl", "shift_ctrl"]);
  });

  it("errors are reported and take no time", () => {
    const seq = parseSequence("z ? x");
    expect(seq.units).toBe(2);
    expect(seq.errors).toHaveLength(1);
  });

  it("parses metadata and explicit durations into exact score units", () => {
    const seq = parseSequence("@title Exact\n@tempo 108\n@grid 1/16\n@root C\n@scale chromatic\n@profile Ambient\n\n.:1 i:3 r:8");
    expect(seq.metadata).toMatchObject({
      title: "Exact",
      tempo: 108,
      grid: 16,
      root: "C",
      scale: "chromatic",
      profile: "ambient",
    });
    expect(seq.events.map((e) => [e.type, e.startUnit, e.durationUnits])).toEqual([
      ["rest", 0, 1],
      ["note", 1, 3],
      ["note", 4, 8],
    ]);
    expect(seq.units).toBe(12);
    expect(seq.errors).toEqual([]);
  });

  it("reports line context and preserves unknown directives as warnings", () => {
    const seq = parseSequence("@future legato\n@tempo nope\nz");
    expect(seq.metadata.unknown).toEqual({ future: "legato" });
    expect(seq.warnings[0]).toMatchObject({ line: 1, warning: "unknown directive @future was preserved and ignored" });
    expect(seq.errors[0]).toMatchObject({ line: 2, error: 'invalid tempo "nope" (expected an integer from 40 to 240 BPM)' });
  });
});

describe("sequence → performance events", () => {
  it("uses one grid step per event at the current BPM", () => {
    expect(stepSeconds(120, 8)).toBeCloseTo(0.25);
    expect(stepSeconds(120, 4)).toBeCloseTo(0.5);
    expect(stepSeconds(120, 16)).toBeCloseTo(0.125);
  });

  it("emits down/up pairs for keys and one-shots for drums", () => {
    const ev = sequenceToPerformance(parseSequence("z- <KICK>"), 250);
    expect(ev).toEqual([
      { timeMs: 0, type: "down", physicalKey: "KeyZ", layer: "base" },
      { timeMs: 500, type: "up", physicalKey: "KeyZ", layer: "base" },
      { timeMs: 500, type: "drum", drum: "kick", layer: "base" },
    ]);
  });
});

describe("Beethoven 5 golden score", () => {
  const source = readFileSync(new URL("../examples/beethoven-5-opening.qwertas", import.meta.url), "utf8");
  const expected = JSON.parse(
    readFileSync(new URL("./fixtures/beethoven-5-opening.events.json", import.meta.url), "utf8"),
  ) as {
    tempo: number;
    grid: number;
    units: number;
    events: Record<string, unknown>[];
  };

  it("matches the checked-in normalized event fixture", () => {
    const score = parseSequence(source);
    const events = score.events.map(({ type, startUnit, durationUnits, physicalKey, layer }) => ({
      type,
      startUnit,
      durationUnits,
      ...(physicalKey ? { physicalKey } : {}),
      ...(layer ? { layer } : {}),
    }));
    expect({ tempo: score.metadata.tempo, grid: score.metadata.grid, units: score.units, events }).toEqual(expected);
    expect(score.errors).toEqual([]);
  });

  it("resolves the motif keys to G G G Eb / F F F D", () => {
    const score = parseSequence(source);
    const profile = PROFILES[score.metadata.profile!];
    const labels = score.events
      .filter((event) => event.type === "note")
      .map((event) =>
        resolveKey(event.physicalKey!, {
          profile,
          root: score.metadata.root!,
          scale: score.metadata.scale!,
          mode: profile.mode,
          chordMode: profile.chordMode,
          octaveOffset: 0,
          layer: event.layer!,
          numpadEnabled: true,
          mappingId: "legacy",
          rowMode: "layered",
        }),
      )
      .map((action) => (action?.kind === "note" ? action.label.replace(/\d+$/, "") : action?.kind));
    expect(labels).toEqual(["G", "G", "G", "D#", "F", "F", "F", "D"]);
  });

  it("converts score units to exact event times at 108 BPM", () => {
    const score = parseSequence(source);
    const unitMs = stepSeconds(score.metadata.tempo, score.metadata.grid) * 1000;
    const events = sequenceToPerformance(score);
    expect(unitMs).toBeCloseTo(138.8888888889);
    expect(
      events.filter((event) => event.type === "down").map((event) => Math.round(event.timeMs / unitMs)),
    ).toEqual([1, 2, 3, 4, 13, 14, 15, 16]);
    expect(events.filter((event) => event.type === "up").map((event) => Math.round(event.timeMs / unitMs))).toEqual([
      2, 3, 4, 12, 14, 15, 16, 24,
    ]);
  });
});
