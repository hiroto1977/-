/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
let vaultWriteThrows: Error | null = null;
let vaultClearThrows: Error | null = null;
const vaultWrites: [string, string][] = [];
const vaultClears: string[] = [];
let proxyConfig: { url: string } | null = { url: 'https://proxy.example/worker' };
const transportCalls: { url: string; init: RequestInit }[] = [];
const bearersSeen: string[] = [];

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => {
      if (vaultThrows) throw vaultThrows;
      return stored;
    },
    setToken: async (id: string, tok: string) => {
      if (vaultWriteThrows) throw vaultWriteThrows;
      vaultWrites.push([id, tok]);
    },
    clearToken: async (id: string) => {
      if (vaultClearThrows) throw vaultClearThrows;
      vaultClears.push(id);
    },
    listServices: async () => ['github'],
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
  vaultWriteThrows = null;
  vaultClearThrows = null;
  vaultWrites.length = 0;
  vaultClears.length = 0;
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

/*
 * 保存・削除の失敗も伏字の合流点を通すこと。
 *
 * `err()` の説明は「ブラウザ版の**全ての失敗**が通る 1 本の口」と書いていたが、
 * `setToken` / `clearToken` は戻り値の型が違う (`TokenSaveResult` / `OsOpResult`)
 * ので **通っていなかった** —— しかも資格情報が生きている 2 経路である
 * (2026-08-22)。main 側の `secrets:set` も同じ形で漏れていた。
 */
/*
 * **API キーがどこへ、何と一緒に出ていくか。**
 *
 * ブラウザ版は Anthropic を**直接**叩く (公式に CORS 対応なのでプロキシを
 * 経由しない)。送り先 URL とヘッダはリテラルなので `lint:network-targets`
 * (送り先が変数で決まる通信の台帳) の対象外で、**何も見ていなかった**。
 * URL が変われば鍵がそのまま別のホストへ行く。字面で留める。
 */
