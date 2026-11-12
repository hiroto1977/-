/**
 * 生体認証 (webauthn.mamori) が使う host の口。`extern pure { … } from "./webauthnHost"` で読む。
 *
 * 判断は持たない —— ブラウザの口 (`crypto` / `btoa` / `atob` / `TextEncoder` / `navigator.credentials` / `window.PublicKeyCredential`) を
 * 呼ぶだけで、型の戻し (`as`) と DOM の型もここに閉じ込める。
 * - `navigator` / `window` は網・記憶・移動・DOM の口をメンバに持つので、Mamori では `extern pure global` にできない (T-249)。
 * - 認証器の呼び出しは「作る」ことだけ (`create`)。`navigator.credentials.get` は検証が未実装なので、ここにも置かない (fail-closed)。
 */

/** 32 バイトの乱数 (challenge)。 */
export function hostChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** 文字列 → UTF-8 のバイト列。 */
export function hostUtf8(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
}

/** ArrayBuffer / TypedArray → 標準の base64 (パディングつき)。 */
export function hostBase64Encode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** 標準の base64 → バイト列。 */
export function hostBase64Decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

/** プラットフォーム認証器を問える環境か (非ブラウザからは false)。 */
export function hostCanAskPlatformAuthenticator(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

export function hostAskPlatformAuthenticator(): Promise<boolean> {
  return window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

/** 登録を認証器へ依頼し、作られた credential の rawId を返す (取り消しなら null)。 */
export async function hostCreateCredentialRawId(publicKey: PublicKeyCredentialCreationOptions): Promise<ArrayBuffer | null> {
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  return credential === null ? null : credential.rawId;
}
