// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/progressGate.ts

/**
 * F-20 progress gate — the check lives in the READ layer (kernel), not in UI.
 * Guest sessions may still write CheckIn / StudyRecord / Word / ChatMessage
 * (Q10 interpretation A); only progress *reads* are blocked.
 */
import { AccountSession, GateDecision, GateReason, Gated, SessionKind } from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { GATE_UNLOCK_HINT } from '../models/constants';

export interface ProgressGate {
  check(session: AccountSession): GateDecision;
  guard<T>(session: AccountSession, data: T): Gated<T>;
  require(session: AccountSession): Result<AccountSession>;
}

/** Create the canonical read-layer gate. */
export function createProgressGate(): ProgressGate {
  const gate: ProgressGate = {
    check(session: AccountSession): GateDecision {
      if (session.kind === SessionKind.Authenticated) {
        const decision: GateDecision = { allowed: true, reason: GateReason.Ok, unlockHint: '' };
        return decision;
      }
      const decision: GateDecision = { allowed: false, reason: GateReason.Guest, unlockHint: GATE_UNLOCK_HINT };
      return decision;
    },

    guard<T>(session: AccountSession, data: T): Gated<T> {
      const allowed: boolean = session.kind === SessionKind.Authenticated;
      const gated: Gated<T> = {
        allowed: allowed,
        reason: allowed ? GateReason.Ok : GateReason.Guest,
        data: allowed ? data : undefined,
        unlockHint: allowed ? '' : GATE_UNLOCK_HINT,
      };
      return gated;
    },

    require(session: AccountSession): Result<AccountSession> {
      if (session.kind === SessionKind.Authenticated) return ok<AccountSession>(session);
      return fail<AccountSession>(ErrorCode.NOT_AUTHENTICATED, 'guest cannot read progress');
    },
  };
  return gate;
}
