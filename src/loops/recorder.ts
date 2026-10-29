import { engine } from "../audio/engine";
import { createStore } from "../app/store";
import type { ContextSnapshot, PerformanceEvent } from "../performance/types";
import { closeLoop, gridMs, quantizeEvents, roundToBeats, tileToLength } from "./loop-events";
import { LoopTrack, nameForEvents } from "./track";
import { transport, transportStore, type ScheduledSource } from "./transport";
import { TRACK_DEFAULT, TRACK_MAX, TRACK_MIN, type TrackView } from "./types";

/** Hits up to this early (seconds) before the downbeat count as on it. */
const EARLY_GRACE = 0.06;

export const loopStore = createStore<{ tracks: TrackView[]; activeCount: number }>({
  tracks: Array.from({ length: TRACK_DEFAULT }, (_, i) => new LoopTrack(i + 1).view()),
  activeCount: TRACK_DEFAULT,
});

/**
 * Loop station with 2–8 active lanes. All TRACK_MAX tracks exist in memory; reducing the
 * slider hides higher lanes without deleting their events (session-only recovery).
 */
class LoopStation implements ScheduledSource {
  readonly tracks = Array.from({ length: TRACK_MAX }, (_, i) => new LoopTrack(i + 1));
  private activeCount = TRACK_DEFAULT;
  private snapshotSource: () => ContextSnapshot = () => {
    throw new Error("loop station snapshot source not set");
  };

  constructor() {
    transport.add(this);
  }

  setSnapshotSource(fn: () => ContextSnapshot) {
    this.snapshotSource = fn;
  }

  getActiveCount() {
    return this.activeCount;
  }

  /** Grow/shrink visible lanes. Shrinking deactivates higher tracks at a clean boundary. */
  setActiveCount(n: number) {
    const next = Math.max(TRACK_MIN, Math.min(TRACK_MAX, Math.round(n)));
    if (next === this.activeCount) return;
    if (next < this.activeCount) {
      for (let i = next; i < this.activeCount; i++) {
        const t = this.tracks[i]!;
        if (t.state === "armed" || t.state === "recording") t.reset();
        else if (t.state === "playing") {
          t.state = "stopped";
          t.performer.releaseAll(false);
        }
      }
    }
    this.activeCount = next;
    this.publish();
  }

  private isActive(t: LoopTrack) {
    return t.id <= this.activeCount;
  }

  private publish() {
    loopStore.set({
      activeCount: this.activeCount,
      tracks: this.tracks.map((t) => t.view(!this.isActive(t))),
    });
  }

  private track(id: number): LoopTrack {
    const t = this.tracks[id - 1];
    if (!t) throw new Error(`no track ${id}`);
    return t;
  }

  private hasContent(): boolean {
    return this.tracks.some((t) => t.state === "playing" || t.state === "stopped");
  }

  /** Arm a track. Empty tracks only — clear a track to re-record it. */
  record(id: number) {
    const t = this.track(id);
    if (!this.isActive(t) || t.state !== "empty" || !engine.running) return;
    const s = transport.state;
    const countIn = s.countInBars * transport.bar();

    if (s.cycleLength === null && !this.tracks.some((o) => o.state === "armed" || o.state === "recording")) {
      // First loop: free length, ends when the user presses Stop.
      let downbeat: number;
      if (s.running) {
        downbeat = transport.nextBar(transport.earliest() + countIn);
      } else {
        const start = transport.earliest();
        transport.start(start);
        downbeat = start + countIn;
        transportStore.set({ origin: downbeat, cycleOrigin: downbeat });
      }
      if (s.countInBars) transport.scheduleCountIn(downbeat, s.countInBars);
      t.recStart = downbeat;
      t.recEnd = null;
    } else if (s.cycleLength !== null) {
      if (!s.running) {
        const start = transport.earliest();
        const downbeat = start + countIn;
        transport.start(start);
        transportStore.set({ origin: downbeat, cycleOrigin: downbeat });
        for (const o of this.tracks) if (o.state === "stopped") this.resume(o, downbeat);
        if (s.countInBars) transport.scheduleCountIn(downbeat, s.countInBars);
        t.recStart = downbeat;
      } else {
        t.recStart = transport.nextCycle(transport.earliest());
      }
      t.recEnd = t.recStart + s.cycleLength;
    } else {
      return; // another track is still recording the first loop
    }

    t.snapshot = this.snapshotSource();
    t.events = [];
    t.openKeys.clear();
    t.ensureBus();
    t.state = "armed";
    this.publish();
  }

  /** Live keyboard events, at the audio time they sounded. */
  capture(ev: PerformanceEvent, at: number) {
    let changed = false;
    for (const t of this.tracks) {
      if (!this.isActive(t)) continue;
      const capturing =
        t.state === "armed" || t.state === "recording" || (t.state === "playing" && t.recEnd !== null && at < t.recEnd);
      if (!capturing || at < t.recStart - EARLY_GRACE) continue;
      const key = ev.physicalKey ?? "";
      const ms = Math.max(0, (at - t.recStart) * 1000);
      if (ev.type === "up") {
        if (!t.openKeys.has(key)) continue;
        t.openKeys.delete(key);
      } else if (t.recEnd !== null && at >= t.recEnd) {
        continue;
      } else if (ev.type === "down") {
        t.openKeys.add(key);
      }
      const rec: PerformanceEvent = { ...ev, timeMs: ms };
      if (t.state === "playing") {
        // Late arrival after the cycle was closed for look-ahead: fold it in directly.
        const grid = gridMs(transport.state.quantize, transport.state.bpm);
        t.events = quantizeEvents(closeLoop([...t.events, rec], t.lengthMs), grid, t.lengthMs);
      } else {
        t.events.push(rec);
      }
      changed = true;
    }
    if (changed) this.publish();
  }

