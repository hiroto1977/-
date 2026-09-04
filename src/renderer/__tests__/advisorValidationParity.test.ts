/*
 * jsdom を宣言していない —— この検査は純関数しか叩かず、DOM に触らないため。
 * `web-shim.ts` の据え付けは `typeof window !== 'undefined'` で囲まれているので
 * node 環境でも import できる (`lint:test-coverage` が無駄な jsdom を落とす)。
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
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

/*
 * AI アドバイザーの応答検査は **2 か所にある**。
 *
 *   main       `clients/business.ts` の `validateBusinessAdvisorJson` (検査あり・変異検査 100%)
 *   ブラウザ版 `web-shim.ts` の `validateAdvisorJson`                 (2026-08-22 まで検査 0 件)
 *
 * ここは**外部 LLM が返した JSON** という信用できない入力の関門で、通った値は
 * 画面と書き出し HTML に載る。実測でブラウザ側は変異体 126 件がどのテストにも
 * 触られていなかった。
 *
 * 本来は `src/shared/` へ 1 つに寄せるべき (両方 pure)。今そうしていないのは
 * main 側の例外文言を検査が字面で固定しているためで、**まずずれを検知する**。
 * 見るのは「通すか弾くか」の判断だけ —— 文言は側ごとに違ってよい。
 */
type Validator = (raw: unknown, allowed: ReadonlySet<string>) => unknown[];

const ALLOWED = new Set(['ec', 'sns-ops']);

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

/** 通す / 弾く だけを見る (文言は側ごとに違ってよい)。 */
function accepts(f: Validator, raw: unknown): boolean {
  try {
    f(raw, ALLOWED);
    return true;
  } catch {
    return false;
  }
}

const CASES: [string, unknown][] = [
  ['正当な 1 件', wrap(rec())],
  ['オブジェクトでない', 'nope'],
  ['null', null],
  ['recommendations が無い', {}],
  ['recommendations が配列でない', { recommendations: 'x' }],
  ['recommendations が空', { recommendations: [] }],
  ['recommendations が 5 件 (境界・通す)', { recommendations: [rec(), rec(), rec(), rec(), rec()] }],
  ['recommendations が 6 件 (境界・弾く)', { recommendations: [rec(), rec(), rec(), rec(), rec(), rec()] }],
  ['entry がオブジェクトでない', wrap('x')],
  ['entry が null', wrap(null)],
  ['categoryId が許可外', wrap(rec({ categoryId: 'nope' }))],
  ['categoryId が文字列でない', wrap(rec({ categoryId: 7 }))],
  ['categoryId がプロトタイプ側の名前', wrap(rec({ categoryId: 'constructor' }))],
  ['rank が数値でない', wrap(rec({ rank: '1' }))],
  ['rank が NaN', wrap(rec({ rank: Number.NaN }))],
  ['rank が Infinity', wrap(rec({ rank: Number.POSITIVE_INFINITY }))],
  ['rank が 0 (境界・弾く)', wrap(rec({ rank: 0 }))],
  ['rank が 1 (境界・通す)', wrap(rec({ rank: 1 }))],
  ['rationale が空', wrap(rec({ rationale: '' }))],
  ['rationale が 600 字 (境界・通す)', wrap(rec({ rationale: 'あ'.repeat(600) }))],
  ['rationale が 601 字 (境界・弾く)', wrap(rec({ rationale: 'あ'.repeat(601) }))],
  ['rationale が文字列でない', wrap(rec({ rationale: 1 }))],
  ['actionItems が配列でない', wrap(rec({ actionItems: 'x' }))],
  ['actionItems が空', wrap(rec({ actionItems: [] }))],
  ['actionItems が 5 件 (境界・通す)', wrap(rec({ actionItems: ['a', 'b', 'c', 'd', 'e'] }))],
  ['actionItems が 6 件 (境界・弾く)', wrap(rec({ actionItems: ['a', 'b', 'c', 'd', 'e', 'f'] }))],
  ['actionItem が空文字', wrap(rec({ actionItems: [''] }))],
  ['actionItem が 240 字 (境界・通す)', wrap(rec({ actionItems: ['a'.repeat(240)] }))],
  ['actionItem が 241 字 (境界・弾く)', wrap(rec({ actionItems: ['a'.repeat(241)] }))],
  ['actionItem が文字列でない', wrap(rec({ actionItems: [1] }))],
  ['riskFactors が配列でない', wrap(rec({ riskFactors: {} }))],
  ['riskFactors が空', wrap(rec({ riskFactors: [] }))],
  ['riskFactors が 3 件 (境界・通す)', wrap(rec({ riskFactors: ['a', 'b', 'c'] }))],
  ['riskFactors が 4 件 (境界・弾く)', wrap(rec({ riskFactors: ['a', 'b', 'c', 'd'] }))],
  ['riskFactor が空文字', wrap(rec({ riskFactors: [''] }))],
  ['riskFactor が 240 字 (境界・通す)', wrap(rec({ riskFactors: ['a'.repeat(240)] }))],
  ['riskFactor が 241 字 (境界・弾く)', wrap(rec({ riskFactors: ['a'.repeat(241)] }))],
];

async function loadBoth(): Promise<{ web: Validator; main: Validator }> {
  const webMod = (await import('../web-shim')) as unknown as { validateAdvisorJson: Validator };
  const mainMod = (await import('../../main/clients/business')) as unknown as {
    validateBusinessAdvisorJson: Validator;
  };
  return { web: webMod.validateAdvisorJson, main: mainMod.validateBusinessAdvisorJson };
}

describe('AI アドバイザーの応答検査は main とブラウザ版で同じ判断をする', () => {
  it.each(CASES)('%s', async (_label, raw) => {
    const { web, main } = await loadBoth();
    expect(accepts(web, raw)).toBe(accepts(main, raw));
  });

  it('「全部弾く」で一致していない (通す側も在る)', async () => {
    const { web, main } = await loadBoth();
    const accepted = CASES.filter(([, raw]) => accepts(web, raw));
    expect(accepted.length).toBeGreaterThanOrEqual(8);
    expect(CASES.length - accepted.length).toBeGreaterThanOrEqual(20);
    // 通した分は main も通す。
    for (const [, raw] of accepted) expect(accepts(main, raw)).toBe(true);
  });

  it('通ったときは中身をそのまま返す (落としも足しもしない)', async () => {
    const { web } = await loadBoth();
    const out = web(wrap(rec({ rank: 2, rationale: 'r' })), ALLOWED) as Record<string, unknown>[];
    expect(out).toEqual([
      { categoryId: 'ec', rank: 2, rationale: 'r', actionItems: ['やること'], riskFactors: ['risk'] },
    ]);
  });
});
