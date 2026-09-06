/*
 * jsdom を宣言していない —— 純関数しか叩かない (`advisorValidationParity.test.ts` と同じ理由)。
 *
 * **LLM の応答を絞る門が、どの門で止めたかまで留める。**
 *
 * `advisorValidationParity.test.ts` は「main とブラウザ版で**通す/弾くが一致する**」ことを
 * 37 例で見ている。それは大事なのだが、**通ったか弾いたかしか見ていない**ので、門が
 * 1 つ消えても後ろの門か `TypeError` が代わりに弾き、検査は緑のまま通る。実測
 * (2026-09-06 の変異検査): `validateAdvisorJson` の条件式の変異体が
 * **89 件生存**していた —— 例えば `raw === null || typeof raw !== 'object'` を `false` に
 * 潰しても、`null.recommendations` が TypeError を投げるので「弾いた」ことになる。
 *
 * ここは**同じ入力に対して、どの門が止めたか**を文面で確かめる (main 側のテストが
 * その側の文言を固定しているのと同じ形)。文面は利用者に出る文字列ではなく、
 * **門の識別子**として使う。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'locked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Validator = (raw: unknown, allowed: ReadonlySet<string>) => unknown[];

const ALLOWED: ReadonlySet<string> = new Set(['ec', 'sns-ops']);

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoryId: 'ec',
    rank: 1,
    rationale: '理由',
    actionItems: ['やること'],
    riskFactors: ['risk'],
    ...over,
  };
}
const wrap = (r: unknown): unknown => ({ recommendations: [r] });

async function loadValidator(): Promise<Validator> {
  const mod = (await import('../web-shim')) as unknown as { validateAdvisorJson: Validator };
  return mod.validateAdvisorJson;
}

/**
 * 「この入力は**この門**で止まる」の一覧。文面は完全一致で見る (部分一致だと
 * 別の門の文面に含まれてしまう組み合わせがある)。
 */
const GATES: [string, unknown, string][] = [
  ['オブジェクトでない', 'nope', 'response is not an object'],
  ['null', null, 'response is not an object'],
  ['配列 (オブジェクトではあるが recommendations が無い)', [], 'missing recommendations'],
  ['recommendations が無い', {}, 'missing recommendations'],
  ['recommendations が配列でない', { recommendations: 'x' }, 'missing recommendations'],
  ['recommendations が空', { recommendations: [] }, 'recommendations must be 1-5'],
  [
    'recommendations が 6 件',
    { recommendations: [rec(), rec(), rec(), rec(), rec(), rec()] },
    'recommendations must be 1-5',
  ],
  ['entry が文字列', wrap('x'), 'entry is not an object'],
  ['entry が null', wrap(null), 'entry is not an object'],
  ['categoryId が許可外', wrap(rec({ categoryId: 'nope' })), 'invalid categoryId: nope'],
  ['categoryId が数値 (型の門)', wrap(rec({ categoryId: 7 })), 'categoryId is not a string'],
  [
    'categoryId がプロトタイプ側の名前 (Set なので member ではない)',
    wrap(rec({ categoryId: 'constructor' })),
    'invalid categoryId: constructor',
  ],
  ['rank が文字列 (型の門)', wrap(rec({ rank: '1' })), 'rank is not a number'],
  ['rank が NaN', wrap(rec({ rank: Number.NaN })), 'invalid rank'],
  ['rank が Infinity', wrap(rec({ rank: Number.POSITIVE_INFINITY })), 'invalid rank'],
  ['rank が 0', wrap(rec({ rank: 0 })), 'invalid rank'],
  ['rank が 0.9 (1 未満)', wrap(rec({ rank: 0.9 })), 'invalid rank'],
  ['rationale が空', wrap(rec({ rationale: '' })), 'invalid rationale'],
  ['rationale が 601 字', wrap(rec({ rationale: 'あ'.repeat(601) })), 'invalid rationale'],
  ['rationale が数値', wrap(rec({ rationale: 1 })), 'invalid rationale'],
  ['actionItems が文字列', wrap(rec({ actionItems: 'x' })), 'invalid actionItems'],
  ['actionItems が空', wrap(rec({ actionItems: [] })), 'invalid actionItems'],
  [
    'actionItems が 6 件',
    wrap(rec({ actionItems: ['a', 'b', 'c', 'd', 'e', 'f'] })),
    'invalid actionItems',
  ],
  ['actionItem が空文字', wrap(rec({ actionItems: [''] })), 'invalid actionItem entry'],
  ['actionItem が 241 字', wrap(rec({ actionItems: ['a'.repeat(241)] })), 'invalid actionItem entry'],
  ['actionItem が数値', wrap(rec({ actionItems: [1] })), 'invalid actionItem entry'],
  ['riskFactors がオブジェクト', wrap(rec({ riskFactors: {} })), 'invalid riskFactors'],
  ['riskFactors が空', wrap(rec({ riskFactors: [] })), 'invalid riskFactors'],
  ['riskFactors が 4 件', wrap(rec({ riskFactors: ['a', 'b', 'c', 'd'] })), 'invalid riskFactors'],
  ['riskFactor が空文字', wrap(rec({ riskFactors: [''] })), 'invalid riskFactor entry'],
  ['riskFactor が 241 字', wrap(rec({ riskFactors: ['a'.repeat(241)] })), 'invalid riskFactor entry'],
  ['riskFactor が数値', wrap(rec({ riskFactors: [1] })), 'invalid riskFactor entry'],
];

