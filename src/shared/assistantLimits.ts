/**
 * アシスタントの入出力の上限 —— **両ビルドで 1 つだけ持つ。**
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

/**
 * **受け取った応答の最大文字数** (2026-08-29 追加)。
 *
 * ## なぜ要るか —— 上は送る側しか見ていなかった
 *
 * このファイルの上 3 つは「外部 API へ**送る**」上限で、**返ってきた物には
 * 上限が無かった**。応答はそのまま会話履歴へ積まれ、`parseMarkdown` を経て
 * 画面へ出る。
 *
 * `lint:regex` の頭は、この経路の攻撃者を名指ししている ——
 * 「応答は攻撃者が誘導しうる (プロンプト注入、**乗っ取られた proxy**、
 * 悪意ある MCP サーバ)」。そこでは*指数時間の正規表現*を見張っているが、
 * **量**は見ていなかった。症状は同じ (画面が固まる) で、量のほうが容易い。
 *
 * ## 実測 (2026-08-29)
 *
 * `#### x\n` を並べた応答を `parseMarkdown` に通し、React 要素へ起こした:
 *
 * ```
 *   0.1MiB   14,979 blocks   parse  13ms   render    108ms   html   1.3MiB
 *     1MiB  149,796 blocks   parse  74ms   render    803ms   html  13.4MiB
 *    10MiB 1,497,965 blocks  parse 746ms   render 15,630ms   html 134.3MiB
 * ```
 *
 * 解析は線形で問題ない (だから `lint:regex` の判断は正しい)。**溢れるのは
 * その先** —— レンダラーは 1 スレッドなので 15 秒画面が死に、134MiB の DOM が
 * 残る。上の数字は文字列化 (`renderToString`) なので、**実際の DOM はもっと
 * 重い**。
 *
 * ## 値の決め方 (判断であって、典拠のある数字ではない)
 *
 * 正当な応答は `maxTokens: 2048` で縛られている —— 英語で 4 文字/token と
 * 見ても 8,000 字ほど、日本語なら更に短い。10 万字はその **12 倍以上**で、
 * **正当な応答では決して発火しない**余裕を取ってある。一方これに当たれば
 * ブロック数は 1.5 万程度に収まり、上の表で 100ms 台である。
 *
 * 送信側の 8,000 字 (`MAX_ASSISTANT_CONTENT_CHARS`) を流用しない ——
 * あちらは正当な応答の長さと同じ桁なので、**正当な答えを切ってしまう**。
 * 「送る量」と「受けて画面に出せる量」は別の判断である。
 */
export const MAX_ASSISTANT_REPLY_CHARS = 100_000;

/** 切り詰めたことを黙らせない。画面には必ずこの一行が付く。 */
export const ASSISTANT_REPLY_TRUNCATED_NOTICE =
  '\n\n…（応答が長すぎたため、ここで打ち切りました）';

// ---------------------------------------------------------------------------
// 最新の発話 —— 切らずに断る (2026-09-09 · パス 112)
// ---------------------------------------------------------------------------

/**
 * **いま送ろうとしている発話は、切らずに断る。**
 *
 * `sanitizeMessages` (main) / `sanitizeAssistantTurns` (ブラウザ版) は会話履歴を窓に
 * 収めるため、1 発話を `MAX_ASSISTANT_CONTENT_CHARS` で**黙って切る**。既に交わした
 * 履歴を窓に収めるのは設計だが、**最新の発話** (利用者がいま書いた物・マイクで話した物)
 * まで黙って切ると、利用者は全文が届いたと思い、AI は途中で切れた質問に答える。
 *
 * このファイルの下にある応答側の規則 —— 「切り詰めたことを黙らせない」
 * (`ASSISTANT_REPLY_TRUNCATED_NOTICE`) —— を送る側にも当てる: 最新の発話が天井を
 * 超えていたら切らずに断り、画面は `maxLength` で同じ天井を持つ (数は写さない)。
 * 2026-09-09 まで画面に天井は無く、8,001 字目からは黙って消えていた。
 *
 * 履歴の判定と分けるのは、応答 (`MAX_ASSISTANT_REPLY_CHARS` = 10 万字) を次の往復で
 * 履歴として送るときに、断ると会話そのものが止まるから —— そちらは窓のまま。
 */
export function latestTurnTooLong(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const last: unknown = raw[raw.length - 1];
  if (last === null || typeof last !== 'object') return false;
  const content = (last as { content?: unknown }).content;
  // `sanitize*` と同じく前後の空白は数えない (同じ発話を片方が通し片方が断らないように)。
  return typeof content === 'string' && content.trim().length > MAX_ASSISTANT_CONTENT_CHARS;
}

/** 断りの文面。両ビルドと skills が同じ 1 つを読む (`label` は「入力」「プロンプト」)。 */
export function inputTooLongMessage(label: string): string {
  return `${label}が長すぎます (${MAX_ASSISTANT_CONTENT_CHARS} 字以内)`;
}
