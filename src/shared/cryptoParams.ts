/**
 * 暗号パラメータ — アプリ全体で 1 つだけ持つ。
 *
 * AES-GCM の IV 長と PBKDF2 の強度は、**同じ 1 つの決定**でありながら
 * `security/vault.ts` / `security/dataCrypto.ts` / `data/cloudBackup.ts` の
 * 3 モジュールに書き写されていた。同期はコメント
 * （「vault.ts の IV_BYTES と一致させる」）だけが担保していた。
 *
 * 最も危ういのは `data/cloudBackup.ts` の鍵導出識別子で、
 * **反復回数を文字列に焼き込んでいた** (`'PBKDF2-SHA-256-600k'`)。
 * vault 側の強度を上げても、バックアップに添える暗号メタは「600k」と
 * 言い続ける — 後から復号する側が信じるのはこの文字列なので、
 * 実装とメタデータが食い違うと「復号できないバックアップ」になる。
 *
 * 実際、写経は既にずれ始めていた: ソルト長は vault が 32 バイト、
 * dataCrypto が 16 バイトで別々になっている（どちらも安全な値なので実害は
 * 無いが、「コメントで同期する」が機能していない証拠である）。
 * ソルト長は用途で分けてよい判断なので各モジュールに残し、
 * **1 つであるべきもの（IV 長・反復回数・ハッシュ）だけ**をここへ集めた。
 */

/** AES-GCM の IV 長（バイト）。GCM の標準は 96 ビット = 12 バイト。 */
export const AES_GCM_IV_BYTES = 12;

/** PBKDF2 のハッシュ。 */
export const PBKDF2_HASH = 'SHA-256' as const;

/** PBKDF2 の反復回数。上げるときはここだけを変える。 */
export const PBKDF2_ITERATIONS = 600_000;

/** ソルト長の下限。用途ごとに増やすのは自由だが、これを下回らせない。 */
export const MIN_SALT_BYTES = 16;

/**
 * 暗号メタに載せる鍵導出の識別子。**定数から組み立てる**ので、
 * 反復回数を上げれば表示も一緒に動く。
 *
 * 1000 の倍数は `600k` の形にする — 既存のバックアップに書かれている
 * 表記がこれで、値を変えずに移行できる。
 */
export function kdfLabel(iterations: number = PBKDF2_ITERATIONS, hash: string = PBKDF2_HASH): string {
  const n = iterations % 1000 === 0 ? `${iterations / 1000}k` : String(iterations);
  return `PBKDF2-${hash}-${n}`;
}
