// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/quality.ts

/**
 * `[[QUALITY:n]]` tag protocol — deterministic string scanning, no regex
 * backtracking, no `any`. Missing / out-of-range / non-integer tags yield
 * `quality = -1`, which means "this turn does not write back the schedule".
 */
import { ParsedAIReply } from '../models/types';

export interface QualityTagParser {
  parse(raw: string): ParsedAIReply;
  strip(raw: string): string;
  clamp(n: number): number;
}

const OPEN: string = '[[QUALITY:';
const CLOSE: string = ']]';

/** Collect the inner text of every `[[QUALITY:...]]` block, in order. */
function collectTagInners(raw: string): readonly string[] {
  const inners: string[] = [];
  let cursor: number = 0;
  while (cursor < raw.length) {
    const start: number = raw.indexOf(OPEN, cursor);
    if (start < 0) break;
    const end: number = raw.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) break;
    inners.push(raw.slice(start + OPEN.length, end));
    cursor = end + CLOSE.length;
  }
  return inners;
}

function parseInner(inner: string): number {
  const s: string = inner.trim();
  if (s.length === 0) return -1;
  for (let i: number = 0; i < s.length; i++) {
    const c: string = s.charAt(i);
    if (c < '0' || c > '9') return -1;
  }
  const n: number = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : -1;
}

/** Create the canonical tag parser. */
export function createQualityTagParser(): QualityTagParser {
  const parser: QualityTagParser = {
    clamp(n: number): number {
      return Number.isInteger(n) && n >= 0 && n <= 5 ? n : -1;
    },

    strip(raw: string): string {
      let out: string = '';
      let cursor: number = 0;
      while (cursor < raw.length) {
        const start: number = raw.indexOf(OPEN, cursor);
        if (start < 0) {
          out = out + raw.slice(cursor);
          break;
        }
        out = out + raw.slice(cursor, start);
        const end: number = raw.indexOf(CLOSE, start + OPEN.length);
        if (end < 0) break; // malformed tail: drop it entirely
        cursor = end + CLOSE.length;
      }
      return out.trim();
    },

    parse(raw: string): ParsedAIReply {
      const inners: readonly string[] = collectTagInners(raw);
      let quality: number = -1;
      for (const inner of inners) {
        const q: number = parseInner(inner);
        if (q >= 0) quality = q; // last *valid* tag wins
      }
      const parsed: ParsedAIReply = {
        displayText: parser.strip(raw),
        quality: quality,
        wordIds: [],
      };
      return parsed;
    },
  };
  return parser;
}