describe('API キーの送り先とヘッダ', () => {
  const KEY = 'sk-ant-test-key-value';
  let fetchCalls: { url: string; init: RequestInit }[] = [];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: '{"recommendations":[]}' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('事業アドバイザーは api.anthropic.com へ送り、鍵は x-api-key だけに載る', async () => {
    stored = KEY;
    const hub = await loadShim();
    await invoke(hub, 'business', 'advise', { question: '次に注力すべき事業は？' });

    expect(fetchCalls.map((c) => c.url)).toEqual(['https://api.anthropic.com/v1/messages']);
    const h = fetchCalls[0]!.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe(KEY);
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(h['content-type']).toBe('application/json');
    // 鍵が他のヘッダに混ざっていない (Authorization へ二重に載せる等)。
    const elsewhere = Object.entries(h).filter(([k, v]) => k !== 'x-api-key' && String(v).includes(KEY));
    expect(elsewhere, `鍵が別のヘッダにも載っている: ${JSON.stringify(elsewhere)}`).toEqual([]);
    // 本文にも鍵は載らない。
    expect(String(fetchCalls[0]!.init.body)).not.toContain(KEY);
  });

  /*
   * **同じ守りを、鍵を持つ残り 2 経路にも当てる (2026-08-25)。**
   *
   * 上の 1 本は「事業アドバイザー」だけを留めていた。ところが
   * `x-api-key` を載せて Anthropic を直接叩く経路は**3 つ**ある ——
   * `business/advise` / `stocks/advise` / `emotions/analyze`。
   *
   * 実測した: `web-shim.ts` の `stocks` 側と `emotions` 側の URL を
   * `https://exfil.example/v1/messages` へ書き換えても、
   * **10,778 件のテストが全部緑のまま通った**。
   * 利用者の API キーが、そのまま別のホストへ出る変更である。
   *
   * 「掃討はファイル単位、危険は関数単位」—— 同じファイルの中で、
   * 兄弟の関数だけが留められていなかった。
   */
  it.each([
    ['stocks', 'advise', { question: '次に買い増すべき銘柄は？' }],
    ['emotions', 'analyze-text', { text: '今日は落ち着いている' }],
  ])('★ %s/%s も api.anthropic.com へしか送らない', async (service, action, payload) => {
    stored = KEY;
    const hub = await loadShim();
    await invoke(hub, service, action, payload);

    expect(
      fetchCalls.map((c) => c.url),
      `${service}/${action} の送り先が変わっています (鍵が別ホストへ出ます)`,
    ).toEqual(['https://api.anthropic.com/v1/messages']);
    const h = fetchCalls[0]!.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe(KEY);
    // 鍵が他のヘッダにも本文にも混ざらない。
    const elsewhere = Object.entries(h).filter(([k, v]) => k !== 'x-api-key' && String(v).includes(KEY));
    expect(elsewhere, `鍵が別のヘッダにも載っている: ${JSON.stringify(elsewhere)}`).toEqual([]);
    expect(String(fetchCalls[0]!.init.body)).not.toContain(KEY);
  });

  /*
   * **名指しの規則は、名指しした綴りしか止められない。**
   * 上の 3 本は今ある 3 経路を留めるが、**4 本目**には何も言わない。
   * 鍵を載せて直接叩く口の**集合**も留める。
   */
  it('★ 鍵を載せて直接叩く送り先は、字面で 1 つだけ', async () => {
    const src = readFileSync(join(__dirname, '..', 'web-shim.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const targets = [...src.matchAll(/timedFetchAi\(\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(targets.length, '走査が timedFetchAi を 1 つも拾えていない').toBeGreaterThanOrEqual(3);
    expect(
      [...new Set(targets)],
      'timedFetchAi の送り先が増えました。鍵が出る先なので、上の it.each にも足してください',
    ).toEqual(['https://api.anthropic.com/v1/messages']);
  });

  it('鍵が未設定なら 1 度も外へ出ない', async () => {
    stored = null;
    const hub = await loadShim();
    const r = await invoke(hub, 'business', 'advise', { question: 'x' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_configured');
    expect(fetchCalls).toEqual([]);
  });

  it('質問が規則違反なら、鍵を読む前に断って外へ出ない', async () => {
    stored = KEY;
    const hub = await loadShim();
    for (const question of ['', 'a'.repeat(1001), 'ok\nbad']) {
      const r = await invoke(hub, 'business', 'advise', { question });
      expect(r.ok).toBe(false);
    }
    expect(fetchCalls).toEqual([]);
  });
});

/*
 * **ブラウザから直接叩いてよい相手かどうか。**
 *
 * `AI_PROVIDERS[id].browserDirect` が false の提供元は、ブラウザから直接
 * fetch してはいけない。とくに `compat` は **送り先を利用者が資格情報で
 * 指定する**ので (`compatUrl`)、直接叩けば任意のホストへ画面から鍵を載せた
 * 通信が出る。だから `browserDirect: false` で、プロキシ未設定なら断る。
 *
 * 表そのもの (どの提供元が true/false か) は `providers.test.ts` が字面で
 * 留めている。ここは**それを読む側**が約束を守っているかを見る。
 */
describe('ブラウザ直接続の可否を守っているか', () => {
  let fetchCalls: string[] = [];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      fetchCalls.push(String(input));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const CHAT = { messages: [{ role: 'user', content: 'こんにちは' }] };

  it.each([
    ['compat (送り先が利用者指定)', { compatUrl: 'https://arbitrary.example/v1', compatKey: 'k', compatModel: 'm', default: 'compat' }],
    ['openai (CORS 非対応)', { openai: 'sk-openai-key', default: 'openai' }],
  ])('%s はプロキシ未設定なら断り、1 度も外へ出ない', async (_label, creds) => {
    stored = JSON.stringify(creds);
    proxyConfig = null;
    const hub = await loadShim();
    const r = await invoke(hub, 'assistant', 'chat', CHAT);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_configured');
    expect(fetchCalls, `直接叩いてしまった: ${JSON.stringify(fetchCalls)}`).toEqual([]);
    expect(transportCalls, 'プロキシ未設定なのに中継しようとした').toEqual([]);
  });

  it('compat はプロキシがあれば中継越しにしか出ない (直接 fetch しない)', async () => {
    stored = JSON.stringify({ compatUrl: 'https://arbitrary.example/v1', compatKey: 'k', compatModel: 'm', default: 'compat' });
    proxyConfig = { url: 'https://proxy.example/worker' };
    const hub = await loadShim();
    await invoke(hub, 'assistant', 'chat', CHAT);
    expect(fetchCalls, `中継を通さず直接叩いた: ${JSON.stringify(fetchCalls)}`).toEqual([]);
    expect(transportCalls.length).toBeGreaterThan(0);
    expect(transportCalls[0]!.url).toContain('arbitrary.example');
  });

  it('anthropic (browserDirect: true) は中継を通さず直接叩く', async () => {
    stored = JSON.stringify({ anthropic: 'sk-ant-key', default: 'anthropic' });
    proxyConfig = { url: 'https://proxy.example/worker' };
    const hub = await loadShim();
    await invoke(hub, 'assistant', 'chat', CHAT);
    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0]).toContain('api.anthropic.com');
    expect(transportCalls).toEqual([]);
  });
});

describe('資格情報の保存・削除の失敗も伏字を通す', () => {
  const SECRET = `ghp_${'a'.repeat(36)}`;

  it('setToken の失敗に混ざった秘密は伏せて返す', async () => {
    vaultWriteThrows = new Error(`write failed with ${SECRET}`);
    const hub = await loadShim();
    const call = hub.setToken as (a: string, b: unknown) => Promise<{ message: string }>;
    const r = await call('github', 'ghp_valid_token_value');
    expect(r.message).not.toContain('a'.repeat(36));
    expect(r.message).toContain('ghp_');
  });

  it('clearToken の失敗に混ざった秘密は伏せて返す', async () => {
    vaultClearThrows = new Error(`clear failed with ${SECRET}`);
    const hub = await loadShim();
    const call = hub.clearToken as (a: string) => Promise<{ message: string }>;
    const r = await call('github');
    expect(r.message).not.toContain('a'.repeat(36));
    expect(r.message).toContain('ghp_');
  });

  it('長すぎる失敗は切って返す', async () => {
    vaultWriteThrows = new Error('x'.repeat(5000));
    const hub = await loadShim();
    const call = hub.setToken as (a: string, b: unknown) => Promise<{ message: string }>;
    const r = await call('github', 'ghp_valid_token_value');
    expect(r.message.length).toBeLessThan(5000);
    expect(r.message.length).toBeLessThanOrEqual(2000);
  });
});

describe('資格情報の保存 — 弾く規則はデスクトップ版と同じ 1 つ', () => {
  const save = async (tok: unknown) => {
    const hub = await loadShim();
    return (await (hub.setToken as (a: string, b: unknown) => Promise<{ ok: boolean; code?: string }>)(
      'github',
      tok,
    ));
  };

  it('空・空白だけは保存しない', async () => {
    // 保存したように見えて中身が無いと、あとで「設定したのに繋がらない」に
    // なる。規則は `shared/tokenInput.ts` に 1 つだけ置いてある。
    for (const tok of ['', '   ', '\n\t ']) {
      const r = await save(tok);
      expect(r.ok, JSON.stringify(tok)).toBe(false);
      expect(r.code).toBe('invalid_token');
    }
    expect(vaultWrites).toEqual([]);
  });

  it('文字列でないものは保存しない', async () => {
    for (const tok of [undefined, null, 42, {}, []]) {
      const r = await save(tok);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('invalid_token');
    }
    expect(vaultWrites).toEqual([]);
  });

  it('上限を超える長さは保存しない', async () => {
    const r = await save('a'.repeat(65_537));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('invalid_token');
    expect(vaultWrites).toEqual([]);
  });

  it('上限ちょうどは保存する', async () => {
    const tok = 'a'.repeat(65_536);
    expect((await save(tok)).ok).toBe(true);
    expect(vaultWrites).toEqual([['github', tok]]);
  });

  it('前後の空白を落として保存する', async () => {
    expect((await save('  ghp_padded  ')).ok).toBe(true);
    expect(vaultWrites).toEqual([['github', 'ghp_padded']]);
  });

  it('Vault への書き込みが失敗したら、成功に見せない', async () => {
    vaultWriteThrows = new Error('IndexedDB quota exceeded');
    const r = await save('ghp_valid_token');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('write_failed');
  });

  it('削除の失敗も黙らない (消したつもりを作らない)', async () => {
    vaultClearThrows = new Error('vault locked');
    const hub = await loadShim();
    const r = (await (hub.clearToken as (a: string) => Promise<{ ok: boolean }>)('github')) as {
      ok: boolean;
    };
    expect(r.ok).toBe(false);
  });

  it('正しい削除は Vault へ届く', async () => {
    const hub = await loadShim();
    const r = (await (hub.clearToken as (a: string) => Promise<{ ok: boolean }>)('github')) as {
      ok: boolean;
    };
    expect(r.ok).toBe(true);
    expect(vaultClears).toEqual(['github']);
  });
});
