import type { PerformanceState } from "../app/store";

export function KeyboardTest({ perf }: { perf: PerformanceState }) {
  const held = [...perf.activeCodes];
  return (
    <section className="ktest">
      <div className="ktest-summary">
        <div>
          <span className="label">Held now</span>
          <span className="big">{held.length}</span>
        </div>
        <div>
          <span className="label">Peak held</span>
          <span className="big">{perf.peakHeld}</span>
        </div>
        <p>
          Sound is muted here. Press and hold chords of keys you want to play together. If a key you are holding
          doesn&apos;t light up, your keyboard can&apos;t register that combination (rollover / ghosting limit) — that
          is hardware, not the app.
        </p>
      </div>
      <div className="ktest-held">
        {held.length === 0 ? <span className="muted">No keys detected</span> : held.map((c) => <code key={c}>{c}</code>)}
      </div>
      <ol className="ktest-log">
        {perf.events.map((e) => (
          <li key={e.id} className={e.type}>
            <span>{e.type === "down" ? "↓" : "↑"}</span>
            <code>{e.code}</code>
            <span className="muted">key “{e.key}”</span>
            <span className="muted">held {e.held}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
