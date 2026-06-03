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

describe('buildFinancialReportMarkdown', () => {
  const { ratios, diagnosis, trend } = fixture();
  const md = buildFinancialReportMarkdown({ label: 'EC事業', ratios, diagnosis, trend, generatedAt: new Date('2026-06-02T00:00:00Z') });

  it('includes the title, date and overall grade', () => {
    expect(md).toContain('# 財務分析レポート — EC事業');
    expect(md).toContain('作成日: 2026-06-02');
    expect(md).toContain(`## 総合評価: ${diagnosis.grade}`);
  });

  it('renders category scores and all 17 indicator rows', () => {
    expect(md).toContain('| 安全性 |');
    expect(md).toContain('| 収益性 |');
    expect(md).toContain('| 効率性 |');
    // 17 指標 + 2 ヘッダ行 (指標|値 と区切り) のうち主要なものを確認
    expect(md).toContain('| 自己資本比率 |');
    expect(md).toContain('| ROE |');
    expect(md).toContain('| CCC |');
  });

  it('reflects the margin trend and keeps the disclaimer', () => {
    expect(md).toContain('営業利益率トレンド:** 改善傾向');
    expect(md).toContain('財務助言ではありません');
  });

  it('golden: renders the exact full Markdown report', () => {
    const expected = [
      '# 財務分析レポート — EC事業',
      '',
      '作成日: 2026-06-02',
      '',
      '## 総合評価: S （総合スコア 84 / 100）',
      '',
      '| カテゴリ | スコア |',
      '| --- | ---: |',
      '| 安全性 | 92 |',
      '| 収益性 | 98 |',
      '| 効率性 | 39 |',
      '',
      '**営業利益率トレンド:** 改善傾向（履歴 +7pt）',
      '',
      '## 強み',
      '- 自己資本比率（スコア 100）',
      '- 固定長期適合率（スコア 100）',
      '- 債務償還年数（スコア 100）',
      '',
      '## 要改善（一般情報）',
      '- 売上債権回転率が低め。回収サイトの長期化に注意。',
      '- 棚卸資産回転率が低め。在庫の滞留に注意。',
      '- CCC（現金化日数）が長め。回収・在庫・支払のサイト最適化を検討。',
      '',
      '## 主要財務指標',
      '',
      '| 指標 | 値 |',
      '| --- | ---: |',
      '| 自己資本比率 | 50% |',
      '| 流動比率 | 183.3% |',
      '| 固定長期適合率 | 64.3% |',
      '| 借入金月商倍率 | 2.21ヶ月 |',
      '| 債務償還年数 | 0.8年 |',
      '| 営業利益率 | 20% |',
      '| 経常利益率 | 19.6% |',
      '| 当期純利益率 | 13.7% |',
      '| 当期純利益 | 1,649,088 円 |',
      '| 労働分配率 | 39.5% |',
      '| EBITDA | 2,760,000 円 |',
      '| EBITDAマージン | 23% |',
      '| 売上債権回転率 | 8倍 |',
      '| 棚卸資産回転率 | 12倍 |',
      '| CCC | 39.5日 |',
      '| ROA | 17.2% |',
      '| ROE | 34.4% |',
      '',
      '---',
      '※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。',
    ].join('\n');
    expect(md).toBe(expected);
  });

  it('null の指標は値欄を — で描画する (fmtValue の null ガード)', () => {
    // 売上0 → 多くの比率が null。CCC 行が「| CCC | — |」になることを確認。
    // `if (v == null) return '—'` の条件を false 固定 / '—' を空に変える mutant を殺す。
    const zeroRatios = computeFinancialRatios(deriveBusinessFinancials({ revenue: 0, variableCost: 0, fixedCost: 0, profit: 0, profitMargin: 0 }));
    const mdNull = buildFinancialReportMarkdown({ label: 'Z', ratios: zeroRatios, diagnosis, trend, generatedAt: new Date('2026-06-02T00:00:00Z') });
    expect(mdNull).toContain('| CCC | — |');
  });

  it('deltaPct=0 は +0pt ではなく 0pt (> 0 と >= 0 を区別)', () => {
    // 利益率が完全横ばい → deltaPct=0。`deltaPct > 0 ? '+' : ''` を `>= 0` にする
    // mutant は「+0pt」になるため、0pt 表記の検証で殺せる。
    const flat0 = analyzeMarginTrend([{ revenue: 100, profit: 10 }, { revenue: 100, profit: 10 }]);
    expect(flat0.deltaPct).toBe(0);
    const md0 = buildFinancialReportMarkdown({ label: 'Z', ratios, diagnosis, trend: flat0, generatedAt: new Date('2026-06-02T00:00:00Z') });
    expect(md0).toContain('（履歴 0pt）');
    expect(md0).not.toContain('+0pt');
  });

  it('defaults generatedAt to now when omitted', () => {
    const today = new Date().toISOString().slice(0, 10);
    const md2 = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis, trend });
    expect(md2).toContain(`作成日: ${today}`);
  });

  it('covers down/flat trends, null delta, and empty strengths/weaknesses', () => {
    const ax = (key: string, score: number) => ({ key, label: key, unit: '', raw: score, score });
    const D = new Date('2026-06-02T00:00:00Z');
    const weak = diagnoseFinancials([ax('equityRatio', 10), ax('operatingMargin', 5)]); // 強みなし
    const strong = diagnoseFinancials([ax('equityRatio', 95), ax('operatingMargin', 95)]); // 弱みなし
    const down = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis: weak, trend: analyzeMarginTrend([{ revenue: 100, profit: 20 }, { revenue: 100, profit: 10 }]), generatedAt: D });
    expect(down).toContain('**営業利益率トレンド:** 悪化傾向（履歴 -10pt）');
    expect(down).toContain('- 特筆すべき強みは検出されませんでした。');
    const flat = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis: strong, trend: analyzeMarginTrend([{ revenue: 100, profit: 10 }]), generatedAt: D });
    expect(flat).toContain('**営業利益率トレンド:** 横ばい（履歴 —）');
    expect(flat).toContain('- 大きな弱みは検出されませんでした。');
  });
});
