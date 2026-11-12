import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * autopilot の `missingKeyFigures` キュー (2026-09-05)。
 *
 * 生ファイルの正規表現で「210 件が keyFigures を持たない」と誤認したのが導入の動機で、
 * 正規化後に数え直すと欠落は 0 件だった (複数行の keyFigures を見落としていた)。
 * それでも欠落すれば概念表の「提唱者・初出」列が黙って空になり、増強キューは
 * summary の長さしか見ないので気付けない。以後の欠落を止める番犬として残す。
 * 標本 (欠落は鳴る) と対照 (空白だけ・他コレクション・値あり) を留める。
 */
const req = createRequire(import.meta.url);
const { missingKeyFiguresSuspects } = req('../../../scripts/knowledge-autopilot.cjs') as {
  missingKeyFiguresSuspects: (entries: { id: string; collection: string; meta?: unknown }[]) => { id: string; collection: string }[];
};

const withKf = (id: string, value: string | null | undefined, collection = 'academic') => ({
  id,
  collection,
  meta: [{ label: '提唱者・初出', value }],
});

describe('missingKeyFiguresSuspects', () => {
  it('★ 標本: meta に「提唱者・初出」が無い／値が空／null の学術項目を鳴らす (id 順)', () => {
    const out = missingKeyFiguresSuspects([
      { id: 'econ-b', collection: 'academic' },
      withKf('econ-a', ''),
      withKf('mgmt-c', null),
      withKf('human-d', '   '),
    ]);
    expect(out).toEqual([
      { id: 'econ-a', collection: 'academic' },
      { id: 'econ-b', collection: 'academic' },
      { id: 'human-d', collection: 'academic' },
      { id: 'mgmt-c', collection: 'academic' },
    ]);
  });

  it('対照: 値があれば鳴らない', () => {
    expect(missingKeyFiguresSuspects([withKf('econ-a', 'ジョン・ナッシュ（1950 提唱）')])).toEqual([]);
  });

  it('対照: 学術以外のコレクションは keyFigures を持たない設計なので見ない', () => {
    expect(missingKeyFiguresSuspects([{ id: 'tax-x', collection: 'compliance' }, withKf('subsidy-y', '', 'subsidy')])).toEqual([]);
  });

  it('対照: meta が配列でなくても落ちない', () => {
    expect(missingKeyFiguresSuspects([{ id: 'econ-z', collection: 'academic', meta: 'nope' }])).toEqual([{ id: 'econ-z', collection: 'academic' }]);
  });
});
