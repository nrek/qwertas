import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { loopStore } from "../loops/recorder";
import { textPlayer, textStore } from "../text/scheduler";
import { GRIDS, type Grid } from "../text/types";
import { sendTextToTrack } from "../app/session";
import { useStore } from "../app/store";
import { Btn, Field } from "./controls";
import { ScoreEditor, ScoreImport, ScoreIssues, ScoreMeta, ScoreSettingsToggle, useScore } from "./ScoreChrome";

function useCursor(playing: boolean) {
  const [cursor, setCursor] = useState<{ start: number; end: number } | null>(null);
  useEffect(() => {
    if (!playing) {
      setCursor(null);
      return;
    }
    let raf = 0;
    const loop = () => {
      const c = textPlayer.cursor();
      setCursor((prev) => (prev?.start === c?.start && prev?.end === c?.end ? prev : c));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return cursor;
}

export function TextPanel() {
  const t = useStore(textStore);
  const { tracks } = useStore(loopStore);
  const cursor = useCursor(t.playing);
  const score = useScore();
  const playable = engine.running && score.errors.length === 0 && score.units > 0;

  const setText = (text: string) => {
    textStore.set({ text });
    textPlayer.retime();
  };
  const setGrid = (grid: Grid) => {
    textStore.set({ grid });
    textPlayer.retime();
  };

  return (
    <div className="text-panel">
      <ScoreEditor score={score} cursor={cursor} onChange={setText} />
      <div className="text-side">
        <ScoreImport onBeforeLoad={() => textPlayer.stop()} onLoaded={() => textPlayer.retime()} />
        <div className="segmented">
          <Btn
            className="big"
            on={t.playing}
            disabled={!playable}
            onClick={() => (t.playing ? textPlayer.stop() : textPlayer.play())}
          >
            {t.playing ? "■ Stop" : "▶ Play"}
          </Btn>
          <Btn on={t.loop} onClick={() => textStore.set({ loop: !t.loop })}>
            Loop
          </Btn>
        </div>
        <div className="segmented">
          <Field label="Grid">
            <div className="segmented">
              {GRIDS.map((g) => (
                <Btn
                  key={g}
                  on={score.metadata.grid === g}
                  disabled={score.directives.has("grid")}
                  title={score.directives.has("grid") ? "Set by @grid in this score" : undefined}
                  onClick={() => setGrid(g)}
                >
                  1/{g}
                </Btn>
              ))}
            </div>
          </Field>
          <Field label="BPM">
            <span className="bpm-readout">{score.metadata.tempo}</span>
          </Field>
        </div>
        <ScoreSettingsToggle />
        <ScoreMeta score={score} />
        <Field label="Send to track">
          <div className="segmented">
            {tracks.map((tr) => (
              <Btn
                key={tr.id}
                disabled={!playable}
                title={tr.state === "empty" ? `Loop this text on Track ${tr.id}` : `Replace ${tr.name} on Track ${tr.id}`}
                onClick={() => sendTextToTrack(tr.id)}
              >
                {tr.id}
              </Btn>
            ))}
          </div>
        </Field>
        <p className="syntax">
          <code>z:1</code> key · <code>.:2</code> rest · <code>-</code> hold · <code>|</code> bar ·{" "}
          <code>&lt;KICK&gt;</code> <code>&lt;SNARE&gt;</code> <code>&lt;HAT&gt;</code> <code>&lt;CLAP&gt;</code>{" "}
          <code>&lt;RIM&gt;</code> <code>&lt;TOM&gt;</code> · <code>{"{shift}"}</code> <code>{"{ctrl}"}</code>{" "}
          <code>{"{alt}"}</code> <code>{"{base}"}</code> · <code>@tempo</code> <code>@grid</code>
        </p>
        <ScoreIssues score={score} />
      </div>
    </div>
  );
}
