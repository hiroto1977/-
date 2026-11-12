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

// --- 2026-09-05: 任意の位置の出典 DOI 共有 + id 類似（dedupeShared） ---
const { sourceDois, sharedSourceDedupeSuspects, idSimilarity, SHARED_ID_SIMILARITY } = req(
  '../../../scripts/knowledge-autopilot.cjs',
) as {
  sourceDois: (entry: { sources?: unknown[] }) => string[];
  sharedSourceDedupeSuspects: (
    entries: { id: string; collection: string; sources?: unknown[] }[],
    distinct: Set<string>,
  ) => { a: string; b: string; dois: string[]; idSimilarity: number }[];
  idSimilarity: (a: string, b: string) => number;
  SHARED_ID_SIMILARITY: number;
};

describe('sourceDois — 出典のすべての位置から DOI を集める', () => {
  it('位置を問わず拾い、表記ゆれは畳み、重複は 1 つにする', () => {
    expect(
      sourceDois(
        entry('a', [
          'https://en.wikipedia.org/wiki/X',
          'https://doi.org/10.1037/0022-3514.52.3.511',
          'https://journals.sagepub.com/doi/10.1177/014920639201800306',
          'https://doi.org/10.1037/0022-3514.52.3.511.',
        ]),
      ),
    ).toEqual(['10.1037/0022-3514.52.3.511', '10.1177/014920639201800306']);
  });

  it('DOI の無い項目・出典なしは空配列', () => {
    expect(sourceDois(entry('a', ['https://laws.e-gov.go.jp/law/417AC0000000086']))).toEqual([]);
    expect(sourceDois({ sources: [] })).toEqual([]);
    expect(sourceDois({})).toEqual([]);
  });
});

describe('idSimilarity — 分野接頭辞を除いた id 語彙の Jaccard', () => {
  it('人名や修飾語が付いただけの id は高い', () => {
    expect(idSimilarity('econ-time-inconsistency', 'econ-time-inconsistency-kydland-prescott')).toBeCloseTo(0.5);
    expect(idSimilarity('human-transactive-memory', 'mgmt-transactive-memory-wegner')).toBeCloseTo(2 / 3);
  });

  it('分野接頭辞は語彙に数えない（同じ接頭辞だけでは 0）', () => {
    expect(idSimilarity('econ-public-goods-samuelson', 'econ-tiebout-hypothesis')).toBe(0);
  });

  it('2 文字以下の語は数えない・語彙が空同士なら 0', () => {
    expect(idSimilarity('econ-is-lm', 'econ-is-lm-model')).toBeCloseTo(0);
    expect(idSimilarity('a', 'b')).toBe(0);
  });

  it('しきい値は 0 と 1 の間', () => {
    expect(SHARED_ID_SIMILARITY).toBeGreaterThan(0);
    expect(SHARED_ID_SIMILARITY).toBeLessThan(1);
  });
});

describe('sharedSourceDedupeSuspects — 任意位置の出典 DOI 共有 + id 類似', () => {
  const HS = 'https://doi.org/10.1037/0022-3514.52.3.511';
  const KP = 'https://doi.org/10.1086/260580';
  const WIKI = 'https://en.wikipedia.org/wiki/X';

  it('標本: 第一出典が違っても、2 番目に同じ DOI があり id が近ければ鳴る（dedupeSource が素通りする形）', () => {
    const out = sharedSourceDedupeSuspects(
      [entry('econ-time-inconsistency', [WIKI, KP]), entry('econ-time-inconsistency-kydland-prescott', [KP])],
      new Set(),
    );
    expect(out).toEqual([
      { a: 'econ-time-inconsistency', b: 'econ-time-inconsistency-kydland-prescott', dois: ['10.1086/260580'], idSimilarity: 0.5 },
    ]);
  });

  it('標本: id が別物でも、共有 DOI が 2 件以上なら鳴る', () => {
    const out = sharedSourceDedupeSuspects([entry('econ-alpha', [HS, KP]), entry('econ-beta', [KP, WIKI, HS])], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]!.dois).toEqual(['10.1037/0022-3514.52.3.511', '10.1086/260580']);
    expect(out[0]!.idSimilarity).toBe(0);
  });

  it('対照: 共有 DOI が 1 件だけで id が別物なら鳴らない（別概念が同じ古典を引いているだけ）', () => {
    const out = sharedSourceDedupeSuspects([entry('econ-public-goods-samuelson', [HS]), entry('econ-tiebout-hypothesis', [WIKI, HS])], new Set());
    expect(out).toEqual([]);
  });

  it('対照: 裁定済み「別概念」ペアは除外する', () => {
    const out = sharedSourceDedupeSuspects(
      [entry('econ-time-inconsistency', [KP]), entry('econ-time-inconsistency-kydland-prescott', [KP])],
      new Set(['econ-time-inconsistency|econ-time-inconsistency-kydland-prescott']),
    );
    expect(out).toEqual([]);
  });

  it('対照: コレクションが違えば鳴らない', () => {
    const out = sharedSourceDedupeSuspects(
      [entry('econ-time-inconsistency', [KP], 'academic'), entry('econ-time-inconsistency-kydland', [KP], 'compliance')],
      new Set(),
    );
    expect(out).toEqual([]);
  });

  it('対照: DOI でない共通の出典（Wikipedia）は数えない', () => {
    const out = sharedSourceDedupeSuspects([entry('econ-time-inconsistency', [WIKI]), entry('econ-time-inconsistency-kydland', [WIKI])], new Set());
    expect(out).toEqual([]);
  });

  it('a<b で並べ、同じペアは共有 DOI が何件でも 1 行（1 件共有で id 語彙 1/3 のペアは鳴らない）', () => {
    const out = sharedSourceDedupeSuspects(
      [entry('mgmt-z-sensemaking', [HS, KP]), entry('mgmt-a-sensemaking-weick', [KP, HS]), entry('mgmt-m-sensemaking-theory', [HS])],
      new Set(),
    );
    // a|z: 共有 2 件 → 鳴る。m|z: 共有 1 件・語彙 {sensemaking,theory} vs {sensemaking} = 0.5 → 鳴る。
    // a|m: 共有 1 件・語彙 {sensemaking,weick} vs {sensemaking,theory} = 1/3 → 鳴らない（対照）。
    expect(out.map((p) => `${p.a}|${p.b}`)).toEqual(['mgmt-a-sensemaking-weick|mgmt-z-sensemaking', 'mgmt-m-sensemaking-theory|mgmt-z-sensemaking']);
    expect(out[0]!.dois).toHaveLength(2);
    expect(out[1]!.dois).toEqual(['10.1037/0022-3514.52.3.511']);
    expect(out[1]!.idSimilarity).toBe(0.5);
  });
});
