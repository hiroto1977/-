/**
 * 生体認証ゲート (WebAuthn / パスキー) — **検証は未実装 / fail-closed**。
 *
 * Integrity Chain（docs/SECURITY_CHAIN.md）の「生体認証」レイヤ。プラットフォーム
 * 認証器（Touch ID / Windows Hello / Android 生体）向けの能力検出・登録セレモニー・
 * オプション組み立てを提供する。
 *
 * ⚠️ 2026-07 セキュリティ監査の残件（docs/SECURITY_AUDIT.md「修正しなかった」節）:
 * 旧 `verifyBiometric` は `navigator.credentials.get()` が返した assertion の
 * `rawId.byteLength > 0` だけで `true` を返していた。署名検証も challenge 照合も
 * していないため所持証明としては無価値で（`credentials.get` を差し替えられる立場なら
 * 認証器なしで通る）、解錠ゲートに配線すれば自明に迂回できる「所持の演出」だった。
 * 本モジュールはテスト以外どこからも import されていない死コードだったため、
 * 将来の誤配線を静かに許すより **必ず throw する fail-closed** に倒した。
 *
 * 実装する場合に必ず守る不変条件:
 *  1. **マスターパスワード / PBKDF2 派生鍵を「生体解錠の利便性」のために永続化しない。**
 *     WebAuthn は鍵素材を JS に渡さない（秘密鍵は Secure Enclave / TPM 内に留まる）ので、
 *     生体だけで Vault を開くには鍵か平文パスワードの保存が必要になり、Vault
 *     (`vault.ts`: AES-GCM-256 + PBKDF2 600k) の脅威モデル＝端末・プロファイル窃取時の
 *     オフライン総当り耐性を根本から壊す。生体は「既に解錠済みセッションの再認証
 *     (step-up)」に留め、KDF の代替にはしない。
 *  2. challenge は呼び出し側で発行・保存し、assertion 側で照合する。クライアントで
 *     生成して捨てる challenge はリプレイ防止として機能しない（旧実装の欠陥）。
 *  3. 検証は (a) 登録時に保存した公開鍵での `signature` 検証、(b) `clientDataJSON` の
 *     `type` / `challenge` / `origin`、(c) `authenticatorData` の `rpIdHash`・
 *     UV フラグ・`signCount` の単調増加を **すべて** 照合する。いずれかを省いた
 *     セレモニーは認証ではない。
 *  4. `registerBiometric` は現状 `credentialId` のみを返す。(3)(a) には
 *     `AuthenticatorAttestationResponse.getPublicKey()` の永続化が別途必要
 *     （`attestation: 'none'` のままでも公開鍵自体は取得できる）。
 *
 * 維持されている設計上の不変条件:
 *  - 秘密鍵は認証器内（Secure Enclave / TPM 等）に留まり、JS からは取り出せない
 *  - 本モジュールは credentialId（公開識別子）のみを保存対象として返す
 *  - userVerification: 'required' で必ず生体/PIN を要求する
 *  - WebCrypto と同様、ネットワーク送信は行わない（ローカル所持証明のみ）
 *
 * 純粋ヘルパー（bufferToBase64url / base64urlToBuffer / buildCreationOptions /
 * buildRequestOptions）は navigator なしで単体テストできるよう分離して export する。
 */

const textChallenge = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(32));

/** ArrayBuffer/TypedArray → base64url 文字列（パディングなし）。 */
export function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // `=` は btoa の出力では末尾にしか現れないので、末尾固定の正規表現は
  // 「全部落とす」と同じ結果になる。同じなら**確かめられる方**を選ぶ
  // (`/=+$/` の `$` を外す変異体は観測できないが、`'='` を空文字に変える
  // 変異体は「= が残る」で落ちる)。
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replaceAll('=', '');
}

