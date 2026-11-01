/**
 * **財務諸表の断り書きを、検査の中で呼んで全文で留める。** (パス 502)
 *
 * `statementEstimateNotes()` の 1 文目は 3 つの文字列リテラルを `+` で繋いでおり、
 * 2 本目・3 本目 (`包括利益のOCI・…3ヶ月集計、` と `注記/附属明細/…単純合算。`) の変異体
 * (`""` への置き換え) が生き残っていた。理由は 2 つ重なっていた:
 *
 * - 既存の `financialStatements.test.ts` の「断り書きの中身」は `const notes =
 *   statementEstimateNotes()` を **`describe` の本体 (= 検査の外・収集時)** で呼ぶ。
 *   変異検査 (Stryker) は検査ファイルの `beforeAll` から変異体を有効にするので、
 *   収集時に評価した値は元のままで、断片の `toContain` は変異体に**届かない**。
 * - 画面・CSV の検査は `expect(出力).toContain(statementEstimateNotes()[i])` と
 *   **同じ出所を両辺に置く**ので、文が空になっても両辺が一緒に動いて通る。
 *
 * ここは**検査の中で**呼び、全文を**字面そのまま**書き下す (原文の式では組まない)。
 * 繋ぎ目 (`、` の後ろ・`。` の後ろ) も同時に留まる。
 */
import { describe, expect, it } from 'vitest';
import { statementEstimateNotes } from '../financialStatements';

describe('statementEstimateNotes — 全文 (パス 502)', () => {
  it('★ 2 文を字面ごと固定する (1 文目は 3 本のリテラルの繋ぎ目まで)', () => {
    expect(statementEstimateNotes()).toEqual([
      '※ 諸表・指標・チャートは同じ概算財務データに連動。CFは簡易間接法（営業=純利益+減価償却・投資/財務は概算）。包括利益のOCI・株主資本変動の配当はデータ無しのため0/概算。四半期は月次履歴を3ヶ月集計、注記/附属明細/勘定科目内訳はテンプレート+概算値。連結は内部取引消去なしの単純合算。',
      '※ 事業別の貸借対照表データが無いため、各事業の BS / CF は売上・収益性から概算生成しています（自己資本比率は収益性で変動）。概算であり財務助言ではありません。',
    ]);
  });
});
