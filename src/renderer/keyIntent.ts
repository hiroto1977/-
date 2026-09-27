/**
 * **キー操作を「意図」として読む口は 1 つ** (2026-09-27 · パス 493i)。
 *
 * ## 何が起きていたか
 *
 * 日本語の入力は IME を通る。変換を確定する Enter と、変換を取り消す Escape は
 * **IME への操作**であって、画面への操作ではない。ところが実 chromium (141) は、
 * 変換中に届いた Enter / Escape の keydown を **`key` のまま `isComposing: true` で**
 * ページへ渡す (2026-09-27 実測 —— CDP で変換中の文字を置いてから Enter を届けた)。
 * `e.key === 'Enter'` だけを見る handler は、**変換を確定した瞬間に送る**。
 *
 * | 画面 | 欄 | 変換の確定・取り消しで起きていたこと |
 * | --- | --- | --- |
 * | 株式 / 経営ダッシュボード | アドバイザーへの質問 | **打ちかけの質問が有料の AI へ送られる** |
 * | 株式 | 銘柄の登録・戦略の比較 | 変換中の文字列で登録・比較が走る |
 * | サイドバー | サービスの検索 | 打ちかけの語の先頭ヒットへ移る / Escape で検索語ごと消える |
 * | 窓全体 | (どこでも) | 変換の取り消しの Escape でドロワーが閉じる |
 *
 * `<form onSubmit>` の送信はこの形にならない —— 変換を確定する Enter は暗黙の送信を
 * 起こさない (同じ測定で確かめた)。危ないのは keydown を直に読む所だけである。
 * パスワード欄は IME が働かないので今日は起きないが、判定を 1 つにするため同じ口を通す。
 *
 * ## 判定
 *
 * - `isComposing` が真 —— 変換中 (Chromium・Firefox)。React の合成イベントは
 *   この欄を持たないので `nativeEvent` から読む。
 * - `keyCode === 229` —— Safari は変換を確定した**後**に Enter の keydown を
 *   `isComposing: false`・`keyCode: 229` で届ける。`keyCode` は非推奨だが、
 *   この区別を持つ唯一の欄である。
 *
 * 母集団は `renderer/__tests__/keyIntentCensus.test.ts` が数える
 * (Enter / Escape を素で比べる所は、このファイルの外に 1 つも無い)。
 */

/** DOM の KeyboardEvent と React の合成イベントの両方が満たす形。 */
export interface KeyLike {
  readonly key: string;
  readonly keyCode?: number;
  readonly isComposing?: boolean;
  readonly nativeEvent?: { readonly isComposing?: boolean };
}

/** IME が変換中の打鍵か (変換を確定する Enter・取り消す Escape を含む)。 */
export function isImeComposing(e: KeyLike): boolean {
  if (e.nativeEvent?.isComposing === true) return true;
  if (e.isComposing === true) return true;
  return e.keyCode === 229;
}

/** 送信・決定としての Enter (変換の確定ではない)。 */
export function isSubmitEnter(e: KeyLike): boolean {
  return e.key === 'Enter' && !isImeComposing(e);
}

/** 取り消し・閉じるとしての Escape (変換の取り消しではない)。 */
export function isCancelEscape(e: KeyLike): boolean {
  return e.key === 'Escape' && !isImeComposing(e);
}
