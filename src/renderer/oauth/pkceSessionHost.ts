/**
 * PKCE の一時秘密を置く host の口。pkceSession.mamori が `extern pure { … } from "./pkceSessionHost"` で読む。
 *
 * `sessionStorage` は触れることが投げる記憶の口で、Mamori では `extern pure global` にできない (T-249)。
 * 鍵の組み立て (`pkce.` の接頭辞) と 4 つの鍵は pkceSession.mamori が持ち、ここは引数の鍵と値をそのまま渡すだけ。
 *
 * 失敗の受け方は元の pkceSession.ts と同じ:
 * - 置く … 投げる (呼び出し側が置けた分を消してから理由の文に直す)
 * - 読む … 触れなければ `null` (「切れた」と同じ扱い)
 * - 消す … 投げず、消せたかを返す (呼び出し側が消せなかった鍵の名前を集める)
 */
export function hostSetItem(key: string, value: string): void {
  sessionStorage.setItem(key, value);
}

export function hostGetItem(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    // 保存領域そのものへ触れられない。「切れた」と同じ扱いにする —— 4 つ揃わなければ交換はできないので、
    // 投げて画面を落とすより「やり直してください」へ倒す。理由は置く段 (savePkceSession) で既に出ている。
    return null;
  }
}

export function hostRemoveItem(key: string): boolean {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
