import { engine } from "../audio/engine";
import { createStore } from "../app/store";
import { forEachLoopEvent } from "../loops/loop-events";
import { transport, transportStore, type ScheduledSource } from "../loops/transport";
import { Performer } from "../performance/performer";
import type { ContextSnapshot, PerformanceEvent } from "../performance/types";
import { parseSequence, sequenceToPerformance, stepSeconds } from "./parser";
import type { Grid, QwertasScore } from "./types";

export const DEFAULT_TEXT = `{base} z x c v | z x c v
q..w..e..r
a-s-d-f
<KICK> . <SNARE> . <HAT> . <HAT> .`;

const TEXT_KEY = "cxl-qwert.text.v1";

function loadText(): string {
  try {
    return globalThis.localStorage?.getItem(TEXT_KEY) ?? DEFAULT_TEXT;
  } catch {
    return DEFAULT_TEXT;
  }
}

export type TextState = {
  text: string;
  playing: boolean;
  loop: boolean;
  grid: Grid;
  filename?: string;
  applyScoreSettings: boolean;
};

export const textStore = createStore<TextState>({
  text: loadText(),
  playing: false,
  loop: true,
  grid: 8,
  applyScoreSettings: true,
});

textStore.subscribe(() => {
  try {
    globalThis.localStorage?.setItem(TEXT_KEY, textStore.get().text);
  } catch {
    // storage unavailable
  }
});

/**
 * Plays a parsed text sequence through the shared transport (AudioContext look-ahead),
 * using the live mapping via a Performer — no setTimeout chains.
 */
class TextPlayer implements ScheduledSource {
  private performer = new Performer("text");
  private seq: QwertasScore = parseSequence("");
  private perf: PerformanceEvent[] = [];
  private anchor = 0;
  private stepSec = 0.25;
  private snapshot: ContextSnapshot | null = null;
  private snapshotSource: () => ContextSnapshot = () => {
    throw new Error("text snapshot source not set");
  };

  constructor() {
    transport.add(this);
    let bpm = transportStore.get().bpm;
    transportStore.subscribe(() => {
      const next = transportStore.get().bpm;
      if (next !== bpm) {
        bpm = next;
        this.retime();
      }
    });
  }

  setSnapshotSource(fn: () => ContextSnapshot) {
    this.snapshotSource = fn;
  }

  private compile() {
    const { text, grid, filename } = textStore.get();
    this.seq = parseSequence(text, { tempo: transportStore.get().bpm, grid, filename });
    this.stepSec = stepSeconds(this.seq.metadata.tempo, this.seq.metadata.grid);
    // Stamp pitches from the live snapshot so stored/exported events are layout-independent.
    this.perf = sequenceToPerformance(this.seq, this.stepSec * 1000, this.snapshotSource());
  }

  score(): QwertasScore {
    this.compile();
    return this.seq;
  }

  play() {
    if (!engine.running) return;
    this.stop();
    this.compile();
    if (this.seq.units === 0 || this.seq.errors.length > 0) return;
    // Follow the live profile/scale while playing; resnapshot on every play.
    this.snapshot = this.snapshotSource();
    const s = transport.state;
    if (s.running) {
      // Over running loops, enter on a bar so the pattern sits with them.
      this.anchor = s.cycleLength
        ? transport.nextBar(transport.earliest())
        : transport.nextBeat(transport.earliest());
    } else {
      this.anchor = transport.earliest();
      transport.start(this.anchor);
    }
    textStore.set({ playing: true });
  }

  stop() {
    this.performer.releaseAll(false);
    if (textStore.get().playing) textStore.set({ playing: false });
  }

  /** Text changed or grid/BPM changed mid-play: keep the playhead's position in steps. */
  retime() {
    if (!textStore.get().playing) return;
    const now = transport.earliest();
    const pos = (now - this.anchor) / this.stepSec;
    this.performer.releaseAll(false);
    this.compile();
    if (this.seq.units === 0 || this.seq.errors.length > 0) return this.stop();
    const wrapped = textStore.get().loop ? pos % this.seq.units : Math.min(pos, this.seq.units);
    this.anchor = now - wrapped * this.stepSec;
  }

  lengthSec(): number {
    return this.seq.units * this.stepSec;
  }

  /** Current source range under the playhead, for the editor cursor. */
  cursor(): { start: number; end: number } | null {
    if (!textStore.get().playing || this.seq.units === 0) return null;
    const pos = (engine.now() - this.anchor) / this.stepSec;
    if (pos < 0) return null;
    const unit = Math.floor(textStore.get().loop ? pos % this.seq.units : pos);
    for (const e of this.seq.events) {
      if (e.type === "bar" || e.type === "modifier") continue;
      if (unit >= e.startUnit && unit < e.startUnit + e.durationUnits) return e.source;
    }
    return null;
  }

  /** Current sequence as loop material: events (ms), pattern length (ms). */
  export(): { events: PerformanceEvent[]; patternMs: number } {
    this.compile();
    return { events: this.perf, patternMs: this.seq.units * this.stepSec * 1000 };
  }

  schedule(from: number, to: number) {
    if (!textStore.get().playing || !this.snapshot) return;
    const loop = textStore.get().loop;
    const len = this.lengthSec();
    if (!loop && from >= this.anchor + len) {
      this.stop();
      return;
    }
    const snap = this.snapshot;
    forEachLoopEvent(
      this.perf,
      len,
      this.anchor,
      from,
      to,
      (ev, at) => this.performer.perform(ev, snap, at),
      loop ? Infinity : 1,
    );
  }
}

export const textPlayer = new TextPlayer();
