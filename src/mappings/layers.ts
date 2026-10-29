export type LayerId = "base" | "shift" | "ctrl" | "alt" | "shift_ctrl" | "shift_alt" | "ctrl_alt";

export const LAYER_IDS: LayerId[] = ["base", "shift", "ctrl", "alt", "shift_ctrl", "shift_alt", "ctrl_alt"];

export const LAYER_LABELS: Record<LayerId, string> = {
  base: "Base",
  shift: "Shift",
  ctrl: "Ctrl",
  alt: "Alt",
  shift_ctrl: "Shift+Ctrl",
  shift_alt: "Shift+Alt",
  ctrl_alt: "Ctrl+Alt",
};

/** Simulated dynamics: standard keyboards expose no velocity, so the layer implies one. */
export const LAYER_VELOCITY: Record<LayerId, number> = {
  base: 90,
  shift: 112,
  ctrl: 96,
  alt: 100,
  shift_ctrl: 80,
  shift_alt: 90,
  ctrl_alt: 100,
};

export type ModifierState = { shift: boolean; ctrl: boolean; alt: boolean };

/**
 * `ShiftRight` is a percussion key (open hat) in drum-bearing modes, so only
 * `ShiftLeft` counts as the Shift layer there.
 */
export function modifiersFromCodes(codes: ReadonlySet<string>, shiftRightIsDrum: boolean): ModifierState {
  return {
    shift: codes.has("ShiftLeft") || (!shiftRightIsDrum && codes.has("ShiftRight")),
    ctrl: codes.has("ControlLeft") || codes.has("ControlRight"),
    alt: codes.has("AltLeft") || codes.has("AltRight"),
  };
}

export function layerFromModifiers({ shift, ctrl, alt }: ModifierState): LayerId {
  if (shift && ctrl) return "shift_ctrl";
  if (shift && alt) return "shift_alt";
  if (ctrl && alt) return "ctrl_alt";
  if (shift) return "shift";
  if (ctrl) return "ctrl";
  if (alt) return "alt";
  return "base";
}

export const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);
