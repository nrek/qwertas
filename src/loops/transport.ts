import { engine } from "../audio/engine";
import { createStore } from "../app/store";
import type { Quantize } from "./types";

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
export const BEATS_PER_BAR = 4;

export interface ScheduledSource {
  /** Schedule everything that sounds in [from, to) (audio seconds). Called every tick. */
  schedule(from: number, to: number): void;
}

export type TransportState = {
  bpm: number;
  metronome: boolean;
  countInBars: 0 | 1 | 2;
  quantize: Quantize;
  running: boolean;
  /** Audio time of beat 0 of the metronome grid. */
  origin: number;
  /** Master loop length in seconds — set by the first recorded/loaded track. */
  cycleLength: number | null;
  /** Audio time of loop cycle 0. */
  cycleOrigin: number;
};

export const transportStore = createStore<TransportState>({
  bpm: 120,
  metronome: false,
  countInBars: 1,
  quantize: "off",
  running: false,
  origin: 0,
  cycleLength: null,
  cycleOrigin: 0,
});

/**
 * One clock for everything: a short look-ahead scheduler on AudioContext time.
 * Tracks, text playback and the metronome never run their own timers, so they cannot drift.
 */
class Transport {
  private sources = new Set<ScheduledSource>();
  private scheduledUntil = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private countIn: { at: number; accent: boolean }[] = [];

  get state(): TransportState {
    return transportStore.get();
  }

  beat(): number {
    return 60 / this.state.bpm;
  }

  bar(): number {
    return this.beat() * BEATS_PER_BAR;
  }

  add(source: ScheduledSource) {
    this.sources.add(source);
  }

  /** Make sure the scheduler clock is ticking (the engine must already be started). */
  ensureClock() {
    if (this.timer) return;
    this.scheduledUntil = engine.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Earliest time a newly started thing can be scheduled without being skipped. */
  earliest(): number {
    return Math.max(engine.now() + 0.03, this.scheduledUntil) + 0.005;
  }

  start(at = this.earliest()) {
    this.ensureClock();
    transportStore.set({ running: true, origin: at, cycleOrigin: at });
  }

  stop() {
    this.countIn = [];
    transportStore.set({ running: false });
  }

  setBpm(bpm: number) {
    const clamped = Math.max(40, Math.min(240, Math.round(bpm)));
    const s = this.state;
    if (s.running) {
      // Re-anchor the grid at the next beat so the metronome doesn't jump.
      transportStore.set({ origin: this.nextBeat(this.earliest()), bpm: clamped });
    } else {
      transportStore.set({ bpm: clamped });
    }
  }

  nextBeat(t: number): number {
    const { origin } = this.state;
    const b = this.beat();
    return origin + Math.ceil((t - origin - 1e-6) / b) * b;
  }

  nextBar(t: number): number {
    const { origin } = this.state;
    const b = this.bar();
    return origin + Math.ceil((t - origin - 1e-6) / b) * b;
  }

  nextCycle(t: number): number {
    const { cycleOrigin, cycleLength } = this.state;
    if (!cycleLength) return t;
    return cycleOrigin + Math.ceil((t - cycleOrigin - 1e-6) / cycleLength) * cycleLength;
  }

  /** Count-in clicks for `bars` bars ending exactly at `downbeat`. */
  scheduleCountIn(downbeat: number, bars: number) {
    const b = this.beat();
    const n = bars * BEATS_PER_BAR;
    for (let i = n; i >= 1; i--) {
      this.countIn.push({ at: downbeat - i * b, accent: i % BEATS_PER_BAR === 0 });
    }
  }

  private tick() {
    const now = engine.now();
    const from = Math.max(this.scheduledUntil, now);
    const to = now + LOOKAHEAD;
    if (to <= from) return;
    const s = this.state;

    if (s.running && s.metronome) {
      const b = this.beat();
      let k = Math.ceil((from - s.origin - 1e-6) / b);
      for (let t = s.origin + k * b; t < to; k++, t = s.origin + k * b) {
        if (t >= from) engine.click(t, ((k % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0);
      }
    }
    if (this.countIn.length) {
      const due = this.countIn.filter((c) => c.at < to);
      this.countIn = this.countIn.filter((c) => c.at >= to);
      // With the metronome already clicking, a count-in would double every beat.
      if (!(s.running && s.metronome)) for (const c of due) if (c.at >= from) engine.click(c.at, c.accent);
    }

    for (const src of this.sources) src.schedule(from, to);
    this.scheduledUntil = to;
  }
}

export const transport = new Transport();
