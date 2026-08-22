/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * ブラウザ版の**資格情報の出口**。`runProxyBearer` は、プロキシ経由で書き込む
 * 全アクション (calendar / gmail / drive / wordpress / canva / cloudflare /
 * notion / slack …) が通る 1 本の口です。
 *
 * ここには過去の事故が 1 つ埋まっています。保存値は「貼り付けた生の文字列」と
 * 「OAuth の TokenSet JSON」の 2 種類ありますが、以前は **JSON として読めたのに
 * `accessToken` が無い場合、その JSON 丸ごとを `Authorization: Bearer` に載せて**
 * いました。TokenSet には `refreshToken` が入る — アクセストークンより強い
 * 資格情報が、渡す必要のない相手 (とプロキシの運用者) へ出ます。しかも JSON の
 * 塊は Bearer として通らないので、**漏らす代償だけ払って認証は必ず失敗**します。
 *
 * 規則は `src/shared/vaultToken.ts` に寄せて検査済みですが、**web-shim が
 * その規則を実際に通しているか**は誰も見ていませんでした (2026-08-22)。
 * `runProxyBearer` から `bearerFromStoredToken` を外しても、
 * `vaultToken.test.ts` は 1 本も落ちません。ここはその配線を留めます。
 */

let stored: string | null = null;
let vaultThrows: Error | null = null;
let proxyConfig: { url: string } | null = { url: 'https://proxy.example/worker' };
const transportCalls: { url: string; init: RequestInit }[] = [];
const bearersSeen: string[] = [];

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => {
      if (vaultThrows) throw vaultThrows;
      return stored;
    },
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => proxyConfig,
  fetchViaProxy: async (url: string, init: RequestInit) => {
    transportCalls.push({ url, init });
    return new Response('{}', { status: 200 });
  },
  PROXY_REQUIRED_SERVICES: new Set(['notion', 'atlassian', 'cloudflare']),
}));

/** 書き込みクライアントは、**渡された bearer だけ**を記録する薄い偽物にする。 */
vi.mock('../data/saasWriteWeb', async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const spy =
    (name: string) =>
    async (_payload: unknown, token: string) => {
      bearersSeen.push(token);
      return { spy: name };
    };
  return {
    ...real,
    createCalendarEvent: spy('calendar'),
    createGmailDraft: spy('gmail'),
    createDriveFolder: spy('drive'),
    createWordPressPostDraft: spy('wordpress'),
    createCanvaFolder: spy('canva'),
    createCloudflareDnsRecord: spy('cloudflare'),
  };
});

type Hub = Record<string, unknown>;
async function loadShim(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}
const invoke = async (hub: Hub, svc: string, action: string, payload: unknown = {}) =>
  (await (hub.invoke as (a: string, b: string, c: unknown) => Promise<{ ok: boolean; code?: string; message?: string }>)(
    svc,
    action,
    payload,
  ));

beforeEach(() => {
  stored = null;
  vaultThrows = null;
  proxyConfig = { url: 'https://proxy.example/worker' };
  transportCalls.length = 0;
  bearersSeen.length = 0;
});

