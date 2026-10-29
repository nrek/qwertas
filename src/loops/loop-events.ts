import type { PerformanceEvent } from "../performance/types";

/** Grid size in ms for a quantize setting at a tempo, or null for "off". */
export function gridMs(quantize: "off" | "1/4" | "1/8" | "1/16", bpm: number): number | null {
  if (quantize === "off") return null;
  const beat = 60000 / bpm;
  return beat * ({ "1/4": 1, "1/8": 0.5, "1/16": 0.25 } as const)[quantize];
}

function sortEvents(events: PerformanceEvent[]): PerformanceEvent[] {
  // Ups before downs at the same instant, so a retrigger doesn't get cut by its own release.
  const rank = (e: PerformanceEvent) => (e.type === "up" ? 0 : 1);
  return [...events].sort((a, b) => a.timeMs - b.timeMs || rank(a) - rank(b));
}

/**
 * Fit recorded events into one loop cycle: drop note starts at/after the end (that is
 * overrun the player already performed live), and end held notes just before the seam.
 */
export function closeLoop(events: PerformanceEvent[], lengthMs: number): PerformanceEvent[] {
  const out: PerformanceEvent[] = [];
  const open = new Set<string>();
  for (const e of sortEvents(events)) {
    const key = e.physicalKey ?? "";
    if (e.type === "up") {
      // A release only belongs to the loop if its press does.
      if (!open.delete(key)) continue;
      out.push(e.timeMs >= lengthMs ? { ...e, timeMs: lengthMs - 1 } : e);
    } else if (e.timeMs < lengthMs) {
      if (e.type === "down") open.add(key);
      out.push(e);
    }
  }
  return sortEvents(out);
}

/**
 * Snap event starts to the grid; each key's release moves with its start so note lengths
 * (the feel) survive. Starts that snap onto the loop end wrap to 0.
 */
export function quantizeEvents(events: PerformanceEvent[], grid: number | null, lengthMs: number): PerformanceEvent[] {
  if (!grid) return sortEvents(events);
  const shift = new Map<string, number>();
  const out = sortEvents(events).map((e) => {
    if (e.type === "up") {
      const d = shift.get(e.physicalKey ?? "") ?? 0;
      const t = Math.min(lengthMs - 1, Math.max(0, e.timeMs + d));
      return { ...e, timeMs: t };
    }
    let snapped = Math.round(e.timeMs / grid) * grid;
    if (snapped >= lengthMs - 0.5) snapped = 0;
    if (e.type === "down") shift.set(e.physicalKey ?? "", snapped - e.timeMs);
    return { ...e, timeMs: snapped };
  });
  return sortEvents(out);
}

/** Repeat a pattern to fill a loop of a different length (text sequence → existing cycle). */
export function tileToLength(events: PerformanceEvent[], patternMs: number, lengthMs: number): PerformanceEvent[] {
  if (patternMs <= 0) return [];
  const out: PerformanceEvent[] = [];
  for (let offset = 0; offset < lengthMs; offset += patternMs) {
    for (const e of events) out.push({ ...e, timeMs: e.timeMs + offset });
  }
  return closeLoop(out, lengthMs);
}

/** First loop length: whole beats, at least one. */
export function roundToBeats(seconds: number, beat: number): number {
  return Math.max(1, Math.round(seconds / beat)) * beat;
}

/**
 * Visit every looped event that sounds in [from, to): event time = anchor + k·length + offset.
 */
export function forEachLoopEvent<T extends { timeMs: number }>(
  events: readonly T[],
  lengthSec: number,
  anchor: number,
  from: number,
  to: number,
  fn: (ev: T, at: number, cycle: number) => void,
  maxCycles = Infinity,
) {
  if (lengthSec <= 0 || to <= anchor) return;
  const start = Math.max(from, anchor);
  let k = Math.max(0, Math.floor((start - anchor) / lengthSec));
  for (; k < maxCycles; k++) {
    const base = anchor + k * lengthSec;
    if (base >= to) break;
    for (const ev of events) {
      const at = base + ev.timeMs / 1000;
      if (at >= start && at < to) fn(ev, at, k);
    }
  }
}
