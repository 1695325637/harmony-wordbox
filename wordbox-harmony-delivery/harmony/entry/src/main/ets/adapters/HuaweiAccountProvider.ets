/**
 * Harmony AccountProvider adapter (track B).
 *
 * Wraps Huawei Account Kit behind the kernel's `AccountProvider` port. The
 * unionId is converted to a local irreversible digest (`fnv1a`) before it ever
 * reaches the kernel; only `displayName` is retained. Kit error codes are
 * normalized through the kernel's pure `mapAccountKitError`.
 * Any failure (user cancel / network / Kit unavailable) returns a `Result.fail`
 * and leaves the persisted session untouched — handled by `AccountService`.
 *
 * NOT compiled in this environment (no DevEco / Account Kit SDK).
 */
import { authentication } from '@kit.AccountKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import {
  AccountProvider, AccountAuthResult, Result, ErrorCode,
  ok, fail, fnv1a, mapAccountKitError,
} from '../core/index';

const TOKEN_TTL_MS: number = 3600_000;

export class HuaweiAccountProvider implements AccountProvider {
  private readonly context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  /** Map a Kit / BusinessError into the kernel's stable error taxonomy. */
  private static errorCodeOf(err: BusinessError): ErrorCode {
    return mapAccountKitError(String(err.code));
  }

  async signIn(): Promise<Result<AccountAuthResult>> {
    try {
      const provider: authentication.HuaweiIDProvider = new authentication.HuaweiIDProvider();
      const request: authentication.AuthorizationWithHuaweiIDRequest =
        provider.createAuthorizationWithHuaweiIDRequest();
      request.scopes = ['profile'];
      request.permissions = ['id', 'displayName'];
      request.forceAuthorization = false;
      request.state = 'wordbox-signin';

      const controller: authentication.AuthorizationController =
        new authentication.AuthorizationController(this.context.getApplicationContext());
      const response: authentication.AuthorizationWithHuaweiIDResponse =
        await controller.executeRequest(request);

      const unionId: string = response.data?.unionID ?? '';
      const displayName: string = response.data?.displayName ?? '旅行者';
      if (unionId.length === 0) {
        return fail<AccountAuthResult>(ErrorCode.ACCOUNT_AUTH_FAILED, 'empty unionId');
      }
      // Irreversible local digest — the raw unionId never enters the kernel.
      const uid: string = 'hw-' + fnv1a('wordbox|' + unionId);
      const auth: AccountAuthResult = {
        uid: uid,
        displayName: displayName,
        expiresAtMs: new Date().getTime() + TOKEN_TTL_MS,
      };
      return ok<AccountAuthResult>(auth);
    } catch (err) {
      const business: BusinessError = err as BusinessError;
      return fail<AccountAuthResult>(
        HuaweiAccountProvider.errorCodeOf(business),
        'account kit sign-in failed: ' + String(business.code),
      );
    }
  }

  async signOut(): Promise<Result<boolean>> {
    try {
      const provider: authentication.HuaweiIDProvider = new authentication.HuaweiIDProvider();
      const request: authentication.CancelAuthorizationWithHuaweiIDRequest =
        provider.createCancelAuthorizationWithHuaweiIDRequest();
      const controller: authentication.AuthorizationController =
        new authentication.AuthorizationController(this.context.getApplicationContext());
      await controller.executeRequest(request);
      return ok<boolean>(true);
    } catch (err) {
      const business: BusinessError = err as BusinessError;
      return fail<boolean>(
        HuaweiAccountProvider.errorCodeOf(business),
        'account kit sign-out failed: ' + String(business.code),
      );
    }
  }

  async refreshToken(): Promise<Result<AccountAuthResult>> {
    // A token refresh is a silent re-authorization; no new PII is collected.
    return this.signIn();
  }
}

export function createHuaweiAccountProvider(context: common.UIAbilityContext): HuaweiAccountProvider {
  return new HuaweiAccountProvider(context);
}
