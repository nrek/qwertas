import {
  faKeyboard,
  faLayerGroup,
  faMusic,
  faSliders,
  faStopwatch,
  faVolumeHigh,
  faWandMagicSparkles,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { engine } from "../audio/engine";
import { playAll, stopEverything } from "../app/session";
import { settingsFromProfile, settingsStore, useStore, type Settings } from "../app/store";
import { transport, transportStore } from "../loops/transport";
import { PROFILE_IDS, PROFILES, type ProfileId } from "../mappings/profiles";
import { PLAY_MODES } from "../mappings/zones";
import { NOTE_NAMES, SCALE_IDS, SCALES, type NoteName, type ScaleId } from "../scales/scales";
import { Btn, Dial, RangeRow } from "./controls";

const set = settingsStore.set;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (v: number) => (v === 0 ? "0 dB" : `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`);

/** Grid placement for a one-octave mini piano (14 half-columns). */
const PIANO: Record<NoteName, { col: number; black: boolean }> = {
  C: { col: 1, black: false },
  "C#": { col: 2, black: true },
  D: { col: 3, black: false },
  "D#": { col: 4, black: true },
  E: { col: 5, black: false },
  F: { col: 7, black: false },
  "F#": { col: 8, black: true },
  G: { col: 9, black: false },
  "G#": { col: 10, black: true },
  A: { col: 11, black: false },
  "A#": { col: 12, black: true },
  B: { col: 13, black: false },
};

/** Global instrument controls: sound, key, play, tempo, EQ, effects, output. */
export function ControlPane({ settings }: { settings: Settings }) {
  const select =
    <T extends string>(apply: (v: T) => void) =>
    (e: ChangeEvent<HTMLSelectElement>) => {
      apply(e.target.value as T);
      e.currentTarget.blur();
    };

  return (
    <aside className="control-pane">
      <Section
        icon={faLayerGroup}
        title="Sound"
        control={
          <select
            className="wide"
            value={settings.profileId}
            onChange={select<ProfileId>((id) => set(settingsFromProfile(id)))}
          >
            {PROFILE_IDS.map((id) => (
              <option key={id} value={id}>
                {PROFILES[id].name}
              </option>
            ))}
          </select>
        }
      />

      <Section icon={faMusic} title="Key" aside={`${settings.root} ${SCALES[settings.scale].label}`}>
        <Sub label="Root">
          <div className="piano">
            {NOTE_NAMES.map((n) => (
              <button
                key={n}
                className={`pkey${PIANO[n].black ? " black" : ""}${settings.root === n ? " on" : ""}`}
                style={{ gridColumn: `${PIANO[n].col} / span 2` }}
                onClick={(e) => {
                  set({ root: n });
                  e.currentTarget.blur();
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </Sub>
        <Sub label="Scale">
          <select className="wide" value={settings.scale} onChange={select<ScaleId>((scale) => set({ scale }))}>
            {SCALE_IDS.map((id) => (
              <option key={id} value={id}>
                {SCALES[id].label}
              </option>
            ))}
          </select>
        </Sub>
      </Section>

      <Section icon={faKeyboard} title="Play">
        <Sub label="Mode">
          <div className="seg-fill">
            {PLAY_MODES.map((m) => (
              <Btn key={m.id} on={settings.mode === m.id} onClick={() => set({ mode: m.id })}>
                {m.label}
              </Btn>
            ))}
          </div>
        </Sub>
        <div className="pair">
          <Sub label="Octave">
            <div className="stepper">
              <Btn onClick={() => set({ octaveOffset: Math.max(-2, settings.octaveOffset - 1) })}>−</Btn>
              <span className="step-value">
                {settings.octaveOffset > 0 ? `+${settings.octaveOffset}` : settings.octaveOffset}
              </span>
              <Btn onClick={() => set({ octaveOffset: Math.min(2, settings.octaveOffset + 1) })}>+</Btn>
            </div>
          </Sub>
          <Sub label="Chords">
            <div className="seg-fill">
              <Btn on={!settings.chordMode} onClick={() => set({ chordMode: false })}>
                Off
              </Btn>
              <Btn on={settings.chordMode} onClick={() => set({ chordMode: true })}>
                On
              </Btn>
            </div>
          </Sub>
        </div>
      </Section>

      <TempoSection />

      <Section icon={faSliders} title="EQ">
        <div className="dials">
          <Dial
            label="Bass"
            value={settings.bass}
            min={-12}
            max={12}
            def={0}
            format={db}
            onChange={(bass) => set({ bass })}
          />
          <Dial
            label="Mids"
            value={settings.mid}
            min={-12}
            max={12}
            def={0}
            format={db}
            onChange={(mid) => set({ mid })}
          />
          <Dial
            label="Treble"
            value={settings.treble}
            min={-12}
            max={12}
            def={0}
            format={db}
            onChange={(treble) => set({ treble })}
          />
        </div>
      </Section>

      <Section icon={faWandMagicSparkles} title="Effects">
        <RangeRow label="Reverb" value={settings.reverb} format={pct} onChange={(reverb) => set({ reverb })} />
        <RangeRow label="Drive" value={settings.drive} format={pct} onChange={(drive) => set({ drive })} />
        <RangeRow
          label="Filter"
          value={settings.filter}
          format={(v) => (v < 0.45 ? "Dark" : v > 0.55 ? "Bright" : "Neutral")}
          onChange={(filter) => set({ filter })}
        />
      </Section>

      <Section icon={faVolumeHigh} title="Output">
        <RangeRow label="Volume" value={settings.volume} format={pct} onChange={(volume) => set({ volume })} />
      </Section>
    </aside>
  );
}

function TempoSection() {
  const t = useStore(transportStore);
  const [draft, setDraft] = useState(String(t.bpm));
  useEffect(() => setDraft(String(t.bpm)), [t.bpm]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) transport.setBpm(n);
    else setDraft(String(t.bpm));
  };
  return (
    <Section icon={faStopwatch} title="Tempo">
      <div className="tempo-row">
        <div className="stepper">
          <Btn onClick={() => transport.setBpm(t.bpm - 1)}>−</Btn>
          <input
            className="bpm"
            type="number"
            min={40}
            max={240}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <Btn onClick={() => transport.setBpm(t.bpm + 1)}>+</Btn>
        </div>
        <span className="bpm-unit">BPM</span>
      </div>
      <div className="seg-fill">
        <Btn on={t.metronome} title="Metronome" onClick={() => transportStore.set({ metronome: !t.metronome })}>
          Metro
        </Btn>
        <Btn
          on={t.running}
          title="Play: start the clock and every stopped loop"
          disabled={!engine.running}
          onClick={playAll}
        >
          ▶ Play
        </Btn>
        <Btn title="Stop All" onClick={stopEverything}>
          ■ Stop
        </Btn>
      </div>
    </Section>
  );
}

function Section({
  icon,
  title,
  aside,
  control,
  children,
}: {
  icon: IconDefinition;
  title: string;
  aside?: string;
  /** Rendered inline in the header row (single-control sections). */
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="cp-section">
      <header>
        <FontAwesomeIcon icon={icon} className="cp-icon" />
        <h3>{title}</h3>
        {aside && <span className="cp-aside">{aside}</span>}
        {control && <div className="cp-inline">{control}</div>}
      </header>
      {children}
    </section>
  );
}

function Sub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cp-sub">
      <span className="cp-label">{label}</span>
      {children}
    </div>
  );
}
