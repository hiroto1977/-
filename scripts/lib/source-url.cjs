'use strict';
/**
 * 出典 URL の正規化 —— **このリポジトリで唯一の実装** (2026-09-26 · パス 478)。
 *
 * ## 3 つ在ったのを 1 つに畳んだ (実測してから)
 *
 * パス 478 の最初の版は「`.cjs` 側の唯一の実装」と名乗ったが**偽だった** ——
 * `scripts/lint-citations.cjs` が 2026-09-05 から同名の関数を持ち、しかも**契約が違った**
 * (見つけたのはパス 325 の `parsedUrlGateCensus` で、`new URL(` の母集団に私の新しい行が
 * 載っていないと鳴った)。実測 (2026-09-26 · 標本 13 種):
 *
 * | 軸 | 私の最初の版 | `lint-citations` | 採った側 |
 * | --- | --- | --- | --- |
 * | フラグメント | 落とす | 落とす | 同じ |
 * | scheme | `https` へ | `https` へ | 同じ |
 * | ホストの大小 | 落とす | 落とす | 同じ |
 * | 末尾の `/` | 落とす (根は `/`) | 落とす (根も空) | **`lint-citations`** |
 * | **パスの大小** | **残す** | **落とす** | **`lint-citations`** |
 * | **ポート** | **残す** | **落とす** (`hostname`) | **`lint-citations`** |
 * | クエリ | 残す | 残す | 同じ |
 *
 * ★ **パスの大小で実物が割れていた** —— `academic/infosoc-data-feminism` は
 * `…/wiki/Data_Feminism` と `…/wiki/Data_feminism` の 2 件を持ち、私の版は**独立 3 件**、
 * `lint-citations` の版は**独立 2 件**と数えた。実質は同じ頁なので、**過大に数えるのは私の版**
 * である。向きが決め手: 過大は「偽の 2 件目を黙って受ける」(静かな誤り)、
 * 過小は「正当な項目を落とす」(騒がしい誤り) —— **静かな方を避ける。**
 *
 * ★ **ポートを落とすのは実測して受け入れた** —— コーパスに port つきの出典は **0 件**。
 * 一般には別のポートは別のサーバだが、落とす向きの誤りは騒がしい側なので、
 * **契約を 2 つに割るよりも 1 つにする方を採った**。port つきの出典が入る日に、
 * この段を読んで分ければよい。
 *
 * ## 写しは 1 つだけ残る (`.ts` 側)
 *
 * `.cjs` からは `.ts` を require できないので、実行時側
 * (`src/renderer/data/sourceVerification.ts`) の写しは避けられない
 * (前例: `scripts/lib/strip-non-code.cjs` · パス 452)。
 * **割れないことは `src/renderer/data/__tests__/sourceUrlParity.test.ts` が
 * 同じ標本を両方に通して見る (台帳は両方向)。**
 */

function normalizeSourceUrl(url) {
  const trimmed = String(url ?? '').trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
  const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  return `https://${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
}

/** 独立した出典数 (同じ文書を指す綴りは 1 件に畳む)。 */
function distinctSourceCount(sources) {
  const urls = new Set();
  for (const s of sources ?? []) urls.add(normalizeSourceUrl(s && s.url));
  return urls.size;
}

module.exports = { normalizeSourceUrl, distinctSourceCount };
