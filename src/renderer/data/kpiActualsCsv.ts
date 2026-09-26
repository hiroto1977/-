/**
 * KPI actuals ↔ CSV mapping. Mirrors `salesCsv.ts`, reusing the generic CSV
 * core (`csv.ts`) and the KPI model's validator (`parseKpiActual`).
 */
import { recordsToCsv, parseCsvRecords } from './csv';
import { actualKey, parseKpiActual, type KpiActual } from './kpiActuals';

/**
 * 書き出す列。**記録の形 (`COLLECTION_SHAPES['kpi-actuals']`) が宣言する欄を
 * すべて覆う** —— 覆わない欄は書き出した瞬間に消える。
 *
 * ## 2026-09-23 · パス 429 実測
 *
 * ここは **7 列**で、記録の形は **8 欄** (`laborCost` = 人件費) を宣言していた。
 * `kpiActualsFromCsv` も `laborCost` を `parseKpiActual` へ渡しておらず、
 * **書き出し側が落とし、取り込み側も読み戻せない**:
 *
 * | 操作 | 人件費 |
 * | --- | --- |
 * | 画面で 2,500,000 を入力 (`人件費(任意)`) | 2,500,000 |
 * | 書き出して読み戻す | **消える** |
 * | 手で `laborCost` 列を足した CSV を読ませる | **消える** (取り込みが読まない) |
 *
 * ★ **消えた先が紙である** —— 人件費は金融機関等提出用の書面の「人件費」の行・
 * 損益計算書の「（うち 人件費）」・労働分配率・人件費率・一人当たり人件費・
 * 付加価値の算定に入る。往復のあとはその全部が空欄か 0 になる。
 *
 * ★ **既存の検査は往復の等値を主張していたが、標本が見分けられなかった** ——
 * `expect(entries).toEqual(ROWS)` の `ROWS` に `laborCost` が無かった
 * (法則 `no-weakness-as-spec` の隣の形: 主張は正しく、標本だけが盲目)。
 */
export const KPI_CSV_COLUMNS = [
  'period',
  'unit',
  'revenue',
  'cogs',
  'advertising',
  'sga',
  'depreciation',
  'laborCost',
] as const;

export function kpiActualsToCsv(rows: readonly KpiActual[]): string {
  return recordsToCsv(rows, KPI_CSV_COLUMNS as unknown as (keyof KpiActual & string)[]);
}

export interface KpiImportResult {
  readonly entries: KpiActual[];
  readonly errors: { row: number; message: string }[];
  /** `errors` のうち、同じ (期間, 事業) が既に在るためスキップした行の数 (パス 124)。 */
  readonly duplicates: number;
}

/**
 * Parse a KPI actuals CSV; each row validated independently.
 *
 * **同じ (期間, 事業) は 1 件** (パス 124): 既に保存されている組 (`existing`) と、同じファイルの
 * 中で先に出た組は取り込まず `errors` に数える —— 以前は同じファイルを 2 度読むと売上高が
 * 2 倍になった (`addMany` は既存と照合しない)。
 */
export function kpiActualsFromCsv(text: string, existing: readonly KpiActual[] = []): KpiImportResult {
  const records = parseCsvRecords(text);
  const entries: KpiActual[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Set(existing.map(actualKey));
  let duplicates = 0;

  records.forEach((rec, i) => {
    let entry: KpiActual;
    try {
      entry = parseKpiActual({
        period: rec.period,
        unit: rec.unit,
        revenue: rec.revenue,
        cogs: rec.cogs,
        advertising: rec.advertising,
        sga: rec.sga,
        depreciation: rec.depreciation,
        // 人件費は任意。7 列の古い CSV では `rec.laborCost` が undefined になり、
        // `parseKpiActual` が「未入力」として欄ごと持たせない —— 古い控えも今までどおり読める。
        laborCost: rec.laborCost,
      });
    } catch (e) {
      // parse は常に Error を throw するため else 側 '不正な行' は到達不能 (防御)。
      // Stryker disable next-line StringLiteral
      errors.push({ row: i + 1, message: e instanceof Error ? e.message : '不正な行' });
      return;
    }
    const key = actualKey(entry);
    if (seen.has(key)) {
      duplicates += 1;
      errors.push({ row: i + 1, message: `${entry.period} の「${entry.unit}」は既に入力されています（同じ期・事業の重複行はスキップ）` });
      return;
    }
    seen.add(key);
    entries.push(entry);
  });

  return { entries, errors, duplicates };
}
