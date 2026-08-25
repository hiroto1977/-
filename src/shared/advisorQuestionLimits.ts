/**
 * アドバイザーの「質問」が受け取る入力の規則 —— **両ビルドで 1 つだけ持つ。**
 *
 * ## なぜ要るか (2026-08-25)
 *
 * `business/advise` と `stocks/advise` は、利用者の質問をそのまま
 * **有料 API (Anthropic) の要求本文へ載せる**。その手前の検査は
 * 「空でない / 1000 字以内 / 改行・制御文字を含まない」の 3 つで、
 * **4 か所に字面で書かれていた**:
 *
 * ```
 *   main/clients/business.ts:640      question.length > 1000
 *   main/clients/stocks.ts:1242       question.length > 1000
 *   renderer/web-shim.ts:458          question.length > 1000   (business)
 *   renderer/web-shim.ts:567          question.length > 1000   (stocks)
 * ```
 *
 * 同じ判断を 4 度書くと、**片方だけ動かしたときに誰も気付かない**。
 * `main` 側は IPC の**信頼境界**なので、そちらが緩むと乗っ取られた
 * レンダラーが利用者の鍵で長い本文を送れる。ブラウザ側が緩むと、
 * 同じことが利用者自身の操作で起きる (費用の話)。
 *
 * このリポジトリは同じ形を既に 3 度consolidate している ——
 * `assistantLimits.ts` / `emotionsLimits.ts` / `recordEntryLimits.ts`。
 * ここだけ残っていた。
 *
 * ## 見つけ方 (自分の取りこぼしの記録)
 *
 * この重複は、**両側に現れる数値リテラルを数える検出器**が既に
 * 挙げていた (2026-08-25 の「自動では見つけられないを確かめた」節)。
 * `1000` は `main/clients/business.ts` と `renderer/web-shim.ts` の
 * 両方に出ていたのに、**「たまたま同じ丸い数」として捨てた**。
 * 検出器は当てていて、**選り分けたほうが間違っていた**。
 *
 * ## 値
 *
 * 既に 4 か所すべてが同じ値なので、そのまま採る (挙動は変えない)。
 */

/** アドバイザーの質問の上限。 */
export const MAX_ADVISOR_QUESTION_CHARS = 1000;

/**
 * 質問として受け取ってよいか。**判断はここ 1 つ**。
 *
 * 戻り値は失敗の理由 (`null` なら通す) —— 呼び出し側が
 * それぞれの流儀 (`throw` / `err()`) で伝えられるようにする。
 */
export type AdvisorQuestionProblem = 'empty' | 'too-long' | 'control-chars';

export function checkAdvisorQuestion(question: unknown): AdvisorQuestionProblem | null {
  if (typeof question !== 'string' || question.length === 0) return 'empty';
  if (question.length > MAX_ADVISOR_QUESTION_CHARS) return 'too-long';
  // CR / LF / NUL。要求本文とログの両方で行を割られないようにする。
  if (/[\r\n\0]/.test(question)) return 'control-chars';
  return null;
}
