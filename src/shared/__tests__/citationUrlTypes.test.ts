import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `lint:citations` の「同じ URL は同じ種別」規則 (2026-09-05)。
 *
 * 確証ゲートは出典の **type** で権威を数える。同じ資料が項目によって 'academic' だったり 'media' だったり
 * すると、同じ根拠で片方だけがゲートを満たす。実測で 11,171 URL 中 45 件が 2 種別以上を持ち、6 件は
 * 権威の境界をまたいでいた (e-gov の会社法が 1 件だけ 'reference'、国民生活センターが 1 件だけ 'media'、
 * IEEE Spectrum の同じ記事が academic ×2 / media ×1)。鳴る標本と通る対照を留める。
 */
const req = createRequire(import.meta.url);
const { checkUrlTypes, normalizeSourceUrl } = req('../../../scripts/lint-citations.cjs') as {
  checkUrlTypes: (entries: { id: string; collection?: string; sources: unknown[] }[]) => {
    conflicts: { url: string; vocabulary: string; types: { type: string; ids: string[] }[] }[];
    multiCited: number;
    urls: number;
  };
  normalizeSourceUrl: (url: string) => string;
};

const entry = (id: string, url: string, type: string, collection?: string) => ({ id, collection, sources: [{ url, type, label: 'l' }] });

describe('normalizeSourceUrl', () => {
  it('http→https・ホストとパスの大小・末尾の / ・#fragment を同じ資料として畳む', () => {
    const want = 'https://laws.e-gov.go.jp/law/129ac0000000089';
    expect(normalizeSourceUrl('https://laws.e-gov.go.jp/law/129AC0000000089')).toBe(want);
    expect(normalizeSourceUrl('https://laws.e-gov.go.jp/law/129AC0000000089/')).toBe(want);
    expect(normalizeSourceUrl('http://LAWS.e-gov.go.jp/law/129ac0000000089#Mp-At_435')).toBe(want);
    expect(normalizeSourceUrl('  https://laws.e-gov.go.jp/law/129ac0000000089  ')).toBe(want);
  });

  it('対照: クエリは資料を選ぶので残し、URL でない文字列は落とさず小文字化だけする', () => {
    expect(normalizeSourceUrl('https://www.politybooks.com/bookdetail?book_slug=Platform-Capitalism'))
      .toBe('https://www.politybooks.com/bookdetail?book_slug=Platform-Capitalism');
    expect(normalizeSourceUrl('Not A Url')).toBe('not a url');
  });
});

describe('checkUrlTypes', () => {
  it('★ 標本: 同じ URL が academic と media を持つと、URL と種別ごとの項目つきで鳴る', () => {
    const r = checkUrlTypes([
      entry('a', 'https://spectrum.ieee.org/metcalfes-law-is-wrong', 'academic', 'academic'),
      entry('b', 'https://spectrum.ieee.org/metcalfes-law-is-wrong', 'academic', 'academic'),
      entry('c', 'https://spectrum.ieee.org/metcalfes-law-is-wrong', 'media', 'academic'),
    ]);
    expect(r.conflicts).toEqual([
      {
        url: 'https://spectrum.ieee.org/metcalfes-law-is-wrong',
        vocabulary: 'academic',
        types: [
          { type: 'academic', ids: ['academic:a', 'academic:b'] },
          { type: 'media', ids: ['academic:c'] },
        ],
      },
    ]);
  });

  it('★ 標本: 表記ゆれ (大小・末尾 / ・http・#fragment) でも同じ URL として鳴る', () => {
    const r = checkUrlTypes([
      entry('a', 'https://laws.e-gov.go.jp/law/129AC0000000089', 'government'),
      entry('b', 'http://laws.e-gov.go.jp/law/129ac0000000089/#Mp-At_435', 'reference'),
    ]);
    expect(r.conflicts.map((c) => c.url)).toEqual(['https://laws.e-gov.go.jp/law/129ac0000000089']);
    expect(r.conflicts[0]?.types.map((t) => t.type).sort()).toEqual(['government', 'reference']);
  });

  it('対照: 同じ URL が同じ種別なら鳴らず、別の URL は別の種別でよく、クエリが違えば別の URL', () => {
    const r = checkUrlTypes([
      entry('a', 'https://x.example/a', 'academic'),
      entry('b', 'https://x.example/a/', 'academic'),
      entry('c', 'https://x.example/b', 'media'),
      entry('d', 'https://x.example/c?p=1', 'academic'),
      entry('e', 'https://x.example/c?p=2', 'media'),
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it('対照: 語彙の違うコレクション (academic の reference ⇄ compliance の media) は比べず、同じ語彙 (econ-history) なら鳴る', () => {
    const across = checkUrlTypes([
      entry('a', 'https://www.jpx.co.jp/regulation/preventing/insider/index.html', 'reference', 'academic'),
      entry('b', 'https://www.jpx.co.jp/regulation/preventing/insider/index.html', 'media', 'compliance'),
    ]);
    expect(across.conflicts).toEqual([]);
    expect(across.urls).toBe(2);
    const within = checkUrlTypes([
      entry('a', 'https://x.example/a', 'reference', 'academic'),
      entry('b', 'https://x.example/a', 'media', 'econ-history'),
    ]);
    expect(within.conflicts.map((c) => [c.vocabulary, c.url])).toEqual([['academic', 'https://x.example/a']]);
  });

  it('生存確認: 2 回以上引かれた URL を種別に関係なく数え、urls は正規化後の URL 数', () => {
    const r = checkUrlTypes([
      entry('a', 'https://x.example/a', 'academic'),
      entry('b', 'https://x.example/A/', 'academic'),
      entry('c', 'https://x.example/b', 'media'),
    ]);
    expect(r.multiCited).toBe(1);
    expect(r.urls).toBe(2);
  });

  it('対照: 出典が配列でない・null・url や type が文字列でない項目は落ちずに飛ばす', () => {
    const r = checkUrlTypes([
      { id: 'a', sources: [null, 42, { url: 7, type: 'academic' }, { url: 'https://x.example/a' }] },
      { id: 'b', sources: 'nope' as unknown as unknown[] },
    ]);
    expect(r.conflicts).toEqual([]);
    expect(r.urls).toBe(0);
  });
});
