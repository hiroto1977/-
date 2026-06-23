import { describe, it, expect } from 'vitest';
import {
  buildCorpus,
  buildCorpusParallel,
  KNOWLEDGE_CORPUS,
  corpusStats,
  extractTerms,
  retrieve,
  retrieveScored,
  type KnowledgeDoc,
} from '../knowledgeCorpus';

describe('buildCorpus', () => {
  it('produces a non-empty corpus spanning all five knowledge kinds', () => {
    const corpus = buildCorpus();
    expect(corpus.length).toBeGreaterThan(1000);
    const kinds = new Set(corpus.map((d) => d.kind));
    expect(kinds).toContain('学術概念');
    expect(kinds).toContain('コンプライアンス');
    expect(kinds).toContain('補助金・助成金');
    expect(kinds).toContain('相談窓口');
    expect(kinds).toContain('経済史');
  });

  it('is exposed as a prebuilt KNOWLEDGE_CORPUS', () => {
    expect(KNOWLEDGE_CORPUS.length).toBe(buildCorpus().length);
  });

  it('corpusStats reports totals by kind', () => {
    const stats = corpusStats();
    expect(stats.total).toBe(KNOWLEDGE_CORPUS.length);
    expect(stats.byKind['学術概念']).toBeGreaterThan(100);
    expect(stats.byKind['経済史']).toBeGreaterThan(50);
  });
});

describe('buildCorpusParallel', () => {
  it('produces the same count as sync buildCorpus', async () => {
    const parallel = await buildCorpusParallel();
    expect(parallel.length).toBe(buildCorpus().length);
  });

  it('includes economic history entries', async () => {
    const parallel = await buildCorpusParallel();
    expect(parallel.some((d) => d.kind === '経済史' && d.title.includes('1990'))).toBe(true);
  });
});

describe('extractTerms', () => {
  it('extracts alphanumeric words (length >= 2)', () => {
    expect(extractTerms('AKモデル GDP')).toContain('gdp');
    expect(extractTerms('AKモデル GDP')).toContain('ak');
  });

  it('generates CJK bigrams', () => {
    const terms = extractTerms('補助金');
    expect(terms).toContain('補助');
    expect(terms).toContain('助金');
  });

  it('returns [] for whitespace-only input', () => {
    expect(extractTerms('   ')).toEqual([]);
  });
});

describe('retrieve / retrieveScored', () => {
  const corpus: KnowledgeDoc[] = [
    { id: 'a', kind: '学術概念', title: 'ネットワーク外部性', category: 'economics', body: '利用者が増えるほど効用が増える' },
    { id: 'b', kind: '学術概念', title: 'メニューコスト', category: 'economics', body: '価格変更の費用' },
    { id: 'c', kind: '補助金・助成金', title: '雇用調整助成金', category: 'employment', body: '雇用維持の助成' },
    { id: 'd', kind: '経済史', title: '1990年（平成2年）', category: '1990年代', body: 'バブル崩壊' },
  ];

  it('ranks documents matching the query first', () => {
    const out = retrieve('ネットワーク効果について', 2, corpus);
    expect(out[0]?.id).toBe('a');
  });

  it('retrieveScored returns scores in descending order', () => {
    const scored = retrieveScored('助成 費用 効用', 3, corpus);
    expect(scored.length).toBeGreaterThan(0);
    expect(scored[0]!.score).toBeGreaterThanOrEqual(scored[scored.length - 1]!.score);
  });

  it('returns [] when nothing matches', () => {
    expect(retrieve('天気予報について', 5, corpus)).toEqual([]);
  });

  it('works against the real corpus for a known concept', () => {
    const out = retrieve('オークンの法則 失業率');
    expect(out.some((d) => d.title.includes('オークン'))).toBe(true);
  });

  it('retrieves economic history by year', () => {
    const out = retrieve('1990年 平成2年 日経平均');
    expect(out.some((d) => d.kind === '経済史' && d.title.includes('1990'))).toBe(true);
  });
});
