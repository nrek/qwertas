import { readFileSync } from "node:fs";
import { LearnCoach, drumCode, flattenPracticeEvents } from "../src/learn/coach";
import { parseSequence } from "../src/text/parser";

const ode = parseSequence(
  readFileSync(new URL("../examples/ode-to-joy-complete-theme.qwertas", import.meta.url), "utf8"),
);

/** Coach driven by a fake clock in seconds. */
function setup(src: string) {
  let t = 0;
  const coach = new LearnCoach(() => t);
  coach.start(parseSequence(src));
  const held = new Set<string>();
  return {
    coach,
    advance: (ms: number) => {
      t += ms / 1000;
      coach.tick();
    },
    down: (code: string, layer: Parameters<LearnCoach["update"]>[1] = "base") => {
      held.add(code);
      coach.update(held, layer);
    },
    up: (code: string, layer: Parameters<LearnCoach["update"]>[1] = "base") => {
      held.delete(code);
      coach.update(held, layer);
    },
  };
}

describe("practice events", () => {
  it("flattens the Ode to Joy theme into 62 timed key holds", () => {
    expect(ode.errors).toEqual([]);
    const events = flattenPracticeEvents(ode);
    expect(events).toHaveLength(62);
    expect(events.slice(0, 4).map((e) => [e.code, e.durationUnits])).toEqual([
      ["KeyE", 2],
      ["KeyE", 2],
      ["KeyR", 2],
      ["KeyT", 2],
    ]);
  });

  it("w:4 at 100 BPM on a 1/8 grid needs a 1.2 s hold", () => {
    const w4 = flattenPracticeEvents(ode).find((e) => e.code === "KeyW" && e.durationUnits === 4)!;
    expect(w4.requiredMs).toBeCloseTo(1200);
  });

  it("prompts fixed percussion keys for named drums", () => {
    expect(drumCode("kick")).toBe("Space");
    expect(drumCode("snare")).toBe("Enter");
    expect(drumCode("crash")).toBe("Numpad7");
  });
});

describe("learn coach", () => {
  const TEMPO = "@tempo 120\n@grid 1/8\n"; // one unit = 250 ms

  it("highlights the target and advances only after the full hold", () => {
    const s = setup(`${TEMPO}w:4 e:1`);
    expect([...s.coach.state().promptCodes]).toEqual(["KeyW"]);
    s.down("KeyW");
    s.advance(900);
    expect(s.coach.state().index).toBe(0);
    expect(s.coach.state().progress).toBeCloseTo(0.9);
    s.advance(100);
    expect(s.coach.state().index).toBe(1);
    expect([...s.coach.state().promptCodes]).toEqual(["KeyE"]);
  });

  it("early release resets the hold", () => {
    const s = setup(`${TEMPO}w:4`);
    s.down("KeyW");
    s.advance(800);
    s.up("KeyW");
    expect(s.coach.state().progress).toBe(0);
    s.down("KeyW");
    s.advance(800);
    expect(s.coach.state().index).toBe(0);
    s.advance(200);
    expect(s.coach.state().status).toBe("finished");
  });

  it("wrong keys do not advance", () => {
    const s = setup(`${TEMPO}w:1`);
    s.down("KeyQ");
    s.advance(1000);
    expect(s.coach.state().index).toBe(0);
  });

  it("a repeated note needs a fresh press", () => {
    const s = setup(`${TEMPO}e:1 e:1`);
    s.down("KeyE");
    s.advance(250);
    expect(s.coach.state().index).toBe(1);
    s.advance(500);
    expect(s.coach.state().index).toBe(1);
    s.up("KeyE");
    s.down("KeyE");
    s.advance(250);
    expect(s.coach.state().status).toBe("finished");
  });

  it("reports a still-held completed key as spent until it is released", () => {
    const s = setup(`${TEMPO}w:1 e:1`);
    s.down("KeyW");
    s.advance(250);
    expect([...s.coach.state().spentCodes]).toEqual(["KeyW"]);
    s.up("KeyW");
    expect(s.coach.state().spentCodes.size).toBe(0);
  });

  it("rests advance on their own after their written length", () => {
    const s = setup(`${TEMPO}.:2 w:1`);
    expect(s.coach.state().promptCodes.size).toBe(0);
    s.advance(400);
    expect(s.coach.state().index).toBe(0);
    s.advance(100);
    expect([...s.coach.state().promptCodes]).toEqual(["KeyW"]);
  });

  it("layered notes require the layer's modifiers and highlight them", () => {
    const s = setup(`${TEMPO}{shift} q:1`);
    expect([...s.coach.state().promptCodes].sort()).toEqual(["KeyQ", "ShiftLeft"]);
    s.down("KeyQ");
    s.advance(500);
    expect(s.coach.state().index).toBe(0);
    s.up("KeyQ");
    s.down("ShiftLeft", "shift");
    s.down("KeyQ", "shift");
    s.advance(250);
    expect(s.coach.state().status).toBe("finished");
  });
});
