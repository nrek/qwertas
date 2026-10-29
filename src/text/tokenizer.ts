import type { DrumId } from "../drums/kits";
import type { LayerId } from "../mappings/layers";
import type { Token } from "./types";

/** Characters that name a physical key. `.` and `-` are rest/sustain, so Period/Minus aren't literals. */
const CHAR_CODES: Record<string, string> = {
  ",": "Comma",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "=": "Equal",
  "\\": "Backslash",
};

export function charToCode(ch: string): string | null {
  const c = ch.toLowerCase();
  if (c >= "a" && c <= "z") return `Key${c.toUpperCase()}`;
  if (c >= "0" && c <= "9") return `Digit${c}`;
  return CHAR_CODES[c] ?? null;
}

/** `<NAME>` drum tokens. Extra names are aliases over the same kit voices. */
export const DRUM_TOKENS: Record<string, DrumId> = {
  KICK: "kick",
  KICK2: "kick2",
  SNARE: "snare",
  HAT: "hat_closed",
  OHAT: "hat_open",
  OPENHAT: "hat_open",
  CLAP: "clap",
  RIM: "rim",
  TOM: "tom",
  CRASH: "crash",
  RIDE: "ride",
};

const LAYER_TOKENS: Record<string, LayerId> = {
  base: "base",
  shift: "shift",
  ctrl: "ctrl",
  alt: "alt",
  "shift+ctrl": "shift_ctrl",
  "ctrl+shift": "shift_ctrl",
  "shift+alt": "shift_alt",
  "alt+shift": "shift_alt",
  "ctrl+alt": "ctrl_alt",
  "alt+ctrl": "ctrl_alt",
};

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const lineStarts = [0];
  for (let at = 0; at < src.length; at++) if (src[at] === "\n") lineStarts.push(at + 1);
  const position = (at: number) => {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (lineStarts[mid]! <= at) low = mid;
      else high = mid;
    }
    return { line: low + 1, column: at - lineStarts[low]! + 1 };
  };
  const push = (t: Omit<Token, "text" | "line" | "column">) =>
    tokens.push({ ...t, ...position(t.start), text: src.slice(t.start, t.end) });
  const duration = (after: number): { end: number; units?: number; error?: string } => {
    if (src[after] !== ":") return { end: after };
    let end = after + 1;
    while (end < src.length && !/[\s|]/.test(src[end]!)) end++;
    const raw = src.slice(after + 1, end);
    if (!/^\d+$/.test(raw)) return { end, error: `invalid duration "${raw || "(empty)"}"` };
    const units = Number(raw);
    if (!Number.isSafeInteger(units) || units < 1 || units > 100_000) {
      return { end, error: `duration must be between 1 and 100000 grid units` };
    }
    return { end, units };
  };

  while (i < src.length) {
    const ch = src[i]!;

    if (ch === "@") {
      const lineStart = src.lastIndexOf("\n", i - 1) + 1;
      if (/^\s*$/.test(src.slice(lineStart, i))) {
        const end = src.indexOf("\n", i);
        const tokenEnd = end < 0 ? src.length : end;
        const body = src.slice(i + 1, tokenEnd).trim();
        const split = body.search(/\s/);
        const directive = (split < 0 ? body : body.slice(0, split)).toLowerCase();
        const value = split < 0 ? "" : body.slice(split).trim();
        push({ kind: "directive", start: i, end: tokenEnd, directive, value });
        i = tokenEnd;
        continue;
      }
    }

    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j]!)) j++;
      push({ kind: "space", start: i, end: j });
      i = j;
      continue;
    }

    if (ch === "<" || ch === "{") {
      const close = ch === "<" ? ">" : "}";
      const j = src.indexOf(close, i + 1);
      const nl = src.indexOf("\n", i + 1);
      if (j < 0 || (nl >= 0 && nl < j)) {
        push({ kind: "error", start: i, end: i + 1, error: `unclosed ${ch}` });
        i++;
        continue;
      }
      const name = src.slice(i + 1, j).trim();
      if (ch === "<") {
        const drum = DRUM_TOKENS[name.toUpperCase()];
        const d = duration(j + 1);
        push(
          drum
            ? d.error
              ? { kind: "error", start: i, end: d.end, error: d.error }
              : { kind: "drum", start: i, end: d.end, drum, durationUnits: d.units }
            : { kind: "error", start: i, end: d.end, error: `unknown drum <${name}>` },
        );
        i = d.end;
      } else {
        const layer = LAYER_TOKENS[name.toLowerCase().replace(/\s+/g, "")];
        push(
          layer
            ? { kind: "layer", start: i, end: j + 1, layer }
            : { kind: "error", start: i, end: j + 1, error: `unknown layer {${name}}` },
        );
        i = j + 1;
      }
      continue;
    }

    if (ch === "." || charToCode(ch)) {
      const d = duration(i + 1);
      if (d.error) push({ kind: "error", start: i, end: d.end, error: d.error });
      else if (ch === ".") push({ kind: "rest", start: i, end: d.end, durationUnits: d.units });
      else push({ kind: "key", start: i, end: d.end, code: charToCode(ch)!, durationUnits: d.units });
      i = d.end;
      continue;
    }
    if (ch === "-") push({ kind: "sustain", start: i, end: i + 1 });
    else if (ch === "|") push({ kind: "bar", start: i, end: i + 1 });
    else if (ch === "(") {
      let end = src.indexOf(")", i + 1);
      end = end < 0 ? i + 1 : end + 1;
      const d = duration(end);
      push({
        kind: "error",
        start: i,
        end: d.end,
        error: "simultaneous groups are reserved but not supported in this version",
      });
      i = d.end;
      continue;
    }
    else {
      push({ kind: "error", start: i, end: i + 1, error: `"${ch}" is not a key` });
    }
    i++;
  }
  return tokens;
}
