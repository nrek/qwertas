import type { DrumId } from "../drums/kits";
import type { LayerId } from "../mappings/layers";
import { NUMPAD_KEYS, PERCUSSION_KEYS } from "../mappings/zones";
import { stepSeconds } from "../text/parser";
import type { QwertasScore } from "../text/types";

export type PracticeEvent = {
  type: "note" | "drum" | "rest";
  /** Physical key the user must hold; absent for rests. */
  code?: string;
  layer: LayerId;
  durationUnits: number;
  requiredMs: number;
  source: { start: number; end: number };
};

const LAYER_MODIFIERS: Record<LayerId, string[]> = {
  base: [],
  shift: ["ShiftLeft"],
  ctrl: ["ControlLeft"],
  alt: ["AltLeft"],
  shift_ctrl: ["ShiftLeft", "ControlLeft"],
  shift_alt: ["ShiftLeft", "AltLeft"],
  ctrl_alt: ["ControlLeft", "AltLeft"],
};

/** Fixed key that plays a named drum live: the percussion keys first, then the numpad. */
export function drumCode(drum: DrumId): string | undefined {
  for (const map of [PERCUSSION_KEYS, NUMPAD_KEYS]) {
    for (const [code, action] of Object.entries(map)) {
      if (action.kind === "drum" && action.drum === drum) return code;
    }
  }
  return undefined;
}

export function keyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "Num ");
}

/** Score → the ordered things a learner must do: hold a key, or wait out a rest. */
export function flattenPracticeEvents(score: QwertasScore): PracticeEvent[] {
  const unitMs = stepSeconds(score.metadata.tempo, score.metadata.grid) * 1000;
  const out: PracticeEvent[] = [];
  for (const e of score.events) {
    if (e.durationUnits <= 0) continue;
    const base = { durationUnits: e.durationUnits, requiredMs: e.durationUnits * unitMs, source: e.source };
    if (e.type === "note" && e.physicalKey) {
      out.push({ ...base, type: "note", code: e.physicalKey, layer: e.layer ?? "base" });
    } else if (e.type === "drum" && e.drum) {
      const code = drumCode(e.drum);
      // Fixed percussion keys ignore the layer, so drums never require modifiers.
      out.push(code ? { ...base, type: "drum", code, layer: "base" } : { ...base, type: "rest", layer: "base" });
    } else if (e.type === "rest") {
      out.push({ ...base, type: "rest", layer: "base" });
    }
  }
  return out;
}

export type CoachStatus = "idle" | "running" | "finished";

export type CoachState = {
  status: CoachStatus;
  index: number;
  total: number;
  current: PracticeEvent | null;
  /** Keys to highlight: the target plus any modifiers its layer needs. */
  promptCodes: ReadonlySet<string>;
  /** 0..1 of the current event's required hold (or rest wait). */
  progress: number;
  /** Keys still held after their note completed; they no longer count until released. */
  spentCodes: ReadonlySet<string>;
};

/**
 * Pure practice state machine. The caller feeds the held key set and current layer on every
 * key change and ticks it with a clock; the coach advances only when the target is held,
 * in the required layer, for the score's exact duration. Rests advance on their own.
 */
export class LearnCoach {
  private events: PracticeEvent[] = [];
  private index = 0;
  private status: CoachStatus = "idle";
  private held: ReadonlySet<string> = new Set();
  private layer: LayerId = "base";
  /** Keys still down from the previous event; they must be released before they count again. */
  private stale = new Set<string>();
  private since: number | null = null;

  constructor(private now: () => number) {}

  start(score: QwertasScore) {
    this.events = flattenPracticeEvents(score);
    this.index = 0;
    this.stale = new Set(this.held);
    this.status = this.events.length ? "running" : "finished";
    this.enter();
  }

  stop() {
    this.stale.clear();
    this.status = "idle";
    this.events = [];
    this.index = 0;
    this.since = null;
  }

  /** Feed the live keyboard state after every keydown/keyup. */
  update(held: ReadonlySet<string>, layer: LayerId) {
    this.held = new Set(held);
    this.layer = layer;
    for (const code of [...this.stale]) if (!held.has(code)) this.stale.delete(code);
    if (this.status !== "running") return;
    const ev = this.events[this.index];
    if (!ev || ev.type === "rest") return;
    if (this.satisfied(ev)) {
      if (this.since === null) this.since = this.now();
    } else {
      // Early release (or wrong layer) resets this event's progress.
      this.since = null;
    }
    this.tick();
  }

  tick() {
    if (this.status !== "running") return;
    // Several events can complete in one tick only for back-to-back rests, which is fine.
    for (let guard = 0; guard < this.events.length; guard++) {
      const ev = this.events[this.index];
      if (!ev || this.since === null) return;
      if (this.now() - this.since < ev.requiredMs / 1000) return;
      this.advance();
    }
  }

  state(): CoachState {
    const current = this.status === "running" ? (this.events[this.index] ?? null) : null;
    const promptCodes = new Set<string>();
    if (current?.code) {
      promptCodes.add(current.code);
      for (const m of LAYER_MODIFIERS[current.layer]) promptCodes.add(m);
    }
    let progress = 0;
    if (current && this.since !== null) {
      progress = Math.min(1, ((this.now() - this.since) * 1000) / current.requiredMs);
    }
    return {
      status: this.status,
      index: this.index,
      total: this.events.length,
      current,
      promptCodes,
      progress,
      spentCodes: new Set(this.stale),
    };
  }

  private satisfied(ev: PracticeEvent): boolean {
    return (
      !!ev.code &&
      this.held.has(ev.code) &&
      !this.stale.has(ev.code) &&
      (ev.type === "drum" || this.layer === ev.layer)
    );
  }

  private advance() {
    this.stale = new Set(this.held);
    this.index++;
    if (this.index >= this.events.length) {
      this.status = "finished";
      this.since = null;
      return;
    }
    this.enter();
  }

  private enter() {
    const ev = this.events[this.index];
    this.since = ev?.type === "rest" && this.status === "running" ? this.now() : null;
  }
}
