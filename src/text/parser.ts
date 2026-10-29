import type { LayerId } from "../mappings/layers";
import { PROFILE_IDS, PROFILES } from "../mappings/profiles";
import { withCanonical } from "../performance/canonicalize";
import type { ContextSnapshot, PerformanceEvent } from "../performance/types";
import { contextFromSnapshot } from "../performance/types";
import { resolveKey } from "../mappings/resolve";
import { NOTE_NAMES, SCALE_IDS, SCALES } from "../scales/scales";
import { tokenize } from "./tokenizer";
import type { Grid, QwertasScore, ScoreEvent, ScoreMetadata, Token } from "./types";

/**
 * Tokens → normalized score events on a grid.
 *   key / <DRUM> / .  consume their explicit duration, or one unit
 *   -                 extends the previous note, drum or rest by one unit
 *   | and whitespace  consume no time
 *   {layer}           sets the modifier layer for following keys
 */
export function parseTokens(
  tokens: Token[],
  defaults: { tempo?: number; grid?: Grid; filename?: string } = {},
): QwertasScore {
  const events: ScoreEvent[] = [];
  const errors: Token[] = [];
  const warnings: Token[] = [];
  const directives = new Set<string>();
  const metadata: ScoreMetadata = {
    tempo: defaults.tempo ?? 120,
    grid: defaults.grid ?? 8,
    filename: defaults.filename,
    unknown: {},
  };
  let unit = 0;
  let layer: LayerId = "base";
  let last: ScoreEvent | null = null;
  const problem = (tok: Token, message: string): Token => ({ ...tok, kind: "error", error: message });
  const warning = (tok: Token, message: string): Token => ({ ...tok, warning: message });

  for (const tok of tokens) {
    const source = { start: tok.start, end: tok.end };
    switch (tok.kind) {
      case "key": {
        const durationUnits = tok.durationUnits ?? 1;
        last = {
          index: events.length,
          startUnit: unit,
          type: "note",
          physicalKey: tok.code,
          token: tok.text,
          durationUnits,
          layer,
          source,
        };
        events.push(last);
        unit += durationUnits;
        break;
      }
      case "drum": {
        const durationUnits = tok.durationUnits ?? 1;
        last = {
          index: events.length,
          startUnit: unit,
          type: "drum",
          drum: tok.drum,
          token: tok.text,
          durationUnits,
          layer,
          source,
        };
        events.push(last);
        unit += durationUnits;
        break;
      }
      case "rest": {
        const durationUnits = tok.durationUnits ?? 1;
        last = {
          index: events.length,
          startUnit: unit,
          type: "rest",
          token: tok.text,
          durationUnits,
          source,
        };
        events.push(last);
        unit += durationUnits;
        break;
      }
      case "sustain":
        if (last) {
          last.durationUnits += 1;
          last.source = { start: last.source.start, end: tok.end };
        } else {
          events.push(
            (last = {
              index: events.length,
              startUnit: unit,
              type: "rest",
              token: tok.text,
              durationUnits: 1,
              source,
            }),
          );
        }
        unit++;
        break;
      case "layer":
        layer = tok.layer ?? "base";
        events.push({
          index: events.length,
          startUnit: unit,
          type: "modifier",
          token: tok.text,
          durationUnits: 0,
          layer,
          source,
        });
        break;
      case "bar":
        events.push({
          index: events.length,
          startUnit: unit,
          type: "bar",
          token: tok.text,
          durationUnits: 0,
          source,
        });
        break;
      case "directive":
        parseDirective(tok, metadata, directives, errors, warnings, problem, warning);
        break;
      case "error":
        errors.push(tok);
        break;
      case "space":
        break;
    }
  }
  return { metadata, events, units: unit, errors, warnings, directives };
}

type ProblemFn = (tok: Token, message: string) => Token;

