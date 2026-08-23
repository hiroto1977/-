/**
 * アシスタントが外部 API へ送る入力の上限 —— **両ビルドで 1 つだけ持つ。**
 *
 * ## なぜ要るか (2026-08-23)
 *
 * 会話履歴の整形は 2 度書かれている。**名前が違う**ので、同名の関数を数える
 * 台帳 (`dualBuildDecisions.test.ts`) からは見えていなかった:
 *
 * ```
 *   main    clients/assistant.ts  sanitizeMessages        MAX_CONTENT / MAX_MESSAGES
 *   browser web-shim.ts           sanitizeAssistantTurns  8000 / 40 (字面)
 * ```
 *
 * 中身は同じ判断で、値も一致していた。危ないのは**上限が字面で 2 度書いて
 * あること** —— 片方を動かしても、もう片方は動かない。`system` に至っては
 * `slice(0, 60000)` がブラウザ版に 2 箇所ある。
 *
 * これらは「有料 API へどれだけ送れるか」を決める数字なので、緩む方向へ
 * ずれると**課金と送信量**に直接効く。`shared/emotionsLimits.ts` /
 * `shared/recordEntryLimits.ts` と同じ扱いにする。
 *
 * 値は現行のまま。利用者から見た挙動は変えない。
 */

/** 1 メッセージあたりの最大文字数。 */
export const MAX_ASSISTANT_CONTENT_CHARS = 8000;

/** 会話履歴の最大件数 (新しい方を優先して末尾を残す)。 */
export const MAX_ASSISTANT_MESSAGES = 40;

/** system プロンプト (RAG 文脈を含む) の最大文字数。 */
export const MAX_ASSISTANT_SYSTEM_CHARS = 60000;
