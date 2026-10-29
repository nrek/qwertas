import { engine, type Bus } from "../audio/engine";
import { activeKit, resolveKey, type KeyAction } from "../mappings/resolve";
import { eventLog } from "../recording/performance-events";
import { hasCanonicalPitch } from "./canonicalize";
import { contextFromSnapshot, type ContextSnapshot, type EventSource, type PerformanceEvent } from "./types";

type Release = (at: number | undefined, fast: boolean) => void;

/**
 * Turns PerformanceEvents into sound at an exact audio time. One instance per source
 * (live, text, each loop track) so held notes and buses never cross between sources.
 * Prefers pitch-canonical fields when present so layout changes cannot rewrite history.
 */
export class Performer {
  private held = new Map<string, Release>();

  constructor(
    readonly source: EventSource,
    public bus: Bus | null = null,
  ) {}

  /** Returns the resolved/display action or null. `at` undefined = now. */
  perform(ev: PerformanceEvent, snap: ContextSnapshot, at?: number): KeyAction | null {
    eventLog.capture(this.source, ev, at ?? engine.now());
    const layer = ev.layer ?? "base";
    const holdKey = ev.physicalKey ?? `anon:${ev.pitch ?? ev.drum ?? "x"}`;

    if (ev.type === "up") {
      this.held.get(holdKey)?.(at, false);
      this.held.delete(holdKey);
      return null;
    }

    const ctx = contextFromSnapshot(snap, layer);

    if (ev.type === "drum" || (ev.drum && !hasCanonicalPitch(ev))) {
      if (!ev.drum) return null;
      const kit = activeKit(ctx);
      engine.playDrum(ev.drum, kit, ev.velocity ?? 100, 1, at, this.bus);
      return { kind: "drum", drum: ev.drum, kit, velocity: ev.velocity ?? 100, pitch: 1, row: "fixed", label: ev.drum };
    }

    if (hasCanonicalPitch(ev) && ev.instrumentId) {
      const velocity = ev.velocity ?? 100;
      this.held.get(holdKey)?.(at, true);
      this.held.delete(holdKey);
      if (ev.pitches && ev.pitches.length > 1) {
        const hs = ev.pitches.map((m) => engine.noteOn(ev.instrumentId!, m, velocity * 0.82, at, this.bus));
        this.held.set(holdKey, (t, fast) => hs.forEach((h) => engine.noteOff(h, fast, t)));
        return {
          kind: "chord",
          voice: ev.instrumentId,
          midis: ev.pitches,
          velocity,
          row: "home",
          label: String(ev.pitches[0]),
          chordName: ev.pitches.join(","),
        };
      }
      const midi = ev.pitch ?? ev.pitches![0]!;
      const h = engine.noteOn(ev.instrumentId, midi, velocity, at, this.bus);
      this.held.set(holdKey, (t, fast) => engine.noteOff(h, fast, t));
      return { kind: "note", voice: ev.instrumentId, midi, velocity, row: "home", label: String(midi) };
    }

    // Legacy fallback: re-resolve physical key with the snapshot's mapping (defaults to legacy).
    const code = ev.physicalKey ?? "";
    const action = resolveKey(code, ctx);
    if (!action) return null;
    this.held.get(holdKey)?.(at, true);
    this.held.delete(holdKey);

    switch (action.kind) {
      case "note": {
        const h = engine.noteOn(action.voice, action.midi, action.velocity, at, this.bus);
        this.held.set(holdKey, (t, fast) => engine.noteOff(h, fast, t));
        break;
      }
      case "chord": {
        const hs = action.midis.map((m) => engine.noteOn(action.voice, m, action.velocity * 0.82, at, this.bus));
        this.held.set(holdKey, (t, fast) => hs.forEach((h) => engine.noteOff(h, fast, t)));
        break;
      }
      case "drum":
        engine.playDrum(action.drum, action.kit, ev.velocity ?? action.velocity, action.pitch, at, this.bus);
        break;
      case "fx":
        engine.playFx(action.fx, activeKit(ctx), ev.velocity ?? 100, at, this.bus);
        break;
      case "control":
        if (action.control === "choke") engine.chokeAll();
        break;
    }
    return action;
  }

  releaseAll(fast = true) {
    for (const release of this.held.values()) release(undefined, fast);
    this.held.clear();
  }
}
