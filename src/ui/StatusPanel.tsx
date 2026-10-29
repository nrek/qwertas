import { KITS } from "../drums/kits";
import { VOICES } from "../instruments/voices";
import { LAYER_IDS, LAYER_LABELS, type LayerId } from "../mappings/layers";
import { MAPPINGS } from "../mappings/layout";
import { PROFILES } from "../mappings/profiles";
import { SCALES } from "../scales/scales";
import type { PerformanceState, Settings } from "../app/store";

function layerName(settings: Settings, id: LayerId): string {
  const target = PROFILES[settings.profileId].layers[id];
  return "voice" in target ? VOICES[target.voice].label : `${KITS[target.kit].label} kit`;
}

/** Always visible: which instrument each modifier gives, and which one is held now. */
export function LayerStrip({ settings, layer }: { settings: Settings; layer: LayerId }) {
  return (
    <div className="layers">
      {LAYER_IDS.map((id) => (
        <div key={id} className={`layer-chip${layer === id ? " on" : ""}`}>
          <span className="combo">{LAYER_LABELS[id]}</span>
          <span className="voice">{layerName(settings, id)}</span>
        </div>
      ))}
    </div>
  );
}

type Props = { settings: Settings; perf: PerformanceState; latencyMs: number | null };

export function LiveReadouts({ settings, perf, latencyMs }: Props) {
  const profile = PROFILES[settings.profileId];
  const mode = settings.mode[0]!.toUpperCase() + settings.mode.slice(1);
  return (
    <div className="readouts">
      <Readout label="Instrument" value={layerName(settings, perf.layer)} />
      <Readout label="Scale" value={`${settings.root} ${SCALES[settings.scale].label}`} />
      <Readout label="Layer" value={LAYER_LABELS[perf.layer]} accent />
      <Readout label="Mode" value={mode} />
      <Readout
        label="Layout"
        value={MAPPINGS.find((m) => m.id === settings.mappingId)?.label ?? settings.mappingId}
      />
      <Readout label="Quality" value={settings.quality === "ultra" ? "Ultra" : "High"} />
      <Readout label="Note" value={perf.lastNote} mono />
      <Readout label="Chord" value={perf.lastChord} mono />
      <Readout label="Last voice" value={perf.lastInstrument} />
      <Readout
        label="Drums"
        value={`${KITS[profile.kit].label}${perf.drumVelOffset ? ` (vel ${perf.drumVelOffset > 0 ? "+" : ""}${perf.drumVelOffset})` : ""}`}
      />
      <Readout label="Output latency" value={latencyMs === null ? "—" : `${latencyMs} ms`} mono />
    </div>
  );
}

function Readout({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div className={`readout${accent ? " accent" : ""}`}>
      <span className="label">{label}</span>
      <span className={`value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}
