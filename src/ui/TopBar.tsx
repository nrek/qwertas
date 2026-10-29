import { faWaveSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { setPaused } from "../keyboard/controller";
import { masterRecorder, recorderStore } from "../recording/master-recorder";
import { useStore, type View } from "../app/store";
import { Btn, formatTime } from "./controls";

type Props = {
  view: View;
  paused: boolean;
  onView: (v: View) => void;
  onSettings: () => void;
};

export function TopBar({ view, paused, onView, onSettings }: Props) {
  return (
    <header className="topbar">
      <h1 className="brand">
        <span className="brand-mark">
          <FontAwesomeIcon icon={faWaveSquare} />
        </span>
        <em>QWERTAS</em>
      </h1>
      <div className="actions">
        <Btn
          className={`pause-btn${paused ? " paused" : ""}`}
          on={paused}
          title="Pause Instrument (Pause/Break or F12)"
          onClick={() => setPaused(!paused)}
        >
          {paused ? "▶ Resume" : "❚❚ Pause"}
        </Btn>
        <RecordControls />
        <Btn on={view === "test"} onClick={() => onView(view === "test" ? "play" : "test")}>
          {view === "test" ? "Back to Play" : "Keyboard Test"}
        </Btn>
        <Btn onClick={onSettings}>Settings</Btn>
      </div>
    </header>
  );
}

function RecordControls() {
  const r = useStore(recorderStore);
  const [, tick] = useState(0);
  useEffect(() => {
    if (r.status !== "recording") return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [r.status]);

  if (r.status === "recording") {
    const elapsed = (engine.now() - r.startedAt) * 1000;
    return (
      <Btn className="rec-btn recording" onClick={() => void masterRecorder.stop()} title="Stop master recording">
        ■ {formatTime(elapsed)}
      </Btn>
    );
  }
  if (r.status === "stopped") {
    return (
      <div className="segmented">
        <Btn className="rec-btn save" onClick={() => void masterRecorder.save()} title="Save .webm + events + manifest">
          Save {formatTime(r.durationMs)}
        </Btn>
        <Btn onClick={() => masterRecorder.discard()}>Discard</Btn>
      </div>
    );
  }
  return (
    <Btn
      className="rec-btn"
      disabled={!engine.running}
      title={r.savedTo ? `Saved: ${r.savedTo}` : "Record master output"}
      onClick={() => masterRecorder.start()}
    >
      ● Rec
    </Btn>
  );
}
