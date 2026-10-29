import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { listOutputDevices, sinkIdSupported, type OutputDevice } from "../audio/devices";
import { QUALITY_OPTIONS, type AudioQuality } from "../audio/quality";
import { settingsStore, type Settings } from "../app/store";
import { MAPPINGS, type MappingId } from "../mappings/layout";
import { PROFILE_IDS, PROFILES, type ProfileId } from "../mappings/profiles";

export function SettingsDialog({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const set = settingsStore.set;
  const [outputs, setOutputs] = useState<OutputDevice[]>([]);
  const [sinkNote, setSinkNote] = useState<string | null>(null);
  const canSink = sinkIdSupported();

  useEffect(() => {
    void listOutputDevices().then((r) => {
      setOutputs(r.devices);
      if (!r.supported) setSinkNote(r.note ?? "Output device list unavailable.");
    });
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <h3>Keyboard layout</h3>
        <label className="row">
          Layout
          <select
            value={settings.mappingId}
            onChange={(e) => {
              set({ mappingId: e.target.value as MappingId });
              e.currentTarget.blur();
            }}
          >
            {MAPPINGS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{MAPPINGS.find((m) => m.id === settings.mappingId)?.blurb}</p>
        <label className="row">
          Melodic rows
          <select
            value={settings.rowMode}
            onChange={(e) => {
              set({ rowMode: e.target.value as "unified" | "layered" });
              e.currentTarget.blur();
            }}
          >
            <option value="unified">Unified (one instrument across rows)</option>
            <option value="layered">Layered (hybrid per-row voices on Base)</option>
          </select>
        </label>
        <p className="muted">
          Layout changes live input and legends only. Stored loops and text already stamped with pitches keep their
          original notes.
        </p>

        <h3>Audio quality</h3>
        <label className="row">
          Quality
          <select
            value={settings.quality}
            onChange={(e) => {
              const quality = e.target.value as AudioQuality;
              set({ quality });
              engine.setQuality(quality);
              e.currentTarget.blur();
            }}
          >
            {QUALITY_OPTIONS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{QUALITY_OPTIONS.find((q) => q.id === settings.quality)?.blurb}</p>
        <p className="muted mono">
          Sample rate {engine.sampleRate() ?? "—"} Hz · latency{" "}
          {engine.latencyMs() === null ? "—" : `${engine.latencyMs()} ms`} (measured when available)
        </p>

        <h3>Output</h3>
        <label className="row">
          Output device
          <select
            value={settings.outputDeviceId}
            disabled={!canSink}
            onChange={(e) => {
              const outputDeviceId = e.target.value;
              set({ outputDeviceId });
              void engine.setOutputDevice(outputDeviceId).then((r) => {
                setSinkNote(r.ok ? null : r.reason ?? "Could not switch output.");
              });
              e.currentTarget.blur();
            }}
          >
            <option value="">System default</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {!canSink && (
          <p className="muted">
            This build cannot select sinks via Web Audio. Route QWERTAS through Windows Sound settings or a virtual
            cable (VB-Audio, VoiceMeeter, etc.). QWERTAS does not host VST/AU plugins or install cable drivers.
          </p>
        )}
        {sinkNote && <p className="muted">{sinkNote}</p>}

        <h3>General</h3>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.ignoreRepeat}
            onChange={(e) => {
              set({ ignoreRepeat: e.target.checked });
              e.currentTarget.blur();
            }}
          />
          Ignore key repeat (held keys sustain instead of retriggering)
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={settings.numpadEnabled}
            onChange={(e) => {
              set({ numpadEnabled: e.target.checked });
              e.currentTarget.blur();
            }}
          />
          Numpad drum machine
        </label>
        <label className="row">
          Startup profile
          <select
            value={settings.startupProfile}
            onChange={(e) => {
              set({ startupProfile: e.target.value as ProfileId });
              e.currentTarget.blur();
            }}
          >
            {PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {PROFILES[id].name}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Theme
          <select
            value={settings.theme}
            onChange={(e) => {
              set({ theme: e.target.value as "light" | "dark" });
              e.currentTarget.blur();
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
