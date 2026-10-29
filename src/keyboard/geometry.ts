export type KeyCap = { code: string; label: string; width?: number };

/** Main block, 15 units wide per row (ANSI). */
export const MAIN_ROWS: KeyCap[][] = [
  [
    { code: "Backquote", label: "`" },
    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => ({ code: `Digit${d}`, label: d })),
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
    { code: "Backspace", label: "Backspace", width: 2 },
  ],
  [
    { code: "Tab", label: "Tab", width: 1.5 },
    ..."QWERTYUIOP".split("").map((c) => ({ code: `Key${c}`, label: c })),
    { code: "BracketLeft", label: "[" },
    { code: "BracketRight", label: "]" },
    { code: "Backslash", label: "\\", width: 1.5 },
  ],
  [
    { code: "CapsLock", label: "Caps", width: 1.75 },
    ..."ASDFGHJKL".split("").map((c) => ({ code: `Key${c}`, label: c })),
    { code: "Semicolon", label: ";" },
    { code: "Quote", label: "'" },
    { code: "Enter", label: "Enter", width: 2.25 },
  ],
  [
    { code: "ShiftLeft", label: "Shift", width: 2.25 },
    ..."ZXCVBNM".split("").map((c) => ({ code: `Key${c}`, label: c })),
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "/" },
    { code: "ShiftRight", label: "Shift", width: 2.75 },
  ],
  [
    { code: "ControlLeft", label: "Ctrl", width: 1.5 },
    { code: "MetaLeft", label: "Win", width: 1.25 },
    { code: "AltLeft", label: "Alt", width: 1.5 },
    { code: "Space", label: "Space", width: 6.25 },
    { code: "AltRight", label: "Alt", width: 1.5 },
    { code: "ContextMenu", label: "Menu", width: 1.5 },
    { code: "ControlRight", label: "Ctrl", width: 1.5 },
  ],
];

export const ARROWS: (KeyCap | null)[][] = [
  [null, { code: "ArrowUp", label: "↑" }, null],
  [
    { code: "ArrowLeft", label: "←" },
    { code: "ArrowDown", label: "↓" },
    { code: "ArrowRight", label: "→" },
  ],
];

/** Numpad cells placed on a 4×5 grid: [col, row, colSpan, rowSpan]. */
export const NUMPAD: (KeyCap & { grid: [number, number, number, number] })[] = [
  { code: "NumLock", label: "Num", grid: [1, 1, 1, 1] },
  { code: "NumpadDivide", label: "/", grid: [2, 1, 1, 1] },
  { code: "NumpadMultiply", label: "*", grid: [3, 1, 1, 1] },
  { code: "NumpadSubtract", label: "-", grid: [4, 1, 1, 1] },
  { code: "Numpad7", label: "7", grid: [1, 2, 1, 1] },
  { code: "Numpad8", label: "8", grid: [2, 2, 1, 1] },
  { code: "Numpad9", label: "9", grid: [3, 2, 1, 1] },
  { code: "NumpadAdd", label: "+", grid: [4, 2, 1, 2] },
  { code: "Numpad4", label: "4", grid: [1, 3, 1, 1] },
  { code: "Numpad5", label: "5", grid: [2, 3, 1, 1] },
  { code: "Numpad6", label: "6", grid: [3, 3, 1, 1] },
  { code: "Numpad1", label: "1", grid: [1, 4, 1, 1] },
  { code: "Numpad2", label: "2", grid: [2, 4, 1, 1] },
  { code: "Numpad3", label: "3", grid: [3, 4, 1, 1] },
  { code: "NumpadEnter", label: "Ent", grid: [4, 4, 1, 2] },
  { code: "Numpad0", label: "0", grid: [1, 5, 2, 1] },
  { code: "NumpadDecimal", label: ".", grid: [3, 5, 1, 1] },
];

export const ALL_CODES: string[] = [
  ...MAIN_ROWS.flat().map((k) => k.code),
  ...ARROWS.flat().flatMap((k) => (k ? [k.code] : [])),
  ...NUMPAD.map((k) => k.code),
];
