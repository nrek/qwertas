import type { DrumId, KitId } from "../drums/kits";
import type { VoiceId } from "../instruments/voices";
import { chordOnDegree, degreeToMidi, type NoteName, type ScaleId } from "../scales/scales";
import { LAYER_VELOCITY, type LayerId } from "./layers";
import {
  dvorasMidi,
  isMelodicRow,
  melodicLabel,
  qwertorasMidi,
  type MappingId,
} from "./layout";
import type { Profile } from "./profiles";
import {
  DRUM_ROWS,
  NUMPAD_KEYS,
  PERCUSSION_KEYS,
  zonesFor,
  type FixedAction,
  type PlayMode,
  type RowId,
} from "./zones";

export type ResolveContext = {
  profile: Profile;
  root: NoteName;
  scale: ScaleId;
  mode: PlayMode;
  chordMode: boolean;
  octaveOffset: number;
  layer: LayerId;
  numpadEnabled: boolean;
  mappingId: MappingId;
  /** Unified forces every melodic row onto the active layer voice (DVORA default). */
  rowMode: "unified" | "layered";
};

export type KeyAction =
  | { kind: "note"; voice: VoiceId; midi: number; velocity: number; row: RowId; label: string }
  | {
      kind: "chord";
      voice: VoiceId;
      midis: number[];
      velocity: number;
      row: RowId;
      label: string;
      chordName: string;
    }
  | { kind: "drum"; drum: DrumId; kit: KitId; velocity: number; pitch: number; row: RowId | "fixed"; label: string }
  | Extract<FixedAction, { kind: "control" }>
  | Extract<FixedAction, { kind: "fx" }>;

const DRUM_VELOCITY = 100;

function fixedToAction(action: FixedAction, kit: KitId, row: RowId | "fixed"): KeyAction {
  if (action.kind === "drum") {
    return { kind: "drum", drum: action.drum, kit, velocity: DRUM_VELOCITY, pitch: 1, row, label: action.drum };
  }
  return action;
}

/** Kit for fixed percussion keys: the Ctrl+Alt kit layer swaps it too. */
export function activeKit(ctx: Pick<ResolveContext, "profile" | "layer">): KitId {
  const target = ctx.profile.layers[ctx.layer];
  return "kit" in target ? target.kit : ctx.profile.kit;
}

/**
 * Pure mapping: physical key + current state → what the key does. No audio, no React —
 * the keyboard controller triggers the result, and the UI calls this for key legends.
 */
export function resolveKey(code: string, ctx: ResolveContext): KeyAction | null {
  const kit = activeKit(ctx);

  if (code in NUMPAD_KEYS) {
    return ctx.numpadEnabled ? fixedToAction(NUMPAD_KEYS[code]!, kit, "numpad") : null;
  }
  if (code in PERCUSSION_KEYS) {
    // In Instrument mode Right Shift stays a Shift-layer modifier instead of an open hat.
    if (code === "ShiftRight" && ctx.mode === "instrument") return null;
    return fixedToAction(PERCUSSION_KEYS[code]!, kit, "fixed");
  }

  const zones = zonesFor(ctx.mode, ctx.chordMode, ctx.profile.hybrid);
  for (const zone of zones) {
    const index = zone.keys.indexOf(code);
    if (index < 0) continue;

    const target = ctx.profile.layers[ctx.layer];
    const layerIsKit = "kit" in target;

    if (zone.role === "drums" || layerIsKit) {
      const pads = zone.pads ?? DRUM_ROWS[zone.row as keyof typeof DRUM_ROWS];
      const drum = pads[index % pads.length]!;
      const repeatIndex = pads.slice(0, index).filter((d) => d === drum).length;
      const pitch = Math.pow(2, (repeatIndex * 3) / 12);
      return { kind: "drum", drum, kit, velocity: DRUM_VELOCITY, pitch, row: zone.row, label: drum };
    }

    const voice: VoiceId =
      ctx.rowMode === "unified" || ctx.layer !== "base" || !zone.baseVoice
        ? (target as { voice: VoiceId }).voice
        : zone.baseVoice;
    const velocity = LAYER_VELOCITY[ctx.layer];
    const octave = zone.octave + ctx.octaveOffset;

    if (zone.role === "chords") {
      const chord = chordOnDegree(ctx.root, ctx.scale, octave, index);
      return {
        kind: "chord",
        voice,
        midis: chord.midis,
        velocity,
        row: zone.row,
        label: chord.numeral,
        chordName: `${chord.numeral} — ${chord.name}`,
      };
    }

    const midi = pitchFor(ctx, zone.row, index, octave);
    return { kind: "note", voice, midi, velocity, row: zone.row, label: melodicLabel(midi) };
  }
  return null;
}

function pitchFor(ctx: ResolveContext, row: RowId, index: number, octave: number): number {
  if (ctx.mappingId === "dvorasqwertas" && isMelodicRow(row)) {
    return dvorasMidi(ctx.root, row, index, ctx.octaveOffset);
  }
  if (ctx.mappingId === "qwertoras" && isMelodicRow(row)) {
    return qwertorasMidi(ctx.root, ctx.scale, row, index, ctx.octaveOffset);
  }
  // legacy + number-row notes: scale degrees per octave row
  return degreeToMidi(ctx.root, ctx.scale, octave, index);
}