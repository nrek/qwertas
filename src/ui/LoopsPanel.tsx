import { useEffect, useState, type ChangeEvent } from "react";
import { engine } from "../audio/engine";
import { loopStation, loopStore } from "../loops/recorder";
import { BEATS_PER_BAR, transport, transportStore } from "../loops/transport";
import { QUANTIZE_OPTIONS, type Quantize, type TrackView } from "../loops/types";
import { useStore } from "../app/store";
import { Btn, Field, release } from "./controls";

function useAudioClock(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      setNow(engine.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

const STATE_LABEL: Record<TrackView["state"], string> = {
  empty: "EMPTY",
  armed: "ARMED",
  recording: "RECORDING",
  playing: "PLAYING",
  stopped: "STOPPED",
};

export function LoopsPanel() {
  const { tracks, activeCount } = useStore(loopStore);
  const t = useStore(transportStore);
  const busy = t.running || tracks.some((tr) => !tr.inactive && (tr.state === "armed" || tr.state === "recording"));
  const now = useAudioClock(busy);
  const select =
    <T extends string>(apply: (v: T) => void) =>
    (e: ChangeEvent<HTMLSelectElement>) => {
      apply(e.target.value as T);
      e.currentTarget.blur();
    };

  const active = tracks.filter((tr) => !tr.inactive);
  const inactive = tracks.filter((tr) => tr.inactive && (tr.state !== "empty" || tr.eventCount > 0));

  return (
    <div className="loops-panel">
      <div className="loops-head">
        <Field label={`Tracks: ${activeCount}`}>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={activeCount}
            aria-label="Active track count"
            aria-valuemin={2}
            aria-valuemax={8}
            aria-valuenow={activeCount}
            onChange={(e) => {
              loopStation.setActiveCount(Number(e.target.value));
              e.currentTarget.blur();
            }}
          />
        </Field>
        <Field label="Count-in">
          <select
            value={t.countInBars}
            onChange={select((v) => transportStore.set({ countInBars: Number(v) as 0 | 1 | 2 }))}
          >
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </Field>
        <Field label="Quantize">
          <select value={t.quantize} onChange={select<Quantize>((quantize) => transportStore.set({ quantize }))}>
            {QUANTIZE_OPTIONS.map((q) => (
              <option key={q} value={q}>
                {q === "off" ? "Off" : q}
              </option>
            ))}
          </select>
        </Field>
        <div className="cycle">
          <span className="label">Loop length</span>
          <span className="value">
            {t.cycleLength
              ? `${t.cycleLength.toFixed(2)} s · ${Math.round(t.cycleLength / transport.beat())} beats`
              : "set by first track"}
          </span>
        </div>
        <p className="muted hint">
          First loop sets the length — press Stop to close it. Later tracks record exactly one cycle.
        </p>
      </div>
      <div className="tracks">
        {active.map((tr) => (
          <TrackRow key={tr.id} track={tr} now={now} />
        ))}
      </div>
      {inactive.length > 0 && (
        <div className="tracks inactive-lane">
          <p className="muted hint">Inactive (retained this session — raise Tracks to restore)</p>
          {inactive.map((tr) => (
            <div key={tr.id} className="track inactive">
              <div className="track-id">TRACK {tr.id}</div>
              <div className="track-state">INACTIVE</div>
              <div className="track-name">
                {tr.name || "—"} · {tr.eventCount} events
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackRow({ track: tr, now }: { track: TrackView; now: number }) {
  const t = transportStore.get();
  let progress = 0;
  let detail = "";
  if (tr.state === "armed") {
    const wait = tr.recStart - now;
    detail = wait > 0 ? `starts in ${wait.toFixed(1)}s` : "starting";
  } else if (tr.state === "recording" && tr.recEnd === null) {
    const beats = Math.max(0, (now - tr.recStart) / transport.beat());
    detail = `bar ${Math.floor(beats / BEATS_PER_BAR) + 1} · press Stop to close loop`;
    progress = (beats % BEATS_PER_BAR) / BEATS_PER_BAR;
  } else if (tr.state === "recording" && tr.recEnd !== null) {
    progress = Math.min(1, (now - tr.recStart) / (tr.recEnd - tr.recStart));
    detail = `${((tr.recEnd - now) > 0 ? tr.recEnd - now : 0).toFixed(1)}s left`;
  } else if (tr.state === "playing" && t.running && t.cycleLength) {
    const phase = (now - t.cycleOrigin) / t.cycleLength;
    progress = phase - Math.floor(phase);
  }

  const hasLoop = tr.state === "playing" || tr.state === "stopped";
  return (
    <div className={`track state-${tr.state}${tr.muted ? " muted" : ""}`}>
      <div className="track-id">TRACK {tr.id}</div>
      <div className="track-state">
        <span className="dot" />
        {tr.muted && hasLoop ? "MUTED" : STATE_LABEL[tr.state]}
      </div>
      <div className="track-name">{tr.state === "empty" ? "" : tr.name}</div>
      <div className="track-bar">
        <div className="fill" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
        {detail && <span className="detail">{detail}</span>}
      </div>
      <div className="track-buttons">
        {tr.state === "empty" && (
          <Btn className="rec" disabled={!engine.running} onClick={() => loopStation.record(tr.id)}>
            ● Record
          </Btn>
        )}
        {(tr.state === "armed" || tr.state === "recording") && (
          <Btn className="rec on" onClick={() => loopStation.stop(tr.id)}>
            {tr.state === "recording" && tr.recEnd === null ? "■ Stop" : "Cancel"}
          </Btn>
        )}
        {tr.state === "playing" && <Btn onClick={() => loopStation.stop(tr.id)}>■ Stop</Btn>}
        {tr.state === "stopped" && <Btn onClick={() => loopStation.play(tr.id)}>▶ Play</Btn>}
        <Btn on={tr.muted} disabled={!hasLoop} onClick={() => loopStation.toggleMute(tr.id)}>
          Mute
        </Btn>
        <Btn disabled={tr.state === "empty"} onClick={() => loopStation.clear(tr.id)}>
          Clear
        </Btn>
        <input
          type="range"
          className="track-vol"
          min={0}
          max={1}
          step={0.01}
          value={tr.volume}
          title="Volume"
          onChange={(e) => loopStation.setVolume(tr.id, Number(e.target.value))}
          onPointerUp={release}
        />
      </div>
    </div>
  );
}
