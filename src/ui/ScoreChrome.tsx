import { useEffect, useMemo, useRef, useState } from "react";
import { applyScoreSettings } from "../app/session";
import { useStore } from "../app/store";
import { transportStore } from "../loops/transport";
import { parseSequence } from "../text/parser";
import { textStore } from "../text/scheduler";
import { tokenize } from "../text/tokenizer";
import type { QwertasScore } from "../text/types";
import { Btn } from "./controls";

type ImportedScoreFile = { path: string; name: string; content: string };
type QwertBridge = { openScoreFile?: () => Promise<ImportedScoreFile | null> };

/** The score shared by Text and Learn, parsed against the current BPM/grid defaults. */
export function useScore(): QwertasScore {
  const t = useStore(textStore);
  const { bpm } = useStore(transportStore);
  return useMemo(
    () => parseSequence(t.text, { tempo: bpm, grid: t.grid, filename: t.filename }),
    [bpm, t.filename, t.grid, t.text],
  );
}

/**
 * Mirror-highlighted score editor; `cursor` marks the token being played or practised.
 * With `follow`, the active line is kept a third of the way down the view, like a typing test.
 */
export function ScoreEditor({
  score,
  cursor,
  onChange,
  follow = false,
}: {
  score: QwertasScore;
  cursor: { start: number; end: number } | null;
  onChange: (text: string) => void;
  follow?: boolean;
}) {
  const { text } = useStore(textStore);
  const tokens = useMemo(() => tokenize(text), [text]);
  const mirror = useRef<HTMLPreElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastLineTop = useRef<number | null>(null);

  useEffect(() => {
    if (!follow || !cursor) {
      lastLineTop.current = null;
      return;
    }
    const hot = mirror.current?.querySelector<HTMLElement>(".tok-hot");
    const area = input.current;
    if (!hot || !area || hot.offsetTop === lastLineTop.current) return;
    lastLineTop.current = hot.offsetTop;
    area.scrollTo({ top: Math.max(0, hot.offsetTop - area.clientHeight / 3), behavior: "smooth" });
  }, [follow, cursor?.start, cursor?.end]);
  const issueRanges = new Map<string, "error" | "warning">([
    ...score.errors.map((issue) => [`${issue.start}:${issue.end}`, "error"] as const),
    ...score.warnings.map((issue) => [`${issue.start}:${issue.end}`, "warning"] as const),
  ]);

  return (
    <div className="editor">
      <pre ref={mirror} className="editor-mirror" aria-hidden>
        {tokens.map((tok) => {
          const hot = cursor && tok.start < cursor.end && tok.end > cursor.start && tok.kind !== "space";
          const issue = issueRanges.get(`${tok.start}:${tok.end}`);
          return (
            <span
              key={tok.start}
              className={`tok-${issue ?? tok.kind}${hot ? " tok-hot" : ""}`}
              title={
                tok.error ??
                score.errors.find((e) => e.start === tok.start)?.error ??
                score.warnings.find((e) => e.start === tok.start)?.warning
              }
            >
              {tok.text}
            </span>
          );
        })}
        {"\n"}
      </pre>
      <textarea
        ref={input}
        className="editor-input"
        spellCheck={false}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** Import Score button + filename; `onBeforeLoad` stops whatever is using the old score. */
export function ScoreImport({ onBeforeLoad, onLoaded }: { onBeforeLoad: () => void; onLoaded?: () => void }) {
  const t = useStore(textStore);
  const { bpm } = useStore(transportStore);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const importScore = async () => {
    const bridge = (window as unknown as { qwert?: QwertBridge }).qwert;
    if (!bridge?.openScoreFile) {
      setError("Score import is unavailable in this build.");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const file = await bridge.openScoreFile();
      if (!file) return;
      onBeforeLoad();
      textStore.set({ text: file.content, filename: file.name });
      const imported = parseSequence(file.content, { tempo: bpm, grid: t.grid, filename: file.name });
      if (t.applyScoreSettings && imported.errors.length === 0) applyScoreSettings(imported);
      onLoaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="text-toolbar">
        <Btn onClick={() => void importScore()} disabled={importing}>
          {importing ? "Importing…" : "Import Score"}
        </Btn>
        {t.filename && (
          <span className="score-file" title={t.filename}>
            {t.filename}
          </span>
        )}
      </div>
      {error && <p className="text-errors">{error}</p>}
    </>
  );
}

export function ScoreSettingsToggle() {
  const t = useStore(textStore);
  return (
    <label className="score-apply">
      <input
        type="checkbox"
        checked={t.applyScoreSettings}
        onChange={(event) => textStore.set({ applyScoreSettings: event.target.checked })}
      />
      Apply score settings on import
    </label>
  );
}

export function ScoreMeta({ score }: { score: QwertasScore }) {
  const m = score.metadata;
  return (
    <dl className="score-meta">
      <div>
        <dt>Title</dt>
        <dd>{m.title ?? "Untitled"}</dd>
      </div>
      <div>
        <dt>Tempo</dt>
        <dd>{m.tempo} BPM</dd>
      </div>
      <div>
        <dt>Grid</dt>
        <dd>1/{m.grid}</dd>
      </div>
      <div>
        <dt>Root</dt>
        <dd>{m.root ?? "Current (default)"}</dd>
      </div>
      <div>
        <dt>Scale</dt>
        <dd>{m.scale ?? "Current (default)"}</dd>
      </div>
      <div>
        <dt>Profile</dt>
        <dd>{m.profile ?? "Current (default)"}</dd>
      </div>
    </dl>
  );
}

export function ScoreIssues({ score }: { score: QwertasScore }) {
  return (
    <>
      {score.errors.length > 0 && (
        <div className="text-errors">
          <strong>
            Score loaded with {score.errors.length} error{score.errors.length === 1 ? "" : "s"}.
          </strong>
          {score.errors.slice(0, 5).map((error) => (
            <span key={`${error.start}:${error.end}`}>
              Line {error.line}, column {error.column}: {error.error}
            </span>
          ))}
        </div>
      )}
      {score.warnings.length > 0 && (
        <div className="text-warnings">
          {score.warnings.slice(0, 3).map((warning) => (
            <span key={`${warning.start}:${warning.end}`}>
              Line {warning.line}: {warning.warning}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
