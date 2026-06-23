import { describe, it, expect } from 'vitest';
import {
  buildCorpus,
  KNOWLEDGE_CORPUS,
  extractTerms,
  retrieve,
  retrieveServices,
  buildSystemPrompt,
  buildSystemPromptParallel,
  formatKnowledgeSection,
  formatServiceSection,
  ASSISTANT_BASE_INSTRUCTIONS,
  type KnowledgeDoc,
  type AssistantService,
} from '../assistantContext';

describe('buildCorpus', () => {
  it('produces a non-empty corpus spanning all five knowledge kinds', () => {
    const corpus = buildCorpus();
    expect(corpus.length).toBeGreaterThan(100);
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
    { id: 'a', kind: '学術概念', title: 'ネットワーク外部性', body: '利用者が増えるほど効用が増える' },
    { id: 'b', kind: '学術概念', title: 'メニューコスト', body: '価格変更の費用' },
    { id: 'c', kind: '補助金・助成金', title: '雇用調整助成金', body: '雇用維持の助成' },
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

  it('formatServiceSection lists services with ids', () => {
    const section = formatServiceSection([{ id: 'tax', label: '税務試算', description: 'desc' }]);
    expect(section).toContain('税務試算（id: tax）');
  });

  it('buildSystemPrompt always includes base instructions', () => {
    const prompt = buildSystemPrompt('こんにちは', []);
    expect(prompt).toContain(ASSISTANT_BASE_INSTRUCTIONS.split('\n')[0]!);
  });

  it('buildSystemPrompt injects relevant knowledge + services', () => {
    const services: AssistantService[] = [
      { id: 'funding', label: '資金調達レーダー', description: '補助金や助成金を可視化' },
    ];
    const prompt = buildSystemPrompt('補助金について教えて', services);
    expect(prompt).toContain('参考ナレッジ');
    expect(prompt).toContain('資金調達レーダー');
  });

  it('buildSystemPromptParallel injects knowledge like sync build', async () => {
    const prompt = await buildSystemPromptParallel('インボイス制度', []);
    expect(prompt).toContain(ASSISTANT_BASE_INSTRUCTIONS.split('\n')[0]!);
    expect(prompt).toContain('参考ナレッジ');
  });
});
