import type { ActionResult } from '../../preload/preload';

/**
 * `serviceHub.invoke()` の戻り値を「利用者に何と伝えるべきか」へ分類する。
 *
 * 2026-08 監査で見つけた食い違い: 同じアクションを呼ぶ 3 経路が、結果の読み方を
 * 別々に持っていた。
 *
 * - `ServiceActionPanel` — `ok` と `persisted === false` を区別して表示していた（正しい）
 * - `ChatbotWidget`      — `ok` は見るが `persisted` を見ず、保存されないメモも
 *                          「✅ 実行しました」と言っていた
 * - `VoiceCommandBar`    — **戻り値を一切見ていなかった**。`action:invoke` は失敗時も
 *                          reject せず `{ ok: false }` を返すため、`await invoke()` の
 *                          後ろの `.catch()` は不動作で、**未設定トークンや検証エラーでも
 *                          「実行した」ことになり対象ページへ遷移していた**。
 *                          「GitHub に issue を作って」が黙って何も作らない状態。
 *
 * 三者に同じ判断を書き写した結果どれか 1 つが欠けた、というこのリポジトリで
 * 繰り返している形なので、**分類だけ**をここへ集約する。文言は経路ごとに違って
 * よい（パネルは時刻を添える・チャットは遷移を予告する）ので各所に残す。
 */
export type ActionVerdict =
  /** 成功し、結果も残る。 */
  | 'ok'
  /** 受け付けたが保存されない（`persisted: false` の stub アクション）。 */
  | 'accepted-not-saved'
  /** 失敗した。`message` に理由が入る。 */
  | 'failed';

/**
 * 分類結果。`verdict` が判別子なので、`failed` を弾いた後は `data` が narrow される
 * （呼び出し側が `result.ok` を別に確かめ直す必要が無い）。
 */
export type ActionClassification<T> =
  | { readonly verdict: 'failed'; readonly message: string }
  | { readonly verdict: 'ok' | 'accepted-not-saved'; readonly data: T };

/**
 * 自身が持つ `persisted` の値（プロトタイプ由来は読まない）。持たなければ `undefined`。
 *
 * 型で `boolean` に絞らないのは、呼び出し側が `=== false` で厳密比較するため。
 * ここで `typeof value === 'boolean'` を挟んでも観測できる差が無く、変異テストで
 * 殺せない分岐が増えるだけだった。
 */
function ownPersistedValue(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return undefined;
  if (!Object.hasOwn(data, 'persisted')) return undefined;
  return (data as { persisted?: unknown }).persisted;
}

/**
 * 呼び出し結果を分類する。
 *
 * `persisted` を持たないアクション（create-issue / send-message など）は `ok` の
 * まま — 「保存されるか」を主張しないアクションに勝手な但し書きを付けない。
 */
export function classifyActionResult<T>(result: ActionResult<T>): ActionClassification<T> {
  if (!result.ok) return { verdict: 'failed', message: result.message };
  return ownPersistedValue(result.data) === false
    ? { verdict: 'accepted-not-saved', data: result.data }
    : { verdict: 'ok', data: result.data };
}
