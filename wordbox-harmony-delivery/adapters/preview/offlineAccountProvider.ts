/**
 * Track C adapter: offline simulation of Huawei Account Kit authorization.
 * No network, no SDK. Three outcomes are demonstrable: succeed / cancel /
 * networkError / kitUnavailable. Any failure leaves the session unchanged.
 */
import {
  AccountProvider, AccountAuthResult, Result, ok, fail, ErrorCode,
} from '@core';

export type OfflineAuthOutcome = 'succeed' | 'cancel' | 'networkError' | 'kitUnavailable';

const DEMO_UID: string = 'demo-uid-001';
const DEMO_NAME: string = '旅行者（演示账号）';
const DEMO_EXPIRES_AT_MS: number = 4102444800000; // 2100-01-01, deterministic

export class OfflineAccountProvider implements AccountProvider {
  private outcome: OfflineAuthOutcome = 'succeed';

  setOutcome(outcome: OfflineAuthOutcome): void {
    this.outcome = outcome;
  }

  getOutcome(): OfflineAuthOutcome {
    return this.outcome;
  }

  async signIn(): Promise<Result<AccountAuthResult>> {
    switch (this.outcome) {
      case 'cancel':
        return fail<AccountAuthResult>(ErrorCode.ACCOUNT_USER_CANCELLED, 'user cancelled sign-in');
      case 'networkError':
        return fail<AccountAuthResult>(ErrorCode.ACCOUNT_NETWORK, 'network unavailable (demo)');
      case 'kitUnavailable':
        return fail<AccountAuthResult>(ErrorCode.ACCOUNT_KIT_UNAVAILABLE, 'account kit unavailable (demo)');
      default: {
        const auth: AccountAuthResult = {
          uid: DEMO_UID,
          displayName: DEMO_NAME,
          expiresAtMs: DEMO_EXPIRES_AT_MS,
        };
        return ok<AccountAuthResult>(auth);
      }
    }
  }

  async signOut(): Promise<Result<boolean>> {
    return ok<boolean>(true);
  }

  async refreshToken(): Promise<Result<AccountAuthResult>> {
    return this.signIn();
  }
}

/** Factory for the offline account provider. */
export function createOfflineAccountProvider(): OfflineAccountProvider {
  return new OfflineAccountProvider();
}
