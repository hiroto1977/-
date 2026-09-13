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

/**
 * 書き出したファイルに**同梱する出所**。
 *
 * ## なぜ必須引数か (2026-09-07)
 *
 * ここが出す CSV は 1 行も断り書きを持っていなかった。中身は
 * `businessFinancials.ts` が月次 KPI から丸ごと組み立てた概算で、貸借対照表の
 * 現預金・売上債権・棚卸資産・仕入債務・短期借入金・長期借入金は**どの画面でも
 * 入力されていない**。画面は 3 か所で「概算」と断っているのに、
 * `statement-bs-<事業>-2026-09-07.csv` を受け取った人 (会計事務所・金融機関) には
 * 「項目, 金額」しか見えず、**会社の貸借対照表として読める**。
 *
 * 同じ画面の Markdown 書き出しは 2 本とも断り書きを中に持っていたので、
 * 落ちていたのは CSV の経路だけだった。任意引数にすると次の呼び手が
 * 黙って落とせるので**必須**にしている (`scope` も `notes` も空は投げる ——
 * 「文脈を書いたことになっている空欄」を作らない)。
 */
export interface CsvProvenance {
  /**
   * 対象 (事業名・「連結（自社の実績）」など)。**ファイル名に頼らない** ——
   * 名前は改名や転送で消えるが、中に書いた行は残る。
   */
  readonly scope: string;
  /** 断り書き。画面が出している物と同じ文 (`statementEstimateNotes()`)。 */
  readonly notes: readonly string[];
}

/**
 * 出所の行を組む (表の後ろに空行 1 行 → 対象 → 断り書き)。
 *
 * 列数は表と同じ 2 列に揃える (欠けた列を嫌う取り込み側がある)。
 * 先頭が `=` `+` `-` `@` の文字は `csv.ts` が打ち消すので、ここでは触らない。
 */
function provenanceRows(prov: CsvProvenance, width: number): string[][] {
  if (prov.scope.trim() === '') throw new Error('CsvProvenance.scope が空です (書き出しの対象を書いてください)');
  if (prov.notes.length === 0 || prov.notes.some((n) => n.trim() === '')) {
    throw new Error('CsvProvenance.notes が空です (画面と同じ断り書きを渡してください)');
  }
  const pad = (first: string): string[] => [first, ...Array<string>(width - 1).fill('')];
  return [pad(''), pad(`対象: ${prov.scope}`), ...prov.notes.map((n) => pad(n))];
}

/** 事業別の 15 指標を 1 行/事業 の CSV に整形する。算定不能は空欄。 */
export function ratiosToCsv(
  units: readonly { readonly label: string; readonly ratios: FinancialRatios }[],
  prov: CsvProvenance,
): string {
  const header = ['事業', ...COLUMNS.map((c) => c.label)];
  const body = units.map((u) => [
    u.label,
    ...COLUMNS.map((c) => {
      const v = u.ratios[c.key] as number | null;
      return v == null ? '' : String(v);
    }),
  ]);
  return toCsv([header, ...body, ...provenanceRows(prov, header.length)]);
}

/**
 * 財務諸表のライン項目を「項目, 金額」2列 CSV に整形する。
 * インデント段は全角スペースで保持し、金額が無い行は display を出力する。
 * 表の後ろに対象と断り書きを付ける (`CsvProvenance`)。
 */
export function statementToCsv(lines: readonly StatementLine[], prov: CsvProvenance): string {
  const header = ['項目', '金額'];
  const body = lines.map((l) => {
    const indent = '　'.repeat(l.indent ?? 0);
    const value = l.amount != null ? String(l.amount) : (l.display ?? '');
    return [indent + l.label, value];
  });
  return toCsv([header, ...body, ...provenanceRows(prov, header.length)]);
}
