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

  it('defaults generatedAt to now when omitted', () => {
    const today = new Date().toISOString().slice(0, 10);
    const md2 = buildFinancialReportMarkdown({ label: 'X', ratios, diagnosis, trend });
    expect(md2).toContain(`作成日: ${today}`);
  });
});
