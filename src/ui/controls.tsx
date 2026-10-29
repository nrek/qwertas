import type React from "react";
import type { ReactNode } from "react";

/** Controls must never keep focus — the keyboard belongs to the instrument. */
export const release = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Full-width slider with label left and live value right. */
export function RangeRow({
  label,
  value,
  onChange,
  format = (v) => `${Math.round(v * 100)}`,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="range-row">
      <span className="range-head">
        <span>{label}</span>
        <span className="range-value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={release}
      />
    </label>
  );
}

const DIAL_SWEEP = 270;

/**
 * Rotary control: drag up/down (Shift = fine), wheel, double-click resets.
 * Never focusable, so keys keep playing the instrument.
 */
export function Dial({
  label,
  value,
  min,
  max,
  def,
  step = 0.5,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  def: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const span = max - min;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const angle = ((value - min) / span) * DIAL_SWEEP - DIAL_SWEEP / 2;
  const defAngle = ((def - min) / span) * DIAL_SWEEP - DIAL_SWEEP / 2;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const start = value;
    const move = (ev: PointerEvent) => {
      const px = ev.shiftKey ? 600 : 150;
      onChange(clamp(start + ((startY - ev.clientY) / px) * span));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <div className="dial-field">
      <div
        className="dial"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        title={`${label} — drag, scroll, double-click to reset`}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onChange(def)}
        onWheel={(e) => onChange(clamp(value + (e.deltaY < 0 ? step : -step) * 2))}
      >
        <svg viewBox="-30 -30 60 60">
          <path className="dial-track" d={arc(-DIAL_SWEEP / 2, DIAL_SWEEP / 2)} />
          {value !== def && (
            <path className="dial-fill" d={arc(Math.min(defAngle, angle), Math.max(defAngle, angle))} />
          )}
          <circle className="dial-cap" r="16" />
          <line className="dial-needle" x1="0" y1="-6" x2="0" y2="-14" transform={`rotate(${angle})`} />
        </svg>
      </div>
      <span className="dial-label">{label}</span>
      <span className="dial-value">{format(value)}</span>
    </div>
  );
}

function arc(fromDeg: number, toDeg: number, r = 24): string {
  const pt = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return `${(r * Math.cos(rad)).toFixed(2)} ${(r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M ${pt(fromDeg)} A ${r} ${r} 0 ${toDeg - fromDeg > 180 ? 1 : 0} 1 ${pt(toDeg)}`;
}

export function Btn({
  children,
  onClick,
  on,
  className,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  on?: boolean;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`${className ?? ""}${on ? " on" : ""}`}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        onClick();
        release(e);
      }}
    >
      {children}
    </button>
  );
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
