import { useMemo, type CSSProperties } from "react";
import { DRUM_SHORT } from "../drums/kits";
import { VOICES } from "../instruments/voices";
import type { LayerId } from "../mappings/layers";
import { PROFILES } from "../mappings/profiles";
import { resolveKey, type KeyAction } from "../mappings/resolve";
import { ARROWS, MAIN_ROWS, NUMPAD, type KeyCap } from "../keyboard/geometry";
import { resolveContext } from "../keyboard/controller";
import type { Settings } from "../app/store";

const MOD_LAYER_HINT: Record<string, LayerId> = {
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "ctrl",
  ControlRight: "ctrl",
  AltLeft: "alt",
  AltRight: "alt",
};

type KeyInfo = { cls: string; sub: string; title: string };

type ShortKey = Extract<KeyAction, { kind: "fx" }>["fx"] | Extract<KeyAction, { kind: "control" }>["control"];

const SHORT: Record<ShortKey, string> = {
  riser: "RISE",
  downer: "DROP",
  tom_fill: "FILL",
  snare_roll: "ROLL",
  repeat: "REPEAT",
  choke: "CHOKE",
  accent: "ACC",
  vel_up: "VEL+",
  vel_down: "VEL−",
};

function infoFor(code: string, action: KeyAction | null, settings: Settings): KeyInfo {
  const modLayer = MOD_LAYER_HINT[code];
  if (modLayer && !(code === "ShiftRight" && action)) {
    const target = PROFILES[settings.profileId].layers[modLayer];
    const sub = "voice" in target ? VOICES[target.voice].label : "Alt kit";
    return { cls: "mod", sub, title: `Hold for ${sub}` };
  }
  if (!action) return { cls: "idle", sub: "", title: "" };
  switch (action.kind) {
    case "note":
      return {
        cls: `row-${action.row}`,
        sub: action.label,
        title: `${VOICES[action.voice].label} ${action.label}`,
      };
    case "chord":
      return { cls: "chord", sub: action.label, title: `${action.chordName} (${VOICES[action.voice].label})` };
    case "drum":
      return { cls: "drum", sub: DRUM_SHORT[action.drum], title: action.drum };
    case "fx":
      return { cls: "fx", sub: SHORT[action.fx], title: action.fx };
    case "control":
      return { cls: "control", sub: SHORT[action.control], title: action.control };
  }
}

type Props = {
  settings: Settings;
  layer: LayerId;
  active: ReadonlySet<string>;
  legends: Record<string, string>;
  /** Keyboard Test: show raw keys only, no musical mapping. */
  raw?: boolean;
  /** Learn: keys the score is waiting for. */
  prompt?: ReadonlySet<string>;
  /** Learn: 0..1 of the required hold; a held target's colour fades out over it. */
  promptProgress?: number;
  /** Learn: held keys whose note already completed — shown unlit until released. */
  spent?: ReadonlySet<string>;
};

export function KeyboardView({ settings, layer, active, legends, raw, prompt, promptProgress = 0, spent }: Props) {
  const infos = useMemo(() => {
    const ctx = resolveContext(layer);
    const map = new Map<string, KeyInfo>();
    const all: KeyCap[] = [
      ...MAIN_ROWS.flat(),
      ...ARROWS.flat().filter((k): k is KeyCap => !!k),
      ...NUMPAD,
    ];
    for (const k of all) {
      map.set(k.code, raw ? { cls: "idle", sub: "", title: k.code } : infoFor(k.code, resolveKey(k.code, ctx), settings));
    }
    return map;
  }, [settings, layer, raw]);

  const cap = (k: KeyCap, style?: CSSProperties) => {
    const info = infos.get(k.code)!;
    const legend = k.label.length === 1 ? (legends[k.code] ?? k.label) : k.label;
    const isActive = active.has(k.code);
    const isTarget = !!prompt?.has(k.code);
    const isSpent = isActive && !!spent?.has(k.code);
    const learnCls = `${isTarget ? " learn-target" : ""}${isSpent ? " learn-spent" : ""}`;
    return (
      <div
        key={k.code}
        data-code={k.code}
        className={`key ${info.cls}${isActive ? " active" : ""}${learnCls}${k.label.length > 1 ? " wide-label" : ""}`}
        style={isTarget ? ({ ...style, "--hold": promptProgress } as CSSProperties) : style}
        title={info.title}
      >
        <span className="legend">{legend}</span>
        {info.sub && <span className="sub">{info.sub}</span>}
      </div>
    );
  };

  return (
    <div className="keyboard">
      <div className="main-block">
        {MAIN_ROWS.map((row, i) => (
          <div className="key-row" key={i}>
            {row.map((k) => cap(k, { flexGrow: k.width ?? 1, flexBasis: 0 }))}
          </div>
        ))}
      </div>
      <div className="side-block">
        <div className="arrows">
          {ARROWS.map((row, i) => (
            <div className="key-row" key={i}>
              {row.map((k, j) => (k ? cap(k, { flexGrow: 1, flexBasis: 0 }) : <div className="key-spacer" key={j} />))}
            </div>
          ))}
        </div>
      </div>
      <div className={`numpad${settings.numpadEnabled || raw ? "" : " disabled"}`}>
        {NUMPAD.map((k) =>
          cap(k, {
            gridColumn: `${k.grid[0]} / span ${k.grid[2]}`,
            gridRow: `${k.grid[1]} / span ${k.grid[3]}`,
          }),
        )}
      </div>
    </div>
  );
}
