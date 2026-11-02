/**
 * dataCrypto の host の口 (薄い壁)。dataCrypto.mamori が `extern pure { … } from "./dataCryptoHost"` で読む。
 *
 * WebCrypto (`crypto.subtle`)・`btoa` / `atob`・`TextEncoder` / `TextDecoder`・`Uint8Array` は、Mamori では
 * `extern pure global` にできない (T-249: 網・記憶・コードの口をメンバに持つ host は pure で宣言できない)。
 * そこでバイト列と文字列を出し入れする**プリミティブだけ**をここへ閉じ込める。反復回数・ソルト長の床、封筒の形の検め、
 * 断りの文、呼ぶ順序 (検めてから導出する) は dataCrypto.mamori が持つ —— ここは判断を持たない。
 *
 * 失敗の受け方は元の dataCrypto.ts と同じ:
 * - `hostFromBase64` … base64 として読めなければ `atob` の例外のまま投げる (呼び出し側が理由の文に直す)
 * - `hostDeriveKey` … WebCrypto が使えなければその理由の文で投げる (`webCryptoUnavailableReason`)
 * - `hostDecrypt` … 認証失敗は例外のまま (呼び出し側が「復号に失敗しました」へ直す)
 */
import { webCryptoUnavailableReason } from './webCrypto';
import { PBKDF2_HASH } from '../../shared/cryptoParams';

export function hostToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function hostFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  // `<=` にする変異は i=bin.length で out[bin.length] への OOB 書込み (Uint8Array では無視) +
  // charCodeAt(len)=NaN を生むだけで out の中身は不変 → 観測不能な equivalent。
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hostRandomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function hostDeriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  /*
   * `vault.ts` の同名関数と同じ理由でここも守る (パス 171)。この経路を通るのは
   * バックアップの暗号化・レコードの封緘・クラウド退避で、どれも失敗の `message`
   * をそのまま画面へ出す。**内部 API の名前ではなく打てる手を言う。**
   */
  const missing = webCryptoUnavailableReason();
  if (missing !== null) throw new Error(missing);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    // ハッシュは**凍結値を読む** (パス 327)。`'SHA-256'` と書き写すと、`PBKDF2_HASH` を変えたときに
    // `kdfLabel()` 由来の封筒メタだけが動いて導出は動かない (`cryptoParams.ts` が述べる「復号できないバックアップ」)。
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: PBKDF2_HASH },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** AES-GCM で暗号化し、暗号文 (認証タグを含む) のバイト列を返す。 */
export async function hostEncrypt(key: CryptoKey, iv: Uint8Array, plaintext: string): Promise<Uint8Array> {
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return new Uint8Array(ct);
}

/** AES-GCM で復号して文字列にする。認証に失敗すれば例外のまま投げる。 */
export async function hostDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource);
  return new TextDecoder().decode(plain);
}
