import { startLearn, stopLearning } from "../app/session";
import { useStore } from "../app/store";
import { keyLabel } from "../learn/coach";
import { learnStore } from "../learn/session";
import { LAYER_LABELS } from "../mappings/layers";
import { textStore } from "../text/scheduler";
import { Btn, Field } from "./controls";
import { ScoreEditor, ScoreImport, ScoreIssues, ScoreMeta, ScoreSettingsToggle, useScore } from "./ScoreChrome";

/**
 * Learn: the shared Text score, played by the user. The keyboard highlights the key the
 * score is waiting for; holding it for the written duration moves the song forward.
 */
export function LearnPanel() {
  const learn = useStore(learnStore);
  const score = useScore();
  const running = learn.status === "running";
  const valid = score.errors.length === 0 && score.units > 0;
  const current = learn.current;

  const setText = (text: string) => {
    if (running) stopLearning();
    textStore.set({ text });
  };

  let next = "Press Start, then hold each highlighted key for its written length.";
  if (running && current?.code) {
    const layer = current.type === "note" && current.layer !== "base" ? `${LAYER_LABELS[current.layer]} + ` : "";
    next = `${layer}${keyLabel(current.code)} · hold ${current.durationUnits}`;
  } else if (running && current) {
    next = `Rest · ${current.durationUnits}`;
  } else if (learn.status === "finished") {
    next = "Complete — press Restart to play it again.";
  }

  return (
    <div className="text-panel">
      <ScoreEditor score={score} cursor={running ? (current?.source ?? null) : null} onChange={setText} follow />
      <div className="text-side">
        <ScoreImport onBeforeLoad={() => stopLearning()} />
        <div className="segmented">
          <Btn className="big" on={running} disabled={!valid} onClick={() => (running ? stopLearning() : startLearn())}>
            {running ? "■ Stop" : "▶ Start"}
          </Btn>
          <Btn disabled={!valid} onClick={() => startLearn()}>
            Restart
          </Btn>
        </div>
        <Field label="Next">
          <div className={`learn-next${running && current?.code ? " waiting" : ""}`}>
            <strong>{next}</strong>
            {running && (
              <span className="learn-step">
                {Math.min(learn.index + 1, learn.total)} / {learn.total}
              </span>
            )}
          </div>
        </Field>
        <div className="learn-progress" aria-label="Hold progress">
          <span style={{ width: `${Math.round((running ? learn.progress : 0) * 100)}%` }} />
        </div>
        <ScoreSettingsToggle />
        <ScoreMeta score={score} />
        <p className="syntax">
          Learn is silent until you play: every key you press sounds, but only the highlighted key held for its full
          length moves the score forward. Rests advance on their own.
        </p>
        <ScoreIssues score={score} />
      </div>
    </div>
  );
}
