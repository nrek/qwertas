import { engine } from "../audio/engine";
import { createStore } from "../app/store";
import { KITS } from "../drums/kits";
import { VOICES } from "../instruments/voices";
import { LAYER_IDS } from "../mappings/layers";
import { PROFILES } from "../mappings/profiles";
import type { LoopTrack } from "../loops/track";
import { SCALES } from "../scales/scales";
import type { ContextSnapshot } from "../performance/types";
import { eventLog, type LoggedEvent } from "./performance-events";

export type RecorderState = {
  status: "idle" | "recording" | "stopped";
  startedAt: number;
  durationMs: number;
  savedTo: string | null;
  error: string | null;
};

export const recorderStore = createStore<RecorderState>({
  status: "idle",
  startedAt: 0,
  durationMs: 0,
  savedTo: null,
  error: null,
});

type Take = { blob: Blob; events: LoggedEvent[]; manifest: Record<string, unknown> };

export type SaveRecordingPayload = { audio: ArrayBuffer; events: string; manifest: string };
type QwertBridge = { saveRecording?: (p: SaveRecordingPayload) => Promise<{ saved: boolean; path?: string }> };

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm"];

export type ManifestContext = {
  snapshot: ContextSnapshot;
  bpm: number;
  tracks: readonly LoopTrack[];
};

export function buildManifest(ctx: ManifestContext, durationMs: number, mimeType: string) {
  const p = PROFILES[ctx.snapshot.profileId];
  return {
    app: "qwertas",
    format: 1,
    recordedAt: new Date().toISOString(),
    profile: p.name,
    root: ctx.snapshot.root,
    scale: SCALES[ctx.snapshot.scale].label,
    mode: ctx.snapshot.mode,
    chordMode: ctx.snapshot.chordMode,
    octaveOffset: ctx.snapshot.octaveOffset,
    bpm: ctx.bpm,
    durationMs,
    audio: { mimeType },
    layers: Object.fromEntries(
      LAYER_IDS.map((id) => {
        const t = p.layers[id];
        return [id, "voice" in t ? VOICES[t.voice].label : `${KITS[t.kit].label} kit`];
      }),
    ),
    loops: ctx.tracks
      .filter((t) => t.state !== "empty")
      .map((t) => ({
        track: t.id,
        name: t.name,
        state: t.state,
        muted: t.muted,
        volume: t.volume,
        durationMs: t.lengthMs,
        snapshot: t.snapshot,
        events: t.events,
      })),
  };
}

/**
 * Master recording: captures exactly what the speakers get (post-limiter, minus metronome)
 * as WebM/Opus, plus the performance-event log and a manifest. Separate from loop recording.
 */
class MasterRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private take: Take | null = null;
  private contextSource: () => ManifestContext = () => {
    throw new Error("recorder context source not set");
  };

  setContextSource(fn: () => ManifestContext) {
    this.contextSource = fn;
  }

  start() {
    const stream = engine.recordStream();
    if (!stream || recorderStore.get().status === "recording") return;
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.take = null;
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(250);
    const at = engine.now();
    eventLog.start(at);
    recorderStore.set({ status: "recording", startedAt: at, durationMs: 0, savedTo: null, error: null });
  }

  stop(): Promise<void> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve();
    const durationMs = Math.round((engine.now() - recorderStore.get().startedAt) * 1000);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
        const events = eventLog.stop();
        const manifest = buildManifest(this.contextSource(), durationMs, blob.type);
        this.take = { blob, events, manifest };
        this.recorder = null;
        recorderStore.set({ status: "stopped", durationMs });
        resolve();
      };
      rec.stop();
    });
  }

  async save(): Promise<string | null> {
    if (!this.take) return null;
    const bridge = (window as unknown as { qwert?: QwertBridge }).qwert;
    if (!bridge?.saveRecording) {
      recorderStore.set({ error: "Saving needs the desktop app" });
      return null;
    }
    try {
      const result = await bridge.saveRecording({
        audio: await this.take.blob.arrayBuffer(),
        events: JSON.stringify(this.take.events, null, 1),
        manifest: JSON.stringify(this.take.manifest, null, 2),
      });
      if (!result.saved) return null;
      this.take = null;
      recorderStore.set({ status: "idle", savedTo: result.path ?? null, error: null });
      return result.path ?? null;
    } catch (err) {
      recorderStore.set({ error: String(err) });
      return null;
    }
  }

  discard() {
    this.take = null;
    recorderStore.set({ status: "idle", durationMs: 0 });
  }

  /** For the smoke test. */
  takeSize(): number {
    return this.take?.blob.size ?? 0;
  }
}

export const masterRecorder = new MasterRecorder();
