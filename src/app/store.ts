import { useSyncExternalStore } from "react";
import type { LayerId } from "../mappings/layers";
import type { MappingId } from "../mappings/layout";
import { PROFILES, type ProfileId } from "../mappings/profiles";
import type { PlayMode } from "../mappings/zones";
import type { NoteName, ScaleId } from "../scales/scales";
import type { AudioQuality } from "../audio/quality";

export type Store<T> = {
  get: () => T;
  set: (partial: Partial<T>) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (partial) => {
      state = { ...state, ...partial };
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export type Settings = {
  profileId: ProfileId;
  root: NoteName;
  scale: ScaleId;
  mode: PlayMode;
  chordMode: boolean;
  octaveOffset: number;
  volume: number;
  reverb: number;
  drive: number;
  filter: number;
  /** Master EQ, dB (±12). */
  bass: number;
  mid: number;
  treble: number;
  ignoreRepeat: boolean;
  numpadEnabled: boolean;
  startupProfile: ProfileId;
  theme: Theme;
  /** Live keyboard → pitch strategy. Does not rewrite stored pitch-canonical events. */
  mappingId: MappingId;
  /** Unified = one voice across melodic rows; layered = hybrid per-row voices on base. */
  rowMode: "unified" | "layered";
  quality: AudioQuality;
  /** Empty string = system default output. */
  outputDeviceId: string;
};

export type Theme = "light" | "dark";

const STORAGE_KEY = "cxl-qwert.settings.v1";

/** Persisted preferences only; the musical state always starts from the startup profile. */
type Persisted = Pick<
  Settings,
  | "volume"
  | "ignoreRepeat"
  | "numpadEnabled"
  | "startupProfile"
  | "theme"
  | "mappingId"
  | "rowMode"
  | "quality"
  | "outputDeviceId"
>;

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

export function settingsFromProfile(id: ProfileId): Pick<
  Settings,
  "profileId" | "root" | "scale" | "mode" | "chordMode" | "reverb" | "drive"
> {
  const p = PROFILES[id];
  return {
    profileId: id,
    root: p.root,
    scale: p.scale,
    mode: p.mode,
    chordMode: p.chordMode,
    reverb: p.fx.reverb,
    drive: p.fx.drive,
  };
}

function initialSettings(): Settings {
  const persisted = loadPersisted();
  const startupProfile =
    persisted.startupProfile && persisted.startupProfile in PROFILES ? persisted.startupProfile : "dark_techno";
  return {
    ...settingsFromProfile(startupProfile),
    octaveOffset: 0,
    volume: persisted.volume ?? 0.8,
    filter: 0.5,
    bass: 0,
    mid: 0,
    treble: 0,
    ignoreRepeat: persisted.ignoreRepeat ?? true,
    numpadEnabled: persisted.numpadEnabled ?? true,
    startupProfile,
    theme: persisted.theme === "dark" ? "dark" : "light",
    mappingId:
      persisted.mappingId === "legacy" || persisted.mappingId === "qwertoras" || persisted.mappingId === "dvorasqwertas"
        ? persisted.mappingId
        : "dvorasqwertas",
    rowMode: persisted.rowMode === "layered" ? "layered" : "unified",
    quality: persisted.quality === "ultra" ? "ultra" : "high",
    outputDeviceId: typeof persisted.outputDeviceId === "string" ? persisted.outputDeviceId : "",
  };
}

export const settingsStore = createStore<Settings>(initialSettings());

settingsStore.subscribe(() => {
  const s = settingsStore.get();
  const persisted: Persisted = {
    volume: s.volume,
    ignoreRepeat: s.ignoreRepeat,
    numpadEnabled: s.numpadEnabled,
    startupProfile: s.startupProfile,
    theme: s.theme,
    mappingId: s.mappingId,
    rowMode: s.rowMode,
    quality: s.quality,
    outputDeviceId: s.outputDeviceId,
  };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // storage unavailable — preferences just won't persist
  }
});

export type View = "play" | "test";
export type Tab = "live" | "text" | "loops" | "learn";

export type PerformanceState = {
  audioReady: boolean;
  view: View;
  tab: Tab;
  /** Physical keyboard → instrument mapping disabled; playback and audio keep running. */
  instrumentPaused: boolean;
  /** Paused automatically because a text field has focus (undone on blur). */
  autoPaused: boolean;
  activeCodes: ReadonlySet<string>;
  layer: LayerId;
  lastNote: string;
  lastChord: string;
  lastInstrument: string;
  drumVelOffset: number;
  /** Keyboard Test: most physical keys seen held at once. */
  peakHeld: number;
  /** Keyboard Test: recent raw key events, newest first. */
  events: { id: number; type: "down" | "up"; code: string; key: string; held: number }[];
  /** `navigator.keyboard.getLayoutMap()` legends for the OS layout, when available. */
  legends: Record<string, string>;
};

export const perfStore = createStore<PerformanceState>({
  audioReady: false,
  view: "play",
  tab: "live",
  instrumentPaused: false,
  autoPaused: false,
  activeCodes: new Set(),
  layer: "base",
  lastNote: "—",
  lastChord: "—",
  lastInstrument: "—",
  drumVelOffset: 0,
  peakHeld: 0,
  events: [],
  legends: {},
});