describe('壊れた TokenSet を外へ出さない', () => {
  it('accessToken の無い JSON は Bearer に載せず、断る', async () => {
    // これが再発すると refreshToken ごと相手とプロキシ運用者へ出る。
    stored = JSON.stringify({ refreshToken: 'RT_SUPER_SECRET', expiresAt: 1 });
    const hub = await loadShim();
    const r = await invoke(hub, 'calendar', 'create-event');

    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_configured');
    expect(bearersSeen).toEqual([]);
    expect(transportCalls).toEqual([]);
  });

  it('断りの文言に refreshToken を混ぜない', async () => {
    stored = JSON.stringify({ refreshToken: 'RT_SUPER_SECRET' });
    const hub = await loadShim();
    const r = await invoke(hub, 'gmail', 'create-draft');
    expect(JSON.stringify(r)).not.toContain('RT_SUPER_SECRET');
  });

  it('オブジェクトの形なのに使える accessToken が無ければ通さない', async () => {
    // 配列も `typeof === 'object'` なので、ここを素通りさせない。
    // `[{accessToken}]` は中身が正しく見えても、取り出す場所が違う。
    for (const bad of ['{}', '[]', '[{"accessToken":"x"}]', '{"accessToken":""}']) {
      stored = bad;
      const hub = await loadShim();
      const r = await invoke(hub, 'drive', 'create-folder');
      expect(r.ok, bad).toBe(false);
    }
    expect(bearersSeen).toEqual([]);
    expect(transportCalls).toEqual([]);
  });

  it('オブジェクトの形でない値は生のトークンとして扱う (断らない)', async () => {
    // **これは意図した挙動**。数字だけの API キーは `12345` として JSON の
    // 数値に読めてしまうし、`null` や `""` も JSON としては読める。
    // 「TokenSet の形をしていない」= 貼り付けた生の文字列、と読む。
    // 送っても相手が 401 を返すだけで、refreshToken のような**別の秘密が
    // 漏れることはない** — 断るべきなのは「漏れる形」だけである。
    for (const raw of ['12345', 'null', '""', 'ghp_plain']) {
      stored = raw;
      bearersSeen.length = 0;
      const hub = await loadShim();
      const r = await invoke(hub, 'drive', 'create-folder');
      expect(r.ok, raw).toBe(true);
      expect(bearersSeen, raw).toEqual([raw]);
    }
  });

  it('正しい TokenSet なら accessToken **だけ**を渡す', async () => {
    stored = JSON.stringify({ accessToken: 'AT_OK', refreshToken: 'RT_SUPER_SECRET' });
    const hub = await loadShim();
    const r = await invoke(hub, 'calendar', 'create-event');

    expect(r.ok).toBe(true);
    expect(bearersSeen).toEqual(['AT_OK']);
    // JSON 丸ごとでも refreshToken でもない。
    expect(bearersSeen[0]).not.toContain('RT_SUPER_SECRET');
    expect(bearersSeen[0]).not.toContain('{');
  });

  it('貼り付けた生のトークンはそのまま渡す', async () => {
    stored = 'ghp_raw_pasted_token';
    const hub = await loadShim();
    await invoke(hub, 'wordpress', 'create-post-draft');
    expect(bearersSeen).toEqual(['ghp_raw_pasted_token']);
  });
});

describe('資格情報が使えないときは、外へ出る準備をしない', () => {
  it('未設定なら断り、通信もしない', async () => {
    stored = null;
    const hub = await loadShim();
    const r = await invoke(hub, 'canva', 'create-folder');
    expect(r.code).toBe('not_configured');
    expect(transportCalls).toEqual([]);
  });

  it('Vault がロックされていれば、その旨を伝えて通信しない', async () => {
    vaultThrows = new Error('locked');
    const hub = await loadShim();
    const r = await invoke(hub, 'canva', 'create-folder');
    expect(r.code).toBe('not_configured');
    expect(r.message).toContain('ロック');
    expect(transportCalls).toEqual([]);
  });

  it('**資格情報の確認はプロキシ用意より先**', async () => {
    // 両方だめなとき、「プロキシを登録してください」と案内すると、
    // 利用者は無関係な設定をしに行かされる。手元で使えないと分かっている
    // のに外へ出る準備を始める理由も無い。
    stored = null;
    proxyConfig = null;
    const hub = await loadShim();
    const r = await invoke(hub, 'canva', 'create-folder');
    expect(r.message).not.toContain('プロキシ');
    expect(r.message).toContain('トークン');
  });

  it('資格情報が正しくてもプロキシ未設定なら、その理由を返す', async () => {
    stored = 'ghp_raw_pasted_token';
    proxyConfig = null;
    const hub = await loadShim();
    const r = await invoke(hub, 'canva', 'create-folder');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('プロキシ');
    expect(bearersSeen).toEqual([]);
  });
});