  /** Track Stop button: ends a first loop, cancels an arm/overdub, or stops playback. */
  stop(id: number) {
    const t = this.track(id);
    if (t.state === "recording" && t.recEnd === null) {
      this.finishFirstLoop(t);
    } else if (t.state === "armed" || t.state === "recording") {
      t.reset();
      this.dropCycleIfEmpty();
    } else if (t.state === "playing") {
      t.state = "stopped";
      t.performer.releaseAll(false);
    }
    this.publish();
  }

  private finishFirstLoop(t: LoopTrack) {
    const raw = Math.max(0, engine.now() - t.recStart);
    const length = roundToBeats(raw, transport.beat());
    transportStore.set({ cycleLength: length, cycleOrigin: t.recStart });
    t.recEnd = t.recStart + length;
  }

  play(id: number) {
    const t = this.track(id);
    if (!this.isActive(t) || t.state !== "stopped") return;
    if (!transport.state.running) {
      transport.start();
    }
    this.resume(t, transport.earliest());
    this.publish();
  }

  private resume(t: LoopTrack, from: number) {
    t.state = "playing";
    t.playFrom = from;
  }

  toggleMute(id: number) {
    const t = this.track(id);
    t.muted = !t.muted;
    t.applyGain();
    this.publish();
  }

  setVolume(id: number, volume: number) {
    const t = this.track(id);
    t.volume = Math.max(0, Math.min(1, volume));
    t.applyGain();
    this.publish();
  }

  /** Removes only this track; the others keep looping untouched. */
  clear(id: number) {
    this.track(id).reset();
    this.dropCycleIfEmpty();
    this.publish();
  }

  private dropCycleIfEmpty() {
    if (this.tracks.every((t) => t.state === "empty")) transportStore.set({ cycleLength: null });
  }

  /** Text → Loop: load a sequence as a track, tiled to the existing cycle if there is one. */
  loadEvents(id: number, events: PerformanceEvent[], patternMs: number, snapshot: ContextSnapshot, name: string) {
    if (!engine.running || patternMs <= 0) return;
    const t = this.track(id);
    t.reset();
    const s = transport.state;
    let lengthMs: number;
    if (s.cycleLength === null) {
      lengthMs = patternMs;
      const anchor = s.running ? transport.nextBeat(transport.earliest()) : transport.earliest();
      if (!s.running) transport.start(anchor);
      transportStore.set({ cycleLength: patternMs / 1000, cycleOrigin: anchor });
      t.playFrom = anchor;
      t.events = closeLoop(events, lengthMs);
    } else {
      lengthMs = s.cycleLength * 1000;
      if (!s.running) {
        transport.start();
        for (const o of this.tracks) if (o.state === "stopped") this.resume(o, transport.state.cycleOrigin);
      }
      t.playFrom = transport.earliest();
      t.events = tileToLength(events, patternMs, lengthMs);
    }
    t.lengthMs = lengthMs;
    t.snapshot = snapshot;
    t.name = name;
    t.ensureBus();
    t.state = "playing";
    this.publish();
  }

  /** Global Play: start the clock and every stopped track from the top of a cycle. */
  playAll() {
    if (!engine.running) return;
    if (!transport.state.running) transport.start();
    const from = transport.state.cycleOrigin;
    for (const t of this.tracks) if (this.isActive(t) && t.state === "stopped") this.resume(t, from);
    this.publish();
  }

  /** Global Stop All: every track stops, pending recordings are cancelled. */
  stopAll() {
    for (const t of this.tracks) {
      if (t.state === "armed" || (t.state === "recording" && t.recEnd !== null)) t.reset();
      else if (t.state === "recording") this.finishAndStop(t);
      else if (t.state === "playing") t.state = "stopped";
      t.performer.releaseAll(true);
    }
    this.dropCycleIfEmpty();
    this.publish();
  }

  private finishAndStop(t: LoopTrack) {
    this.finishFirstLoop(t);
    this.finalize(t);
    t.state = "stopped";
  }

  private finalize(t: LoopTrack) {
    const s = transport.state;
    const lengthMs = (s.cycleLength ?? 0) * 1000;
    const grid = gridMs(s.quantize, s.bpm);
    t.lengthMs = lengthMs;
    t.events = quantizeEvents(closeLoop(t.events, lengthMs), grid, lengthMs);
    if (t.snapshot) t.name = nameForEvents(t.events, t.snapshot, t.name);
    t.state = "playing";
    t.playFrom = t.recEnd ?? transport.earliest();
  }

  schedule(from: number, to: number) {
    const s = transport.state;
    let changed = false;
    for (const t of this.tracks) {
      if (!this.isActive(t)) continue;
      if (t.state === "armed" && from >= t.recStart) {
        t.state = "recording";
        changed = true;
      }
      // Close the cycle one look-ahead early so its first repetition isn't skipped;
      // capture() keeps folding in hits until recEnd actually passes.
      if (t.state === "recording" && t.recEnd !== null && to >= t.recEnd) {
        this.finalize(t);
        changed = true;
      }
    }
    if (s.running && s.cycleLength) {
      for (const t of this.tracks) {
        if (this.isActive(t)) t.schedule(from, to, s.cycleOrigin, s.cycleLength);
      }
    }
    if (changed) this.publish();
  }
}

export const loopStation = new LoopStation();
