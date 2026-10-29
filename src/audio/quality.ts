export type AudioQuality = "high" | "ultra";

export const QUALITY_OPTIONS: { id: AudioQuality; label: string; blurb: string }[] = [
  {
    id: "high",
    label: "High",
    blurb: "Default. Low latency with 2× drive oversampling — strong quality at moderate CPU.",
  },
  {
    id: "ultra",
    label: "Ultra",
    blurb: "Opt-in. 4× drive oversampling and tighter voice envelopes. Higher CPU; Web Audio only (no offline bounce yet).",
  },
];

export type QualityConfig = {
  shaperOversample: OverSampleType;
  /** Slightly longer amp attack floor to reduce clicks under polyphony stress. */
  attackFloor: number;
};

export function qualityConfig(q: AudioQuality): QualityConfig {
  if (q === "ultra") return { shaperOversample: "4x", attackFloor: 0.003 };
  return { shaperOversample: "2x", attackFloor: 0.001 };
}