/** base64url 文字列 → Uint8Array。 */
export function base64urlToBuffer(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  // **パディングは戻さない。** `atob` は仕様上 `=` を取り除いてから復号し、
  // 長さ % 4 === 1 のときだけ投げる (HTML の forgiving-base64 decode)。
  // つまり `=` を足しても結果は変わらない — 実測でも Node / Chromium とも
  // `atob('QQ') === atob('QQ==')`。足す処理を残すと、結果の変わらない算術が
  // 3 つ分の変異体として残るだけになる。
  const binary = atob(normalized);
  // 手書きの for ループだと `i <= binary.length` の変異体が TypedArray の
  // 範囲外書き込み (黙って捨てられる) になって殺せない。`from` に寄せると
  // その境界自体が無くなる。
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export interface BiometricRegistration {
  /** 保存対象（公開）。再認証時に allowCredentials で参照する。 */
  readonly credentialId: string;
}

const RP_NAME = 'Service Hub';

/** 登録用 PublicKeyCredentialCreationOptions を組み立てる（純粋・テスト可能）。 */
export function buildCreationOptions(
  userId: string,
  userName: string,
  challenge: BufferSource = textChallenge(),
): PublicKeyCredentialCreationOptions {
  return {
    challenge,
    rp: { name: RP_NAME },
    user: {
      id: base64urlToBuffer(bufferToBase64url(new TextEncoder().encode(userId))),
      name: userName,
      displayName: userName,
    },
    // ES256 (-7) と RS256 (-257)
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60_000,
    attestation: 'none',
  };
}

/** 検証用 PublicKeyCredentialRequestOptions を組み立てる（純粋・テスト可能）。 */
export function buildRequestOptions(
  credentialId: string,
  challenge: BufferSource = textChallenge(),
): PublicKeyCredentialRequestOptions {
  return {
    challenge,
    allowCredentials: [{ type: 'public-key', id: base64urlToBuffer(credentialId) }],
    userVerification: 'required',
    timeout: 60_000,
  };
}

/** プラットフォーム生体認証が利用可能か。 */
export async function isBiometricAvailable(): Promise<boolean> {
  // Stryker disable next-line ConditionalExpression,StringLiteral: 下の try/catch が
  // 同じ `false` へ吸収するため、この門の有無は観測できない (等価変異)。
  // 非ブラウザ (Node / main プロセス) から読まれるのは**正常な経路**なので、
  // そこで例外を制御フローに使わないための門として残す。
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * 生体認証クレデンシャルを登録し、保存すべき credentialId を返す。
 *
 * 注意: credentialId だけでは何の権限も生まれない（検証側が未実装 = `verifyBiometric`
 * は必ず throw する）。実際に解錠ゲートを作るときは冒頭の不変条件 3(a)/4 のとおり
 * `getPublicKey()` の保存もここに追加する必要がある。
 */
export async function registerBiometric(userId: string, userName: string): Promise<BiometricRegistration> {
  const publicKey = buildCreationOptions(userId, userName);
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('生体認証の登録がキャンセルされました。');
  return { credentialId: bufferToBase64url(credential.rawId) };
}

/** `verifyBiometric` が常に投げるエラー。誤配線を throw で可視化するための型。 */
export class BiometricVerificationUnimplementedError extends Error {
  constructor() {
    super(
      'verifyBiometric は未実装です（fail-closed）。' +
        'WebAuthn assertion の署名・challenge・origin 検証を実装せずに解錠ゲートには使えません。' +
        '要件は src/renderer/security/webauthn.ts 冒頭の不変条件 1〜4 を参照。',
    );
    this.name = 'BiometricVerificationUnimplementedError';
  }
}

/**
 * 生体所持証明の検証 — **未実装**。呼ぶと必ず throw する（fail-closed）。
 *
 * 認証器セレモニー（`navigator.credentials.get`）自体も実行しない。生体プロンプトを
 * 出しておいて検証しないのは利用者に誤った保証を与えるため、UI を出す前に落とす。
 * 実装するときは冒頭の不変条件 1〜4 を満たしてから本関数を置き換える
 * （assertion 要求オプションは `buildRequestOptions` が提供する）。
 *
 * @deprecated 未実装。解錠ゲートに配線しないこと（配線しても throw で必ず拒否される）。
 * @throws {BiometricVerificationUnimplementedError} 常に
 */
export async function verifyBiometric(_credentialId: string): Promise<never> {
  throw new BiometricVerificationUnimplementedError();
}
