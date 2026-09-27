/**
 * **記録 ⇄ CSV の往復で、欄が消えないこと。** (2026-09-23 · パス 429)
 *
 * このアプリは記録を CSV で書き出し、同じ CSV を読み戻せる (売上集計 · KPI 実績)。
 * その往復で欄が落ちると、利用者は**消えたことに気付けない** —— 画面には
 * 「N 件取り込みました」と出て、落ちた欄だけが静かに空になる。
 *
 * ## 実測 (2026-09-23 · 直す前)
 *
 * `KPI_CSV_COLUMNS` は **7 列**で、記録の形 (`COLLECTION_SHAPES['kpi-actuals']`) は
 * **8 欄** (`laborCost` = 人件費) を宣言していた。取り込み側も `laborCost` を
 * `parseKpiActual` へ渡していなかったので、**書き出しが落とし、取り込みも読めない**:
 *
 * | 操作 | 人件費 | 労働分配率 | 人件費率 | 一人当たり人件費 |
 * | --- | ---: | ---: | ---: | ---: |
 * | 画面で入力 | 2,500,000 | 41.7% | 25% | 833,333 |
 * | **書き出して読み戻す** | **消える** | **null** | **null** | **null** |
 *
 * ★ **消えた先が紙である** —— 人件費は金融機関等提出用の書面の「人件費」の行と
 * 損益計算書の「（うち 人件費）」に入り、付加価値 (= 営業利益 + 人件費 + 減価償却費)
 * の算定にも入る。往復した控えで書面を出すと、その行が空欄になる。
 *
 * ★ **既存の検査は往復の等値を主張していた** —— `kpiActualsCsv.test.ts` の
 * `expect(entries).toEqual(ROWS)` は正しい不変条件だが、`ROWS` に `laborCost` が
 * 無かったので**標本が母集団を見分けられなかった**。だからここでは標本を
 * **形の宣言から組み立て**、欄が 1 つ増えた日に黙らないようにする。
 *
 * ## 母集団は走査で導く
 *
 * 手で 2 つ並べると 3 つ目の往復が足された日に黙る。`data/` を走査して
 * CSV を組み立てるモジュールを全部拾い、種類つきの台帳と**両方向**に突き合わせる。
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readOriginalSource, readOriginalDir } from '../../../shared/__tests__/originalSource';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { SALES_COLLECTION, type SalesEntry } from '../sales';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../kpiActuals';
import { SALES_CSV_COLUMNS, salesToCsv, salesFromCsv } from '../salesCsv';
import { KPI_CSV_COLUMNS, kpiActualsToCsv, kpiActualsFromCsv } from '../kpiActualsCsv';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const DATA_DIR = resolve(__dirname, '..');

/** 注記と文字列を落とす —— 説明の中の言及を宣言と数えないため (法則 `mention-vs-declaration`)。 */
/**
 * CSV を組み立てるモジュールの種類。
 *
 * `record-roundtrip` = 保管した記録を書き出し、**同じ形式で読み戻す**。
 * `report-only`      = 読み戻す口が無い (人が読む帳票)。**欄の被覆は要求しない** ——
 *                      帳票は記録の写しではなく、選んだ行を並べた物だからである。
 */
interface CsvModule {
  readonly file: string;
  readonly kind: 'record-roundtrip' | 'report-only';
  /** `record-roundtrip` のとき、その記録の collection 名。 */
  readonly collection?: string;
  readonly why: string;
}

const CSV_MODULES: readonly CsvModule[] = [
  {
    file: 'salesCsv.ts',
    kind: 'record-roundtrip',
    collection: SALES_COLLECTION,
    why: '売上集計の「CSV 書き出し」と「CSV 取り込み」が同じ形式で往復する。',
  },
  {
    file: 'kpiActualsCsv.ts',
    kind: 'record-roundtrip',
    collection: KPI_ACTUALS_COLLECTION,
    why: 'KPI 実績の「CSV 書き出し」と「CSV 取り込み」が同じ形式で往復する。',
  },
  {
    file: 'financialCsv.ts',
    kind: 'report-only',
    why: '財務比率と計算書類の帳票。読み戻す口が無く (`parseCsvRecords` を 1 度も呼ばない)、行は記録ではなく算定した値である。',
  },
];

