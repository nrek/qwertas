import { layerFromModifiers, modifiersFromCodes, type LayerId } from "../src/mappings/layers";
import { PROFILE_IDS, PROFILES, type ProfileId } from "../src/mappings/profiles";
import { resolveKey, type ResolveContext } from "../src/mappings/resolve";
import { ROW_KEYS, type PlayMode } from "../src/mappings/zones";
import { isInScale, NOTE_NAMES, SCALE_IDS, type NoteName, type ScaleId } from "../src/scales/scales";

function ctx(over: Partial<ResolveContext> & { profileId?: ProfileId } = {}): ResolveContext {
  const profile = PROFILES[over.profileId ?? "dark_techno"];
  return {
    profile,
    root: profile.root,
    scale: profile.scale,
    mode: profile.mode,
    chordMode: profile.chordMode,
    octaveOffset: 0,
    layer: "base",
    numpadEnabled: true,
    mappingId: "legacy",
    rowMode: "layered",
    ...over,
  };
}

const MELODIC_KEYS = [...ROW_KEYS.number, ...ROW_KEYS.qwerty, ...ROW_KEYS.home, ...ROW_KEYS.bottom];

describe("layers", () => {
  it("derives the layer from held physical modifier keys", () => {
    const layer = (codes: string[], shiftRightIsDrum = true) =>
      layerFromModifiers(modifiersFromCodes(new Set(codes), shiftRightIsDrum));
    expect(layer([])).toBe("base");
    expect(layer(["ShiftLeft"])).toBe("shift");
    expect(layer(["ControlRight"])).toBe("ctrl");
    expect(layer(["AltLeft"])).toBe("alt");
    expect(layer(["ShiftLeft", "ControlLeft"])).toBe("shift_ctrl");
    expect(layer(["ShiftLeft", "AltLeft"])).toBe("shift_alt");
    expect(layer(["ControlLeft", "AltLeft"])).toBe("ctrl_alt");
    expect(layer(["ShiftRight"], true)).toBe("base");
    expect(layer(["ShiftRight"], false)).toBe("shift");
  });
});

describe("Scenario A — immediate play (Dark Techno)", () => {
  it("every main-row key does something musical", () => {
    for (const code of MELODIC_KEYS) expect(resolveKey(code, ctx())).not.toBeNull();
  });
});

describe("Scenario B — modifier swap", () => {
  it("same physical key plays a different instrument per layer", () => {
    const voices = (["base", "shift", "ctrl", "alt", "shift_ctrl", "shift_alt"] as LayerId[]).map((layer) => {
      const a = resolveKey("KeyQ", ctx({ layer }));
      return a && "voice" in a ? a.voice : null;
    });
    expect(new Set(voices).size).toBe(6);
  });

  it("Ctrl+Alt turns melodic rows into the alternate kit", () => {
    const a = resolveKey("KeyQ", ctx({ layer: "ctrl_alt" }));
    expect(a?.kind).toBe("drum");
    if (a?.kind === "drum") expect(a.kit).toBe("industrial");
  });
});

describe("Scenario C — hybrid play", () => {
  const c = ctx({ mode: "hybrid", chordMode: false });
  it("ZXCV is bass, QWERTY melody, Space kick, Enter snare", () => {
    const z = resolveKey("KeyZ", c);
    const q = resolveKey("KeyQ", c);
    expect(z?.kind === "note" && z.voice).toBe("bass");
    expect(q?.kind === "note" && q.voice).toBe("dark_synth");
    expect(resolveKey("Space", c)).toMatchObject({ kind: "drum", drum: "kick" });
    expect(resolveKey("Enter", c)).toMatchObject({ kind: "drum", drum: "snare" });
    expect(resolveKey("Backspace", c)).toMatchObject({ kind: "drum", drum: "clap" });
  });

  it("rows ascend in register: bottom < home < qwerty < number", () => {
    const first = (code: string) => {
      const a = resolveKey(code, c);
      return a?.kind === "note" ? a.midi : NaN;
    };
    expect(first("KeyZ")).toBeLessThan(first("KeyA"));
    expect(first("KeyA")).toBeLessThan(first("KeyQ"));
    expect(first("KeyQ")).toBeLessThan(first("Digit1"));
  });

  it("home row plays scale-aware chords when chord mode is on", () => {
    const a = resolveKey("KeyA", ctx({ mode: "hybrid", chordMode: true }));
    expect(a?.kind).toBe("chord");
  });

  it("numpad acts as a drum machine", () => {
    expect(resolveKey("Numpad2", c)).toMatchObject({ kind: "drum", drum: "kick" });
    expect(resolveKey("Numpad5", c)).toMatchObject({ kind: "drum", drum: "snare" });
    expect(resolveKey("Numpad7", c)).toMatchObject({ kind: "drum", drum: "crash" });
    expect(resolveKey("Numpad0", c)).toMatchObject({ kind: "control", control: "repeat" });
    expect(resolveKey("Numpad2", { ...c, numpadEnabled: false })).toBeNull();
  });
});

describe("Scenario D — scale lock", () => {
  it("every melodic key stays inside the selected scale, for every root/scale/mode/layer", () => {
    const modes: PlayMode[] = ["hybrid", "instrument"];
    for (const scale of SCALE_IDS as ScaleId[]) {
      for (const root of NOTE_NAMES as readonly NoteName[]) {
        for (const mode of modes) {
          for (const chordMode of [false, true]) {
            for (const layer of ["base", "shift", "ctrl"] as LayerId[]) {
              const c = ctx({ root, scale, mode, chordMode, layer, octaveOffset: 1 });
              for (const code of MELODIC_KEYS) {
                const a = resolveKey(code, c);
                if (a?.kind === "note") expect(isInScale(a.midi, root, scale)).toBe(true);
                if (a?.kind === "chord" && scale !== "chromatic") {
                  for (const m of a.midis) expect(isInScale(m, root, scale)).toBe(true);
                }
              }
            }
          }
        }
      }
    }
  });

  it("does not default to chromatic", () => {
    for (const id of PROFILE_IDS) expect(PROFILES[id].scale).not.toBe("chromatic");
  });
});

describe("Scenario E — drum mode", () => {
  it("main keyboard becomes a pad surface", () => {
    const c = ctx({ mode: "drum" });
    for (const code of MELODIC_KEYS) expect(resolveKey(code, c)?.kind).toBe("drum");
  });
});

describe("Instrument mode", () => {
  it("Right Shift is a layer modifier, not a hat", () => {
    expect(resolveKey("ShiftRight", ctx({ mode: "instrument" }))).toBeNull();
    expect(resolveKey("ShiftRight", ctx({ mode: "hybrid" }))).toMatchObject({ drum: "hat_open" });
  });
});
