import type { EventSource, PerformanceEvent } from "../performance/types";

export type LoggedEvent = PerformanceEvent & { source: EventSource };

/**
 * Log of every performed event while a master recording runs. Times are relative to the
 * recording start in audio time, so scheduled (look-ahead) events land where they sound.
 */
class PerformanceEventLog {
  private startAt: number | null = null;
  private events: LoggedEvent[] = [];

  start(at: number) {
    this.startAt = at;
    this.events = [];
  }

  stop(): LoggedEvent[] {
    this.startAt = null;
    const out = this.events.sort((a, b) => a.timeMs - b.timeMs);
    this.events = [];
    return out;
  }

  get active(): boolean {
    return this.startAt !== null;
  }

  /** Distinct sources logged so far in this recording. */
  sources(): EventSource[] {
    return [...new Set(this.events.map((e) => e.source))];
  }

  capture(source: EventSource, ev: PerformanceEvent, at: number) {
    if (this.startAt === null || at < this.startAt) return;
    this.events.push({ ...ev, timeMs: Math.round((at - this.startAt) * 1000), source });
  }
}

export const eventLog = new PerformanceEventLog();
