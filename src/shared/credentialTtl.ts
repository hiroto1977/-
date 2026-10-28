/**
 * **保存した資格情報の有効時間** (2026-10-28 · threat: T-213)。
 *
 * 第三者が発行する API キー・PAT の有効期限はアプリから変えられない。アプリが
 * 変えられるのは**自分が保管した写しをいつまで信用するか**で、ここを短くすると
 * 端末から持ち出された保管ファイル・IndexedDB が**使い捨てに近づく**: 盗まれた写しは
 * 盗まれた側でも期限で死に、利用者が打ち直すまでの窓だけが残る。
 *
 * 規則は 1 つで、両ビルドの保管層 (`main/secrets.ts` / `renderer/security/vault.ts`) が
 * 同じ判定を読む。書く側は保存した時刻を**平文の付随データ**として残し (時刻は秘密では
 * ない)、読む側と一覧はこの判定で期限切れを**読まずに消す**。
 *
 * - **日付の無い記録 (この規則より前に保存した物) は期限切れ**として扱う (fail closed)。
 *   「いつ保存したか分からない物を無期限に信用する」のは、この規則が無かった頃の
 *   状態そのものである。利用者は 1 度だけ打ち直す。
 * - **未来の時刻も期限切れ**として扱う。保存時刻は `Date.now()` なので未来には
 *   ならず、未来なら書き換えられた物か時計が戻された物である。
 * - **OAuth の TokenSet (更新トークンを持つ物) は除く** —— 認可サーバが自分の期限を
 *   持ち (`expiresAt` と更新)、デスクトップ版は `getValidToken` がそれを読む。
 *   除くかどうかは**保存した値の形**で決める (`hasUsableAccessToken` と同じ判定)。
 *   ブラウザ版の保管庫は適用する側 (貼り付け式 PKCE の TokenSet は accessToken だけで
 *   相手側の期限が 1 時間なので、除く理由が無い)。
 */
import { hasUsableAccessToken } from './vaultToken';

/** 保存した資格情報を信用する時間。1 日の作業の範囲 (8 時間) で、翌日は打ち直す。 */
export const CREDENTIAL_TTL_HOURS = 8;
export const CREDENTIAL_TTL_MS = CREDENTIAL_TTL_HOURS * 60 * 60 * 1000;
/** 時計の揺れとして許す未来の幅。これより先は「書き換えられた」と読む。 */
export const CREDENTIAL_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * 保存した時刻 `storedAt` (epoch ms) の記録は、`now` の時点で期限切れか。
 * 日付が無い・数でない・非有限・未来・TTL を超えた —— どれも `true`。
 */
export function storedCredentialExpired(storedAt: unknown, now: number): boolean {
  if (typeof storedAt !== 'number' || !Number.isFinite(storedAt)) return true;
  if (storedAt > now + CREDENTIAL_CLOCK_SKEW_MS) return true;
  return now - storedAt > CREDENTIAL_TTL_MS;
}

/** 保存した値が OAuth の TokenSet (更新トークンを持つ JSON) か。期限の規則の外に置く側。 */
export function isRefreshableTokenSetJson(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  if (!hasUsableAccessToken(parsed)) return false;
  const refreshToken = (parsed as { refreshToken?: unknown }).refreshToken;
  return typeof refreshToken === 'string' && refreshToken !== '';
}

export const EXPIRED_CREDENTIAL_REASON = 'expired' as const;

/** 期限切れで消したことを利用者に言う文。原因 (時間) と直す手 (登録し直す) を名指しする。 */
export function expiredStoredCredentialMessage(serviceId: string): string {
  return `${serviceId} の保存された資格情報は、保存から ${CREDENTIAL_TTL_HOURS} 時間が経ったので無効にして消しました。設定から登録し直してください`;
}
