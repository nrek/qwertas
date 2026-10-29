export type OutputDevice = { deviceId: string; label: string };

/** List audio outputs when the runtime grants permission / supports enumeration. */
export async function listOutputDevices(): Promise<{ devices: OutputDevice[]; supported: boolean; note?: string }> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { devices: [], supported: false, note: "Device enumeration is unavailable in this runtime." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);
    stream?.getTracks().forEach((t) => t.stop());
    const all = await navigator.mediaDevices.enumerateDevices();
    const devices = all
      .filter((d) => d.kind === "audiooutput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Output ${i + 1}` }));
    return { devices, supported: true };
  } catch (err) {
    return { devices: [], supported: false, note: String(err) };
  }
}

export function sinkIdSupported(): boolean {
  return typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === "function";
}
