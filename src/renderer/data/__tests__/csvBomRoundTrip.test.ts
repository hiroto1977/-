/**
 * **自分が書き出した CSV を、自分で読み戻せる** (2026-09-23 · パス 428)。
 *
 * ## 直す前の実測
 *
 * 書き出しは 3 画面が**それぞれ生の不可視文字 (U+FEFF · BOM) を先頭に足して**
 * おり (Excel が UTF-8 を読むために要る)、取り込みはその印を**どこでも剥がして
 * いなかった**。結果:
 *
 * | 読ませる物 | 売上の取り込み | KPI の取り込み |
 * | --- | --- | --- |
 * | `salesToCsv(...)` (印なし) | 1 件 ✅ | 通る ✅ |
 * | **画面が Blob へ入れる物そのもの** | **0 件・「日付は YYYY-MM-DD 形式で入力してください」** | **0 件・「期間は YYYY-MM 形式で入力してください」** |
 *
 * ★ **断りの文が、それを読む利用者に対して証明可能に偽だった** —— 日付は
 * `2026-08-01` で、まさにその形式である。BOM は画面に 1 文字も見えないので、
 * 利用者は正しい欄を直し続けることになる。
 *
 * ★ **外から来る CSV でも同じ** —— Excel の「CSV UTF-8」は常にこの印を付ける。
 *
 * ## 検査の形
 *
 * 背骨は**振る舞い**: 画面が実際に Blob へ入れるのと同じ文字列を作って
 * 取り込みへ渡し、**行が戻ること**を見る。加えて母集団を**走査で導き**
 * (`text/csv` の Blob を組む所)、**書き出しが付ける印と取り込みが剥がす印が
 * 同じ 1 つ**であることを両方向で留める。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { CSV_BOM, parseCsv, parseCsvRecords } from '../csv';
import { salesToCsv, salesFromCsv } from '../salesCsv';
import { kpiActualsToCsv, kpiActualsFromCsv } from '../kpiActualsCsv';
import type { SalesEntry } from '../sales';
import type { KpiActual } from '../kpiActuals';

const SALES: readonly SalesEntry[] = [
  { date: '2026-08-01', channel: 'shopify', amount: 500_000, orders: 1, note: 'メモ' },
];

const KPI: readonly KpiActual[] = [
  { period: '2026-08', unit: 'A', revenue: 1_000_000, cogs: 400_000, advertising: 0, sga: 100_000, depreciation: 0 },
];

describe('書き出した CSV を読み戻せる (BOM)', () => {
  it('★ 売上: 画面が Blob へ入れる物そのものを読み戻せる', () => {
    const exported = CSV_BOM + salesToCsv(SALES); // SalesPage.tsx の書き出しと同じ形
    const back = salesFromCsv(exported);
    expect(back.errors).toEqual([]);
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0]?.date).toBe('2026-08-01');
    expect(back.entries[0]?.amount).toBe(500_000);
  });

  it('★ KPI: 画面が Blob へ入れる物そのものを読み戻せる', () => {
    const exported = CSV_BOM + kpiActualsToCsv(KPI); // KpiPage.tsx の書き出しと同じ形
    const back = kpiActualsFromCsv(exported);
    expect(back.errors).toEqual([]);
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0]?.period).toBe('2026-08');
    expect(back.entries[0]?.revenue).toBe(1_000_000);
  });

  it('★ 外から来る CSV (Excel の「CSV UTF-8」) も同じく読める', () => {
    const excel = `${CSV_BOM}date,channel,amount,orders,note\r\n2026-08-01,shopify,500000,1,メモ\r\n`;
    const back = salesFromCsv(excel);
    expect(back.errors).toEqual([]);
    expect(back.entries).toHaveLength(1);
  });

  it('標本が的に当たる — 剥がさなければ最初の列名が壊れる', () => {
    // 針が本当にこの欠陥を再現できることを、製品を壊さずに示す。
    const header = `${CSV_BOM}date,amount`;
    const withMark = header.split('\n')[0]!;
    expect(withMark.startsWith(CSV_BOM)).toBe(true);
    // 剥がさない読み方をすると、1 列目の名前に印が残る。
    expect(withMark.split(',')[0]).not.toBe('date');
    // 剥がせば `date` になる。
    expect(parseCsv(header)[0]?.[0]).toBe('date');
  });

  it('印は先頭の 1 つだけ外す (途中の U+FEFF は利用者のデータ)', () => {
    const rows = parseCsv(`${CSV_BOM}a,b\n1,x${CSV_BOM}y\n`);
    expect(rows[0]).toEqual(['a', 'b']);
    expect(rows[1]).toEqual(['1', `x${CSV_BOM}y`]);
  });

  it('印が無い CSV の答えは 1 つも変わらない', () => {
    const plain = salesToCsv(SALES);
    expect(salesFromCsv(plain).entries).toEqual(salesFromCsv(CSV_BOM + plain).entries);
    expect(parseCsvRecords(plain)).toEqual(parseCsvRecords(CSV_BOM + plain));
  });
});

/**
 * **付ける側と外す側は同じ 1 つを読む** (法則 `center-then-count-callers`)。
 *
 * 母集団は走査で導く —— `text/csv` の Blob / ダウンロードを組む所。3 画面が
 * それぞれ生の不可視文字を書いていたのが、この欠陥が 3 か所で同時に成立した
 * 理由である。生のままだと `lint:charset` の台帳に理由を書くことになり、
 * 「Excel のために要る」とだけ書けて**剥がす側が居ないこと**は誰も問わない。
 */
const CSV_WRITERS = ['../../pages/SalesPage.tsx', '../../pages/KpiPage.tsx', '../../components/FinancialAnalysis.tsx'] as const;

function csvWriterFiles(): string[] {
  const out: string[] = [];
  for (const rel of CSV_WRITERS) {
    const src = readOriginalSource(path.resolve(__dirname, rel));
    if (/text\/csv/.test(src)) out.push(rel);
  }
  return out;
}

describe('CSV の印は 1 つの定数から出る', () => {
  it('走査が空虚でない (text/csv を組む画面が 3 枚とも在る)', () => {
    expect(csvWriterFiles()).toEqual([...CSV_WRITERS]);
  });

  it('★ 書き出す画面は生の不可視文字ではなく CSV_BOM を読む', () => {
    for (const rel of csvWriterFiles()) {
      const src = readOriginalSource(path.resolve(__dirname, rel));
      expect(src, `${rel} に生の U+FEFF が残っている`).not.toContain(CSV_BOM);
      expect(src, `${rel} が CSV_BOM を読んでいない`).toContain('CSV_BOM');
    }
  });

  it('★ 取り込みの漏斗は、その同じ定数で剥がす', () => {
    const src = readOriginalSource(path.resolve(__dirname, '../csv.ts'));
    // `parseCsv` が `CSV_BOM` を使って先頭を落としていること (綴りではなく
    // 振る舞いは上の describe が見る。ここは「2 つ目の定数が生えない」側)。
    expect(src).toContain('text.startsWith(CSV_BOM)');
    // 生の不可視文字は 1 文字も無い (escape で書く)。
    expect(src).not.toContain(CSV_BOM);
  });
});
