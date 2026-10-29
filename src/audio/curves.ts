const curveCache = new Map<number, Float32Array<ArrayBuffer>>();

/** Soft-clip waveshaper curve for drive amount 0..1 (cached per 1% step). */
export function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 100);
  const cached = curveCache.get(key);
  if (cached) return cached;
  const k = key * 0.6;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  curveCache.set(key, curve);
  return curve;
}

/** Velocity 0..127 → linear gain with a gentle curve. */
export function velocityGain(velocity: number): number {
  const v = Math.max(0, Math.min(127, velocity)) / 127;
  return Math.pow(v, 1.4);
}

/** Global filter control 0..1 → cutoff multiplier (0.5 = unchanged, 0 = 1/4, 1 = 4x). */
export function filterMultiplier(control: number): number {
  return Math.pow(4, (control - 0.5) * 2);
}
