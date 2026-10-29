import type { DrumId } from "../drums/kits";
import type { VoiceId } from "../instruments/voices";
import type { LayerId } from "../mappings/layers";
import type { MappingId } from "../mappings/layout";
import { PROFILES, type ProfileId } from "../mappings/profiles";
import type { ResolveContext } from "../mappings/resolve";
import type { PlayMode } from "../mappings/zones";
import type { NoteName, ScaleId } from "../scales/scales";

/**
 * Shared event for live, text, and loops.
 * Pitch fields are the playback source of truth when present; physicalKey/layer remain
 * as input + performance metadata (Learn highlights, UI, legacy resolve fallback).
 */
export type PerformanceEvent = {
  timeMs: number;
  type: "down" | "up" | "drum";
  /** Input metadata — which physical key produced this event. */
  physicalKey?: string;
  layer?: LayerId;
  drum?: DrumId;
  velocity?: number;
  /** Canonical MIDI pitch (notes) or chord root. */
  pitch?: number;
  /** Full chord MIDI set when type is a chordal down. */
  pitches?: number[];
  /** Voice used at capture time. */
  instrumentId?: VoiceId;
  mappingId?: MappingId;
  mappingVersion?: number;
};

export type EventSource = "live" | "text" | `track:${number}`;

/** Musical settings frozen with a loop so later profile/scale/layout changes don't rewrite it. */
export type ContextSnapshot = {
  profileId: ProfileId;
  root: NoteName;
  scale: ScaleId;
  mode: PlayMode;
  chordMode: boolean;
  octaveOffset: number;
  numpadEnabled: boolean;
  /** Layout used when the loop/text was captured. Missing → treat as legacy. */
  mappingId?: MappingId;
  /** Unified = all melodic rows share the layer voice; layered = hybrid per-row voices. */
  rowMode?: "unified" | "layered";
};

export function snapshotOf(s: ContextSnapshot): ContextSnapshot {
  return {
    profileId: s.profileId,
    root: s.root,
    scale: s.scale,
    mode: s.mode,
    chordMode: s.chordMode,
    octaveOffset: s.octaveOffset,
    numpadEnabled: s.numpadEnabled,
    mappingId: s.mappingId,
    rowMode: s.rowMode,
  };
}

export function contextFromSnapshot(snap: ContextSnapshot, layer: LayerId): ResolveContext {
  return {
    profile: PROFILES[snap.profileId],
    root: snap.root,
    scale: snap.scale,
    mode: snap.mode,
    chordMode: snap.chordMode,
    octaveOffset: snap.octaveOffset,
    layer,
    numpadEnabled: snap.numpadEnabled,
    mappingId: snap.mappingId ?? "legacy",
    rowMode: snap.rowMode ?? "layered",
  };
}
