import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * **未来の `asOf` は、古くなるのを見張る仕組みから静かに外れていた** (2026-09-06)。
 *
 * `asOf` は「確認した時点」で、autopilot はここから経過月数を出して
 * 再確証キューを作る。ところが `monthsSince` は正規表現に当たった値の差を
 * そのまま返していたので、
 *
 *   - `2027-06` (未来) → **負の月数**。`null` でもなく `>= limit` でもないので
 *     **キューに一度も入らない** = 打ち間違い 1 つでその項目は永久に「新しい」
 *   - `2026-13`         → 同じく負 (月を検査していなかった)
 *   - `2026-00`         → もっと悪く、**9 か月前**として通る (それらしい値なので気付けない)
 *
 * 値はノートの frontmatter (`as_of:`) にも載るので、7,000 枚超が
 * 「まだ来ていない時点で確認した」と名乗ることにもなる。
 * そこで **読む側 (`monthsSince`)** と **書く側 (`assertAsOfIsPast`)** の両方で止める。
 * 実測 (2026-09-06): compliance 393 + subsidy 140 の 533 件に不正な値は 0 件。
 * つまりこれは**将来の打ち間違いに対する番人**であり、今日の不具合ではない。
 */
const req = createRequire(import.meta.url);
const { monthsSince } = req('../../../scripts/knowledge-autopilot.cjs') as {
  monthsSince: (asOf: unknown, today: Date) => number | null;
};
const { assertAsOfIsPast } = req('../../../scripts/build-knowledge-vault.cjs') as {
  assertAsOfIsPast: (entries: { id: string; asOf?: unknown }[], today?: Date) => number;
};

/** 2026-09-15 を「今日」とする (月の途中。月末・月初に依存しないため)。 */
const TODAY = new Date(2026, 8, 15);

describe('monthsSince — 読めない・暦に無い・未来は null', () => {
  it('同じ月なら 0、1 年前なら 12', () => {
    expect(monthsSince('2026-09', TODAY)).toBe(0);
    expect(monthsSince('2025-09', TODAY)).toBe(12);
    expect(monthsSince('2025-12', TODAY)).toBe(9);
  });

  it('日付つき (YYYY-MM-DD) も月で数える', () => {
    expect(monthsSince('2025-09-30', TODAY)).toBe(12);
  });

  it('★ 未来は null — 負の月数を返して「永久に新しい」を作らない', () => {
    expect(monthsSince('2026-10', TODAY)).toBeNull();
    expect(monthsSince('2027-06', TODAY)).toBeNull();
  });

  it('★ 暦に無い月は null (13 月は負、00 月は「9 か月前」に化けていた)', () => {
    expect(monthsSince('2026-13', TODAY)).toBeNull();
    expect(monthsSince('2026-00', TODAY)).toBeNull();
  });

  it('読めない値は null', () => {
    expect(monthsSince('', TODAY)).toBeNull();
    expect(monthsSince('2026-9', TODAY)).toBeNull(); // 1 桁の月は形式外
    expect(monthsSince(null, TODAY)).toBeNull();
    expect(monthsSince(undefined, TODAY)).toBeNull();
    expect(monthsSince('いつか', TODAY)).toBeNull();
  });

  it('★ 返る月数は負にならない (キューの判定 age >= limit が意味を持つ前提)', () => {
    for (const v of ['2026-09', '2026-10', '2027-01', '2020-01', '2026-13']) {
      const n = monthsSince(v, TODAY);
      if (n !== null) expect(n, v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('assertAsOfIsPast — 書く側でも止める', () => {
  const entry = (id: string, asOf?: unknown) => ({ id, asOf });

  it('過去と当月は通る。空の asOf も通る (frontmatter に出さないだけ)', () => {
    expect(assertAsOfIsPast([entry('a', '2026-09'), entry('b', '2025-01'), entry('c'), entry('d', '')], TODAY)).toBe(4);
  });

  it('★ 未来の asOf は投げる (id と値を名指しする)', () => {
    expect(() => assertAsOfIsPast([entry('ok', '2026-01'), entry('future-one', '2027-06')], TODAY)).toThrow(/future-one/);
    expect(() => assertAsOfIsPast([entry('future-one', '2026-10')], TODAY)).toThrow(/未来/);
  });

  it('★ 暦に無い月・読めない値も投げる', () => {
    expect(() => assertAsOfIsPast([entry('bad-month', '2026-13')], TODAY)).toThrow(/暦に無い月/);
    expect(() => assertAsOfIsPast([entry('bad-month', '2026-00')], TODAY)).toThrow(/暦に無い月/);
    expect(() => assertAsOfIsPast([entry('unreadable', 'いつか')], TODAY)).toThrow(/読めない/);
  });

  it('対照: 規則は当たるべき所にだけ当たる — 正しい表は 1 件も投げない', () => {
    const ok = ['2019-04', '2023-12', '2026-08', '2026-09'].map((v, i) => entry(`e${i}`, v));
    expect(() => assertAsOfIsPast(ok, TODAY)).not.toThrow();
  });

  it('★ 既定の「今日」は実行時の現在月 (引数なしでも実データを見られる)', () => {
    // 引数を省いても、当月は通り未来は投げる (既定値が効いていることの標本)。
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const key = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    expect(() => assertAsOfIsPast([entry('next', key)])).toThrow(/未来/);
  });
});
