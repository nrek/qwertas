import { engine } from "../audio/engine";
import type { PerformanceState, Settings } from "../app/store";
import { MAPPINGS } from "../mappings/layout";
import { LiveReadouts } from "./StatusPanel";

export function LivePanel({ settings, perf }: { settings: Settings; perf: PerformanceState }) {
  const mapLabel = MAPPINGS.find((m) => m.id === settings.mappingId)?.label ?? settings.mappingId;
  return (
    <div className="live-panel">
      <LiveReadouts settings={settings} perf={perf} latencyMs={perf.audioReady ? engine.latencyMs() : null} />
      <div className="live-bottom">
        <div className="legend-bar">
          <span className="swatch row-home">ASDF · primary register ({mapLabel})</span>
          <span className="swatch row-qwerty">QWERTY · upper</span>
          <span className="swatch row-bottom">ZXCV · lower</span>
          <span className="swatch row-number">Number · chords / high</span>
          <span className="swatch chord">Chords</span>
          <span className="swatch drum">Drums</span>
          <span className="swatch mod">
            {settings.rowMode === "unified" ? "Unified voice" : "Layered hybrid"} · {settings.quality.toUpperCase()} ·
            Shift/Ctrl/Alt swap
          </span>
        </div>
      </div>
    </div>
  );
}
