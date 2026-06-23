import { describe, it, expect } from 'vitest';
import {
  isCjk,
  extractTerms,
  countOccurrences,
  buildInvertedIndex,
  retrieveScored,
  indexedRetrieve,
  type KnowledgeDoc,
} from '../knowledgeIndex';

const CORPUS: KnowledgeDoc[] = [
  { id: 'a', kind: '学術概念', title: 'ネットワーク外部性', body: '利用者が増えるほど効用が増える' },
  { id: 'b', kind: '学術概念', title: 'メニューコスト', body: '価格変更の費用' },
  { id: 'c', kind: '補助金・助成金', title: '雇用調整助成金', body: '雇用維持の助成' },
  { id: 'd', kind: '経済史', title: '1990年（平成2年）', body: 'バブル崩壊の入口。資産価格が下落した。' },
];

/** 線形走査の参照実装 (索引版の同値性を検証する基準)。 */
function linearRetrieve(query: string, k: number, corpus: readonly KnowledgeDoc[]): KnowledgeDoc[] {
  const terms = extractTerms(query);
  if (terms.length === 0) return [];
  const scored: { doc: KnowledgeDoc; score: number; i: number }[] = [];
  corpus.forEach((doc, i) => {
    const title = doc.title.normalize('NFKC').toLowerCase();
    const body = doc.body.normalize('NFKC').toLowerCase();
    let score = 0;
    for (const t of terms) score += countOccurrences(title, t) * 3 + countOccurrences(body, t);
    if (score > 0) scored.push({ doc, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k).map((s) => s.doc);
}

describe('isCjk', () => {
  it('detects hiragana / katakana / kanji and rejects ascii', () => {
    expect(isCjk('あ')).toBe(true);
    expect(isCjk('カ')).toBe(true);
    expect(isCjk('税')).toBe(true);
    expect(isCjk('a')).toBe(false);
    expect(isCjk('1')).toBe(false);
  });
});

describe('extractTerms', () => {
  it('extracts alphanumeric words (length >= 2) lowercased', () => {
    expect(extractTerms('AKモデル GDP')).toContain('gdp');
    expect(extractTerms('AKモデル GDP')).toContain('ak');
  });

  it('generates CJK bigrams', () => {
    const terms = extractTerms('補助金');
    expect(terms).toContain('補助');
    expect(terms).toContain('助金');
  });

  it('keeps a lone CJK char as a single-char term', () => {
    expect(extractTerms('a税b')).toContain('税');
  });

  it('returns [] for whitespace-only input', () => {
    expect(extractTerms('   ')).toEqual([]);
  });
});

describe('countOccurrences', () => {
  it('counts non-overlapping occurrences', () => {
    expect(countOccurrences('ささささ', 'ささ')).toBe(2);
    expect(countOccurrences('abcabc', 'abc')).toBe(2);
    expect(countOccurrences('abc', 'x')).toBe(0);
  });

  it('returns 0 for an empty needle', () => {
    expect(countOccurrences('abc', '')).toBe(0);
  });
});

describe('buildInvertedIndex', () => {
  it('maps terms to postings with title/body term frequencies', () => {
    const index = buildInvertedIndex(CORPUS);
    expect(index.docs).toBe(CORPUS);
    const postings = index.postings.get('助成');
    expect(postings).toBeDefined();
    // doc c (雇用調整助成金 / 雇用維持の助成) contains 助成 in both title and body.
    const cPosting = postings!.find((p) => index.docs[p.i]!.id === 'c');
    expect(cPosting).toBeDefined();
    expect(cPosting!.tfTitle).toBeGreaterThan(0);
    expect(cPosting!.tfBody).toBeGreaterThan(0);
  });

  it('omits terms that appear in no document', () => {
    const index = buildInvertedIndex(CORPUS);
    expect(index.postings.get('天気')).toBeUndefined();
  });
});

describe('retrieveScored / indexedRetrieve', () => {
  const index = buildInvertedIndex(CORPUS);

  it('ranks the best matching document first', () => {
    const out = indexedRetrieve('ネットワーク効果について', 2, index);
    expect(out[0]?.id).toBe('a');
  });

  it('returns [] when nothing matches', () => {
    expect(indexedRetrieve('天気予報について', 5, index)).toEqual([]);
  });

  it('returns [] for term-less queries', () => {
    expect(indexedRetrieve('   ', 5, index)).toEqual([]);
  });

  it('respects the k limit', () => {
    expect(indexedRetrieve('助成 費用 効用', 1, index).length).toBe(1);
  });

  it('attaches positive scores in descending order', () => {
    const scored = retrieveScored('雇用 助成', 5, index);
    expect(scored.length).toBeGreaterThan(0);
    for (const s of scored) expect(s.score).toBeGreaterThan(0);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1]!.score).toBeGreaterThanOrEqual(scored[i]!.score);
    }
  });

  it('matches the linear reference implementation (ordering + selection)', () => {
    const queries = ['助成', '雇用 助成 費用', 'ネットワーク 効用', 'バブル 崩壊 資産', '増える'];
    for (const q of queries) {
      const fromIndex = indexedRetrieve(q, 4, index).map((d) => d.id);
      const fromLinear = linearRetrieve(q, 4, CORPUS).map((d) => d.id);
      expect(fromIndex).toEqual(fromLinear);
    }
  });

  it('breaks score ties by corpus order (stable)', () => {
    // 'a' and 'b' are both 学術概念; query '学術' matches neither title/body, so use a
    // term shared by two docs with equal score → earlier corpus index wins.
    const corpus: KnowledgeDoc[] = [
      { id: 'x', kind: '学術概念', title: '共通', body: '' },
      { id: 'y', kind: '学術概念', title: '共通', body: '' },
    ];
    const idx = buildInvertedIndex(corpus);
    const out = indexedRetrieve('共通', 2, idx).map((d) => d.id);
    expect(out).toEqual(['x', 'y']);
  });
});
