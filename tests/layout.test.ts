import { dvorasMidi, qwertorasMidi } from "../src/mappings/layout";
import { PROFILES } from "../src/mappings/profiles";
import { resolveKey, type ResolveContext } from "../src/mappings/resolve";
import { withCanonical, hasCanonicalPitch } from "../src/performance/canonicalize";
import { contextFromSnapshot, type PerformanceEvent } from "../src/performance/types";

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  const profile = PROFILES.dark_techno;
  return {
    profile,
    root: "C",
    scale: "major",
    mode: "instrument",
    chordMode: false,
    octaveOffset: 0,
    layer: "base",
    numpadEnabled: true,
    mappingId: "dvorasqwertas",
    rowMode: "unified",
    ...over,
  };
}

describe("DVORAQWERTAS chromatic", () => {
  it("home row is contiguous chromatic from the root", () => {
    expect(dvorasMidi("C", "home", 0, 0)).toBe(48); // C3
    expect(dvorasMidi("C", "home", 1, 0)).toBe(49); // C#3
    expect(dvorasMidi("C", "qwerty", 0, 0)).toBe(60); // C4
    expect(dvorasMidi("C", "bottom", 0, 0)).toBe(36); // C2
  });

  it("resolveKey labels match the chromatic midi", () => {
    const a = resolveKey("KeyA", ctx());
    expect(a?.kind).toBe("note");
    if (a?.kind === "note") {
      expect(a.midi).toBe(dvorasMidi("C", "home", 0, 0));
      expect(a.label).toMatch(/^C/);
    }
  });

  it("unified mode uses the layer voice on every melodic row", () => {
    const home = resolveKey("KeyA", ctx({ rowMode: "unified", mode: "hybrid" }));
    const bottom = resolveKey("KeyZ", ctx({ rowMode: "unified", mode: "hybrid" }));
    expect(home?.kind === "note" && home.voice).toBe("dark_synth");
    expect(bottom?.kind === "note" && bottom.voice).toBe("dark_synth");
  });
});

describe("QWERTORAS", () => {
  it("is deterministic for the same scale options", () => {
    const a = qwertorasMidi("C", "major", "home", 4, 0);
    const b = qwertorasMidi("C", "major", "home", 4, 0);
    expect(a).toBe(b);
    expect(a).not.toBe(qwertorasMidi("C", "natural_minor", "home", 4, 0));
  });
});

describe("pitch-canonical events", () => {
  it("stamps pitch and instrument while keeping the physical key", () => {
    const action = resolveKey("KeyA", ctx());
    const ev = withCanonical({ timeMs: 0, type: "down", physicalKey: "KeyA", layer: "base" }, action, "dvorasqwertas");
    expect(ev.physicalKey).toBe("KeyA");
    expect(hasCanonicalPitch(ev)).toBe(true);
    expect(ev.pitch).toBe(48);
    expect(ev.instrumentId).toBe("dark_synth");
  });

  it("same stamped pitch plays under a different live mapping id in the snapshot", () => {
    const action = resolveKey("KeyA", ctx({ mappingId: "dvorasqwertas" }));
    const ev: PerformanceEvent = withCanonical(
      { timeMs: 0, type: "down", physicalKey: "KeyA", layer: "base" },
      action,
      "dvorasqwertas",
    );
    // Snapshot says legacy, but canonical pitch must win for playback consumers.
    const snap = {
      profileId: "dark_techno" as const,
      root: "C" as const,
      scale: "major" as const,
      mode: "instrument" as const,
      chordMode: false,
      octaveOffset: 0,
      numpadEnabled: true,
      mappingId: "legacy" as const,
      rowMode: "layered" as const,
    };
    expect(hasCanonicalPitch(ev)).toBe(true);
    expect(ev.pitch).toBe(48);
    // Legacy resolve of KeyA under C major home would be scale-degree 0 = C3 (48) coincidentally on number
    // but the important invariant is the stamped pitch is independent of snap.mappingId.
    expect(contextFromSnapshot(snap, "base").mappingId).toBe("legacy");
    expect(ev.mappingId).toBe("dvorasqwertas");
  });
});
