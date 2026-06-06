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
import { calcCorporateTax } from '../../shared/taxCorporate';

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

// 円建ての桁区切り。'ja-JP' を 1 箇所に集約。なお実行環境の既定ロケールでも
// 整数の桁区切りは同一になり 'ja-JP'→'' の差が出ない (equivalent) ため、この
// 行の StringLiteral mutation のみ無効化する。
// Stryker disable next-line StringLiteral
const yen = (n: number): string => n.toLocaleString('ja-JP');

function fmtValue(v: number | null, unit: string, money?: boolean): string {
  if (v == null) return '—';
  // money 行も unit ('円') を使う。ハードコードせず unit を経由させることで
  // ROWS の unit を live にし、その StringLiteral mutation を golden で殺せる。
  return money ? `${yen(v)} ${unit}` : `${yen(v)}${unit}`;
}

export interface FinancialReportInput {
  readonly label: string;
  readonly ratios: FinancialRatios;
  readonly diagnosis: FinancialDiagnosis;
  readonly trend: MarginTrend;
  /** 既定は実行時の現在日時。テストでは固定値を渡す。 */
  readonly generatedAt?: Date;
  /**
   * 税引前利益 (経常利益) を課税所得の概算として渡すと「## 法人税等(概算)」
   * セクションを出力する。`calcCorporateTax` (中小・最小均等割の保守的既定) で
   * 法人税等合計・実効税率・税引後利益を概算する。会計上の利益と税法上の課税所得の
   * 差異 (損金不算入等) は概算では無視する。未指定 (undefined) なら従来どおり
   * セクションを出力しない (既存出力と完全に一致)。
   */
  readonly ordinaryProfit?: number;
}

/** パーセント (実効税率) を小数1桁で整形。0.2549 → '25.5%'。 */
function fmtRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 「## 法人税等(概算)」セクションを `lines` に追記する。
 *
 * 税引前利益 (経常利益) を課税所得の概算として `calcCorporateTax` に渡し、
 * 法人税等の内訳・合計・実効税率・税引後利益を Markdown の表で出力する。
 * 税引前利益が 0 以下 (欠損) のときは法人住民税の均等割のみが課され、
 * 税引後利益 = 税引前利益 − 均等割 となる旨を注記する。
 */
function appendCorporateTaxSection(lines: string[], ordinaryProfit: number): void {
  const b = calcCorporateTax(ordinaryProfit);
  lines.push('## 法人税等(概算)');
  lines.push('');
  lines.push('| 項目 | 金額 |');
  lines.push('| --- | ---: |');
  lines.push(`| 税引前利益(経常利益) | ${yen(ordinaryProfit)} 円 |`);
  lines.push(`| 法人税 | ${yen(b.corporateIncomeTax)} 円 |`);
  lines.push(`| 地方法人税 | ${yen(b.localCorporateTax)} 円 |`);
  lines.push(`| 法人住民税 | ${yen(b.residentTax)} 円 |`);
  lines.push(`| 法人事業税 | ${yen(b.businessTax)} 円 |`);
  lines.push(`| 特別法人事業税 | ${yen(b.specialBusinessTax)} 円 |`);
  lines.push(`| 法人税等合計 | ${yen(b.totalTax)} 円 |`);
  lines.push(`| 実効税率 | ${fmtRate(b.effectiveRate)} |`);
  lines.push(`| 税引後利益 | ${yen(b.afterTaxProfit)} 円 |`);
  lines.push('');
  if (ordinaryProfit <= 0) {
    lines.push(`> 欠損(税引前利益が0以下)のため、法人住民税の均等割(${yen(b.residentTax)} 円)のみが課されます。税引後利益 = 税引前利益 − 均等割。`);
  } else {
    // レポートは `calcCorporateTax(ordinaryProfit)` を profile 未指定で呼ぶため
    // 区分は常に中小法人 (保守的既定)。資本金等の細目は CorporateTaxCard (UI) で扱う。
    lines.push('> 区分: 中小法人（経常利益を課税所得の概算として使用。資本金等の細目は経営コックピットの法人税カードで調整可）。');
  }
  lines.push('');
  lines.push('※ 法人税等は概算試算であり、正確な税額計算・税務助言ではありません。申告・納税は税理士 / 国税庁・e-Tax / 都道府県・市区町村で確定してください。');
  lines.push('');
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
  if (input.ordinaryProfit !== undefined) appendCorporateTaxSection(lines, input.ordinaryProfit);
  lines.push('---');
  lines.push('※ 本レポートは概算データに基づく一般情報であり、財務助言ではありません。');
  return lines.join('\n');
}
