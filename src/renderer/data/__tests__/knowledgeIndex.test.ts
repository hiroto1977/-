import { describe, it, expect } from 'vitest';
import {
  buildCorpus,
  buildCorpusParallel,
  KNOWLEDGE_CORPUS,
  extractTerms,
  scoreDoc,
  chunkCorpus,
  retrieve,
  retrieveScored,
  retrieveParallel,
  looksLikeKnowledgeQuery,
  formatKnowledgeAnswer,
  formatKnowledgeSection,
  corpusStats,
  KNOWLEDGE_MIN_SCORE,
  type KnowledgeDoc,
} from '../knowledgeIndex';

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

  it('matches the prebuilt KNOWLEDGE_CORPUS', () => {
    expect(KNOWLEDGE_CORPUS.length).toBe(buildCorpus().length);
  });

  it('buildCorpusParallel yields the same size as sync build', async () => {
    const parallel = await buildCorpusParallel();
    expect(parallel.length).toBe(buildCorpus().length);
  });
});

describe('extractTerms', () => {
  it('extracts alphanumeric words and CJK bigrams', () => {
    expect(extractTerms('AKモデル GDP')).toContain('gdp');
    expect(extractTerms('補助金')).toContain('補助');
    expect(extractTerms('補助金')).toContain('助金');
  });

  it('returns [] for whitespace-only input', () => {
    expect(extractTerms('   ')).toEqual([]);
  });
});

describe('retrieve', () => {
  const corpus: KnowledgeDoc[] = [
    { id: 'a', kind: '学術概念', title: 'ネットワーク外部性', body: '利用者が増えるほど効用が増える' },
    { id: 'b', kind: '学術概念', title: 'メニューコスト', body: '価格変更の費用' },
    { id: 'c', kind: '補助金・助成金', title: '雇用調整助成金', body: '雇用維持の助成' },
    { id: 'd', kind: '経済史', title: '1990年（平成2年）', body: 'バブル崩壊後の日本経済' },
  ];

  it('ranks documents matching the query first', () => {
    const out = retrieve('ネットワーク効果について', 2, corpus);
    expect(out[0]?.id).toBe('a');
  });

  it('returns [] when nothing matches', () => {
    expect(retrieve('天気予報について', 5, corpus)).toEqual([]);
  });

  it('retrieveScored includes scores and respects k', () => {
    const out = retrieveScored('助成 費用 効用', 1, corpus);
    expect(out.length).toBe(1);
    expect(out[0]!.score).toBeGreaterThan(0);
  });

  it('retrieveParallel matches sync retrieve for the same query', async () => {
    const query = 'オークンの法則 失業率';
    const sync = retrieveScored(query, 3);
    const parallel = await retrieveParallel(query, 3);
    expect(parallel.map((s) => s.doc.id)).toEqual(sync.map((s) => s.doc.id));
  });

  it('works against the real corpus for a known concept', () => {
    const out = retrieve('オークンの法則 失業率');
    expect(out.some((d) => d.title.includes('オークン'))).toBe(true);
  });

  it('finds economic history entries', () => {
    const out = retrieve('1990年 バブル');
    expect(out.some((d) => d.kind === '経済史')).toBe(true);
  });
});

describe('chunkCorpus / scoreDoc', () => {
  it('splits corpus into chunks and scores documents', () => {
    const corpus = KNOWLEDGE_CORPUS.slice(0, 10);
    const chunks = chunkCorpus(corpus, 2);
    expect(chunks.length).toBe(2);
    const terms = extractTerms('税務');
    expect(scoreDoc(corpus[0]!, terms)).toBeGreaterThanOrEqual(0);
  });
});

describe('looksLikeKnowledgeQuery', () => {
  it('requires minimum score and prefers query markers', () => {
    expect(looksLikeKnowledgeQuery('インボイス制度とは？', 6)).toBe(true);
    expect(looksLikeKnowledgeQuery('こんにちは', 1, KNOWLEDGE_MIN_SCORE)).toBe(false);
    expect(looksLikeKnowledgeQuery('インボイス', KNOWLEDGE_MIN_SCORE * 2)).toBe(true);
  });
});

describe('formatting', () => {
  it('formatKnowledgeSection returns empty for no docs', () => {
    expect(formatKnowledgeSection([])).toBe('');
  });

  it('formatKnowledgeAnswer includes disclaimer', () => {
    const text = formatKnowledgeAnswer([
      { id: 'x', kind: 'コンプライアンス', title: 'テスト', body: '本文' },
    ]);
    expect(text).toContain('📚');
    expect(text).toContain('専門助言ではありません');
  });

  it('corpusStats counts by kind', () => {
    const stats = corpusStats();
    expect(stats.total).toBe(KNOWLEDGE_CORPUS.length);
    expect(stats.byKind['経済史']).toBeGreaterThan(50);
  });
});
