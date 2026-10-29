import { engine, type Bus } from "../audio/engine";
import { VOICES } from "../instruments/voices";
import { resolveKey } from "../mappings/resolve";
import { Performer } from "../performance/performer";
import { contextFromSnapshot, type ContextSnapshot, type PerformanceEvent } from "../performance/types";
import { forEachLoopEvent } from "./loop-events";
import type { TrackState, TrackView } from "./types";

/** A loop is performance events (not audio), replayed through the same mapping as live play. */
export class LoopTrack {
  name: string;
  state: TrackState = "empty";
  events: PerformanceEvent[] = [];
  lengthMs = 0;
  volume = 0.85;
  muted = false;
  snapshot: ContextSnapshot | null = null;
  readonly performer: Performer;
  bus: Bus | null = null;

  /** Recording window in audio time. `recEnd` null = first loop, ends when the user stops. */
  recStart = 0;
  recEnd: number | null = null;
  /** Keys pressed during this recording (ignore releases of keys held from before). */
  openKeys = new Set<string>();
  /** Playback never schedules before this audio time (resume / fresh loop). */
  playFrom = 0;

  constructor(readonly id: number) {
    this.name = `Track ${id}`;
    this.performer = new Performer(`track:${id}`);
  }

  view(inactive = false): TrackView {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      muted: this.muted,
      volume: this.volume,
      eventCount: this.events.length,
      lengthMs: this.lengthMs,
      recStart: this.recStart,
      recEnd: this.recEnd,
      inactive,
    };
  }

  ensureBus() {
    if (!this.bus) {
      this.bus = engine.createBus(this.gain());
      this.performer.bus = this.bus;
    }
  }

  gain(): number {
    return this.muted ? 0 : this.volume;
  }

  applyGain() {
    if (this.bus) engine.setBusGain(this.bus, this.gain());
  }

  schedule(from: number, to: number, cycleOrigin: number, cycleLength: number) {
    if (this.state !== "playing" || !this.snapshot) return;
    const snap = this.snapshot;
    forEachLoopEvent(this.events, cycleLength, cycleOrigin, Math.max(from, this.playFrom), to, (ev, at) =>
      this.performer.perform(ev, snap, at),
    );
  }

  reset() {
    this.performer.releaseAll(true);
    if (this.bus) engine.disposeBus(this.bus);
    this.bus = null;
    this.performer.bus = null;
    this.state = "empty";
    this.events = [];
    this.lengthMs = 0;
    this.snapshot = null;
    this.recEnd = null;
    this.openKeys.clear();
    this.name = `Track ${this.id}`;
  }
}

/** Name a loop by what it mostly contains: Beat, Bass, Chords, or its main instrument. */
export function nameForEvents(events: PerformanceEvent[], snap: ContextSnapshot, fallback: string): string {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const e of events) {
    if (e.type === "drum") bump("Beat");
    if (e.type !== "down" || !e.physicalKey) continue;
    const a = resolveKey(e.physicalKey, contextFromSnapshot(snap, e.layer ?? "base"));
    if (!a) continue;
    if (a.kind === "drum" || a.kind === "fx") bump("Beat");
    else if (a.kind === "chord") bump("Chords");
    else if (a.kind === "note") bump(a.voice === "bass" || a.row === "bottom" ? "Bass" : VOICES[a.voice].label);
  }
  let best = fallback;
  let max = 0;
  for (const [k, n] of counts) if (n > max) [best, max] = [k, n];
  return best;
}
