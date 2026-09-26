/**
 * **鍵が無ければ、送る前に断る** —— Anthropic を呼ぶ 3 つの操作を**両ビルド**で
 * 振る舞いから留める (2026-09-24 · パス 451)。
 *
 * 綴りの走査 (`credentialFaceCensus`) は「読む口と書く口が在るか」までしか言えない。
 * ここが見るのは**答えそのもの** —— 空のトークンで実物の handler を呼び、
 *
 *  ① 網の口を 1 度も叩かないこと (鍵の無い要求を有料 API へ送らない)
 *  ② 断りが `MISSING_ANTHROPIC_KEY_MESSAGE` そのものであること (文は 1 つ)
 *  ③ 逃げ口 (画面の「Anthropic API キー」) を名乗ること
 *
 * 直す前の実測 (2026-09-24) は `shared/advisorQuestionLimits.ts` の docblock の表に在る:
 * `stocks/advise` と `business/advise` は**空の鍵で 1 回送り**、相手の 401 の本文
 * (「鍵が不正」) が画面へ出ていた。`emotions/analyze-text` だけが送る前に断り、
 * その文は**英語**だった。
 */
import { describe, expect, it, vi } from 'vitest';
import { MISSING_ANTHROPIC_KEY_MESSAGE } from '../advisorQuestionLimits';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/service-hub-p451', getVersion: () => '0.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

/** 叩かれたら記録する偽の fetch —— **叩かれないことがこの検査の要点**。 */
function countingFetch(hits: { n: number }): typeof fetch {
  return (async () => {
    hits.n += 1;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

type ActionMod = { ACTIONS: Record<string, (ctx: unknown) => Promise<unknown>> };

/** 実物の handler を読む口。**静的な import だけ**にする (上の注記の理由)。 */
const LOADERS: Record<'stocks' | 'business' | 'emotions', () => Promise<ActionMod>> = {
  stocks: () => import('../../main/clients/stocks') as unknown as Promise<ActionMod>,
  business: () => import('../../main/clients/business') as unknown as Promise<ActionMod>,
  emotions: () => import('../../main/clients/emotions') as unknown as Promise<ActionMod>,
};

describe('main —— 空のトークンで Anthropic を呼ばない', () => {
  const CASES = [
    ['stocks', 'advise', { question: '今月はどうすべき？' }],
    ['business', 'advise', { question: '今月はどうすべき？' }],
    ['emotions', 'analyze-text', { text: 'つらい' }],
  ] as const;

  it.each(CASES.map((c) => [c[0], c[1], c[2]] as const))(
    '★ %s/%s は送る前に断り、文は 1 つ',
    async (service, action, payload) => {
      // **静的な表で読む** —— 綴りを組み立てる動的 import は vite が警告し、
      // 束ねる側から辿れない (`invalid import "…/${'…'}"`)。母集団は上の CASES が持つ。
      const mod = await LOADERS[service]();
      const fn = mod.ACTIONS[action];
      expect(fn, `${service}/${action} が登録されていない`).toBeTypeOf('function');
      const hits = { n: 0 };
      await expect(
        fn!({ token: '', payload, fetch: countingFetch(hits) }),
      ).rejects.toThrow(MISSING_ANTHROPIC_KEY_MESSAGE);
      expect(hits.n, '鍵が無いのに網の口を叩いた').toBe(0);
    },
  );

  it('★ 文は逃げ口を名乗る (画面の入力欄の綴り)', () => {
    expect(MISSING_ANTHROPIC_KEY_MESSAGE).toContain('Anthropic API キー');
    expect(MISSING_ANTHROPIC_KEY_MESSAGE).toContain('未設定');
    // 対照: 相手の言い分 (鍵が不正) を writeback しない —— 原因が違う。
    expect(MISSING_ANTHROPIC_KEY_MESSAGE).not.toMatch(/不正|invalid/i);
    // 針が的に当たることを標本で示す (不在の主張には標本を添える)。
    expect('invalid x-api-key').toMatch(/不正|invalid/i);
  });
});
