import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * secrets.ts の**書き込み側**。
 *
 * 2026-08 の変異検査で、このファイルが 42.27% (未到達 78 / 生存 34) だと分かった。
 * 既存の 17 本は全部**読み出し側**で、`setToken` / `clearToken` / `encode` /
 * `upgradePlainValues` / 書き込みの直列化 / OAuth の更新経路には**一本も無かった**。
 *
 * つまり「保存時にトークンが本当に暗号化されるか」を誰も見ていなかった。
 * `safeStorage.isEncryptionAvailable()` を常に false にする書き換えを入れても
 * 全テストが通る — 全資格情報が黙って base64 の難読化だけに格下げされる変更が、
 * 検査をすり抜ける状態だった。ここはその穴を塞ぐ。
 *
 * electron は読み出し側テストと同じ形でモックする。`atomicWrite` は**モックしない** —
 * ファイルの権限 (0o600) と `.prev` 退避は実物で確かめたいため。
 */
let encryptionAvailable = true;
let userDataDir = '';
/** `refresh()` の差し替え先。更新経路のテストが各自で入れ替える。 */
let refreshImpl: (config: unknown, tokens: { refreshToken?: string }) => Promise<unknown> = async () => {
  throw new Error('refresh was not stubbed');
};
let refreshCalls = 0;

