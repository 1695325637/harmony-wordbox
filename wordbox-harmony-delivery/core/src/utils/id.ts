/**
 * Deterministic identifiers and hashing. Pure functions, no `Date.now()`,
 * no platform APIs, ArkTS strict-subset compatible.
 */
import { Scene, WordSource } from '../models/types';

/**
 * 32-bit FNV-1a hash rendered as an 8-character lowercase hex string.
 * The input is consumed as UTF-16 code units (two bytes each) so that
 * non-ASCII text still produces a deterministic, well-distributed hash.
 */
export function fnv1a(input: string): string {
  let hash: number = 0x811c9dc5;
  for (let i: number = 0; i < input.length; i++) {
    const code: number = input.charCodeAt(i);
    hash = hash ^ (code & 0xff);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash = hash ^ ((code >>> 8) & 0xff);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Lowercase alphanumeric slug used by built-in seed word ids. */
function slugOf(text: string): string {
  const lowered: string = text.toLowerCase();
  let out: string = '';
  let lastDash: boolean = false;
  for (let i: number = 0; i < lowered.length; i++) {
    const c: string = lowered.charAt(i);
    const isAlphaNum: boolean = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
    if (isAlphaNum) {
      out = out + c;
      lastDash = false;
    } else if (!lastDash) {
      out = out + '-';
      lastDash = true;
    }
  }
  while (out.length > 0 && out.charAt(out.length - 1) === '-') {
    out = out.slice(0, out.length - 1);
  }
  return out.length > 0 ? out : 'word';
}

/**
 * Stable word id.
 *  - seed words: `w-{scene}-{slug}`
 *  - user/chat words: `u-{fnv1a(text|scene)}` (normalized by lowercase text + scene)
 */
export function wordIdOf(text: string, scene: Scene, source: WordSource): string {
  if (source === WordSource.Seed) {
    return 'w-' + scene + '-' + slugOf(text);
  }
  return 'u-' + fnv1a(text.toLowerCase() + '|' + scene);
}

/** Stable id for a single learning session. */
export function sessionIdOf(uid: string, ymd: string, nowMs: number): string {
  return 's-' + fnv1a(uid + '|' + ymd + '|' + String(nowMs));
}

/** Stable id for a chat message within a session. */
export function messageIdOf(sessionId: string, role: string, turnIndex: number): string {
  return 'm-' + fnv1a(sessionId + '|' + role + '|' + String(turnIndex));
}