/** 実装から母集団を導く: `data/` で CSV の行を組み立てているファイル。 */
function csvBuildingFiles(): string[] {
  return readOriginalDir(DATA_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'csv.ts')
    .filter((f) => /\b(recordsToCsv|toCsv)\s*\(/.test(stripComments(readOriginalSource(resolve(DATA_DIR, f)))))
    .sort();
}

const COLUMNS: Readonly<Record<string, readonly string[]>> = {
  [SALES_COLLECTION]: SALES_CSV_COLUMNS,
  [KPI_ACTUALS_COLLECTION]: KPI_CSV_COLUMNS,
};

function shapeFields(collection: string): readonly string[] {
  const shape = (COLLECTION_SHAPES as Record<string, { fields: readonly string[] } | undefined>)[collection];
  if (!shape) throw new Error(`形の宣言が無い collection: ${collection}`);
  return shape.fields;
}

const ROUNDTRIP = CSV_MODULES.filter((m) => m.kind === 'record-roundtrip');

describe('CSV の列は記録の形をすべて覆う (パス 429)', () => {
  it('母集団を走査で導き、台帳と両方向に突き合わせる', () => {
    const found = csvBuildingFiles();
    // 走査が死んで「0 件だから健全」にならないための床。
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found).toEqual([...CSV_MODULES].map((m) => m.file).sort());
  });

  it('台帳のどの行も、理由を書いてある', () => {
    for (const m of CSV_MODULES) {
      expect(m.why.length, m.file).toBeGreaterThanOrEqual(15);
      expect(m.why, m.file).not.toMatch(/^同上[。）)]?$/);
    }
    // 標本: 針が禁じたい文面に当たる (法則 `absence-sample`)。
    expect('同上。').toMatch(/^同上[。）)]?$/);
  });

  it('★ record-roundtrip の列は、その形が宣言する欄と過不足なく一致する', () => {
    expect(ROUNDTRIP.length).toBeGreaterThanOrEqual(2);
    for (const m of ROUNDTRIP) {
      const cols = COLUMNS[m.collection!];
      expect(cols, `${m.file} の列の台帳が無い`).toBeDefined();
      const fields = shapeFields(m.collection!);
      // 書き出しが落とす欄が無いこと (この欠陥そのもの)。
      expect([...fields].filter((f) => !cols!.includes(f)), `${m.file}: 書き出しが落とす欄`).toEqual([]);
      // 逆向き: 形に無い列を書き出していないこと (読み戻す先が無い)。
      expect([...cols!].filter((c) => !fields.includes(c)), `${m.file}: 形に無い列`).toEqual([]);
    }
  });

  it('report-only は読み戻す口を持たない (だから欄の被覆を要求しない)', () => {
    for (const m of CSV_MODULES.filter((x) => x.kind === 'report-only')) {
      const src = stripComments(readOriginalSource(resolve(DATA_DIR, m.file)));
      expect(src, m.file).not.toMatch(/\bparseCsvRecords\s*\(/);
    }
    // 標本: 針は往復する側には当たる。
    expect(stripComments(readOriginalSource(resolve(DATA_DIR, 'kpiActualsCsv.ts')))).toMatch(/\bparseCsvRecords\s*\(/);
  });
});

describe('★ 振る舞い: 全欄を埋めた記録は、往復しても 1 欄も変わらない', () => {
  /** 標本は**形の宣言から**組み立てる —— 欄を並べて書くと 9 つ目が足された日に黙る。 */
  function assertCoversShape(collection: string, sample: Record<string, unknown>): void {
    expect([...Object.keys(sample)].sort(), `${collection} の標本が形の全欄を持たない`).toEqual(
      [...shapeFields(collection)].sort(),
    );
  }

  it('売上: 全 5 欄が往復する', () => {
    const sample: SalesEntry = {
      date: '2026-08-01', channel: 'other', amount: 123_456, orders: 7, note: 'メモ, 引用" と改行\nあり',
    };
    assertCoversShape(SALES_COLLECTION, sample);
    const back = salesFromCsv(salesToCsv([sample]));
    expect(back.errors).toEqual([]);
    expect(back.entries[0]).toEqual(sample);
  });

  it('KPI: 全 8 欄が往復する (人件費を含む)', () => {
    const sample: KpiActual = {
      period: '2026-08', unit: 'EC', revenue: 10_000_000, cogs: 4_000_000,
      advertising: 500_000, sga: 3_000_000, depreciation: 200_000, laborCost: 2_500_000,
    };
    assertCoversShape(KPI_ACTUALS_COLLECTION, sample);
    const back = kpiActualsFromCsv(kpiActualsToCsv([sample]));
    expect(back.errors).toEqual([]);
    expect(back.entries[0]).toEqual(sample);
  });

  it('★ 人件費は書き出しの本文に実際に載る (列名だけでは往復しない)', () => {
    const csv = kpiActualsToCsv([
      { period: '2026-08', unit: 'EC', revenue: 100, cogs: 10, advertising: 10, sga: 90, depreciation: 10, laborCost: 77 },
    ]);
    const [header, row] = csv.split('\r\n');
    expect(header!.split(',')).toContain('laborCost');
    expect(row!.split(',')).toContain('77');
  });

  it('★ 取り込みは列を読む —— 手で laborCost 列を足した CSV も反映される', () => {
    const csv = 'period,unit,revenue,cogs,advertising,sga,depreciation,laborCost\r\n2026-08,EC,100,10,10,90,10,55';
    expect(kpiActualsFromCsv(csv).entries[0]?.laborCost).toBe(55);
  });
});

describe('後方互換と、答えの変わらなさ', () => {
  it('人件費の列が無い古い CSV は今までどおり読め、欄を持たない', () => {
    const old7 = 'period,unit,revenue,cogs,advertising,sga,depreciation\r\n2026-08,EC,100,10,10,10,10';
    const r = kpiActualsFromCsv(old7);
    expect(r.errors).toEqual([]);
    expect(r.entries[0]).toEqual({
      period: '2026-08', unit: 'EC', revenue: 100, cogs: 10, advertising: 10, sga: 10, depreciation: 10,
    });
    expect('laborCost' in r.entries[0]!).toBe(false);
  });

  it('人件費を入れていない記録は、往復しても欄が生えない', () => {
    const sample: KpiActual = {
      period: '2026-08', unit: 'EC', revenue: 100, cogs: 10, advertising: 10, sga: 10, depreciation: 10,
    };
    const back = kpiActualsFromCsv(kpiActualsToCsv([sample])).entries[0]!;
    expect(back).toEqual(sample);
    expect('laborCost' in back).toBe(false);
  });

  it('★ 答えが変わる入力: 人件費 > 販管費 の CSV は、画面と同じ文面で断られる', () => {
    // 直す前は黙って無視されていた。関係の台帳は 1 つ (`recordRelations.ts`) なので、
    // 取り込みも画面と同じ判定を通る。
    const csv = 'period,unit,revenue,cogs,advertising,sga,depreciation,laborCost\r\n2026-08,EC,100,10,10,10,10,99';
    const r = kpiActualsFromCsv(csv);
    expect(r.entries).toEqual([]);
    expect(r.errors[0]?.message).toBe('人件費は販管費以下で入力してください');
  });
});
