import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/knowledge-autopilot.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { weekIndex, shardOffset } = req('../../../scripts/knowledge-autopilot.cjs') as {
  weekIndex: (d: Date) => number;
  shardOffset: (week: number, shardSize: number, total: number) => number;
};

/** 通し週 `weeks` 回ぶんのシャードが覆う位置の集合。 */
function coveredPositions(weeks: number[], shardSize: number, total: number): Set<number> {
  const seen = new Set<number>();
  for (const w of weeks) {
    const off = shardOffset(w, shardSize, total);
    for (let i = 0; i < shardSize; i += 1) seen.add((off + i) % total);
  }
  return seen;
}

describe('weekIndex', () => {
  it('7 日ごとに 1 進む', () => {
    const a = weekIndex(new Date(Date.UTC(2026, 7, 15)));
    expect(weekIndex(new Date(Date.UTC(2026, 7, 22)))).toBe(a + 1);
    expect(weekIndex(new Date(Date.UTC(2026, 7, 29)))).toBe(a + 2);
  });

  it('同じ週のうちは動かない', () => {
    const a = weekIndex(new Date(Date.UTC(2026, 7, 15)));
    for (let d = 15; d < 22; d += 1) {
      const w = weekIndex(new Date(Date.UTC(2026, 7, d)));
      expect(w === a || w === a + 1).toBe(true);
    }
  });

  // ここが以前の不具合。ISO 週番号は毎年 1 に戻るので、シャードが前へ進まなかった。
  it('年をまたいでも戻らない（単調増加）', () => {
    const dec = weekIndex(new Date(Date.UTC(2026, 11, 28)));
    const jan = weekIndex(new Date(Date.UTC(2027, 0, 4)));
    expect(jan).toBeGreaterThan(dec);
    expect(weekIndex(new Date(Date.UTC(2030, 0, 1)))).toBeGreaterThan(jan);
  });

  it('日付だけで決まる（--today で再現できる）', () => {
    const d = new Date(Date.UTC(2026, 7, 15));
    expect(weekIndex(d)).toBe(weekIndex(new Date(Date.UTC(2026, 7, 15))));
  });
});

describe('shardOffset', () => {
  it('URL 数の範囲に収まる', () => {
    for (const w of [0, 1, 53, 1000, 99999]) {
      const off = shardOffset(w, 400, 12229);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(12229);
    }
  });

  it('URL が 0 件でも落ちない', () => {
    expect(shardOffset(5, 400, 0)).toBe(0);
  });

  it('シャード幅が URL 数より広くても範囲内', () => {
    const off = shardOffset(3, 50000, 100);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(100);
  });

  it('週が進めば起点も進む', () => {
    expect(shardOffset(10, 400, 12229)).not.toBe(shardOffset(11, 400, 12229));
  });
});

describe('ローテーションが全 URL を覆うこと', () => {
  const TOTAL = 12229;
  const SHARD = 400;

  it('ceil(総数 / 幅) 週で全件を覆う', () => {
    const need = Math.ceil(TOTAL / SHARD);
    const weeks = Array.from({ length: need }, (_, i) => i);
    expect(coveredPositions(weeks, SHARD, TOTAL).size).toBe(TOTAL);
  });

  it('どの週から始めても一巡すれば全件を覆う（起点に依存しない）', () => {
    const need = Math.ceil(TOTAL / SHARD);
    for (const start of [0, 7, 2953]) {
      const weeks = Array.from({ length: need }, (_, i) => start + i);
      expect(coveredPositions(weeks, SHARD, TOTAL).size, `start=${start}`).toBe(TOTAL);
    }
  });

  // 以前の実装（ISO 週 1..53 が毎年繰り返す）を再現し、覆えないことを固定する。
  // 「直したつもり」で元に戻したときに、この差がテストとして残る。
  it('週番号が 1..53 で循環すると、何年回しても大半が覆われない', () => {
    const isoWeeks = Array.from({ length: 53 }, (_, i) => i + 1);
    const covered = coveredPositions(isoWeeks, 100, TOTAL);
    expect(covered.size).toBe(5300);
    expect(covered.size / TOTAL).toBeLessThan(0.44);
    // 何年繰り返しても同じ集合にしかならない。
    const tenYears = Array.from({ length: 10 }, () => isoWeeks).flat();
    expect(coveredPositions(tenYears, 100, TOTAL).size).toBe(covered.size);
  });
});
