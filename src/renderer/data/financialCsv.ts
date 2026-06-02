/**
 * 財務指標 CSV エクスポート (Phase 6) — 事業別の 15 指標 (+ 金額系) を
 * 表計算・会計ツールに取り込める CSV に整形する純粋ロジック。
 * `data/csv.ts` の `toCsv` を再利用 (BOM はダウンロード側で付与)。
 *
 * **概算であり財務助言ではありません。**
 */

import type { FinancialRatios } from './financialRatios';
import type { StatementLine } from './financialStatements';
import { toCsv } from './csv';

/** 出力列 (FinancialRatios の全 17 フィールド)。 */
const COLUMNS: { readonly key: keyof FinancialRatios; readonly label: string }[] = [
  { key: 'equityRatioPct', label: '自己資本比率(%)' },
  { key: 'currentRatioPct', label: '流動比率(%)' },
  { key: 'fixedLongTermFitPct', label: '固定長期適合率(%)' },
  { key: 'debtToMonthlySalesRatio', label: '借入金月商倍率(ヶ月)' },
  { key: 'debtRepaymentYears', label: '債務償還年数(年)' },
  { key: 'operatingMarginPct', label: '営業利益率(%)' },
  { key: 'ordinaryMarginPct', label: '経常利益率(%)' },
  { key: 'netMarginPct', label: '当期純利益率(%)' },
  { key: 'netProfit', label: '当期純利益(円)' },
  { key: 'laborSharePct', label: '労働分配率(%)' },
  { key: 'ebitda', label: 'EBITDA(円)' },
  { key: 'ebitdaMarginPct', label: 'EBITDAマージン(%)' },
  { key: 'receivablesTurnover', label: '売上債権回転率(倍)' },
  { key: 'inventoryTurnover', label: '棚卸資産回転率(倍)' },
  { key: 'cccDays', label: 'CCC(日)' },
  { key: 'roaPct', label: 'ROA(%)' },
  { key: 'roePct', label: 'ROE(%)' },
];

/** 事業別の 15 指標を 1 行/事業 の CSV に整形する。算定不能は空欄。 */
export function ratiosToCsv(units: readonly { readonly label: string; readonly ratios: FinancialRatios }[]): string {
  const header = ['事業', ...COLUMNS.map((c) => c.label)];
  const body = units.map((u) => [
    u.label,
    ...COLUMNS.map((c) => {
      const v = u.ratios[c.key] as number | null;
      return v == null ? '' : String(v);
    }),
  ]);
  return toCsv([header, ...body]);
}

/**
 * 財務諸表のライン項目を「項目, 金額」2列 CSV に整形する。
 * インデント段は全角スペースで保持し、金額が無い行は display を出力する。
 */
export function statementToCsv(lines: readonly StatementLine[]): string {
  const header = ['項目', '金額'];
  const body = lines.map((l) => {
    const indent = '　'.repeat(l.indent ?? 0);
    const value = l.amount != null ? String(l.amount) : (l.display ?? '');
    return [indent + l.label, value];
  });
  return toCsv([header, ...body]);
}
