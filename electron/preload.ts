import { contextBridge, ipcRenderer } from "electron";

type SaveRecordingPayload = { audio: ArrayBuffer; events: string; manifest: string };
type ScoreFile = { path: string; name: string; content: string };

contextBridge.exposeInMainWorld("qwert", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  openScoreFile: (): Promise<ScoreFile | null> => ipcRenderer.invoke("score:open"),
  saveRecording: (payload: SaveRecordingPayload): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke("recording:save", payload),
});
