import { describe, it, expect } from 'vitest';
import {
  formatKnowledgeAnswer,
  knowledgeRouteLabel,
  matchKnowledge,
  MIN_KNOWLEDGE_SCORE,
} from '../knowledgeChat';
import { buildOrgIndex, type RawTeam } from '../chatOrg';

const ORG = buildOrgIndex(
  {
    executives: [{ id: 'cfo', title: '最高財務責任者 (CFO)', domain: '財務・税務・資金調達' }],
    managers: [{ id: 'mgr-tax', title: '税務部長', reportsTo: 'cfo', teams: ['tax-income'] }],
    secretaries: [{}, {}, {}, {}],
  },
  [{ id: 'tax-income', domain: '税務(所得税)', focus: '所得税・速算表', manager: 'mgr-tax' }] as readonly RawTeam[],
);

describe('matchKnowledge', () => {
  it('returns null for unrelated smalltalk', () => {
    expect(matchKnowledge('こんにちは')).toBeNull();
  });

  it('matches a known academic concept', () => {
    const m = matchKnowledge('オークンの法則 失業率');
    expect(m).not.toBeNull();
    expect(m!.docs.some((d) => d.title.includes('オークン'))).toBe(true);
    expect(m!.topScore).toBeGreaterThanOrEqual(MIN_KNOWLEDGE_SCORE);
  });

  it('matches economic history queries', () => {
    const m = matchKnowledge('1990年 平成2年 日経平均');
    expect(m).not.toBeNull();
    expect(m!.docs.some((d) => d.kind === '経済史')).toBe(true);
  });
});

describe('formatKnowledgeAnswer', () => {
  it('formats docs with kind labels and disclaimer', () => {
    const text = formatKnowledgeAnswer([
      { id: 'x', kind: '学術概念', title: 'テスト概念', category: 'economics', body: '本文' },
    ]);
    expect(text).toContain('📚');
    expect(text).toContain('[学術概念] テスト概念');
    expect(text).toContain('専門家');
  });

  it('returns empty string for no docs', () => {
    expect(formatKnowledgeAnswer([])).toBe('');
  });
});

describe('knowledgeRouteLabel', () => {
  it('routes compliance topics through tax chain when possible', () => {
    const label = knowledgeRouteLabel(ORG, '所得税', {
      id: 'c:1',
      kind: 'コンプライアンス',
      title: '所得税',
      category: 'tax',
      body: '',
    });
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});
