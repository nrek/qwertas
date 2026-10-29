import type { DrumId } from "../drums/kits";
import type { VoiceId } from "../instruments/voices";

export type RowId = "number" | "qwerty" | "home" | "bottom" | "numpad";
export type ZoneRole = "notes" | "drums" | "chords" | "fx";
export type PlayMode = "instrument" | "drum" | "hybrid";

export const PLAY_MODES: { id: PlayMode; label: string }[] = [
  { id: "hybrid", label: "Hybrid" },
  { id: "instrument", label: "Instrument" },
  { id: "drum", label: "Drum" },
];

/** Physical key codes (`KeyboardEvent.code`), so mappings follow key position, not OS layout. */
export const ROW_KEYS: Record<Exclude<RowId, "numpad">, string[]> = {
  number: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  qwerty: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  home: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  bottom: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
};

export type KeyboardZone = {
  row: RowId;
  keys: string[];
  /** Octave of the row's first key before the global octave offset (C4 = octave 4). */
  octave: number;
  role: ZoneRole;
  /**
   * Row personality on the Base layer. Any held modifier layer overrides it, so
   * Shift/Ctrl/Alt always swap the whole melodic surface to that layer's instrument.
   */
  baseVoice?: VoiceId;
  /** Pads for `role: "drums"`, cycled across the row; repeats are tuned upward. */
  pads?: DrumId[];
};

export const DRUM_ROWS: Record<Exclude<RowId, "numpad">, DrumId[]> = {
  bottom: ["kick", "kick2", "tom", "tom", "tom", "kick", "kick2", "tom", "tom", "tom"],
  home: ["snare", "clap", "rim", "snare", "clap", "rim", "snare", "clap", "rim", "snare", "clap"],
  qwerty: ["hat_closed", "hat_open", "hat_closed", "hat_open", "ride", "crash", "hat_closed", "hat_open", "ride", "crash", "ride", "crash"],
  number: ["tom", "tom", "tom", "tom", "rim", "rim", "clap", "clap", "crash", "crash", "ride", "ride"],
};

function drumZone(row: Exclude<RowId, "numpad">): KeyboardZone {
  return { row, keys: ROW_KEYS[row], octave: 0, role: "drums", pads: DRUM_ROWS[row] };
}

export function zonesFor(mode: PlayMode, chordMode: boolean, hybridVoices: HybridVoices): KeyboardZone[] {
  if (mode === "drum") {
    return [drumZone("number"), drumZone("qwerty"), drumZone("home"), drumZone("bottom")];
  }
  if (mode === "instrument") {
    return [
      { row: "number", keys: ROW_KEYS.number, octave: 5, role: "notes" },
      { row: "qwerty", keys: ROW_KEYS.qwerty, octave: 4, role: "notes" },
      { row: "home", keys: ROW_KEYS.home, octave: 3, role: chordMode ? "chords" : "notes" },
      { row: "bottom", keys: ROW_KEYS.bottom, octave: 2, role: "notes" },
    ];
  }
  return [
    { row: "number", keys: ROW_KEYS.number, octave: 5, role: "notes", baseVoice: hybridVoices.number },
    { row: "qwerty", keys: ROW_KEYS.qwerty, octave: 4, role: "notes", baseVoice: hybridVoices.qwerty },
    {
      row: "home",
      keys: ROW_KEYS.home,
      octave: 3,
      role: chordMode ? "chords" : "notes",
      baseVoice: hybridVoices.home,
    },
    { row: "bottom", keys: ROW_KEYS.bottom, octave: 2, role: "notes", baseVoice: hybridVoices.bottom },
  ];
}

export type HybridVoices = { number: VoiceId; qwerty: VoiceId; home: VoiceId; bottom: VoiceId };

/** Keys that always trigger percussion / controls, independent of the row zones. */
export type FixedAction =
  | { kind: "drum"; drum: DrumId }
  | { kind: "control"; control: "repeat" | "choke" | "accent" | "vel_up" | "vel_down" }
  | { kind: "fx"; fx: "riser" | "downer" | "tom_fill" | "snare_roll" };

export const PERCUSSION_KEYS: Record<string, FixedAction> = {
  Space: { kind: "drum", drum: "kick" },
  Enter: { kind: "drum", drum: "snare" },
  Backspace: { kind: "drum", drum: "clap" },
  ShiftRight: { kind: "drum", drum: "hat_open" },
  Backslash: { kind: "drum", drum: "hat_closed" },
  ArrowUp: { kind: "fx", fx: "riser" },
  ArrowDown: { kind: "fx", fx: "downer" },
  ArrowLeft: { kind: "fx", fx: "tom_fill" },
  ArrowRight: { kind: "fx", fx: "snare_roll" },
};

export const NUMPAD_KEYS: Record<string, FixedAction> = {
  Numpad7: { kind: "drum", drum: "crash" },
  Numpad8: { kind: "drum", drum: "hat_open" },
  Numpad9: { kind: "drum", drum: "ride" },
  Numpad4: { kind: "drum", drum: "clap" },
  Numpad5: { kind: "drum", drum: "snare" },
  Numpad6: { kind: "drum", drum: "rim" },
  Numpad1: { kind: "drum", drum: "kick2" },
  Numpad2: { kind: "drum", drum: "kick" },
  Numpad3: { kind: "drum", drum: "tom" },
  NumpadDivide: { kind: "drum", drum: "hat_closed" },
  Numpad0: { kind: "control", control: "repeat" },
  NumpadDecimal: { kind: "control", control: "choke" },
  NumpadEnter: { kind: "control", control: "accent" },
  NumpadAdd: { kind: "control", control: "vel_up" },
  NumpadSubtract: { kind: "control", control: "vel_down" },
};
