/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';

const SENTINEL = 'sk-ant-api03-SENTINELKEY0000';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => JSON.stringify({ anthropic: SENTINEL, openai: SENTINEL }),
    status: async () => 'unlocked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

/*
 * **`err()` を通らない誤りの文言が 1 つだけあった。**
 *
 * `web-shim` の `err()` は `redactForMessage` を内側で通すので、そこを
 * 通る文言は全部伏せられる。だが `assistant.chatAll` はプロバイダごとの
 * 失敗を `ok({ answers })` の**中身**として返すので、関門を通らない。
 *
 * 実測 (2026-08-23): 送信が `Authorization: Bearer sk-ant-…` を含む例外で
 * 落ちると、その鍵が**そのまま `answers[].error` に載って画面へ届いた**。
 * main 側の同じ経路は先に塞いであったのに、ブラウザ版が残っていた。
 *
 * **数える単位は「err() の呼び出し」ではなく「画面へ出る文字列」。**
 * 出口が 1 つだと思い込んだところに、出口がもう 1 つあった。
 */

type Hub = { invoke: (s: string, a: string, p: unknown) => Promise<unknown> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

describe('画面へ出る文字列は、どの出口でも伏字を通る', () => {
  it('chatAll: 例外に混じった鍵が answers[].error へ逐語で出ない', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`connect ECONNREFUSED while sending Authorization: Bearer ${SENTINEL}`);
    });
    const hub = await loadHub();
    const res = await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    const blob = JSON.stringify(res);
    expect(blob, '鍵が逐語で画面まで届いている').not.toContain(SENTINEL);
  });

  it('走査が実物に届いている (answers に到達していて、空虚でない)', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`boom Authorization: Bearer ${SENTINEL}`);
    });
    const hub = await loadHub();
    const res = (await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    })) as { ok: boolean; data?: { answers?: { ok: boolean; error?: string }[] } };
    // ここへ来ていること自体が前提 —— 資格情報の形が違うと
    // `not_configured` で折り返して、上の検査は何も確かめない。
    expect(res.ok, 'chatAll の本体に届いていない (検査が空虚)').toBe(true);
    const answers = res.data?.answers ?? [];
    expect(answers.length, 'プロバイダが 1 つも走っていない').toBeGreaterThanOrEqual(2);
    const failed = answers.filter((a) => !a.ok && (a.error ?? '').length > 0);
    expect(failed.length, '失敗した答えが無い — 誤りの経路を通っていない').toBeGreaterThanOrEqual(2);
    // 伏せた跡が在ること (中身ごと消えたのではなく、伏字として残っている)。
    expect(failed.some((a) => (a.error ?? '').includes('Authorization'))).toBe(true);
  });

  it('伏字は必要な文脈まで消さない (読める誤りとして残る)', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`connect ECONNREFUSED to api.anthropic.com`);
    });
    const hub = await loadHub();
    const res = (await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    })) as { data?: { answers?: { error?: string }[] } };
    const errors = (res.data?.answers ?? []).map((a) => a.error ?? '').join(' ');
    expect(errors, '秘密でない文脈まで消している').toContain('ECONNREFUSED');
  });
});
