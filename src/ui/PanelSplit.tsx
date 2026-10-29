import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "qwertas.panelHeight";
export const PANEL_MIN = 200;
/** Must match `.keyboard { min-height }` in styles.css. */
const KEYBOARD_MIN = 240;

function defaultHeight(): number {
  return Math.min(300, Math.max(220, Math.round(window.innerHeight * 0.3)));
}

function loadHeight(): number {
  const raw = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : defaultHeight();
}

/** Tallest the panel may be: half the window, and never below the keyboard's minimum height. */
function maxHeight(current: number, keyboard: HTMLElement | null): number {
  const half = Math.floor(window.innerHeight * 0.5);
  const kbRoom = keyboard ? current + keyboard.clientHeight - KEYBOARD_MIN : half;
  return Math.max(PANEL_MIN, Math.min(half, kbRoom));
}

const clamp = (h: number, max: number) => Math.round(Math.min(max, Math.max(PANEL_MIN, h)));

export function usePanelHeight() {
  const [height, setHeight] = useState(loadHeight);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    const refit = () => {
      const kb = document.querySelector<HTMLElement>(".keyboard");
      setHeight((h) => clamp(h, maxHeight(h, kb)));
    };
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(height));
    } catch {
      // storage unavailable — the size just won't persist
    }
  }, [height]);

  return [height, setHeight, heightRef] as const;
}

type Props = {
  height: number;
  heightRef: { current: number };
  onChange: (h: number) => void;
};

/** Drag handle between the keyboard and the tabbed panel; dragging up grows the panel. */
export function PanelSplit({ height, heightRef, onChange }: Props) {
  const drag = useRef<{ y: number; h: number; max: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = heightRef.current;
    drag.current = { y: e.clientY, h, max: maxHeight(h, document.querySelector<HTMLElement>(".keyboard")) };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onChange(clamp(d.h + (d.y - e.clientY), d.max));
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="panel-split"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
      aria-valuenow={height}
      aria-valuemin={PANEL_MIN}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onChange(clamp(defaultHeight(), maxHeight(heightRef.current, document.querySelector(".keyboard"))))}
    />
  );
}
