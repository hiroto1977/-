import { describe, it, expect } from 'vitest';
import {
  buildCorpus,
  knowledgeCorpus,
  extractTerms,
  extractWeightedTerms,
  extractContentRuns,
  retrieve,
  retrieveScored,
  retrieveServices,
  titleSimilarity,
  buildSystemPrompt,
  buildOfflineKnowledgeAnswer,
  formatKnowledgeSection,
  formatServiceSection,
  ASSISTANT_BASE_INSTRUCTIONS,
  type KnowledgeDoc,
  type AssistantService,
} from '../assistantContext';

describe('buildCorpus', () => {
  it('produces a non-empty corpus spanning all four knowledge kinds', () => {
    const corpus = buildCorpus();
    expect(corpus.length).toBeGreaterThan(100);
    const kinds = new Set(corpus.map((d) => d.kind));
    expect(kinds).toContain('学術概念');
    expect(kinds).toContain('コンプライアンス');
    expect(kinds).toContain('補助金・助成金');
    expect(kinds).toContain('相談窓口');
  });

  it('caches: 2 回目の呼び出しは同一インスタンスを返す (再構築しない)', () => {
    expect(knowledgeCorpus()).toBe(knowledgeCorpus());
  });

  it('is exposed as a lazily built, cached knowledgeCorpus()', () => {
    expect(knowledgeCorpus().length).toBe(buildCorpus().length);
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

  it('buildSystemPrompt accepts a multi-turn joined query (follow-up support)', () => {
    const prompt = buildSystemPrompt('オークンの法則とは？\nそれを詳しく', []);
    expect(prompt).toContain('オークン');
  });
});

describe('buildCorpus v2', () => {
  it('includes 経済史 yearly entries with structured titles', () => {
    const hist = knowledgeCorpus().filter((d) => d.kind === '経済史');
    expect(hist.length).toBeGreaterThan(50);
    expect(hist[0]?.title).toMatch(/^\d{4}年（.+）の世界と日本の経済$/);
  });

  it('spans the full verified knowledge base (>4000 docs)', () => {
    expect(knowledgeCorpus().length).toBeGreaterThan(4000);
  });

  it('injects the first source label into academic bodies', () => {
    const academic = knowledgeCorpus().find((d) => d.kind === '学術概念');
    expect(academic?.body).toContain('［出典:');
  });
});

describe('extractWeightedTerms', () => {
  it('gives weight 1 to ascii words and kanji/katakana bigrams', () => {
    const w = new Map(extractWeightedTerms('GDP 補助金').map((x) => [x.t, x.w]));
    expect(w.get('gdp')).toBe(1);
    expect(w.get('補助')).toBe(1);
  });

  it('downweights hiragana-only (glue) bigrams below 1', () => {
    const terms = extractWeightedTerms('について');
    expect(terms.length).toBeGreaterThan(0);
    for (const t of terms) expect(t.w).toBeLessThan(1);
  });

  it('keeps a lone kanji at weight 0.5', () => {
    const w = new Map(extractWeightedTerms('税').map((x) => [x.t, x.w]));
    expect(w.get('税')).toBe(0.5);
  });
});

describe('extractContentRuns', () => {
  it('extracts concept-name runs spanning katakana + kanji', () => {
    expect(extractContentRuns('プロテウス効果とは？')).toContain('プロテウス効果');
  });

  it('returns [] for hiragana-only queries', () => {
    expect(extractContentRuns('これはなんですか')).toEqual([]);
  });
});

describe('titleSimilarity', () => {
  it('is 1 for identical titles and 0 for disjoint ones', () => {
    expect(titleSimilarity('オークンの法則', 'オークンの法則')).toBe(1);
    expect(titleSimilarity('オークンの法則', 'ハドリー循環')).toBe(0);
  });
});

describe('retrieveScored', () => {
  const mk = (id: string, title: string, body: string): KnowledgeDoc => ({
    id,
    kind: '学術概念',
    title,
    body,
  });

  it('ranks rare terms above ubiquitous ones (IDF)', () => {
    // 「経済」は全文書に現れ、「外部性」は 1 件のみ — 稀な語が勝つこと。
    const corpus = [
      mk('common1', '経済成長の基礎', '経済の話'),
      mk('common2', '経済政策の概要', '経済の話'),
      mk('common3', '経済史の視点', '経済の話'),
      mk('rare', '外部性の理論', '経済における外部性の分析'),
    ];
    const out = retrieveScored('経済の外部性', 4, corpus);
    expect(out[0]?.doc.id).toBe('rare');
  });

  it('drops documents matched only by glue (hiragana-only) bigrams', () => {
    const corpus = [mk('glue', 'あるとき', 'それについて')];
    expect(retrieveScored('これについて', 5, corpus)).toEqual([]);
  });

  it('returns scores in descending order', () => {
    const out = retrieveScored('オークンの法則');
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.score).toBeLessThanOrEqual(out[i - 1]!.score);
    }
  });

  it('collapses near-duplicate titles to one representative', () => {
    const corpus = [
      mk('d1', 'ネットワーク外部性', 'ネットワーク外部性の説明その1'),
      mk('d2', 'ネットワーク外部性（補遺）', 'ネットワーク外部性の説明その2'),
      mk('d3', 'メニューコスト', '価格変更の費用'),
    ];
    const ids = retrieveScored('ネットワーク外部性', 3, corpus).map((s) => s.doc.id);
    expect(ids).toContain('d1');
    expect(ids).not.toContain('d2');
  });

  it('finds a named concept via phrase bonus on the real corpus', () => {
    const out = retrieve('プロテウス効果とは？', 3);
    expect(out.some((d) => d.title.includes('プロテウス効果'))).toBe(true);
  });
});

describe('buildOfflineKnowledgeAnswer', () => {
  it('answers a named-concept query from the real corpus with provenance note', () => {
    const out = buildOfflineKnowledgeAnswer('オークンの法則とは？');
    expect(out).not.toBeNull();
    expect(out!).toContain('確証済みナレッジ');
    expect(out!).toContain('オークン');
    expect(out!).toContain('AI 生成ではありません');
  });

  it('returns null when nothing clears the threshold', () => {
    const corpus: KnowledgeDoc[] = [
      { id: 'x', kind: '学術概念', title: 'メニューコスト', body: '価格変更の費用' },
    ];
    expect(buildOfflineKnowledgeAnswer('天気予報について', corpus)).toBeNull();
  });
});

describe('ASSISTANT_BASE_INSTRUCTIONS v2', () => {
  it('mandates citation footers, verbatim figures and clarifying questions', () => {
    expect(ASSISTANT_BASE_INSTRUCTIONS).toContain('参照:');
    expect(ASSISTANT_BASE_INSTRUCTIONS).toContain('出典 URL を創作しない');
    expect(ASSISTANT_BASE_INSTRUCTIONS).toContain('確認の質問');
  });
});
