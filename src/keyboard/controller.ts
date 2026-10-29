import { engine } from "../audio/engine";
import { DRUM_LABELS, type DrumId, type KitId } from "../drums/kits";
import { VOICES } from "../instruments/voices";
import { layerFromModifiers, MODIFIER_CODES, modifiersFromCodes, type LayerId } from "../mappings/layers";
import { resolveKey, type KeyAction, type ResolveContext } from "../mappings/resolve";
import { loopStation } from "../loops/recorder";
import { transport } from "../loops/transport";
import { Performer } from "../performance/performer";
import { withCanonical } from "../performance/canonicalize";
import { contextFromSnapshot, snapshotOf, type PerformanceEvent } from "../performance/types";
import { midiToName } from "../scales/scales";
import { perfStore, settingsStore } from "../app/store";
import { learnKeys } from "../learn/session";

const REPEAT_INTERVAL_MS = 120; // 1/16 at 125 BPM
const ACCENT = 25;
const MAX_EVENTS = 40;
const PAUSE_KEYS = new Set(["Pause", "F12"]);

/** Physical keys currently held. Source of truth for layers — not `event.shiftKey`. */
const held = new Set<string>();
/** Keyup handlers for live-only numpad controls (repeat, accent). Notes live in `live`. */
const controlReleases = new Map<string, () => void>();
const live = new Performer("live");
let lastDrum: { drum: DrumId; kit: KitId; pitch: number } | null = null;
let accentHeld = false;
let eventId = 0;

function currentLayer(): LayerId {
  const mode = settingsStore.get().mode;
  return layerFromModifiers(modifiersFromCodes(held, mode !== "instrument"));
}

export function liveSnapshot() {
  return snapshotOf(settingsStore.get());
}

export function resolveContext(layer: LayerId): ResolveContext {
  return contextFromSnapshot(liveSnapshot(), layer);
}

export function startAudio(): Promise<void> {
  return engine.start().then(() => {
    transport.ensureClock();
    if (!perfStore.get().audioReady) perfStore.set({ audioReady: true });
  });
}

function drumVelocity(base: number): number {
  const offset = perfStore.get().drumVelOffset + (accentHeld ? ACCENT : 0);
  return Math.max(1, Math.min(127, base + offset));
}

type Display = Partial<{ lastNote: string; lastChord: string; lastInstrument: string; drumVelOffset: number }>;

function describe(action: KeyAction): Display {
  switch (action.kind) {
    case "note":
      return { lastNote: midiToName(action.midi), lastInstrument: VOICES[action.voice].label };
    case "chord":
      return {
        lastChord: action.chordName,
        lastNote: action.midis.map(midiToName).join(" "),
        lastInstrument: VOICES[action.voice].label,
      };
    case "drum":
      return { lastNote: DRUM_LABELS[action.drum] };
    case "fx":
      return { lastNote: `FX: ${action.fx.replace("_", " ")}` };
    case "control":
      return {};
  }
}

function controlAction(code: string, action: Extract<KeyAction, { kind: "control" }>): Display {
  switch (action.control) {
    case "repeat": {
      if (!lastDrum) return {};
      const hit = lastDrum;
      const fire = () => engine.playDrum(hit.drum, hit.kit, drumVelocity(100), hit.pitch);
      const timer = setInterval(fire, REPEAT_INTERVAL_MS);
      fire();
      controlReleases.set(code, () => clearInterval(timer));
      return { lastNote: `Repeat ${DRUM_LABELS[hit.drum]}` };
    }
    case "choke":
      engine.chokeAll();
      return { lastNote: "Choke" };
    case "accent":
      accentHeld = true;
      controlReleases.set(code, () => {
        accentHeld = false;
      });
      return { lastNote: "Accent" };
    case "vel_up":
    case "vel_down": {
      const delta = action.control === "vel_up" ? 10 : -10;
      return { drumVelOffset: Math.max(-60, Math.min(27, perfStore.get().drumVelOffset + delta)) };
    }
  }
}

/** Live press: sound first (shared Performer), then feed loop recording, then the UI. */
function pressKey(code: string, layer: LayerId): Display {
  const snap = liveSnapshot();
  const action = resolveKey(code, contextFromSnapshot(snap, layer));
  if (!action) return {};
  if (action.kind === "control") return controlAction(code, action);

  let ev: PerformanceEvent = { timeMs: 0, type: "down", physicalKey: code, layer };
  if (action.kind === "drum") ev.velocity = drumVelocity(action.velocity);
  if (action.kind === "fx") ev.velocity = drumVelocity(100);
  ev = withCanonical(ev, action, snap.mappingId ?? "dvorasqwertas");
  const at = engine.now();
  live.perform(ev, snap, at);
  loopStation.capture(ev, at);
  if (action.kind === "drum") lastDrum = { drum: action.drum, kit: action.kit, pitch: action.pitch };
  return describe(action);
}

