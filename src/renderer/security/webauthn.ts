/**
 * 生体認証ゲート (WebAuthn / パスキー)。
 *
 * Integrity Chain（docs/SECURITY_CHAIN.md）の「生体認証」レイヤ。プラットフォーム
 * 認証器（Touch ID / Windows Hello / Android 生体）を用いた WebAuthn の
 * 登録・検証を行い、Credential Vault の解錠を生体で門番する。
 *
 * 設計上の不変条件:
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
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url 文字列 → Uint8Array。 */
export function base64urlToBuffer(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** 生体認証クレデンシャルを登録し、保存すべき credentialId を返す。 */
export async function registerBiometric(userId: string, userName: string): Promise<BiometricRegistration> {
  const publicKey = buildCreationOptions(userId, userName);
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('生体認証の登録がキャンセルされました。');
  return { credentialId: bufferToBase64url(credential.rawId) };
}

/** 登録済み credentialId で生体所持証明を検証する。成功時 true。 */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  const publicKey = buildRequestOptions(credentialId);
  try {
    const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    return assertion !== null && assertion.rawId.byteLength > 0;
  } catch {
    return false;
  }
}
