import type { KeyAction } from "../mappings/resolve";
import type { MappingId } from "../mappings/layout";
import { MAPPING_VERSION } from "../mappings/layout";
import type { PerformanceEvent } from "./types";

/** Stamp resolved pitch/instrument onto an event. Keystroke fields stay as input metadata. */
export function withCanonical(ev: PerformanceEvent, action: KeyAction | null, mappingId: MappingId): PerformanceEvent {
  if (!action) return { ...ev, mappingId, mappingVersion: MAPPING_VERSION };
  if (action.kind === "note") {
    return {
      ...ev,
      pitch: action.midi,
      pitches: undefined,
      instrumentId: action.voice,
      velocity: action.velocity,
      mappingId,
      mappingVersion: MAPPING_VERSION,
    };
  }
  if (action.kind === "chord") {
    return {
      ...ev,
      pitch: action.midis[0],
      pitches: action.midis,
      instrumentId: action.voice,
      velocity: action.velocity,
      mappingId,
      mappingVersion: MAPPING_VERSION,
    };
  }
  if (action.kind === "drum") {
    return {
      ...ev,
      type: ev.type === "up" ? "up" : "drum",
      drum: action.drum,
      velocity: ev.velocity ?? action.velocity,
      instrumentId: undefined,
      pitch: undefined,
      pitches: undefined,
      mappingId,
      mappingVersion: MAPPING_VERSION,
    };
  }
  return { ...ev, mappingId, mappingVersion: MAPPING_VERSION };
}

/** True when the event carries enough pitch data to play without re-resolving the key map. */
export function hasCanonicalPitch(ev: PerformanceEvent): boolean {
  return typeof ev.pitch === "number" || (Array.isArray(ev.pitches) && ev.pitches.length > 0);
}