function parseDirective(
  tok: Token,
  metadata: ScoreMetadata,
  directives: Set<string>,
  errors: Token[],
  warnings: Token[],
  problem: ProblemFn,
  warning: ProblemFn,
) {
  const name = tok.directive ?? "";
  const value = tok.value?.trim() ?? "";
  directives.add(name);
  if (!value) {
    errors.push(problem(tok, `@${name || "(empty)"} requires a value`));
    return;
  }
  switch (name) {
    case "title":
      metadata.title = value;
      return;
    case "tempo": {
      const tempo = Number(value);
      if (!Number.isInteger(tempo) || tempo < 40 || tempo > 240) {
        errors.push(problem(tok, `invalid tempo "${value}" (expected an integer from 40 to 240 BPM)`));
      } else metadata.tempo = tempo;
      return;
    }
    case "grid": {
      const match = /^1\/(4|8|16|32)$/.exec(value);
      if (!match) errors.push(problem(tok, `invalid grid "${value}" (expected 1/4, 1/8, 1/16, or 1/32)`));
      else metadata.grid = Number(match[1]) as Grid;
      return;
    }
    case "root": {
      const normalized = `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
      if (!NOTE_NAMES.includes(normalized as (typeof NOTE_NAMES)[number])) {
        errors.push(problem(tok, `unknown root "${value}"`));
      } else metadata.root = normalized as (typeof NOTE_NAMES)[number];
      return;
    }
    case "scale": {
      const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
      const id = SCALE_IDS.find(
        (candidate) => candidate === normalized || SCALES[candidate].label.toLowerCase().replace(/[\s-]+/g, "_") === normalized,
      );
      if (!id) errors.push(problem(tok, `unknown scale "${value}"`));
      else metadata.scale = id;
      return;
    }
    case "profile": {
      const normalized = value.toLowerCase().replace(/[\s/_-]+/g, "");
      const id = PROFILE_IDS.find(
        (candidate) =>
          candidate.replace(/_/g, "") === normalized || PROFILES[candidate].name.toLowerCase().replace(/[\s/_-]+/g, "") === normalized,
      );
      if (!id) errors.push(problem(tok, `unknown profile "${value}"`));
      else metadata.profile = id;
      return;
    }
    default:
      metadata.unknown[name] = value;
      warnings.push(warning(tok, `unknown directive @${name} was preserved and ignored`));
  }
}

export function parseSequence(
  src: string,
  defaults: { tempo?: number; grid?: Grid; filename?: string } = {},
): QwertasScore {
  return parseTokens(tokenize(src), defaults);
}

/** Seconds per grid unit: a 1/4 unit is one beat. */
export function stepSeconds(bpm: number, grid: Grid): number {
  return (60 / bpm) * (4 / grid);
}

/**
 * Sequence → PerformanceEvents in ms.
 * When a snapshot is supplied, note downs are stamped with pitch-canonical fields so later
 * layout changes cannot rewrite the music. Keystroke metadata is always retained.
 */
export function sequenceToPerformance(
  seq: QwertasScore,
  unitMs = stepSeconds(seq.metadata.tempo, seq.metadata.grid) * 1000,
  snap?: ContextSnapshot,
): PerformanceEvent[] {
  const out: PerformanceEvent[] = [];
  for (const e of seq.events) {
    const t = e.startUnit * unitMs;
    if (e.type === "note" && e.physicalKey) {
      const end = (e.startUnit + e.durationUnits) * unitMs;
      let down: PerformanceEvent = { timeMs: t, type: "down", physicalKey: e.physicalKey, layer: e.layer };
      if (snap) {
        const mappingId = snap.mappingId ?? "legacy";
        const action = resolveKey(e.physicalKey, contextFromSnapshot(snap, e.layer ?? "base"));
        down = withCanonical(down, action, mappingId);
        out.push(down);
        out.push({
          timeMs: end,
          type: "up",
          physicalKey: e.physicalKey,
          layer: e.layer,
          mappingId,
          mappingVersion: down.mappingVersion,
        });
      } else {
        out.push(down);
        out.push({ timeMs: end, type: "up", physicalKey: e.physicalKey, layer: e.layer });
      }
    } else if (e.type === "drum" && e.drum) {
      out.push({
        timeMs: t,
        type: "drum",
        drum: e.drum,
        layer: e.layer,
        ...(snap ? { mappingId: snap.mappingId ?? "legacy" } : {}),
      });
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs || (a.type === "up" ? -1 : 1));
}
