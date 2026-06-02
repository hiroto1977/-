/**
 * 財務分析レポート生成 (Phase 8) — 総合診断・15指標・トレンドを 1 枚の
 * Markdown レポートに整形する純粋ロジック。指標/診断/トレンドと同じデータに
 * 連動し、共有・印刷用の成果物として書き出せる。
 *
 * **重要 — 概算であり財務助言ではありません。**
 */

import type { FinancialRatios } from './financialRatios';
import type { FinancialDiagnosis } from './financialDiagnosis';
import type { MarginTrend } from './financialTrend';

/** レポートに載せる指標の表示定義 (15指標 + 金額系2)。 */
const ROWS: { readonly key: keyof FinancialRatios; readonly label: string; readonly unit: string; readonly money?: boolean }[] = [
  { key: 'equityRatioPct', label: '自己資本比率', unit: '%' },
  { key: 'currentRatioPct', label: '流動比率', unit: '%' },
  { key: 'fixedLongTermFitPct', label: '固定長期適合率', unit: '%' },
  { key: 'debtToMonthlySalesRatio', label: '借入金月商倍率', unit: 'ヶ月' },
  { key: 'debtRepaymentYears', label: '債務償還年数', unit: '年' },
  { key: 'operatingMarginPct', label: '営業利益率', unit: '%' },
  { key: 'ordinaryMarginPct', label: '経常利益率', unit: '%' },
  { key: 'netMarginPct', label: '当期純利益率', unit: '%' },
  { key: 'netProfit', label: '当期純利益', unit: '円', money: true },
  { key: 'laborSharePct', label: '労働分配率', unit: '%' },
  { key: 'ebitda', label: 'EBITDA', unit: '円', money: true },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン', unit: '%' },
  { key: 'receivablesTurnover', label: '売上債権回転率', unit: '倍' },
  { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍' },
  { key: 'cccDays', label: 'CCC', unit: '日' },
  { key: 'roaPct', label: 'ROA', unit: '%' },
  { key: 'roePct', label: 'ROE', unit: '%' },
];

const TREND_TEXT: Record<MarginTrend['direction'], string> = { up: '改善傾向', flat: '横ばい', down: '悪化傾向' };

function fmtValue(v: number | null, unit: string, money?: boolean): string {
  if (v == null) return '—';
  if (money) return `${v.toLocaleString('ja-JP')} 円`;
  return `${v.toLocaleString('ja-JP')}${unit}`;
}

export interface FinancialReportInput {
  readonly label: string;
  readonly ratios: FinancialRatios;
  readonly diagnosis: FinancialDiagnosis;
  readonly trend: MarginTrend;
  /** 既定は実行時の現在日時。テストでは固定値を渡す。 */
  readonly generatedAt?: Date;
}

/** 財務分析レポートを Markdown 文字列で組み立てる。純粋。 */
export function buildFinancialReportMarkdown(input: FinancialReportInput): string {
  const { label, ratios, diagnosis, trend } = input;
  const date = (input.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# 財務分析レポート — ${label}`);
  lines.push('');
  lines.push(`作成日: ${date}`);
  lines.push('');
  lines.push(`## 総合評価: ${diagnosis.grade} （総合スコア ${diagnosis.overallScore} / 100）`);
  lines.push('');
  lines.push('| カテゴリ | スコア |');
  lines.push('| --- | ---: |');
  for (const c of diagnosis.categories) lines.push(`| ${c.category} | ${c.score} |`);
  lines.push('');
  const delta = trend.deltaPct == null ? '—' : `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}pt`;
  lines.push(`**営業利益率トレンド:** ${TREND_TEXT[trend.direction]}（履歴 ${delta}）`);
  lines.push('');
  lines.push('## 強み');
  if (diagnosis.strengths.length === 0) lines.push('- 特筆すべき強みは検出されませんでした。');
  else for (const s of diagnosis.strengths) lines.push(`- ${s.label}（スコア ${s.score}）`);
  lines.push('');
  lines.push('## 要改善（一般情報）');
  if (diagnosis.weaknesses.length === 0) lines.push('- 大きな弱みは検出されませんでした。');
  else for (const w of diagnosis.weaknesses) lines.push(`- ${w.comment}`);
  lines.push('');
  lines.push('## 主要財務指標');
  lines.push('');
  lines.push('| 指標 | 値 |');
  lines.push('| --- | ---: |');
  for (const r of ROWS) lines.push(`| ${r.label} | ${fmtValue(ratios[r.key] as number | null, r.unit, r.money)} |`);
  lines.push('');
  lines.push('---');
  lines.push('※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。');
  return lines.join('\n');
}
