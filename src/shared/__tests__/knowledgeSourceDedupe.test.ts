import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// scripts/knowledge-autopilot.cjs は CJS (Node スクリプト) 設計のため、テストだけが createRequire で読み込む。
const req = createRequire(import.meta.url);
const { firstSourceDoi, sourceDedupeSuspects } = req('../../../scripts/knowledge-autopilot.cjs') as {
  firstSourceDoi: (entry: { sources?: unknown[] }) => string | null;
  sourceDedupeSuspects: (
    entries: { id: string; collection: string; sources?: unknown[] }[],
    distinct: Set<string>,
  ) => { a: string; b: string; doi: string }[];
};

const src = (url: string) => ({ url, type: 'academic', label: 'x' });
const entry = (id: string, urls: string[], collection = 'academic') => ({ id, collection, sources: urls.map(src) });

describe('firstSourceDoi — 第一出典から DOI を取り出す', () => {
  it('doi.org の URL から DOI を取り出す', () => {
    expect(firstSourceDoi(entry('a', ['https://doi.org/10.1037/0022-3514.52.3.511']))).toBe('10.1037/0022-3514.52.3.511');
  });

  it('出版社ページに埋め込まれた DOI も拾う（SAGE / AEA のパーセント符号化）', () => {
    expect(firstSourceDoi(entry('a', ['https://journals.sagepub.com/doi/10.1177/014920639201800306']))).toBe(
      '10.1177/014920639201800306',
    );
    expect(firstSourceDoi(entry('a', ['https://www.aeaweb.org/articles?id=10.1257%2F0002828054825691']))).toBe(
      '10.1257/0002828054825691',
    );
  });

  it('大文字小文字と末尾の句読点は正規化する', () => {
    expect(firstSourceDoi(entry('a', ['https://doi.org/10.1093/QJE/QJT001.']))).toBe('10.1093/qje/qjt001');
  });

  it('DOI でない URL（e-Gov 法令・Wikipedia）や出典なしは null', () => {
    expect(firstSourceDoi(entry('a', ['https://laws.e-gov.go.jp/law/417AC0000000086']))).toBeNull();
    expect(firstSourceDoi(entry('a', ['https://en.wikipedia.org/wiki/Attachment_in_adults']))).toBeNull();
    expect(firstSourceDoi({ sources: [] })).toBeNull();
    expect(firstSourceDoi({})).toBeNull();
  });

  it('第一出典だけを見る（2 番目以降の DOI は無視）', () => {
    expect(firstSourceDoi(entry('a', ['https://en.wikipedia.org/wiki/X', 'https://doi.org/10.1037/0022-3514.52.3.511']))).toBeNull();
  });
});

describe('sourceDedupeSuspects — 第一出典の DOI が同じペア', () => {
  const HS = 'https://doi.org/10.1037/0022-3514.52.3.511';

  it('標本: 同一コレクションで第一出典の DOI が同じ 2 件を 1 ペアとして鳴らす', () => {
    const out = sourceDedupeSuspects([entry('human-b', [HS]), entry('human-a', [HS, 'https://example.org/x'])], new Set());
    expect(out).toEqual([{ a: 'human-a', b: 'human-b', doi: '10.1037/0022-3514.52.3.511' }]);
  });

  it('DOI の表記ゆれ（doi.org と出版社ページ・大文字）でも同じ鍵に束ねる', () => {
    const out = sourceDedupeSuspects(
      [entry('a', ['https://doi.org/10.1111/J.1540-6261.1994.TB04418.X']), entry('b', ['https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.1994.tb04418.x'])],
      new Set(),
    );
    expect(out).toHaveLength(1);
  });

  it('3 件の塊は 3 ペアに展開し、a<b で並べる', () => {
    const out = sourceDedupeSuspects([entry('c', [HS]), entry('a', [HS]), entry('b', [HS])], new Set());
    expect(out.map((p) => `${p.a}|${p.b}`)).toEqual(['a|b', 'a|c', 'b|c']);
  });

  it('対照: 裁定済み「別概念」ペアは除外する', () => {
    const out = sourceDedupeSuspects([entry('a', [HS]), entry('b', [HS])], new Set(['a|b']));
    expect(out).toEqual([]);
  });

  it('対照: コレクションが違えば鳴らない（学術⇄法令実務の同名併存は意図的）', () => {
    const out = sourceDedupeSuspects([entry('a', [HS], 'academic'), entry('b', [HS], 'compliance')], new Set());
    expect(out).toEqual([]);
  });

  it('対照: DOI でない共通の第一出典（e-Gov 会社法）は鍵にしない', () => {
    const law = 'https://laws.e-gov.go.jp/law/417AC0000000086';
    const out = sourceDedupeSuspects([entry('a', [law]), entry('b', [law]), entry('c', [law])], new Set());
    expect(out).toEqual([]);
  });

  it('対照: 第一出典が違えば、2 番目に同じ DOI があっても鳴らない', () => {
    const out = sourceDedupeSuspects(
      [entry('a', ['https://doi.org/10.1037/0022-3514.61.2.226', HS]), entry('b', [HS])],
      new Set(),
    );
    expect(out).toEqual([]);
  });
});
