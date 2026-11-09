// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/ports/keys.ts

/**
 * The ONLY place in the whole codebase where storage keys are assembled.
 * Partitions: `guest:` (7-day window), `user:{uid}:` (no window), `global:`.
 * No service may hard-code a key string literal.
 */
import { AccountSession, SessionKind } from '../models/types';

/** Partition prefix for a session: `'guest:'` or `'user:{uid}:'`. */
export function partitionOf(session: AccountSession): string {
  if (session.kind === SessionKind.Guest) return 'guest:';
  return 'user:' + session.uid + ':';
}

export function wordsKey(p: string, wordId: string): string { return p + 'words:' + wordId; }
export function recordKey(p: string, wordId: string): string { return p + 'records:' + wordId; }
export function checkInKey(p: string, ymd: string): string { return p + 'checkins:' + ymd; }
export function chatKey(p: string, sessionId: string, msgId: string): string { return p + 'chat:' + sessionId + ':' + msgId; }
export function datesIndexKey(p: string): string { return p + 'index:dates'; }
export function settingsKey(p: string): string { return p + 'meta:settings'; }

export function promptStateKey(): string { return 'guest:meta:promptState'; }
export function mergeMarkerKey(): string { return 'guest:meta:mergeMarker'; }
export function mergeDecisionKey(uid: string): string { return 'user:' + uid + ':meta:mergeDecision'; }
export function mergeLedgerKey(uid: string, key: string): string { return 'user:' + uid + ':meta:mergeLedger:' + key; }
export function sessionKey(): string { return 'global:account:session'; }

/** Extract the `'YYYY-MM-DD'` suffix from a check-in key; '' when absent. */
export function dateFromCheckInKey(key: string): string {
  const marker: string = ':checkins:';
  const at: number = key.indexOf(marker);
  if (at < 0) return '';
  return key.slice(at + marker.length);
}

/** Key prefixes used for partition-wide scans. */
export function wordsPrefix(p: string): string { return p + 'words:'; }
export function recordsPrefix(p: string): string { return p + 'records:'; }
export function checkInsPrefix(p: string): string { return p + 'checkins:'; }
export function chatPrefix(p: string): string { return p + 'chat:'; }
