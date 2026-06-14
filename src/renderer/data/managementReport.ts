/**
 * 経営レポート出力 — 経営コックピットの内容を共有可能な Markdown 文書にまとめる。
 *
 * 役員会・銀行・税理士への報告用に、経営概況 (BusinessOverview)・スコアカード・
 * ハイライトを 1 つのテキストレポートへ整形する純粋関数。IO は持たない
 * (呼び出し側がクリップボードやファイルに出す)。
 *
 * **重要 — 概算の経営診断であり財務・税務助言ではありません。**
 */
import type { BusinessOverview } from './overview';
import type { ManagementScorecard } from '../../shared/managementScorecard';
import { summarizeHighlights, RISK_BAND_LABEL, type Highlight } from './managementHighlights';
import type { MonthlyTrendRow } from './kpiActuals';

const VERDICT_LABEL: Record<ManagementScorecard['verdict'], string> = {
  poor: '要改善', caution: '注意', good: '良好', excellent: '優良',
};
const SEVERITY_MARK: Record<Highlight['severity'], string> = {
  critical: '🔴', warning: '🟡', good: '🟢',
};

const yen = (n: number): string => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const pct = (n: number): string => `${n.toFixed(1)}%`;
const pctOrDash = (n: number | null): string => (n === null ? '—' : `${n}%`);

/**
 * 経営レポートを Markdown 文字列で生成する。
 *
 * @param overview 経営概況
 * @param scorecard 経営スコアカード
 * @param highlights 経営ハイライト (優先度順)
 * @param asOf 生成日 (YYYY-MM-DD 等の表示用文字列)
 * @param monthlyTrend 月次推移 (任意)。2 期以上あれば推移テーブルを出力する。
 */
export function buildManagementReport(
  overview: BusinessOverview,
  scorecard: ManagementScorecard,
  highlights: readonly Highlight[],
  asOf: string,
  // 既定 `[]` は `length >= 2` ゲートにより要素数1の配列と出力上区別できない (どちらもテーブル
  // 非出力) ため、ArrayDeclaration 変異は equivalent。
  // Stryker disable next-line ArrayDeclaration
  monthlyTrend: readonly MonthlyTrendRow[] = [],
  /** 損益分岐点までの売上変動余地 (%)。null / 未指定なら出力しない。 */
  breakEvenDeltaPct: number | null = null,
): string {
  const k = overview.kpi;
  const lines: string[] = [];

  lines.push(`# 経営レポート (${overview.plan.label} プラン)`);
  lines.push('');
  lines.push(`作成日: ${asOf}`);
  lines.push('');
  lines.push('> ※ 本レポートは入力済みデータからの概算の経営診断であり、財務・税務助言ではありません。');
  lines.push('');

  // 総合判定
  lines.push('## 総合判定');
  lines.push('');
  lines.push(`- 経営スコア: **${scorecard.overallScore} / 100** (${VERDICT_LABEL[scorecard.verdict]})`);
  for (const c of scorecard.categories) {
    if (c.score !== null) lines.push(`- ${c.label}: ${c.score} / 100`);
  }
  lines.push('');

  // ハイライト
  if (highlights.length > 0) {
    lines.push('## 経営ハイライト');
    lines.push('');
    const s = summarizeHighlights(highlights);
    lines.push(`総合リスク: **${RISK_BAND_LABEL[s.riskBand]}** — 🔴 ${s.critical} / 🟡 ${s.warning} / 🟢 ${s.good} (計 ${s.total} 件)`);
    lines.push('');
    for (const h of highlights) {
      lines.push(`- ${SEVERITY_MARK[h.severity]} [${h.category}] ${h.message}`);
    }
    lines.push('');
  }

  // 損益
  if (k.hasData) {
    lines.push('## 損益 (P&L)');
    lines.push('');
    lines.push(`- 売上高: ${yen(k.revenue)}`);
    lines.push(`- 営業利益: ${yen(k.operatingProfit)} (営業利益率 ${pct(k.operatingMarginPct)})`);
    lines.push(`- 売上総利益: ${yen(k.grossProfit)} (粗利率 ${pct(k.grossMarginPct)})`);
    lines.push(`- EBITDA: ${yen(k.ebitda)} (マージン ${pct(k.ebitdaMarginPct)})`);
    lines.push(`- 損益分岐点: ${Number.isFinite(k.bep) ? yen(k.bep) : '—'} / 安全余裕率 ${pct(k.safetyMargin)}`);
    if (k.revenueGrowthPct !== null) lines.push(`- 前期比成長率: ${k.revenueGrowthPct}%`);
    if (k.yoy !== null && k.yoy.revenueYoYPct !== null) {
      lines.push(`- 前年同月比 (YoY): ${k.yoy.revenueYoYPct > 0 ? '+' : ''}${k.yoy.revenueYoYPct}% (${k.yoy.period} vs ${k.yoy.priorPeriod})`);
    }
    if (breakEvenDeltaPct !== null) {
      lines.push(`- 損益分岐点までの売上余地: ${breakEvenDeltaPct > 0 ? '+' : ''}${breakEvenDeltaPct}%`);
    }
    lines.push('');
  }

  // 財政状態
  if (overview.financialPosition) {
    const fp = overview.financialPosition;
    lines.push('## 財政状態 (BS)');
    lines.push('');
    lines.push(`- 自己資本比率: ${pctOrDash(fp.equityRatioPct)} / 流動比率: ${pctOrDash(fp.currentRatioPct)}`);
    lines.push(`- ROA: ${pctOrDash(fp.roaPct)} / ROE: ${pctOrDash(fp.roePct)}`);
    if (fp.insolvent) lines.push('- ⚠ 純資産がマイナス (債務超過) です。');
    lines.push('');
  }

  // 資金繰り
  if (overview.accounting) {
    lines.push('## 資金繰り (CF)');
    lines.push('');
    lines.push(`- 営業CF合計: ${yen(overview.accounting.totalNet)} (月次平均 ${yen(overview.accounting.avgMonthlyNet)})`);
    if (overview.runwayMonths !== null) lines.push(`- 資金ランウェイ: ${overview.runwayMonths} か月`);
    if (overview.cashForecast?.shortfallMonthIndex != null) {
      lines.push(`- 資金ショート予測: ${overview.cashForecast.shortfallMonthIndex} か月後`);
    }
    lines.push('');
  }

  // 予実
  if (overview.budget) {
    const b = overview.budget;
    lines.push('## 予算実績差異 (BVA)');
    lines.push('');
    lines.push(`- 売上 達成率: ${pctOrDash(b.revenue.achievementPct)} (予算 ${yen(b.revenue.budget)} / 実績 ${yen(b.revenue.actual)})`);
    lines.push(`- 営業利益 達成率: ${pctOrDash(b.operatingProfit.achievementPct)}`);
    lines.push('');
  }

  // 月次推移
  if (monthlyTrend.length >= 2) {
    lines.push('## 月次推移');
    lines.push('');
    lines.push('| 期間 | 売上高 | 営業利益 | 営業利益率 | 前期比 |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const r of monthlyTrend) {
      const growth = r.revenueGrowthPct === null ? '—' : `${r.revenueGrowthPct > 0 ? '+' : ''}${r.revenueGrowthPct}%`;
      lines.push(`| ${r.period} | ${yen(r.revenue)} | ${yen(r.operatingProfit)} | ${r.operatingMarginPct.toFixed(1)}% | ${growth} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
