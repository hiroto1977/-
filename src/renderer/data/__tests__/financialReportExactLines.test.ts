/**
 * **財務分析レポートの、注記の直後の空行と「未評価」の判定を、全文で留める。** (パス 502)
 *
 * 既存の検査は注記の本文を `toContain` で探すが、**注記のすぐ後ろの空行** (Markdown では
 * 次の段落との区切り) は見ていなかった。空行が別の字に変わると、注記が次の引用に
 * 繋がって 1 つの引用ブロックに読まれる。ここでは欠損の期 (実効税率が空欄) と、
 * 算定できない軸が在る期の**全文**を値ごとに並べる。
 *
 * もう 1 つ: 総合評価の「未評価」は `overallScore` と `grade` の**どちらか一方でも** `null` なら
 * 出す (`||`)。診断の型は 2 つを独立に `null` にできるので、片方だけ `null` の診断でも
 * 文字列 "null" を刷らない (`${null}` は型検査を素通りして "null" を刷る)。
 */
import { describe, expect, it } from 'vitest';
import { buildFinancialReportMarkdown } from '../financialReport';
import { computeFinancialRatios, radarAxes } from '../financialRatios';
import { diagnoseFinancials } from '../financialDiagnosis';
import { analyzeMarginTrend } from '../financialTrend';
import { deriveBusinessFinancials } from '../businessFinancials';

function fixture() {
  const fin = deriveBusinessFinancials({ revenue: 1_000_000, variableCost: 400_000, fixedCost: 300_000, profit: 200_000, profitMargin: 20 });
  const ratios = computeFinancialRatios(fin);
  const diagnosis = diagnoseFinancials(radarAxes(ratios));
  const trend = analyzeMarginTrend([{ revenue: 100, profit: 5 }, { revenue: 100, profit: 12 }]);
  return { ratios, diagnosis, trend };
}

const AT = new Date(2026, 5, 2, 12);

describe('buildFinancialReportMarkdown — 欠損の期の法人税等の節を全文で (パス 502)', () => {
  it('★ 実効税率が空欄の期は、空欄の理由・欠損の注記・算定の注記を、それぞれ空行で区切って並べる', () => {
    const { ratios, diagnosis, trend } = fixture();
    const md = buildFinancialReportMarkdown({ label: 'Z', ratios, diagnosis, trend, generatedAt: AT, ordinaryProfit: -200_000 });
    const section = [
      '## 法人税等(概算)',
      '',
      '| 項目 | 金額 |',
      '| --- | ---: |',
      '| 税引前利益(経常利益) | -200,000 円 |',
      '| 法人税 | 0 円 |',
      '| 地方法人税 | 0 円 |',
      '| 法人住民税 | 70,000 円 |',
      '| 法人事業税 | 0 円 |',
      '| 特別法人事業税 | 0 円 |',
      '| 法人税等合計 | 70,000 円 |',
      '| 実効税率 | — |',
      '| 法定実効税率(参考) | 21.4% |',
      '| 税引後利益 | -270,000 円 |',
      '',
      '> 控除後の課税所得が 0 のため、実効税率は算定していません。',
      '',
      '> 欠損(税引前利益が0以下)のため、法人住民税の均等割(70,000 円)のみが課されます。税引後利益 = 税引前利益 − 均等割。',
      '',
      '> 実効税率は法人税等合計÷課税所得の単純合算ベース。法定実効税率(参考)は事業税(+特別法人事業税)の損金算入を織り込んだ標準指標(限界税率)で、両者は目的の異なる別の参考値です。',
      '',
      '※ 法人税等は概算試算であり、正確な税額計算・税務助言ではありません。申告・納税は税理士 / 国税庁・e-Tax / 都道府県・市区町村で確定してください。',
      '',
      '---',
      '※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。',
    ].join('\n');
    expect(md.endsWith(section)).toBe(true);
  });
});

describe('buildFinancialReportMarkdown — 未評価の軸が在る期の全文 (パス 502)', () => {
  /** 2 軸だけを持ち、どちらも算定できない診断。 */
  const allUnscored = diagnoseFinancials([
    { key: 'ccc', label: 'CCC', unit: '日', raw: null, score: null },
    { key: 'roe', label: 'ROE', unit: '%', raw: null, score: null },
  ]);

  it('★ 「未評価の N 軸」の行は、空行で前後と区切られる (次の見出しに繋がらない)', () => {
    const { ratios, trend } = fixture();
    const md = buildFinancialReportMarkdown({ label: 'Z事業', ratios, diagnosis: allUnscored, trend, generatedAt: AT });
    const head = [
      '# 財務分析レポート — Z事業',
      '',
      '作成日: 2026-06-02',
      '',
      '## 総合評価: 未評価 （算定できた指標がありません）',
      '',
      '| カテゴリ | スコア |',
      '| --- | ---: |',
      '| 安全性 | 未評価 |',
      '| 収益性 | 未評価 |',
      '| 効率性 | 未評価 |',
      '',
      '**未評価の 2 軸:** CCC・ROE（分母となる科目が 0 のため算定できず、総合スコア・カテゴリ平均・強み／要改善から除いています）',
      '',
      '**営業利益率トレンド:** 改善傾向（履歴 +7pt）',
      '',
      '## 強み',
    ].join('\n');
    expect(md.startsWith(head)).toBe(true);
  });

  it('★ 総合スコアだけが null の診断でも「未評価」と書き、"null" を刷らない', () => {
    const { ratios, diagnosis, trend } = fixture();
    expect(diagnosis.grade).not.toBeNull(); // 標本の前提: 格付けは付いている
    const md = buildFinancialReportMarkdown({
      label: 'Z',
      ratios,
      diagnosis: { ...diagnosis, overallScore: null },
      trend,
      generatedAt: AT,
    });
    expect(md).toContain('## 総合評価: 未評価 （算定できた指標がありません）');
    expect(md).not.toContain('null');
    // 格付けがあっても、スコアの無い格付けは刷らない。
    expect(md).not.toContain('## 総合評価: S');
  });

  it('★ 格付けだけが null の診断でも「未評価」と書き、"null" を刷らない', () => {
    const { ratios, diagnosis, trend } = fixture();
    expect(diagnosis.overallScore).not.toBeNull(); // 標本の前提: 総合スコアは在る
    const md = buildFinancialReportMarkdown({
      label: 'Z',
      ratios,
      diagnosis: { ...diagnosis, grade: null },
      trend,
      generatedAt: AT,
    });
    expect(md).toContain('## 総合評価: 未評価 （算定できた指標がありません）');
    expect(md).not.toContain('null');
    // 総合スコアがあっても、格付けの無い評価は「総合スコア 84 / 100」と書かない。
    expect(md).not.toContain('総合スコア');
  });

  it('★ 対照: 総合スコアも格付けも在る診断は、未評価と書かずに数と格付けを書く', () => {
    const { ratios, diagnosis, trend } = fixture();
    const md = buildFinancialReportMarkdown({ label: 'Z', ratios, diagnosis, trend, generatedAt: AT });
    expect(md).toContain(`## 総合評価: ${diagnosis.grade} （総合スコア ${diagnosis.overallScore} / 100）`);
    expect(md).not.toContain('## 総合評価: 未評価');
  });
});
