/**
 * **会計連携の要約で、同じ月が複数行あるときの扱いを値ごとに留める。** (パス 502)
 *
 * `summarizeAccounting` は窓の両端を月の**綴り**で決める (位置に頼らない)。
 * 同じ月の行が複数在るとき、最新月の行 (`latestNet` を持つ行) は**先に在る行**で、
 * 後の同じ月の行は置き換えない (`>` で比べる)。窓の端の月そのものは、どちらを採っても
 * 同じ綴りなので影響しない。`latestNet` は画面と書面の「最新月の営業CF」になる値なので、
 * 同じ月の行が混ざった控え (複数事業の明細を並べたものなど) でどの行を採るかを決めておく。
 */
import { describe, expect, it } from 'vitest';
import { summarizeAccounting } from '../accounting';

const row = (month: string, net: number) => ({ month, income: net, expense: 0, net });

describe('summarizeAccounting — 同じ月が複数行あるとき (パス 502)', () => {
  it('★ 最新月が重なるとき、latestNet は先に在る行の値 (後の行で置き換えない)', () => {
    const s = summarizeAccounting([row('2026-01', 10), row('2026-03', 111), row('2026-03', 999), row('2026-02', 20)])!;
    expect(s.latestMonth).toBe('2026-03');
    expect(s.latestNet).toBe(111);
  });

  it('★ 順序を入れ替えても、先に在る行が最新月の行になる (位置ではなく先着)', () => {
    const s = summarizeAccounting([row('2026-03', 999), row('2026-03', 111), row('2026-01', 10)])!;
    expect(s.latestMonth).toBe('2026-03');
    expect(s.latestNet).toBe(999);
  });

  it('★ 最初の月が重なっても、firstMonth はその月の綴り (合計・件数は全行)', () => {
    const s = summarizeAccounting([row('2026-02', 5), row('2026-01', 10), row('2026-01', 20), row('2026-03', 7)])!;
    expect(s.firstMonth).toBe('2026-01');
    expect(s.latestMonth).toBe('2026-03');
    expect(s.months).toBe(4);
    expect(s.totalNet).toBe(42);
  });

  it('★ 1 行だけなら、最初の月と最新月は同じ行', () => {
    const s = summarizeAccounting([row('2026-07', 5)])!;
    expect(s.firstMonth).toBe('2026-07');
    expect(s.latestMonth).toBe('2026-07');
    expect(s.latestNet).toBe(5);
  });

  it('★ 月の綴りは辞書順で比べる (年をまたぐ並びでも正しい端を採る)', () => {
    const s = summarizeAccounting([row('2027-01', 3), row('2026-12', 2), row('2026-02', 1)])!;
    expect(s.firstMonth).toBe('2026-02');
    expect(s.latestMonth).toBe('2027-01');
    expect(s.latestNet).toBe(3);
  });
});
