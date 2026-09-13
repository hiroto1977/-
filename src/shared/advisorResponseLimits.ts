/**
 * アドバイザーの**応答**を受け取るときの上限 —— 両ビルドで 1 つだけ持つ。
 *
 * ## なぜ要るか (2026-08-25)
 *
 * `business/advise` の応答は**第三者 (LLM) が返してくる値**である。
 * それを画面へ出す手前で形と大きさを検査しているが、その 6 つの上限が
 * **main と web-shim に字面で二重に**書かれていた:
 *
 * ```
 *                          main/clients/business.ts   renderer/web-shim.ts
 *   recommendations              1..5                       1..5
 *   rationale                    1..600                     1..600
 *   actionItems                  1..5                       1..5
 *   actionItems[]                1..240                     1..240
 *   riskFactors                  1..3                       1..3
 *   riskFactors[]                1..240                     1..240
 * ```
 *
 * 片方だけ緩めば、そのビルドだけが**より大きな第三者由来の値**を通す。
 *
 * ## 定数だけを共有する (検証器はまとめない)
 *
 * 2 つの検証器は**同じ上限を見ているが、他に見ているものが違う** ——
 * main は `allowedIds.has(...)` で事業 id の許可も確かめ、失敗の文言も
 * 詳しい。まとめると「どちらかの流儀へ寄せる」変更になり、そこで
 * 挙動が動く。**ずれていたのは数字だけ**なので、数字だけを 1 つにする。
 *
 * 先行例も同じ形である —— `assistantLimits.ts` /
 * `recordEntryLimits.ts` はどちらも定数のみを持つ。
 *
 * ## 見つけ方
 *
 * 両側に現れる数値リテラルを数える検出器が `600` と `240` を
 * `business.ts` / `web-shim.ts` の組で挙げていた。同じ検出器が挙げた
 * `1000` を**一度は「たまたま同じ丸い数」として捨てている** ——
 * 選り分け直したときに、この 2 つも一緒に出てきた。
 */

/** 1 回の応答に含めてよい推奨の数。 */
export const MAX_ADVISOR_RECOMMENDATIONS = 5;

/** 推奨 1 件の理由の長さ。 */
export const MAX_ADVISOR_RATIONALE_CHARS = 600;

/** 推奨 1 件に含めてよい打ち手の数。 */
export const MAX_ADVISOR_ACTION_ITEMS = 5;

/** 推奨 1 件に含めてよいリスクの数。 */
export const MAX_ADVISOR_RISK_FACTORS = 3;

/** 打ち手・リスクの 1 項目の長さ (どちらも同じ)。 */
export const MAX_ADVISOR_ITEM_CHARS = 240;

// ---------------------------------------------------------------------------
// 株式アドバイザー (`stocks/advise`) の応答 —— 形が違うので欄も別 (2026-09-09 · パス 113)
// ---------------------------------------------------------------------------

/**
 * 上の台帳は `business/advise` の物で、**同じファイルの 100 行下に `stocks/advise` が
 * 同じ形の数字を字面で持っていた** —— main (`stocks.ts`) とブラウザ版の双子
 * (`stocksAnalysisWeb.ts`) に `5` / `400` / `200` が 2 度ずつ。値は両側で一致していたが、
 * 「片方だけ緩めば、そのビルドだけがより大きな第三者由来の値を通す」のは上と同じ。
 * パス 113 の走査 (AI へ出る handler がすべて応答側の天井に届く) が、字面の数字を
 * 天井として数えられずに `stocks/advise` を挙げたので、ここへ寄せた。
 *
 * 推奨の件数は上の `MAX_ADVISOR_RECOMMENDATIONS` (5) をそのまま読む。
 */

/** 株式の推奨 1 件の理由の長さ (business の 600 より短い —— 表示欄が狭い)。 */
export const MAX_STOCK_ADVISOR_RATIONALE_CHARS = 400;

/** 株式の推奨 1 件のリスク要因 1 項目の長さ。 */
export const MAX_STOCK_ADVISOR_RISK_CHARS = 200;
