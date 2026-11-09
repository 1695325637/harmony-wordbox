/**
 * `AccountService` — session persistence, guest → authenticated transition,
 * guest-progress probing and Type-B decision detection. All account failures
 * keep the original session untouched; learning is never interrupted.
 */
import {
  AccountSession, AccountAuthResult, AccountTransition, MergeDecision,
  SessionKind, MergeChoiceKind,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { StorageService, Clock } from '../ports/ports';
import { sessionKey, mergeDecisionKey, partitionOf as partitionOfSession } from '../ports/keys';
import { JsonCodec, isSessionLike, isMergeDecisionLike } from '../ports/codec';
import { DEFAULT_GUEST_SESSION } from '../models/constants';
import { RetentionService } from './retention';
import { ScopedRepository } from './repository';

export interface AccountService {
  current(): Promise<Result<AccountSession>>;
  signIn(auth: AccountAuthResult, clock: Clock): Promise<Result<AccountTransition>>;
  signOut(clock: Clock): Promise<Result<AccountSession>>;
  refresh(auth: AccountAuthResult, clock: Clock): Promise<Result<AccountSession>>;
  hasGuestProgress(nowYMD: string): Promise<Result<boolean>>;
  partitionOf(session: AccountSession): string;
  isAuthenticated(session: AccountSession): boolean;
}

export interface AccountDeps {
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly repository: ScopedRepository;
  readonly retention: RetentionService;
}

/** The immutable guest session. */
export function guestSession(): AccountSession {
  return DEFAULT_GUEST_SESSION;
}

/** Build an authenticated session for a uid (uid is an already-hashed local digest). */
export function authenticatedSession(
  uid: string,
  displayName: string,
  authenticatedAtMs: number,
  tokenRefreshedAtMs: number,
): AccountSession {
  const session: AccountSession = {
    kind: SessionKind.Authenticated,
    uid: uid,
    displayName: displayName,
    partition: 'user:' + uid + ':',
    authenticatedAtMs: authenticatedAtMs,
    tokenRefreshedAtMs: tokenRefreshedAtMs,
  };
  return session;
}

/** Create the canonical account service. */
export function createAccountService(deps: AccountDeps): AccountService {
  const storage: StorageService = deps.storage;
  const codec: JsonCodec = deps.codec;
  const retention: RetentionService = deps.retention;

  async function readSession(): Promise<AccountSession> {
    const r = await storage.get(sessionKey());
    if (!r.ok || r.value === undefined) return guestSession();
    const decoded = codec.decode<AccountSession>(r.value, isSessionLike);
    if (!decoded.ok || decoded.value === undefined) return guestSession();
    const session: AccountSession = decoded.value;
    // Normalize the partition so a tampered payload can never cross partitions.
    if (session.partition !== partitionOfSession(session)) return guestSession();
    return session;
  }

  async function hasExplicitDecision(uid: string): Promise<boolean> {
    const r = await storage.get(mergeDecisionKey(uid));
    if (!r.ok || r.value === undefined) return false;
    const decoded = codec.decode<MergeDecision>(r.value, isMergeDecisionLike);
    if (!decoded.ok || decoded.value === undefined) return false;
    return decoded.value.choice !== MergeChoiceKind.Defer;
  }

  const service: AccountService = {
    async current(): Promise<Result<AccountSession>> {
      return ok<AccountSession>(await readSession());
    },

    async signIn(auth: AccountAuthResult, clock: Clock): Promise<Result<AccountTransition>> {
      const before: AccountSession = await readSession();
      const now: number = clock.nowMs();
      const after: AccountSession = authenticatedSession(auth.uid, auth.displayName, now, now);
      const w = await storage.set(sessionKey(), codec.encode<AccountSession>(after));
      if (!w.ok) return fail<AccountTransition>(ErrorCode.STORAGE_WRITE_FAILED, 'session persist failed');

      const gp = await retention.hasGuestProgress(clock.todayYMD());
      const guestProgressExists: boolean = gp.ok && gp.value === true;
      const decisionAlreadyMade: boolean = await hasExplicitDecision(auth.uid);
      const shouldShowTypeB: boolean = guestProgressExists && !decisionAlreadyMade;

      const transition: AccountTransition = {
        before: before,
        after: after,
        guestProgressExists: guestProgressExists,
        shouldShowTypeB: shouldShowTypeB,
        decisionAlreadyMade: decisionAlreadyMade,
      };
      return ok<AccountTransition>(transition);
    },

    async signOut(clock: Clock): Promise<Result<AccountSession>> {
      const guest: AccountSession = guestSession();
      const w = await storage.set(sessionKey(), codec.encode<AccountSession>(guest));
      if (!w.ok) return fail<AccountSession>(ErrorCode.STORAGE_WRITE_FAILED, 'session persist failed');
      return ok<AccountSession>(guest);
    },

    async refresh(auth: AccountAuthResult, clock: Clock): Promise<Result<AccountSession>> {
      const current: AccountSession = await readSession();
      if (current.kind !== SessionKind.Authenticated) return ok<AccountSession>(current);
      const updated: AccountSession = {
        kind: SessionKind.Authenticated,
        uid: current.uid,
        displayName: auth.displayName.length > 0 ? auth.displayName : current.displayName,
        partition: current.partition,
        authenticatedAtMs: current.authenticatedAtMs,
        tokenRefreshedAtMs: clock.nowMs(),
      };
      const w = await storage.set(sessionKey(), codec.encode<AccountSession>(updated));
      if (!w.ok) return ok<AccountSession>(current); // refresh failure never clears the session
      return ok<AccountSession>(updated);
    },

    async hasGuestProgress(nowYMD: string): Promise<Result<boolean>> {
      return retention.hasGuestProgress(nowYMD);
    },

    partitionOf(session: AccountSession): string {
      return partitionOfSession(session);
    },

    isAuthenticated(session: AccountSession): boolean {
      return session.kind === SessionKind.Authenticated;
    },
  };
  return service;
}
