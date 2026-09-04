/*
 * ブラウザ版の AI 経路 —— **外部 API へ送る会話履歴の上限**。
 *
 * `web-shim.ts` は 2026-08-22 の実測で変異体 1178 件がどのテストにも
 * 触られていなかった。そのうち security に効くのは
 *   - `sanitizeAssistantTurns` (外部 API へ送る会話履歴の上限)
 *   - 各 `call*` の**送り先 URL とヘッダ** (キーが載る場所)
 * の 2 つ。ここを字面で留める。
 *
 * jsdom は要らない (据え付けは `typeof window !== 'undefined'` で囲まれている)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let storedToken: string | null = 'sk-ant-test-key';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => storedToken,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['anthropic'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));

type Shim = Record<string, unknown>;
async function loadShim(): Promise<Shim> {
  vi.resetModules();
  delete (globalThis as { serviceHub?: unknown }).serviceHub;
  const mod = (await import('../web-shim')) as unknown as Record<string, unknown>;
  return mod as Shim;
}

beforeEach(() => {
  storedToken = 'sk-ant-test-key';
});

describe('sanitizeAssistantTurns — 外部 API へ送る会話履歴の関門', () => {
  async function sanitize(raw: unknown): Promise<{ role: string; content: string }[]> {
    const mod = (await loadShim()) as { sanitizeAssistantTurns: (r: unknown) => { role: string; content: string }[] };
    return mod.sanitizeAssistantTurns(raw);
  }

  it.each([
    ['配列でない (文字列)', 'nope'],
    ['配列でない (オブジェクト)', { messages: [] }],
    ['null', null],
    ['undefined', undefined],
    ['数値', 7],
  ])('%s は空配列', async (_label, raw) => {
    expect(await sanitize(raw)).toEqual([]);
  });

  it.each([
    ['null の要素', [null]],
    ['文字列の要素', ['hi']],
    ['role が system', [{ role: 'system', content: 'x' }]],
    ['role が無い', [{ content: 'x' }]],
    ['content が文字列でない', [{ role: 'user', content: 42 }]],
    ['content が空白だけ', [{ role: 'user', content: '   ' }]],
    ['content が空文字', [{ role: 'user', content: '' }]],
  ])('%s は落とす', async (_label, raw) => {
    expect(await sanitize(raw)).toEqual([]);
  });

  it('user と assistant はどちらも通す', async () => {
    expect(
      await sanitize([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
  });

  it('前後の空白は落とす', async () => {
    expect(await sanitize([{ role: 'user', content: '  hi  ' }])).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('1 発話は 8000 字で切る (境界)', async () => {
    const at = await sanitize([{ role: 'user', content: 'a'.repeat(8000) }]);
    expect(at[0]!.content.length).toBe(8000);
    const over = await sanitize([{ role: 'user', content: 'a'.repeat(8001) }]);
    expect(over[0]!.content.length).toBe(8000);
  });

  it('直近 40 発話だけ残す (境界・古い側を捨てる)', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const kept = await sanitize(many);
    expect(kept).toHaveLength(40);
    // 残るのは新しい側。
    expect(kept[0]!.content).toBe('m5');
    expect(kept[39]!.content).toBe('m44');
  });

  it('ちょうど 40 発話は全部残る (境界)', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    expect(await sanitize(many)).toHaveLength(40);
  });
});
