// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/utils/collection.ts

/**
 * Immutable collection helpers plus a deterministic canonical JSON encoder.
 * Every function returns fresh arrays / objects and never mutates its inputs.
 * ArkTS strict-subset compatible (no `any`, no dynamic property writes on
 * implicitly-typed values, no reflection).
 */

/** A JSON object with an explicit index signature (defers the recursive alias). */
export interface JsonObject { readonly [key: string]: JsonValue; }

/** A JSON-compatible value used by `stableStringify` (explicit recursive type). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;

/** Return a new array sorted by a comparable key, without mutating `items`. */
export function sortBy<T>(items: readonly T[], keyFn: (item: T) => string): readonly T[] {
  const copy: T[] = [];
  for (const item of items) copy.push(item);
  copy.sort((a: T, b: T) => {
    const ka: string = keyFn(a);
    const kb: string = keyFn(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
  return copy;
}

/** Return a new array with duplicates (by key) removed, keeping first occurrence. */
export function uniqBy<T>(items: readonly T[], keyFn: (item: T) => string): readonly T[] {
  const seen: Set<string> = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k: string = keyFn(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** Group items into a fresh Map keyed by `keyFn` (insertion order preserved). */
export function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups: Map<string, T[]> = new Map<string, T[]>();
  for (const item of items) {
    const k: string = keyFn(item);
    const existing: T[] | undefined = groups.get(k);
    if (existing !== undefined) {
      existing.push(item);
    } else {
      const fresh: T[] = [item];
      groups.set(k, fresh);
    }
  }
  return groups;
}

/** Return the item with the largest score, or undefined for an empty input. */
export function maxBy<T>(items: readonly T[], scoreFn: (item: T) => number): T | undefined {
  let best: T | undefined = undefined;
  let bestScore: number = -Infinity;
  for (const item of items) {
    const score: number = scoreFn(item);
    if (best === undefined || score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function isJsonArray(value: readonly JsonValue[] | JsonObject): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/**
 * Deterministic JSON encoder: object keys are always emitted in sorted order,
 * so two structurally-equivalent objects produce byte-identical strings.
 * This is the foundation of the merge idempotency key.
 */
export function stableStringify(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const obj: readonly JsonValue[] | JsonObject = value;
  if (isJsonArray(obj)) {
    const parts: string[] = [];
    for (const item of obj) parts.push(stableStringify(item));
    return '[' + parts.join(',') + ']';
  }
  const keys: string[] = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(JSON.stringify(k) + ':' + stableStringify(obj[k]));
  }
  return '{' + parts.join(',') + '}';
}