describe('validateAdvisorJson — どの門で止めたか', () => {
  it.each(GATES)('★ %s', async (_label, raw, message) => {
    const validate = await loadValidator();
    expect(() => validate(raw, ALLOWED)).toThrow(new Error(message));
  });

  it('門の数だけ文面がある (どれか 1 つに寄っていない)', () => {
    // 上の表が「全部 response is not an object」のような形に潰れていないこと。
    // 門を 1 つ消して後ろの門が代わりに弾くようになったら、この数が減る。
    // categoryId の文面は値を埋め込むので、門の識別には接頭辞で数える。
    const gateOf = (m: string): string => (m.startsWith('invalid categoryId') ? 'invalid categoryId' : m);
    expect(new Set(GATES.map(([, , m]) => gateOf(m))).size).toBe(13);
  });
});

describe('validateAdvisorJson — 通す側', () => {
  it('境界ちょうどは通す (5 件 / 600 字 / 5 件 / 240 字 / 3 件 / rank 1)', async () => {
    const validate = await loadValidator();
    const out = validate(
      {
        recommendations: [
          rec({
            rank: 1,
            rationale: 'あ'.repeat(600),
            actionItems: ['a'.repeat(240), 'b', 'c', 'd', 'e'],
            riskFactors: ['a'.repeat(240), 'b', 'c'],
          }),
          rec(),
          rec(),
          rec(),
          rec(),
        ],
      },
      ALLOWED,
    );
    expect(out).toHaveLength(5);
  });

  it('★ 通した項目は 5 つの欄だけを持つ (LLM が足した欄を画面へ運ばない)', async () => {
    const validate = await loadValidator();
    const out = validate(
      wrap(rec({ evil: '<script>', __proto__: { polluted: true }, extra: 1 })),
      ALLOWED,
    );
    expect(Object.keys(out[0] as object).sort()).toEqual([
      'actionItems',
      'categoryId',
      'rank',
      'rationale',
      'riskFactors',
    ]);
    expect((out[0] as Record<string, unknown>).evil).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rank は 1 以上なら整数でなくても通す (順位の刻みは LLM に任せている)', async () => {
    const validate = await loadValidator();
    const out = validate(wrap(rec({ rank: 1.5 })), ALLOWED);
    expect((out[0] as { rank: number }).rank).toBe(1.5);
  });

  it('許可集合は呼び出し側から来る (別の集合なら別の categoryId が通る)', async () => {
    const validate = await loadValidator();
    expect(() => validate(wrap(rec({ categoryId: 'other' })), new Set(['other']))).not.toThrow();
    expect(() => validate(wrap(rec({ categoryId: 'ec' })), new Set(['other']))).toThrow(
      new Error('invalid categoryId: ec'),
    );
  });
});
