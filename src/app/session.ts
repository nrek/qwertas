import { engine } from "../audio/engine";
import { liveSnapshot } from "../keyboard/controller";
import { loopStation } from "../loops/recorder";
import { transport, transportStore } from "../loops/transport";
import { masterRecorder } from "../recording/master-recorder";
import { eventLog } from "../recording/performance-events";
import { textPlayer, textStore } from "../text/scheduler";
import { learnStore, startLearning, stopLearning } from "../learn/session";
import { parseSequence } from "../text/parser";
import type { QwertasScore } from "../text/types";
import { perfStore, settingsFromProfile, settingsStore } from "./store";

loopStation.setSnapshotSource(liveSnapshot);
textPlayer.setSnapshotSource(liveSnapshot);
masterRecorder.setContextSource(() => ({
  snapshot: liveSnapshot(),
  bpm: transportStore.get().bpm,
  tracks: loopStation.tracks,
}));

/** Global Play: start the clock and resume every stopped loop. */
export function playAll() {
  if (!engine.running) return;
  loopStation.playAll();
  if (!transportStore.get().running) transport.start();
}

/** Global Stop All: loops, text playback and every sounding voice. */
export function stopEverything() {
  loopStation.stopAll();
  textPlayer.stop();
  stopLearning();
  transport.stop();
  engine.releaseAll();
}

/** Text → Loop: the current text sequence becomes a looping track. */
export function sendTextToTrack(id: number) {
  const { events, patternMs } = textPlayer.export();
  if (!events.length || patternMs <= 0 || textPlayer.score().errors.length > 0) return;
  loopStation.loadEvents(id, events, patternMs, liveSnapshot(), "Text");
}

/** Apply only score-owned musical settings; unrelated mix and UI preferences stay untouched. */
export function applyScoreSettings(score: QwertasScore) {
  const { metadata } = score;
  if (metadata.profile) settingsStore.set(settingsFromProfile(metadata.profile));
  settingsStore.set({
    ...(metadata.root ? { root: metadata.root } : {}),
    ...(metadata.scale ? { scale: metadata.scale } : {}),
  });
  transport.setBpm(metadata.tempo);
  textStore.set({ grid: metadata.grid });
  textPlayer.retime();
}

/** Learn: practise the shared Text score silently — the user's own key holds move it forward. */
export function startLearn(): boolean {
  const { text, grid, filename, applyScoreSettings: apply } = textStore.get();
  const score = parseSequence(text, { tempo: transportStore.get().bpm, grid, filename });
  if (score.errors.length > 0 || score.units === 0) return false;
  textPlayer.stop();
  if (apply) applyScoreSettings(score);
  startLearning(score);
  return true;
}

export { stopLearning };

// Read by the Electron smoke test (QWERT_SMOKE=1) to drive the scenarios end to end.
(window as unknown as { __qwertDebug: unknown }).__qwertDebug = {
  voices: () => engine.activeVoiceCount(),
  audio: () => engine.context?.state ?? "none",
  held: () => [...perfStore.get().activeCodes],
  paused: () => perfStore.get().instrumentPaused,
  latency: () => engine.latencyMs(),
  setTab: (tab: "live" | "text" | "loops") => perfStore.set({ tab }),
  setText: (text: string) => textStore.set({ text }),
  score: () => textPlayer.score(),
  playText: () => textPlayer.play(),
  stopText: () => textPlayer.stop(),
  textCursor: () => textPlayer.cursor(),
  sendTextToTrack,
  cycleLength: () => transportStore.get().cycleLength,
  recordTrack: (id: number) => loopStation.record(id),
  clearTrack: (id: number) => loopStation.clear(id),
  trackState: (id: number) => loopStation.tracks[id - 1]?.state,
  trackEvents: (id: number) => loopStation.tracks[id - 1]?.events.length ?? 0,
  loggedSources: () => eventLog.sources(),
  startRecording: () => masterRecorder.start(),
  stopRecording: () => masterRecorder.stop(),
  takeSize: () => masterRecorder.takeSize(),
  saveRecording: () => masterRecorder.save(),
  stopAll: () => stopEverything(),
  startLearn,
  stopLearn: () => stopLearning(),
  learnState: () => {
    const s = learnStore.get();
    return { status: s.status, index: s.index, total: s.total, prompt: [...s.promptCodes] };
  },
};
