import { describe, it, expect } from 'vitest';
import {
  buildCorpus,
  KNOWLEDGE_CORPUS,
  extractTerms,
  retrieve,
  retrieveForExecutive,
  retrieveParallel,
  retrieveParallelSync,
  mergeRetrievalResults,
  executiveWants,
  EXECUTIVE_IDS,
  retrieveServices,
  buildSystemPrompt,
  formatKnowledgeSection,
  formatParallelKnowledgeSection,
  formatServiceSection,
  ASSISTANT_BASE_INSTRUCTIONS,
  type KnowledgeDoc,
  type AssistantService,
} from '../assistantContext';

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

  it('includes collection and category metadata on every doc', () => {
    for (const doc of buildCorpus()) {
      expect(doc.collection).toBeTruthy();
      expect(doc.category).toBeTruthy();
    }
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

describe('retrieve', () => {
  const corpus: KnowledgeDoc[] = [
    {
      id: 'a',
      kind: '学術概念',
      collection: 'academic',
      category: 'economics',
      title: 'ネットワーク外部性',
      body: '利用者が増えるほど効用が増える',
    },
    {
      id: 'b',
      kind: '学術概念',
      collection: 'academic',
      category: 'management',
      title: 'メニューコスト',
      body: '価格変更の費用',
    },
    {
      id: 'c',
      kind: '補助金・助成金',
      collection: 'subsidy',
      category: 'employment',
      title: '雇用調整助成金',
      body: '雇用維持の助成',
    },
  ];

  it('ranks documents matching the query first', () => {
    const out = retrieve('ネットワーク効果について', 2, corpus);
    expect(out[0]?.id).toBe('a');
  });

  it('returns [] when nothing matches', () => {
    expect(retrieve('天気予報について', 5, corpus)).toEqual([]);
  });

  it('respects the k limit', () => {
    const out = retrieve('助成 費用 効用', 1, corpus);
    expect(out.length).toBe(1);
  });

  it('works against the real corpus for a known concept', () => {
    const out = retrieve('オークンの法則 失業率');
    expect(out.some((d) => d.title.includes('オークン'))).toBe(true);
  });

  it('retrieves economic history entries', () => {
    const out = retrieve('株バブル崩壊 総量規制 1990');
    expect(out.some((d) => d.kind === '経済史')).toBe(true);
  });
});

describe('executiveWants', () => {
  const taxDoc: KnowledgeDoc = {
    id: 'compliance:tax-1',
    kind: 'コンプライアンス',
    collection: 'compliance',
    category: 'tax',
    title: '所得税',
    body: 'test',
  };
  const historyDoc: KnowledgeDoc = {
    id: 'econ-history:eh-1990',
    kind: '経済史',
    collection: 'econ-history',
    category: '1990年代',
    title: '1990年',
    body: 'test',
  };

  it('CFO wants tax compliance but not all econ history via category filter', () => {
    expect(executiveWants('cfo', taxDoc)).toBe(true);
    expect(executiveWants('cfo', historyDoc)).toBe(false);
  });

  it('CIO wants econ history', () => {
    expect(executiveWants('cio', historyDoc)).toBe(true);
  });

  it('COO wants everything', () => {
    expect(executiveWants('coo', taxDoc)).toBe(true);
    expect(executiveWants('coo', historyDoc)).toBe(true);
  });
});

describe('parallel retrieval', () => {
  it('retrieveForExecutive filters by role', () => {
    const cfoDocs = retrieveForExecutive('所得税 法人税', 'cfo', 5);
    expect(cfoDocs.length).toBeGreaterThan(0);
    for (const d of cfoDocs) {
      expect(executiveWants('cfo', d)).toBe(true);
    }
  });

  it('retrieveParallelSync searches all executives', () => {
    const result = retrieveParallelSync('補助金 雇用 経済史', { perExecutive: 2 });
    expect(result.byExecutive.length).toBe(EXECUTIVE_IDS.length);
    expect(result.merged.length).toBeGreaterThan(0);
    const execIdsWithHits = result.byExecutive.filter((r) => r.docs.length > 0).map((r) => r.execId);
    expect(execIdsWithHits.length).toBeGreaterThan(1);
  });

  it('retrieveParallel async matches sync', async () => {
    const query = '労働基準法 社会保険';
    const sync = retrieveParallelSync(query);
    const async = await retrieveParallel(query);
    expect(async.merged.map((d) => d.id)).toEqual(sync.merged.map((d) => d.id));
  });

  it('mergeRetrievalResults deduplicates by id', () => {
    const doc: KnowledgeDoc = {
      id: 'x',
      kind: '学術概念',
      collection: 'academic',
      category: 'economics',
      title: 't',
      body: 'b',
    };
    const merged = mergeRetrievalResults([
      { execId: 'cso', execTitle: 'CSO', docs: [doc] },
      { execId: 'coo', execTitle: 'COO', docs: [doc] },
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('retrieveServices', () => {
  const services: AssistantService[] = [
    { id: 'tax', label: '税務試算', description: '所得税や住民税の概算' },
    { id: 'github', label: 'GitHub', description: 'リポジトリや PR を表示' },
  ];

  it('returns services matching the query', () => {
    const out = retrieveServices('所得税の計算をしたい', services);
    expect(out[0]?.id).toBe('tax');
  });

  it('returns [] when no service matches', () => {
    expect(retrieveServices('天気', services)).toEqual([]);
  });
});

describe('prompt assembly', () => {
  it('formatKnowledgeSection returns empty string for no docs', () => {
    expect(formatKnowledgeSection([])).toBe('');
  });

  it('formatParallelKnowledgeSection includes executive roles', () => {
    const doc: KnowledgeDoc = {
      id: 'a',
      kind: '学術概念',
      collection: 'academic',
      category: 'economics',
      title: 'テスト概念',
      body: '本文',
    };
    const section = formatParallelKnowledgeSection({
      byExecutive: [{ execId: 'cso', execTitle: 'CSO', docs: [doc] }],
      merged: [doc],
    });
    expect(section).toContain('6 役員ロール並列検索');
    expect(section).toContain('CSO');
    expect(section).toContain('テスト概念');
  });

  it('formatServiceSection lists services with ids', () => {
    const section = formatServiceSection([{ id: 'tax', label: '税務試算', description: 'desc' }]);
    expect(section).toContain('税務試算（id: tax）');
  });

  it('buildSystemPrompt always includes base instructions', () => {
    const prompt = buildSystemPrompt('こんにちは', []);
    expect(prompt).toContain(ASSISTANT_BASE_INSTRUCTIONS.split('\n')[0]!);
  });

  it('buildSystemPrompt injects parallel knowledge + services', () => {
    const services: AssistantService[] = [
      { id: 'funding', label: '資金調達レーダー', description: '補助金や助成金を可視化' },
    ];
    const prompt = buildSystemPrompt('補助金について教えて', services);
    expect(prompt).toContain('6 役員ロール並列検索');
    expect(prompt).toContain('資金調達レーダー');
  });
});
