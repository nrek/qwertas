import { app, BrowserWindow, dialog, ipcMain, Menu, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import path from "node:path";

const DEV_URL = process.env.QWERT_DEV_URL;
const SMOKE = process.env.QWERT_SMOKE === "1";
// Packaged builds run from a read-only asar, so smoke artifacts go to userData instead.
const SMOKE_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "smoke-artifacts")
  : path.join(__dirname, "..", "tests", "artifacts");

const MAX_AUDIO_BYTES = 1024 * 1024 * 1024;
const MAX_JSON_CHARS = 64 * 1024 * 1024;
const MAX_SCORE_BYTES = 1024 * 1024;

// The instrument must sound on the first keypress; the renderer still shows an explicit
// "press any key" gate and resumes the AudioContext itself.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#f4f1ea",
    title: "QWERTAS",
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // No application menu: menu accelerators (Ctrl+W, Ctrl+R, Alt focus) would steal performance keys.
  Menu.setApplicationMenu(null);

  // F12 is the Pause Instrument fallback in the renderer, so devtools live on F10 (dev only).
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F10" && !app.isPackaged) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  if (DEV_URL && !app.isPackaged) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  if (SMOKE) {
    // Fully hidden windows pause rAF and painting; an invisible, unfocused one renders normally.
    mainWindow.setSkipTaskbar(true);
    mainWindow.setOpacity(0);
    mainWindow.showInactive();
    runSmoke(mainWindow);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function fromMainFrame(event: IpcMainInvokeEvent): boolean {
  return !!mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

ipcMain.handle("score:open", async (event) => {
  if (!fromMainFrame(event)) throw new Error("untrusted sender");
  const examples = app.isPackaged
    ? path.join(process.resourcesPath, "examples")
    : path.join(__dirname, "..", "examples");
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Import QWERTAS score",
    defaultPath: fs.existsSync(examples) ? examples : undefined,
    properties: ["openFile"],
    filters: [{ name: "QWERTAS Scores", extensions: ["qwertas", "txt"] }],
  });
  if (result.canceled || result.filePaths.length !== 1) return null;

  const filePath = result.filePaths[0]!;
  if (![".qwertas", ".txt"].includes(path.extname(filePath).toLowerCase())) {
    throw new Error("score must be a .qwertas or .txt file");
  }
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error("selected score is not a file");
  if (stat.size > MAX_SCORE_BYTES) throw new Error("score is larger than the 1 MiB limit");
  const bytes = await fs.promises.readFile(filePath);
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("score must be valid UTF-8 text");
  }
  return {
    path: filePath,
    name: path.basename(filePath),
    content: content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"),
  };
});

