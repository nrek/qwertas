import { useEffect, useState } from "react";
import { engine } from "../audio/engine";
import { installKeyboard, setPaused, setView, startAudio } from "../keyboard/controller";
import { KeyboardView } from "../ui/KeyboardView";
import { KeyboardTest } from "../ui/KeyboardTest";
import { LivePanel } from "../ui/LivePanel";
import { LoopsPanel } from "../ui/LoopsPanel";
import { SettingsDialog } from "../ui/SettingsDialog";
import { LayerStrip } from "../ui/StatusPanel";
import { TextPanel } from "../ui/TextPanel";
import { LearnPanel } from "../ui/LearnPanel";
import { learnStore } from "../learn/session";
import { ControlPane } from "../ui/ControlPane";
import { PanelSplit, usePanelHeight } from "../ui/PanelSplit";
import { TopBar } from "../ui/TopBar";
import { Btn } from "../ui/controls";
import "./session";
import { perfStore, settingsStore, useStore, type Tab } from "./store";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "text", label: "Text" },
  { id: "loops", label: "Loops" },
  { id: "learn", label: "Learn" },
];

export function App() {
  const settings = useStore(settingsStore);
  const perf = useStore(perfStore);
  const learn = useStore(learnStore);
  const [showSettings, setShowSettings] = useState(false);
  const [panelHeight, setPanelHeight, panelHeightRef] = usePanelHeight();
  const learning = perf.tab === "learn" && learn.status === "running";

  useEffect(() => installKeyboard(), []);

  useEffect(() => {
    engine.setMix({
      volume: settings.volume,
      reverb: settings.reverb,
      drive: settings.drive,
      filter: settings.filter,
      bass: settings.bass,
      mid: settings.mid,
      treble: settings.treble,
    });
  }, [settings.volume, settings.reverb, settings.drive, settings.filter, settings.bass, settings.mid, settings.treble]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    engine.setQuality(settings.quality);
  }, [settings.quality]);

  useEffect(() => {
    void engine.setOutputDevice(settings.outputDeviceId);
  }, [settings.outputDeviceId]);

  useEffect(() => {
    if (!showSettings) return;
    const onEsc = (e: KeyboardEvent) => e.code === "Escape" && setShowSettings(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showSettings]);

  const testing = perf.view === "test";

  return (
    <div className={`app${testing ? " testing" : ""}${perf.instrumentPaused ? " paused" : ""}`}>
      <TopBar
        view={perf.view}
        paused={perf.instrumentPaused}
        onView={setView}
        onSettings={() => setShowSettings(true)}
      />
      <ControlPane settings={settings} />
      <main className="stage">
        {perf.instrumentPaused ? (
          <div className="paused-banner" onClick={() => !perf.autoPaused && setPaused(false)}>
            <strong>INSTRUMENT PAUSED</strong>
            <span>KEYBOARD PASSTHROUGH</span>
            <span className="muted">
              {perf.autoPaused
                ? "while you type — press Esc or click outside the text box to play again"
                : "loops and text keep playing — Pause/Break or F12 to resume"}
            </span>
          </div>
        ) : testing ? (
          <KeyboardTest perf={perf} />
        ) : (
          <LayerStrip settings={settings} layer={perf.layer} />
        )}
        <KeyboardView
          settings={settings}
          layer={perf.layer}
          active={perf.activeCodes}
          legends={perf.legends}
          raw={testing}
          prompt={learning ? learn.promptCodes : undefined}
          promptProgress={learn.progress}
          spent={perf.tab === "learn" ? learn.spentCodes : undefined}
        />
        {!testing && <PanelSplit height={panelHeight} heightRef={panelHeightRef} onChange={setPanelHeight} />}
        {!testing && (
          <section className="panel" style={{ height: panelHeight }}>
            <nav className="tabs">
              {TABS.map((t) => (
                <Btn key={t.id} on={perf.tab === t.id} onClick={() => perfStore.set({ tab: t.id })}>
                  {t.label}
                </Btn>
              ))}
            </nav>
            <div className="panel-body">
              {perf.tab === "live" && <LivePanel settings={settings} perf={perf} />}
              {perf.tab === "text" && <TextPanel />}
              {perf.tab === "loops" && <LoopsPanel />}
              {perf.tab === "learn" && <LearnPanel />}
            </div>
          </section>
        )}
      </main>
      {!perf.audioReady && (
        <div className="audio-gate" onClick={() => void startAudio()}>
          <div>
            <h2>Click or press any key to enable audio</h2>
            <p>Then rest both hands on the keyboard. Rows are pitch ranges; modifiers change instruments.</p>
          </div>
        </div>
      )}
      {showSettings && <SettingsDialog settings={settings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
