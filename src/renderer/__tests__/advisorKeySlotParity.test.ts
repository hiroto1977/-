/** @vitest-environment jsdom */
/**
 * **ブラウザ版も、画面が書いたスロットを読む** (2026-09-24 · パス 451)。
 *
 * 直す前、アドバイザー 2 つは `anthropic` のスロットだけを読み、main は
 * サービスのスロット (`stocks` / `business`) だけを読んでいた —— **同じ質問に
 * アプリが 2 通り答えていた**。画面の `tokenSetup` が書くのはサービスのスロットなので、
 * そこを読まないと**パス 451 で足した入力欄が、ブラウザ版では効かない**
 * (= パス 450 の「読めるのに書けない」の裏返しを新しく作ることになる)。
 *
 * 順序は「サービスのスロット → `anthropic`」。`anthropic` を落とすと、設定画面の
 * 「Anthropic API キー」に入れた**既存の利用者がその場で鍵を失う**ので、
 * 後ろに残す。理由は `web-shim.ts` の `readAnthropicKey` の docblock に在る。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSING_ANTHROPIC_KEY_MESSAGE } from '../../shared/advisorQuestionLimits';

/** 鍵ごとの保管庫 —— これが無いと「どちらのスロットを読んだか」を測れない。 */
let slots: Record<string, string> = {};
let vaultThrows: Error | null = null;
const reads: string[] = [];

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => {
      reads.push(id);
      if (vaultThrows) throw vaultThrows;
      return slots[id] ?? null;
    },
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));

const SERVICES = ['stocks', 'business'] as const;

beforeEach(() => {
  slots = {};
  vaultThrows = null;
  reads.length = 0;
});

async function invoke(service: string, payload: unknown): Promise<{ ok: boolean; message?: string }> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  const hub = (window as unknown as {
    serviceHub: { invoke: (s: string, a: string, p: unknown) => Promise<{ ok: boolean; message?: string }> };
  }).serviceHub;
  return hub.invoke(service, 'advise', payload);
}

describe('ブラウザ版のアドバイザーが読む鍵のスロット', () => {
  it.each(SERVICES)('★ %s: どちらのスロットにも無ければ、共有の文で断る', async (service) => {
    const r = await invoke(service, { question: '今月はどうすべき？' });
    expect(r.ok).toBe(false);
    expect(r.message).toBe(MISSING_ANTHROPIC_KEY_MESSAGE);
    // サービスのスロットを**先に**見る (画面の入力欄が書く先)。
    expect(reads[0]).toBe(service);
  });

  it.each(SERVICES)('★ %s: サービスのスロットに在れば、そこで足りる', async (service) => {
    slots[service] = 'sk-ant-from-page';
    const r = await invoke(service, { question: '今月はどうすべき？' });
    // 鍵が読めたので「未設定」では断らない (先へ進んで別の理由で止まるのは構わない)。
    expect(r.message).not.toBe(MISSING_ANTHROPIC_KEY_MESSAGE);
    // `anthropic` は見に行かない (先が当たったので)。
    expect(reads).not.toContain('anthropic');
  });

  it.each(SERVICES)('★ %s: 既存の `anthropic` だけでも読める (誰も何も失わない)', async (service) => {
    slots['anthropic'] = 'sk-ant-from-settings';
    const r = await invoke(service, { question: '今月はどうすべき？' });
    expect(r.message).not.toBe(MISSING_ANTHROPIC_KEY_MESSAGE);
    expect(reads).toEqual([service, 'anthropic']);
  });

  it('★ 施錠は「未設定」と混ぜない (原因が違えば直す手も違う)', async () => {
    vaultThrows = new Error('locked');
    const r = await invoke('stocks', { question: 'x' });
    expect(r.ok).toBe(false);
    expect(r.message).not.toBe(MISSING_ANTHROPIC_KEY_MESSAGE);
    expect(r.message).toContain('ロック');
  });
});