function releaseKey(code: string, layer: LayerId) {
  controlReleases.get(code)?.();
  controlReleases.delete(code);
  const ev: PerformanceEvent = { timeMs: 0, type: "up", physicalKey: code, layer };
  const at = engine.now();
  live.perform(ev, liveSnapshot(), at);
  loopStation.capture(ev, at);
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && ["text", "number", "search"].includes((el as HTMLInputElement).type);
}

function logEvent(type: "down" | "up", e: KeyboardEvent) {
  const s = perfStore.get();
  const events = [{ id: ++eventId, type, code: e.code, key: e.key, held: held.size }, ...s.events].slice(
    0,
    MAX_EVENTS,
  );
  perfStore.set({ events, peakHeld: Math.max(s.peakHeld, held.size) });
}

function onKeyDown(e: KeyboardEvent) {
  const code = e.code;
  if (!code) return;

  if (PAUSE_KEYS.has(code)) {
    e.preventDefault();
    if (!e.repeat) setPaused(!perfStore.get().instrumentPaused);
    return;
  }
  // Paused (or typing in a field): the keyboard is a keyboard again.
  if (perfStore.get().instrumentPaused || isEditable(e.target)) return;
  // Other function keys (F11 etc.) keep their normal meaning.
  if (/^F\d{1,2}$/.test(code)) return;
  e.preventDefault();

  if (!perfStore.get().audioReady) void startAudio();

  const view = perfStore.get().view;
  if (e.repeat) {
    // Never retrigger keys that were held through a pause/blur — wait for a fresh press.
    if (!held.has(code) || view === "test" || settingsStore.get().ignoreRepeat) return;
  } else if (held.has(code)) {
    return;
  }

  held.add(code);
  const layer = currentLayer();

  if (view === "test") {
    perfStore.set({ activeCodes: new Set(held), layer });
    logEvent("down", e);
    return;
  }

  let display: Display = {};
  if (!MODIFIER_CODES.has(code) || code === "ShiftRight") display = pressKey(code, layer);
  learnKeys(held, layer);
  perfStore.set({ activeCodes: new Set(held), layer, ...display });
}

function onKeyUp(e: KeyboardEvent) {
  const code = e.code;
  if (!held.has(code)) return;
  e.preventDefault();
  const layer = currentLayer();
  held.delete(code);
  if (perfStore.get().view === "test") {
    perfStore.set({ activeCodes: new Set(held), layer: currentLayer() });
    logEvent("up", e);
    return;
  }
  releaseKey(code, layer);
  learnKeys(held, currentLayer());
  perfStore.set({ activeCodes: new Set(held), layer: currentLayer() });
}

/**
 * Focus loss / pause: keyups will never arrive, so stop every live note and forget held keys.
 * Loop and text playback are untouched.
 */
export function releaseLive() {
  for (const release of controlReleases.values()) release();
  controlReleases.clear();
  held.clear();
  accentHeld = false;
  live.releaseAll(false);
  learnKeys(held, "base");
  perfStore.set({ activeCodes: new Set(), layer: "base" });
}

export function setPaused(paused: boolean, auto = false) {
  if (paused) releaseLive();
  perfStore.set({ instrumentPaused: paused, autoPaused: paused && auto });
}

function onFocusIn(e: FocusEvent) {
  if (isEditable(e.target) && !perfStore.get().instrumentPaused) setPaused(true, true);
}

function onFocusOut(e: FocusEvent) {
  if (isEditable(e.target) && perfStore.get().autoPaused && !isEditable(e.relatedTarget)) setPaused(false);
}

function onVisibility() {
  if (document.visibilityState === "hidden") releaseLive();
}

export async function loadLegends() {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } })
    .keyboard;
  if (!kb?.getLayoutMap) return;
  try {
    const map = await kb.getLayoutMap();
    const legends: Record<string, string> = {};
    map.forEach((value, key) => {
      legends[key] = value.toUpperCase();
    });
    perfStore.set({ legends });
  } catch {
    // layout map unavailable; physical QWERTY legends are used
  }
}

export function installKeyboard(): () => void {
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("keyup", onKeyUp, { capture: true });
  window.addEventListener("blur", releaseLive);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onVisibility);
  void loadLegends();
  return () => {
    window.removeEventListener("keydown", onKeyDown, { capture: true });
    window.removeEventListener("keyup", onKeyUp, { capture: true });
    window.removeEventListener("blur", releaseLive);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("visibilitychange", onVisibility);
    releaseLive();
  };
}

export function setView(view: "play" | "test") {
  releaseLive();
  perfStore.set({ view, events: [], peakHeld: 0 });
}