/** Writes `<base>.webm`, `<base>.events.json`, `<base>.json` to a user-chosen location. */
ipcMain.handle("recording:save", async (event, payload: unknown) => {
  if (!fromMainFrame(event)) throw new Error("untrusted sender");
  const p = payload as { audio?: unknown; events?: unknown; manifest?: unknown };
  if (!(p.audio instanceof ArrayBuffer) || p.audio.byteLength === 0 || p.audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("invalid audio");
  }
  if (typeof p.events !== "string" || typeof p.manifest !== "string") throw new Error("invalid metadata");
  if (p.events.length > MAX_JSON_CHARS || p.manifest.length > MAX_JSON_CHARS) throw new Error("metadata too large");

  let filePath: string | undefined;
  if (SMOKE) {
    fs.mkdirSync(SMOKE_DIR, { recursive: true });
    filePath = path.join(SMOKE_DIR, "performance.webm");
  } else {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "Save performance",
      defaultPath: path.join(app.getPath("music"), `performance-${stamp()}.webm`),
      filters: [{ name: "WebM audio", extensions: ["webm"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    filePath = result.filePath;
  }

  const base = filePath.replace(/\.webm$/i, "");
  await fs.promises.writeFile(`${base}.webm`, Buffer.from(p.audio));
  await fs.promises.writeFile(`${base}.events.json`, p.events, "utf8");
  await fs.promises.writeFile(`${base}.json`, p.manifest, "utf8");
  return { saved: true, path: `${base}.webm` };
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Headless end-to-end check of the plan's scenarios: live play, pause/typing, typed beat,
 * text → loop, live layering into a second track, track clear, master record + save.
 */
function runSmoke(win: BrowserWindow) {
  const errors: string[] = [];
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") errors.push(details.message);
  });
  const wc = win.webContents;
  const js = <T = unknown>(expr: string): Promise<T> => wc.executeJavaScript(expr);
  const dbg = <T = unknown>(expr: string): Promise<T> => js<T>(`window.__qwertDebug.${expr}`);
  const key = (type: "keyDown" | "keyUp", keyCode: string) => wc.sendInputEvent({ type, keyCode });
  const tap = async (keyCode: string, holdMs = 80) => {
    key("keyDown", keyCode);
    await sleep(holdMs);
    key("keyUp", keyCode);
  };
  const shot = async (name: string) => {
    fs.mkdirSync(SMOKE_DIR, { recursive: true });
    // Hidden windows only repaint on demand; without this the capture can be a stale frame.
    wc.invalidate();
    await sleep(250);
    fs.writeFileSync(path.join(SMOKE_DIR, name), (await wc.capturePage()).toPNG());
  };
  const waitFor = async (expr: string, timeoutMs: number) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await dbg<boolean>(expr)) return true;
      await sleep(50);
    }
    return false;
  };

  wc.once("did-finish-load", () => {
    setTimeout(async () => {
      const c: Record<string, unknown> = {};
      const fail: string[] = [];
      const expect = (name: string, ok: boolean) => {
        if (!ok) fail.push(name);
      };
      try {
        wc.focus();
        c.keys = await js(`document.querySelectorAll('[data-code]').length`);
        expect("keyboard rendered", (c.keys as number) > 60);

        // Live play
        await tap("Z", 300);
        await sleep(150);
        expect("audio running", (await dbg("audio()")) === "running");
        key("keyDown", "Z");
        key("keyDown", "Q");
        key("keyDown", "Space");
        await sleep(150);
        c.liveVoices = await dbg("voices()");
        c.lit = await js(`[...document.querySelectorAll('.key.active')].map((el) => el.dataset.code)`);
        expect("live voices", (c.liveVoices as number) >= 2);
        expect("keys lit", (c.lit as string[]).length === 3);
        await shot("smoke-live.png");
        await js(`window.dispatchEvent(new Event('blur'))`);
        await sleep(100);
        expect("blur releases live", (await dbg("voices()")) === 0);

        // Pause: F12 toggles, keys pass through silently
        await tap("F12");
        await sleep(50);
        expect("paused", (await dbg("paused()")) === true);
        await tap("X", 150);
        expect("paused keys silent", (await dbg("voices()")) === 0 && (await dbg<string[]>("held()")).length === 0);
        await tap("F12");
        await sleep(50);
        expect("resumed", (await dbg("paused()")) === false);

        // Master record everything that follows
        await dbg("startRecording()");

        // Typed beat
        await dbg(`setText(${JSON.stringify("<KICK> . <HAT> . <SNARE> . <HAT> .\n{ctrl} z - z x | c v")})`);
        await dbg("setTab('text')");
        await dbg("playText()");
        await sleep(700);
        c.cursor = await dbg("textCursor()");
        await shot("smoke-text.png");
        c.cursorHighlighted = await js(`!!document.querySelector('.tok-hot')`);
        expect("cursor highlighted in editor", c.cursorHighlighted === true);
        await dbg(`setText(${JSON.stringify("<KICK> . <HAT> . <SNARE> . <HAT> .")})`);
        expect("text cursor moves", c.cursor !== null);
        await dbg("stopText()");

        // Text -> Track 1 defines the cycle
        await dbg("sendTextToTrack(1)");
        c.cycle = await dbg("cycleLength()");
        expect("cycle from text", Math.abs((c.cycle as number) - 2) < 0.01);

        // Live layering: record Track 2 (one cycle) over Track 1
        await dbg("recordTrack(2)");
        expect("track 2 recording", await waitFor(`trackState(2) === 'recording'`, 3000));
        for (const k of ["Z", "C", "B", "M"]) {
          await tap(k, 120);
          await sleep(250);
        }
        expect("track 2 playing", await waitFor(`trackState(2) === 'playing'`, 3000));
        c.track2Events = await dbg("trackEvents(2)");
        expect("track 2 has events", (c.track2Events as number) >= 4);
        await dbg("setTab('loops')");
        await sleep(2300);
        c.loggedSources = await dbg("loggedSources()");
        const sources = c.loggedSources as string[];
        expect("track 1 played", sources.includes("track:1"));
        expect("track 2 played", sources.includes("track:2"));
        expect("text logged", sources.includes("text"));
        expect("live logged", sources.includes("live"));
        await shot("smoke-loops.png");

        // Clear Track 2 only
        await dbg("clearTrack(2)");
        expect("track 2 cleared", (await dbg("trackState(2)")) === "empty");
        expect("track 1 continues", (await dbg("trackState(1)")) === "playing");

        // Stop master recording and save
        await dbg("stopRecording()");
        c.takeBytes = await dbg("takeSize()");
        expect("take has audio", (c.takeBytes as number) > 1000);
        c.savedTo = await dbg("saveRecording()");
        const base = path.join(SMOKE_DIR, "performance");
        for (const ext of [".webm", ".events.json", ".json"]) {
          expect(`saved ${ext}`, fs.existsSync(base + ext) && fs.statSync(base + ext).size > 0);
        }
        // Learn: the score waits for held keys; rests advance on their own
        await dbg(`setText(${JSON.stringify("@tempo 120\n@grid 1/8\nw:1 .:1 e:4")})`);
        await dbg("setTab('learn')");
        expect("learn started", (await dbg<boolean>("startLearn()")) === true);
        await sleep(150);
        c.learnPrompt = await js(`[...document.querySelectorAll('.key.learn-target')].map((el) => el.dataset.code)`);
        expect("learn highlights W", (c.learnPrompt as string[]).includes("KeyW"));
        await tap("W", 100);
        await sleep(50);
        expect("short hold does not advance", (await dbg<{ index: number }>("learnState()")).index === 0);
        await tap("W", 400);
        expect("rest then E", await waitFor(`learnState().prompt.includes('KeyE')`, 1500));
        await shot("smoke-learn.png");
        // Mid-hold: the held target is partly faded from its row colour; releasing early resets it
        c.learnIdleBg = await js(`getComputedStyle(document.querySelector('[data-code="KeyE"]')).backgroundColor`);
        key("keyDown", "E");
        await sleep(200);
        c.learnFadeBg = await js(`getComputedStyle(document.querySelector('[data-code="KeyE"]')).backgroundColor`);
        await shot("smoke-learn-fade.png");
        expect("held target is tinted", c.learnFadeBg !== c.learnIdleBg);
        key("keyUp", "E");
        await sleep(100);
        expect("early release keeps E", (await dbg<{ index: number }>("learnState()")).index === 2);
        await tap("E", 1150);
        expect("learn finished", await waitFor(`learnState().status === 'finished'`, 1000));

        // Learn follows the active line: rests race down to a W on the last line
        const longScore = `@tempo 240\n@grid 1/32\n${".:1\n".repeat(40)}w:1`;
        await dbg(`setText(${JSON.stringify(longScore)})`);
        await dbg("startLearn()");
        expect("learn reaches last line", await waitFor(`learnState().prompt.includes('KeyW')`, 3000));
        await sleep(600);
        c.learnScrollTop = await js(`document.querySelector('.editor-input').scrollTop`);
        expect("editor follows active line", (c.learnScrollTop as number) > 0);
        await dbg("stopLearn()");

        type Box = { split: { x: number; y: number }; panel: number; kb: number; key: number; win: number };
        const measure = () =>
          js<Box>(`(() => {
            const r = document.querySelector('.panel-split').getBoundingClientRect();
            return {
              split: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
              panel: document.querySelector('.panel').offsetHeight,
              kb: document.querySelector('.keyboard').offsetHeight,
              key: document.querySelector('.key[data-code="KeyQ"]').offsetHeight,
              win: window.innerHeight,
            };
          })()`);
        const dragSplit = async (toY: number) => {
          const { split } = await measure();
          const at = (type: "mouseDown" | "mouseMove" | "mouseUp", y: number) =>
            wc.sendInputEvent({
              type,
              x: split.x,
              y,
              button: "left",
              clickCount: 1,
              modifiers: type === "mouseMove" ? ["leftbuttondown"] : [],
            });
          at("mouseDown", split.y);
          for (let i = 1; i <= 8; i++) {
            at("mouseMove", Math.round(split.y + ((toY - split.y) * i) / 8));
            await sleep(16);
          }
          at("mouseUp", toY);
          await sleep(150);
          return measure();
        };
        const before = await measure();
        const tall = await dragSplit(0);
        c.resize = { before, tall };
        expect("panel grows when dragged up", tall.panel > before.panel);
        expect("panel capped at half the window", tall.panel <= Math.floor(tall.win / 2));
        expect("keyboard stays visible", tall.kb >= 240 && tall.key >= 36);
        await shot("smoke-resize.png");
        const short = await dragSplit(tall.win);
        expect("panel shrinks to its minimum", short.panel === 200);
        await dragSplit(short.split.y - (before.panel - short.panel));

        await dbg("stopAll()");
        await sleep(200);
        expect("stop all", (await dbg("trackState(1)")) === "stopped");

        expect("no console errors", errors.length === 0);
        console.log(`[smoke] ${JSON.stringify({ ...c, errors })}`);
        console.log(fail.length ? `[smoke] FAIL ${fail.join(", ")}` : "[smoke] PASS");
        app.exit(fail.length ? 1 : 0);
      } catch (err) {
        console.log(`[smoke] FAIL ${String(err)} ${JSON.stringify(c)}`);
        app.exit(1);
      }
    }, 1200);
  });
  wc.once("did-fail-load", (_e, code, desc) => {
    console.log(`[smoke] FAIL load ${code} ${desc}`);
    app.exit(1);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
