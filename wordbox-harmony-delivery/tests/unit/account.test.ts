/**
 * account.test.ts —— 账号/会话服务单测。
 * 覆盖：默认游客 / 登录态切换 / 分区隔离 / 类型 B 判定 /
 * signOut / refresh / 存储失败不清会话 / 篡改分区回退游客 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  SessionKind, ErrorCode, guestSession, authenticatedSession,
  DEFAULT_GUEST_SESSION,
} from '@core';
import type { AccountAuthResult } from '@core';
import {
  createHarness, guestSessionOf, authSessionOf, writeGuestCheckIn,
} from '../helpers/harness';
import { DAILY_GOAL_SECONDS } from '@core';
import { D1, d, makeCheckIn } from '../helpers/fixtures';

const UID = 'qa-uid-001';
function auth(uid: string = UID): AccountAuthResult {
  return { uid: uid, displayName: 'QA 旅客', expiresAtMs: 4_102_444_800_000 };
}

describe('账号服务：会话基础与分区', () => {
  it('guestSession() / DEFAULT_GUEST_SESSION → kind=Guest、uid=guest、partition=guest:', () => {
    expect(guestSession()).toEqual(DEFAULT_GUEST_SESSION);
    expect(guestSessionOf().kind).toBe(SessionKind.Guest);
    expect(guestSessionOf().partition).toBe('guest:');
  });

  it('authenticatedSession(uid,...) → kind=Authenticated、partition=user:{uid}:', () => {
    const s = authenticatedSession(UID, 'QA 旅客', 0, 0);
    expect(s.kind).toBe(SessionKind.Authenticated);
    expect(s.partition).toBe('user:' + UID + ':');
    expect(authSessionOf(UID).uid).toBe(UID);
  });

  it('全新 harness 调用 current() → 返回游客会话，不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.account.current();
    expect(r.ok).toBe(true);
    expect(r.value?.kind).toBe(SessionKind.Guest);
  });

  it('partitionOf / isAuthenticated 对游客与登录态返回正确结果', () => {
    const h = createHarness({ initialYMD: D1 });
    expect(h.services.account.partitionOf(guestSessionOf())).toBe('guest:');
    expect(h.services.account.partitionOf(authSessionOf(UID))).toBe('user:' + UID + ':');
    expect(h.services.account.isAuthenticated(guestSessionOf())).toBe(false);
    expect(h.services.account.isAuthenticated(authSessionOf(UID))).toBe(true);
  });
});

describe('账号服务：登录 / 登出 / 刷新', () => {
  it('signIn(auth, clock) → transition.after 为登录态、session 持久化、current() 能读回', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.account.signIn(auth(), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.after.kind).toBe(SessionKind.Authenticated);
    expect(r.value?.after.uid).toBe(UID);
    expect(r.value?.after.authenticatedAtMs).toBe(h.clock.nowMs());
    const cur = await h.services.account.current();
    expect(cur.value?.kind).toBe(SessionKind.Authenticated);
    expect(cur.value?.uid).toBe(UID);
  });

  it('无游客进度时 signIn → guestProgressExists=false、shouldShowTypeB=false（类型 B 不弹）', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.account.signIn(auth(), h.clock);
    expect(r.value?.guestProgressExists).toBe(false);
    expect(r.value?.shouldShowTypeB).toBe(false);
    expect(r.value?.decisionAlreadyMade).toBe(false);
  });

  it('有窗口内游客进度时 signIn → guestProgressExists=true、shouldShowTypeB=true（类型 B 应弹）', async () => {
    const h = createHarness({ initialYMD: D1 });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: D1, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const r = await h.services.account.signIn(auth(), h.clock);
    expect(r.value?.guestProgressExists).toBe(true);
    expect(r.value?.shouldShowTypeB).toBe(true);
  });

  it('signOut(clock) → 会话回到游客，且不删除游客分区数据', async () => {
    const h = createHarness({ initialYMD: D1 });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: D1, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await h.services.account.signIn(auth(), h.clock);
    const r = await h.services.account.signOut(h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.kind).toBe(SessionKind.Guest);
    expect((await h.services.account.current()).value?.kind).toBe(SessionKind.Guest);
    const snap = await h.services.retention.hasGuestProgress(D1);
    expect(snap.value).toBe(true);
  });

  it('refresh 登录态 → tokenRefreshedAtMs 更新为 clock.nowMs()，displayName 可刷新', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.account.signIn(auth(), h.clock);
    h.clock.setNowMs(h.clock.nowMs() + 10_000);
    const r = await h.services.account.refresh({ uid: UID, displayName: '新昵称', expiresAtMs: 0 }, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.tokenRefreshedAtMs).toBe(h.clock.nowMs());
    expect(r.value?.displayName).toBe('新昵称');
  });

  it('游客态调用 refresh → 原样返回游客会话，不产生认证态', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.account.refresh(auth(), h.clock);
    expect(r.value?.kind).toBe(SessionKind.Guest);
  });

  it('refresh 时存储写失败 → 返回原会话（不清空登录态），不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.account.signIn(auth(), h.clock);
    h.storage.setFailWrites(true);
    const r = await h.services.account.refresh(auth(), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.kind).toBe(SessionKind.Authenticated);
    expect(r.value?.uid).toBe(UID);
  });

  it('signIn 时存储写失败 → fail(STORAGE_WRITE_FAILED)，会话保持游客，不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    h.storage.setFailWrites(true);
    const r = await h.services.account.signIn(auth(), h.clock);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_WRITE_FAILED);
    expect((await h.services.account.current()).value?.kind).toBe(SessionKind.Guest);
  });

  it('会话 payload 的 partition 被篡改为跨分区值 → readSession 归一化为游客（安全规约）', async () => {
    const h = createHarness({ initialYMD: D1 });
    const tampered = {
      kind: SessionKind.Authenticated, uid: UID, displayName: 'QA 旅客',
      partition: 'guest:', authenticatedAtMs: 0, tokenRefreshedAtMs: 0,
    };
    await h.storage.set('global:account:session', h.services.codec.encode(tampered));
    const r = await h.services.account.current();
    expect(r.ok).toBe(true);
    expect(r.value?.kind).toBe(SessionKind.Guest);
    expect(r.value?.partition).toBe('guest:');
  });

  it('hasGuestProgress 仅统计窗口内数据：写入 D1 数据后在 D8 查询（窗口 [D2,D8]）→ false', async () => {
    const h = createHarness({ initialYMD: D1 });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: D1, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    expect((await h.services.account.hasGuestProgress(D1)).value).toBe(true);
    expect((await h.services.account.hasGuestProgress(d(8))).value).toBe(false);
  });
});