vi.mock('electron', () => ({
  app: {
    // どの Electron パスを訊いているかまで見る。`temp` などへ書くと、
    // 他ユーザーからも読める場所に資格情報が落ちるため。
    getPath: (name: string) => (name === 'userData' ? userDataDir : path.join(userDataDir, `WRONG-${name}`)),
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    // OS キーチェーンの可逆な代役。`plain:` 経路を通っていないことを示せれば足りる。
    encryptString: (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  },
}));

vi.mock('../oauth', () => ({
  OAUTH_CONFIGS: { github: { id: 'github', tokenUrl: 'https://example.test/token' } },
  refresh: (config: unknown, tokens: { refreshToken?: string }) => {
    refreshCalls++;
    return refreshImpl(config, tokens);
  },
}));

const FILE_NAME = 'service-hub-secrets.json';
const storePath = () => path.join(userDataDir, FILE_NAME);

/** OS キーチェーンで暗号化された値の保存形 (base64 of `enc:<token>`)。 */
function encrypted(token: string): string {
  return Buffer.from(`enc:${token}`, 'utf8').toString('base64');
}
function plain(token: string): string {
  return `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
}
async function writeRawStore(store: Record<string, string>): Promise<void> {
  await fs.writeFile(storePath(), JSON.stringify(store), 'utf8');
}
async function readRawStore(): Promise<Record<string, string>> {
  return JSON.parse(await fs.readFile(storePath(), 'utf8')) as Record<string, string>;
}

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-secrets-write-'));
  encryptionAvailable = true;
  refreshCalls = 0;
  refreshImpl = async () => {
    throw new Error('refresh was not stubbed');
  };
  vi.resetModules();
});
afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// setToken — 保存時の暗号化 (このファイルで一番大事な不変条件)
// ---------------------------------------------------------------------------

describe('setToken — 保存時の暗号化', () => {
  it('キーチェーンがあれば暗号化して保存する (生のトークンがファイルに現れない)', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_super_secret_value');

    const raw = await readRawStore();
    expect(raw.github).toBe(encrypted('ghp_super_secret_value'));
    // 保存形だけでなく、ファイル全体を見て生の値が無いことを言う。
    const text = await fs.readFile(storePath(), 'utf8');
    expect(text).not.toContain('ghp_super_secret_value');
    expect(text).not.toContain('plain:');
  });

  it('保存した値は読み戻せる (往復)', async () => {
    const { setToken, getToken } = await import('../secrets');
    await setToken('slack', 'xoxb-1234');
    expect(await getToken('slack')).toBe('xoxb-1234');
  });

  it('キーチェーンが無いときだけ plain: の難読化へ落ちる', async () => {
    encryptionAvailable = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_x');

    expect((await readRawStore()).github).toBe(plain('ghp_x'));
  });

  it('plain: へ落ちるときは警告するが、繰り返しても一度だけ', async () => {
    encryptionAvailable = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { setToken } = await import('../secrets');
    await setToken('github', 'a');
    await setToken('slack', 'b');
    await setToken('notion', 'c');

    expect(warn).toHaveBeenCalledTimes(1);
    // 警告文そのものが、この端末で暗号化が効いていないことを知る唯一の合図。
    // 「何が起きているか」「何が危ないか」「どう直すか」の 3 つを含める。
    const text = String(warn.mock.calls[0]![0]);
    expect(text).toContain('safeStorage');
    expect(text).toContain('NOT real encryption');
    expect(text).toContain('read access to the userData directory');
    expect(text).toContain('gnome-keyring');
  });

  it('暗号化できるときは警告しない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { setToken } = await import('../secrets');
    await setToken('github', 'a');
    expect(warn).not.toHaveBeenCalled();
  });

  it('既存のキーを上書きしても他のサービスを消さない', async () => {
    await writeRawStore({ github: encrypted('old'), slack: encrypted('keep') });
    const { setToken } = await import('../secrets');
    await setToken('github', 'new');

    const raw = await readRawStore();
    expect(raw.github).toBe(encrypted('new'));
    expect(raw.slack).toBe(encrypted('keep'));
  });

  it('秘密ファイルは所有者だけが読める権限 (0o600) で書かれる', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_x');
    const mode = (await fs.stat(storePath())).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('上書き時は直前の内容を .prev へ退避する (途中で落ちても失わない)', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'first');
    await setToken('github', 'second');

    const prev = JSON.parse(await fs.readFile(`${storePath()}.prev`, 'utf8')) as Record<string, string>;
    expect(prev.github).toBe(encrypted('first'));
  });
});

// ---------------------------------------------------------------------------
// 書き込みの直列化 — 同時に走った書き込みが互いを消さない
// ---------------------------------------------------------------------------

describe('書き込みの直列化', () => {
  it('同時の setToken が互いを消さない (read-modify-write の競合)', async () => {
    const { setToken } = await import('../secrets');
    await Promise.all([
      setToken('github', 'a'),
      setToken('slack', 'b'),
      setToken('notion', 'c'),
      setToken('linear', 'd'),
    ]);

    const raw = await readRawStore();
    // 直列化が無いと 4 本とも空の store を読み、最後の 1 本だけが残る。
    expect(Object.keys(raw).sort()).toEqual(['github', 'linear', 'notion', 'slack']);
  });

  it('前の書き込みが失敗しても後続が止まらない (鎖が例外を持ち越さない)', async () => {
    const { setToken } = await import('../secrets');
    // userData を「ディレクトリではなくファイル」にすると ENOTDIR で失敗する。
    // (単に消すだけでは atomicWriteFile が mkdir -p で作り直してしまう。)
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.writeFile(userDataDir, 'not a directory', 'utf8');
    await expect(setToken('github', 'a')).rejects.toThrow();
    await fs.rm(userDataDir, { force: true });
    await fs.mkdir(userDataDir, { recursive: true });

    await setToken('slack', 'b');
    expect((await readRawStore()).slack).toBe(encrypted('b'));
  });

  it('同時の clearToken と setToken が両方反映される', async () => {
    await writeRawStore({ github: encrypted('gone'), slack: encrypted('keep') });
    const { setToken, clearToken } = await import('../secrets');
    await Promise.all([clearToken('github'), setToken('notion', 'new')]);

    const raw = await readRawStore();
    expect(raw.github).toBeUndefined();
    expect(raw.slack).toBe(encrypted('keep'));
    expect(raw.notion).toBe(encrypted('new'));
  });
});

// ---------------------------------------------------------------------------
// clearToken / listConfiguredServices
// ---------------------------------------------------------------------------

describe('clearToken', () => {
  it('指定したサービスだけを消す', async () => {
    await writeRawStore({ github: encrypted('a'), slack: encrypted('b') });
    const { clearToken } = await import('../secrets');
    await clearToken('github');

    expect(await readRawStore()).toEqual({ slack: encrypted('b') });
  });

  it('保存されていないサービスを消しても落ちない', async () => {
    await writeRawStore({ slack: encrypted('b') });
    const { clearToken } = await import('../secrets');
    await expect(clearToken('github')).resolves.toBeUndefined();
    expect(await readRawStore()).toEqual({ slack: encrypted('b') });
  });
});

describe('listConfiguredServices', () => {
  it('保存済みのキーを返す', async () => {
    await writeRawStore({ github: encrypted('a'), slack: plain('b') });
    const { listConfiguredServices } = await import('../secrets');
    expect((await listConfiguredServices()).sort()).toEqual(['github', 'slack']);
  });

  it('ファイルが無ければ空', async () => {
    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// plain: からの繰り上げ — キーチェーンが後から使えるようになった時
// ---------------------------------------------------------------------------

describe('plain: 値の繰り上げ暗号化', () => {
  it('キーチェーンが使えるようになったら、次の書き込みで既存の plain: を暗号化し直す', async () => {
    await writeRawStore({ github: plain('ghp_old'), slack: plain('xoxb_old') });
    const { setToken } = await import('../secrets');
    await setToken('notion', 'new');

    const raw = await readRawStore();
    expect(raw.github).toBe(encrypted('ghp_old'));
    expect(raw.slack).toBe(encrypted('xoxb_old'));
    expect(raw.notion).toBe(encrypted('new'));
  });

  it('clearToken でも繰り上げる (書き込む機会は等しく使う)', async () => {
    await writeRawStore({ github: plain('ghp_old'), slack: encrypted('keep') });
    const { clearToken } = await import('../secrets');
    await clearToken('slack');

    expect((await readRawStore()).github).toBe(encrypted('ghp_old'));
  });

  it('既に暗号化済みの値には触らない', async () => {
    await writeRawStore({ github: encrypted('a') });
    const { setToken } = await import('../secrets');
    await setToken('slack', 'b');
    expect((await readRawStore()).github).toBe(encrypted('a'));
  });

  it('キーチェーンが無いままなら plain: のまま残す (壊さない)', async () => {
    encryptionAvailable = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await writeRawStore({ github: plain('ghp_old') });
    const { setToken } = await import('../secrets');
    await setToken('slack', 'b');

    expect((await readRawStore()).github).toBe(plain('ghp_old'));
  });
});

// ---------------------------------------------------------------------------
// 読み出しの防御 — 大きすぎるファイル / 壊れたファイル / stat の失敗
// ---------------------------------------------------------------------------

describe('壊れた保存ファイルへの備え', () => {
  it('上限を超えた保存ファイルは読まずに空として扱う', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fat: Record<string, string> = {};
    for (let i = 0; i < 1200; i++) fat[`svc${i}`] = 'x'.repeat(1000);
    await writeRawStore(fat);
    expect((await fs.stat(storePath())).size).toBeGreaterThan(1024 * 1024);

    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
    expect(String(err.mock.calls[0]![0])).toContain('refusing to load');
  });

  it('上限ちょうど (1 MiB) は読む — 弾くのは超えたときだけ', async () => {
    // `{"pad":"…"}` は 10 バイト + 中身。ちょうど 1 MiB のファイルを作る。
    const json = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 - 10) });
    expect(json.length).toBe(1024 * 1024);
    await fs.writeFile(storePath(), json, 'utf8');
    expect((await fs.stat(storePath())).size).toBe(1024 * 1024);

    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual(['pad']);
  });

  it('1 バイト超えたら弾く', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const json = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 - 9) });
    expect(json.length).toBe(1024 * 1024 + 1);
    await fs.writeFile(storePath(), json, 'utf8');

    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
  });

  it('保存ファイルがまだ無いだけなら、壊れているとは言わない', async () => {
    // 初回起動でファイルが無いのは正常。ここで「壊れている」と記録すると、
    // 本物の破損が起きたときログの中で埋もれる。
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
    expect(err).not.toHaveBeenCalled();
  });

  it('主ファイルが壊れていれば .prev から復旧する', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fs.writeFile(storePath(), '{ this is not json', 'utf8');
    await fs.writeFile(`${storePath()}.prev`, JSON.stringify({ github: encrypted('rescued') }), 'utf8');

    const { getToken } = await import('../secrets');
    expect(await getToken('github')).toBe('rescued');
    expect(String(err.mock.calls[0]![0])).toContain('.prev');
  });

  it('主ファイルも .prev も壊れていれば空として扱う (投げ返さない)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fs.writeFile(storePath(), '{ broken', 'utf8');
    await fs.writeFile(`${storePath()}.prev`, 'also broken', 'utf8');

    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
    expect(String(err.mock.calls[0]![0])).toContain('no usable backup');
  });

  it('JSON が配列なら空として扱う (キーが数字の store にしない)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fs.writeFile(storePath(), JSON.stringify(['a', 'b']), 'utf8');
    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual([]);
    expect(err).toHaveBeenCalled();
  });

  it('JSON の素の値 (null / 文字列 / 数値) は空として扱う', async () => {
    // `"hello"` を素通しすると `Object.entries` が一文字ずつのキーを作り、
    // `{0:'h',1:'e',…}` という架空の store が生まれる。`null` は投げる。
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { listConfiguredServices } = await import('../secrets');
    for (const body of ['null', '"hello"', '42', 'true']) {
      await fs.writeFile(storePath(), body, 'utf8');
      expect(await listConfiguredServices()).toEqual([]);
    }
    expect(err).toHaveBeenCalled();
  });

  it('文字列でない値は落として読む', async () => {
    await fs.writeFile(
      storePath(),
      JSON.stringify({ github: encrypted('a'), broken: 42, alsoBroken: null }),
      'utf8',
    );
    const { listConfiguredServices } = await import('../secrets');
    expect(await listConfiguredServices()).toEqual(['github']);
  });

  it('ENOENT 以外の stat の失敗は握り潰さず投げる', async () => {
    // userData を「ディレクトリではなくファイル」にすると stat は ENOTDIR になる。
    await fs.rm(userDataDir, { recursive: true, force: true });
    await fs.writeFile(userDataDir, 'not a directory', 'utf8');
    const { listConfiguredServices } = await import('../secrets');
    await expect(listConfiguredServices()).rejects.toThrow();
    await fs.rm(userDataDir, { force: true });
    await fs.mkdir(userDataDir, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// OAuth の TokenSet の保存と読み出し
// ---------------------------------------------------------------------------

describe('setOAuthTokens / getOAuthTokens', () => {
  it('TokenSet を往復できる', async () => {
    const { setOAuthTokens, getOAuthTokens } = await import('../secrets');
    await setOAuthTokens('github', { accessToken: 'at', refreshToken: 'rt', expiresAt: 123 });
    expect(await getOAuthTokens('github')).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 123 });
  });

  it('TokenSet も暗号化されて保存される', async () => {
    const { setOAuthTokens } = await import('../secrets');
    await setOAuthTokens('github', { accessToken: 'at_secret' });
    const text = await fs.readFile(storePath(), 'utf8');
    expect(text).not.toContain('at_secret');
  });

  it('未設定なら null', async () => {
    const { getOAuthTokens } = await import('../secrets');
    expect(await getOAuthTokens('github')).toBeNull();
  });

  it('JSON として読めない値なら null', async () => {
    await writeRawStore({ github: encrypted('ghp_raw_pat') });
    const { getOAuthTokens } = await import('../secrets');
    expect(await getOAuthTokens('github')).toBeNull();
  });

  it('accessToken を持たない JSON なら null (壊れた TokenSet を通さない)', async () => {
    await writeRawStore({ github: encrypted(JSON.stringify({ refreshToken: 'rt' })) });
    const { getOAuthTokens } = await import('../secrets');
    expect(await getOAuthTokens('github')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getValidToken — 期限切れ間近の更新
// ---------------------------------------------------------------------------

describe('getValidToken — 更新経路', () => {
  const expiring = (over: number) => ({
    accessToken: 'stale',
    refreshToken: 'rt',
    expiresAt: Date.now() + over,
  });

  it('期限が近ければ更新し、新しい TokenSet を保存する', async () => {
    refreshImpl = async () => ({ accessToken: 'fresh', refreshToken: 'rt2', expiresAt: Date.now() + 3_600_000 });
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(1_000))) });

    const { getValidToken, getOAuthTokens } = await import('../secrets');
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'fresh' });
    expect(refreshCalls).toBe(1);
    expect((await getOAuthTokens('github'))?.accessToken).toBe('fresh');
  });

  it('期限に余裕があれば更新しない', async () => {
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(3_600_000))) });
    const { getValidToken } = await import('../secrets');
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'stale' });
    expect(refreshCalls).toBe(0);
  });

  it('期限が無ければ更新しない', async () => {
    await writeRawStore({ github: encrypted(JSON.stringify({ accessToken: 'at', refreshToken: 'rt' })) });
    const { getValidToken } = await import('../secrets');
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'at' });
    expect(refreshCalls).toBe(0);
  });

  it('refreshToken が無ければ更新しない (期限が近くても)', async () => {
    await writeRawStore({
      github: encrypted(JSON.stringify({ accessToken: 'at', expiresAt: Date.now() + 1_000 })),
    });
    const { getValidToken } = await import('../secrets');
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'at' });
    expect(refreshCalls).toBe(0);
  });

  it('OAuth 設定の無いサービスは更新しない', async () => {
    await writeRawStore({ slack: encrypted(JSON.stringify(expiring(1_000))) });
    const { getValidToken } = await import('../secrets');
    expect(await getValidToken('slack')).toEqual({ ok: true, token: 'stale' });
    expect(refreshCalls).toBe(0);
  });

  it('同時の呼び出しは 1 回の更新にまとめる (更新トークンを二重に使わない)', async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => {
      release = r;
    });
    refreshImpl = async () => {
      await gate;
      return { accessToken: 'fresh', refreshToken: 'rt2', expiresAt: Date.now() + 3_600_000 };
    };
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(1_000))) });

    const { getValidToken } = await import('../secrets');
    const both = Promise.all([getValidToken('github'), getValidToken('github')]);
    release(undefined);
    expect(await both).toEqual([
      { ok: true, token: 'fresh' },
      { ok: true, token: 'fresh' },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('更新が終われば次の呼び出しは新しく更新できる (在庫を残さない)', async () => {
    refreshImpl = async () => ({ accessToken: 'fresh', refreshToken: 'rt2', expiresAt: Date.now() + 1_000 });
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(1_000))) });

    const { getValidToken } = await import('../secrets');
    await getValidToken('github');
    await getValidToken('github');
    expect(refreshCalls).toBe(2);
  });

  it('更新に失敗しても投げず、古い accessToken を返す (呼び出し側が 401 を見る)', async () => {
    refreshImpl = async () => {
      throw new Error('invalid_grant');
    };
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(1_000))) });

    const { getValidToken } = await import('../secrets');
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'stale' });
    expect(refreshCalls).toBe(1);
  });

  it('境界ちょうど (残り 60 秒) では更新しない — 更新するのは切ったときだけ', async () => {
    // `Date` だけを止める。fs の待ちは実物のまま進ませたいので timers は触らない。
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const now = Date.UTC(2026, 7, 22, 0, 0, 0);
      vi.setSystemTime(now);
      await writeRawStore({
        github: encrypted(JSON.stringify({ accessToken: 'edge', refreshToken: 'rt', expiresAt: now + 60_000 })),
      });
      const { getValidToken } = await import('../secrets');
      expect(await getValidToken('github')).toEqual({ ok: true, token: 'edge' });
      expect(refreshCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('境界を 1 ミリ秒でも切れば更新する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const now = Date.UTC(2026, 7, 22, 0, 0, 0);
      vi.setSystemTime(now);
      refreshImpl = async () => ({ accessToken: 'fresh', refreshToken: 'rt2', expiresAt: now + 3_600_000 });
      await writeRawStore({
        github: encrypted(JSON.stringify({ accessToken: 'edge', refreshToken: 'rt', expiresAt: now + 59_999 })),
      });
      const { getValidToken } = await import('../secrets');
      expect(await getValidToken('github')).toEqual({ ok: true, token: 'fresh' });
      expect(refreshCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('更新に失敗しても在庫を残さない (次回また試せる)', async () => {
    refreshImpl = async () => {
      throw new Error('invalid_grant');
    };
    await writeRawStore({ github: encrypted(JSON.stringify(expiring(1_000))) });

    const { getValidToken } = await import('../secrets');
    await getValidToken('github');
    await getValidToken('github');
    expect(refreshCalls).toBe(2);
  });
});
