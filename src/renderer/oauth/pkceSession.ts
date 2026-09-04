/**
 * ブラウザ版 PKCE の**一時秘密**を置く場所を 1 つにする。
 *
 * ## なぜ 1 つに寄せるか (2026-08-23)
 *
 * `code_verifier` は RFC 7636 の言うとおり**秘密**である ——
 * 認可コードと組で握られると、そのままトークン交換を完了できる。
 * `file://` で動くブラウザ版には保存場所が `sessionStorage` しか無いので
 * 置くこと自体は正しいが、**使い終わったら消えること**が要る。
 *
 * 消えていなかった。4 つの鍵は `SettingsPage.tsx` に直書きされていて:
 *
 * ```
 *   complete() の try の中で 4 つ removeItem   ← 交換が成功したときだけ走る
 *   finally は setBusy(false) だけ
 *   キャンセルボタンは pkce.verifier だけ消す  ← 残り 3 つが残る
 * ```
 *
 * つまり **`state` 不一致 (= CSRF の疑い) で落ちたときに、いちばん消したい
 * verifier が残った**。交換の失敗・通信断・`setToken` の失敗でも同じ。
 *
 * ## 不変条件
 *
 * - `pkce.*` の鍵を知っているのは**このファイルだけ** (`__tests__` が字面で留める)
 * - 出口は `clearPkceSession()` の 1 つ。**呼び出し側は `finally` で呼ぶ**
 * - 一部だけ消す関数は置かない —— 「3 つ消して 1 つ残る」形を作れなくする
 */

const KEY_PREFIX = 'pkce.';

/** 保管する 4 つ。**増やすならここだけ。** */
const KEYS = ['verifier', 'state', 'clientId', 'redirectUri'] as const;

export interface PkceSession {
  readonly verifier: string;
  readonly state: string;
  readonly clientId: string;
  readonly redirectUri: string;
}

const storageKey = (k: (typeof KEYS)[number]): string => `${KEY_PREFIX}${k}`;

/** 認可ページを開く直前に置く。 */
export function savePkceSession(s: PkceSession): void {
  for (const k of KEYS) sessionStorage.setItem(storageKey(k), s[k]);
}

/**
 * 交換に要る 4 つを読む。**1 つでも欠けたら `null`** ——
 * 途中まで残った状態で交換を試させない。
 */
export function readPkceSession(): PkceSession | null {
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    const v = sessionStorage.getItem(storageKey(k));
    if (!v) return null;
    out[k] = v;
  }
  return out as unknown as PkceSession;
}

/**
 * **一時秘密を消す。必ず `finally` から呼ぶ。**
 *
 * 成功でも失敗でも中断でも呼んでよい (無い鍵の `removeItem` は無害)。
 * 「成功したときだけ消す」形にすると、**いちばん消したい失敗のときに残る**。
 */
export function clearPkceSession(): void {
  for (const k of KEYS) sessionStorage.removeItem(storageKey(k));
}

/** 検査用 —— 消し残しが無いことを字面ではなく実物で確かめる。 */
export function pkceSessionKeys(): readonly string[] {
  return KEYS.map(storageKey);
}
