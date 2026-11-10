/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchViaProxy, parseProxyEnvelope } from '../proxy';
import { rereadModule } from '../../../shared/__tests__/rereadModule';
import { _resetVaultForTests, getVault } from '../../security/vault';

// jsdom は crypto.subtle を持たないので Node の webcrypto を借りる (他の vault 検査と同じ形)。
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * `proxy.mamori` へ移した判断の、変異検査が教えた穴を留める (2026-11-10 · MG-055)。
 *
 * - `__proto__` という名前のヘッダは落ちる (Map を経由すると本物の欄になってしまう)
 * - userinfo は**ユーザー名だけ**でも**パスワードだけ**でも断る
 * - プロキシへ送るヘッダは content-type と (在れば) x-proxy-auth の 2 つだけ
 * - モジュール直下の値 (未検証の文・MAC の用途名・null body status・上限) は読み直して全部主張する
 */
const cfg = { url: 'https://proxy.example.com/', sharedSecret: 'sek' } as unknown as Parameters<typeof fetchViaProxy>[2];
const noSecretCfg = { url: 'https://proxy.example.com/' } as unknown as Parameters<typeof fetchViaProxy>[2];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('封筒のヘッダ名 __proto__', () => {
  it('★ __proto__ は落ち、同じ封筒の他のヘッダは残る', () => {
    // JSON.parse は `__proto__` を自分の欄として作る (リテラルでは原型の代入になるので文字列で組む)。
    const raw = '{"status":200,"headers":{"__proto__":"x","a":"b"},"body":"z"}';
    const env = parseProxyEnvelope(raw);
    expect(Object.keys(env.headers)).toEqual(['a']);
    expect(env.headers['a']).toBe('b');
    expect(Object.getPrototypeOf(env.headers)).toBe(Object.prototype);
  });
});

describe('userinfo は片方だけでも断る', () => {
  const fail = async (url: string): Promise<string> => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    try {
      await fetchViaProxy(url, { method: 'GET' }, cfg);
    } catch (e) {
      return (e as Error).message;
    }
    return '';
  };
  it('★ ユーザー名だけ', async () => {
    expect(await fail('https://u@api.notion.com/')).toContain('userinfo');
  });
  it('★ パスワードだけ', async () => {
    expect(await fail('https://:p@api.notion.com/')).toContain('userinfo');
  });
  it('対照: 両方とも無ければ通る', async () => {
    expect(await fail('https://api.notion.com/v1/x')).toBe('');
  });
});

describe('プロキシへ送るヘッダ', () => {
  const capture = async (c: typeof cfg): Promise<Record<string, string>> => {
    let seen: Record<string, string> = {};
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      seen = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ status: 200, headers: {}, body: '' }), { status: 200 });
    }));
    await fetchViaProxy('https://api.notion.com/v1/x', { method: 'GET' }, c);
    return seen;
  };
  it('★ 共有秘密が在れば content-type と x-proxy-auth ちょうど 2 つ', async () => {
    expect(await capture(cfg)).toEqual({ 'content-type': 'application/json', 'x-proxy-auth': 'sek' });
  });
  it('★ 共有秘密が無ければ content-type だけ', async () => {
    expect(await capture(noSecretCfg)).toEqual({ 'content-type': 'application/json' });
  });
});

describe('読み直しても同じ値 (モジュール直下の値をすべて主張する)', () => {
  const PW = 'correct-horse-battery-staple';
  const PREF_DB = 'business-hub-preferences';
  const VAULT_DB = 'business-hub-vault';
  const clearDb = (name: string): Promise<void> =>
    new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  const readRaw = (): Promise<Record<string, unknown> | undefined> =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open(PREF_DB, 1);
      open.onsuccess = () => {
        const db = open.result;
        const r = db.transaction('kv', 'readonly').objectStore('kv').get('proxy');
        r.onsuccess = () => { db.close(); resolve(r.result as Record<string, unknown> | undefined); };
        r.onerror = () => { db.close(); reject(r.error ?? new Error('get failed')); };
      };
      open.onerror = () => reject(open.error ?? new Error('open failed'));
    });

  beforeEach(async () => {
    _resetVaultForTests();
    await clearDb(PREF_DB);
    await clearDb(VAULT_DB);
  });

  async function load(): Promise<typeof import('../proxy')> {
    return rereadModule<typeof import('../proxy')>(import.meta.url, '../proxy');
  }

  it('★ 未検証の理由の文 (一字ずつ)', async () => {
    const m = await load();
    expect(m.PROXY_UNVERIFIED_MESSAGE).toBe(
      'プロキシ設定を検証できませんでした（未署名または改竄の可能性があります）。設定画面でプロキシを保存し直してください。',
    );
  });

  it('★ 本文を持てない status は 204 / 205 / 304 ちょうど', async () => {
    const m = await load();
    expect([...m.NULL_BODY_STATUSES].sort((a, b) => a - b)).toEqual([204, 205, 304]);
    expect(m.NULL_BODY_STATUSES.size).toBe(3);
  });

  it('★ 応答の上限は 10 MiB', async () => {
    const m = await load();
    expect(m.MAX_PROXY_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('★ 保存時 MAC の用途名は proxy-config (別の用途名では通らない)', async () => {
    const m = await load();
    const v = getVault();
    await v.initialize(PW);
    await m.setProxyConfig({ url: 'https://my-worker.example.com/proxy', sharedSecret: 'shh' });
    const raw = await readRaw();
    expect(raw?.mac).toBeDefined();
    const canonical = JSON.stringify(['https://my-worker.example.com/proxy', 'shh']);
    expect(await v.verifyAuthTag('proxy-config', canonical, raw?.mac as never)).toBe(true);
    expect(await v.verifyAuthTag('proxy-config-x', canonical, raw?.mac as never)).toBe(false);
  });
});
