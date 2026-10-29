import {
  closeLoop,
  forEachLoopEvent,
  gridMs,
  quantizeEvents,
  roundToBeats,
  tileToLength,
} from "../src/loops/loop-events";
import type { PerformanceEvent } from "../src/performance/types";

const down = (timeMs: number, key = "KeyZ"): PerformanceEvent => ({ timeMs, type: "down", physicalKey: key });
const up = (timeMs: number, key = "KeyZ"): PerformanceEvent => ({ timeMs, type: "up", physicalKey: key });

describe("master loop length", () => {
  it("rounds the first loop to whole beats, minimum one", () => {
    expect(roundToBeats(7.9, 0.5)).toBeCloseTo(8);
    expect(roundToBeats(8.2, 0.5)).toBeCloseTo(8);
    expect(roundToBeats(0.1, 0.5)).toBeCloseTo(0.5);
  });
});

describe("closeLoop", () => {
  it("drops overrun note starts and ends held notes at the seam", () => {
    const out = closeLoop([down(100), up(300), down(1900), up(2100), down(2050, "KeyX")], 2000);
    expect(out).toEqual([down(100), up(300), down(1900), up(1999)]);
  });
});

describe("quantize", () => {
  it("grid sizes follow BPM", () => {
    expect(gridMs("off", 120)).toBeNull();
    expect(gridMs("1/4", 120)).toBe(500);
    expect(gridMs("1/16", 120)).toBe(125);
  });

  it("snaps starts and moves each release with its start (keeps note length)", () => {
    const out = quantizeEvents([down(130), up(380), down(990, "KeyX"), up(1100, "KeyX")], 125, 2000);
    expect(out).toEqual([down(125), up(375), down(1000, "KeyX"), up(1110, "KeyX")]);
  });

  it("wraps starts that snap onto the loop end to the top", () => {
    const out = quantizeEvents([down(1980)], 125, 2000);
    expect(out[0]!.timeMs).toBe(0);
  });

  it("off leaves timing untouched", () => {
    const events = [down(131), up(377)];
    expect(quantizeEvents(events, null, 2000)).toEqual(events);
  });
});

describe("text → loop tiling", () => {
  it("repeats a short pattern across a longer cycle", () => {
    const out = tileToLength([down(0), up(200)], 500, 2000);
    expect(out.filter((e) => e.type === "down").map((e) => e.timeMs)).toEqual([0, 500, 1000, 1500]);
  });

  it("truncates a long pattern to the cycle", () => {
    const out = tileToLength([down(0), up(100), down(1500), up(1600)], 2000, 1000);
    expect(out).toEqual([down(0), up(100)]);
  });
});

describe("shared clock scheduling", () => {
  const events = [{ timeMs: 0 }, { timeMs: 500 }];

  it("visits each event once per cycle inside the window", () => {
    const hits: number[] = [];
    forEachLoopEvent(events, 1, 10, 10, 12.2, (_e, at) => hits.push(at));
    expect(hits).toEqual([10, 10.5, 11, 11.5, 12]);
  });

  it("consecutive windows never double-schedule or skip", () => {
    const hits: number[] = [];
    for (let i = 0; i < 25; i++) {
      const from = 10 + i * 0.12;
      forEachLoopEvent(events, 1, 10, from, from + 0.12, (_e, at) => hits.push(Math.round(at * 1000)));
    }
    expect(hits).toEqual([10000, 10500, 11000, 11500, 12000, 12500]);
  });

  it("can play a single pass", () => {
    const hits: number[] = [];
    forEachLoopEvent(events, 1, 0, 0, 5, (_e, at) => hits.push(at), 1);
    expect(hits).toEqual([0, 0.5]);
  });
});
