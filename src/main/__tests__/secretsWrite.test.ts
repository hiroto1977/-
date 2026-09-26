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

  it('★ 控えは最後に書けた内容 —— 入れ替えたトークンは控えに残らない (パス 134)', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'first');
    await setToken('github', 'second');

    const prev = JSON.parse(await fs.readFile(`${storePath()}.prev`, 'utf8')) as Record<string, string>;
    // 2026-09-09 まで控えは 'first' だった (直前の内容)。
    expect(prev.github).toBe(encrypted('second'));
    expect(JSON.stringify(prev)).not.toContain(encrypted('first'));
  });

  it('★ 消したトークンは控えにも残らず、本体が壊れても復活しない', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { setToken, clearToken, getToken, listConfiguredServices } = await import('../secrets');
    await setToken('github', 'ghp_gone');
    await setToken('slack', 'xoxb_keep');
    await clearToken('github');

    const prev = JSON.parse(await fs.readFile(`${storePath()}.prev`, 'utf8')) as Record<string, string>;
    expect(Object.keys(prev)).toEqual(['slack']);

    // 本体が壊れて控えから復旧しても、消した物は戻らない (2026-09-09 まではここで 'ghp_gone' が復活した)。
    await fs.writeFile(storePath(), '{ this is not json', 'utf8');
    expect(await getToken('github')).toBeNull();
    expect(await listConfiguredServices()).toEqual(['slack']);
    expect(String(err.mock.calls[0]![0])).toContain('.prev');
  });

  it('★ 本体を手で消しても、消したトークンは戻らない (残るのは最後に書けた内容)', async () => {
    const { setToken, clearToken, getToken, listConfiguredServices } = await import('../secrets');
    await setToken('github', 'ghp_gone');
    await clearToken('github');
    await fs.rm(storePath());
    expect(await getToken('github')).toBeNull();
    expect(await listConfiguredServices()).toEqual([]);
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
  it('上限を超えた保存ファイルは読まずに断る (一覧は投げる)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fat: Record<string, string> = {};
    for (let i = 0; i < 1200; i++) fat[`svc${i}`] = 'x'.repeat(1000);
    await writeRawStore(fat);
    expect((await fs.stat(storePath())).size).toBeGreaterThan(1024 * 1024);

    const { listConfiguredServices } = await import('../secrets');
    // 読めなかったのだから「1 件も無い」とは言わない (2026-09-06 に方針を変えた。
    // 空を返すと画面が全サービスに「トークン未設定」を出し、利用者は鍵を打ち直す)。
    await expect(listConfiguredServices()).rejects.toThrow(/保管ファイルを読めませんでした/);
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
    await expect(listConfiguredServices()).rejects.toThrow(/保管ファイルを読めませんでした/);
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

  it('主ファイルも .prev も壊れていれば、一覧は「読めない」と投げる', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fs.writeFile(storePath(), '{ broken', 'utf8');
    await fs.writeFile(`${storePath()}.prev`, 'also broken', 'utf8');

    const { listConfiguredServices } = await import('../secrets');
    await expect(listConfiguredServices()).rejects.toThrow(/保管ファイルを読めませんでした/);
    expect(String(err.mock.calls[0]![0])).toContain('no usable backup');
  });

  it('JSON が配列なら読めないとして断る (キーが数字の store にしない)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await fs.writeFile(storePath(), JSON.stringify(['a', 'b']), 'utf8');
    const { listConfiguredServices } = await import('../secrets');
    await expect(listConfiguredServices()).rejects.toThrow(/保管ファイルを読めませんでした/);
    expect(err).toHaveBeenCalled();
  });

  it('JSON の素の値 (null / 文字列 / 数値) は読めないとして断る', async () => {
    // `"hello"` を素通しすると `Object.entries` が一文字ずつのキーを作り、
    // `{0:'h',1:'e',…}` という架空の store が生まれる。`null` は投げる。
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { listConfiguredServices } = await import('../secrets');
    for (const body of ['null', '"hello"', '42', 'true']) {
      await fs.writeFile(storePath(), body, 'utf8');
      await expect(listConfiguredServices(), body).rejects.toThrow(/保管ファイルを読めませんでした/);
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
// 壊れた TokenSet を Bearer に載せない (パス 246)
// ---------------------------------------------------------------------------

/**
 * `shared/vaultToken.ts` の冒頭は、2026-08-20 の監査で見つけた形をこう書いている:
 *
 *   > レンダラ側が JSON として読めたのに `accessToken` が無い場合、
 *   > **その JSON 丸ごとを Bearer として送っていた**。TokenSet には
 *   > `refreshToken` が入る …… 主プロセス側は同じ状況で null を返していた。
 *   > 同じ規則を 2 か所に書いて片方だけ緩い、という形だったので、規則を
 *   > ここへ 1 つにまとめて両方から呼ぶ。
 *
 * **まとめたのは述語 (`hasUsableAccessToken`) で、「述語が no と言ったときに
 * 何をするか」ではない。** ブラウザ版の `bearerFromStoredToken` は `null` を
 * 返し、`web-shim` が「保存された資格情報が壊れています」と断る。主プロセスの
 * `getValidToken` は `if (!isTokenSet(parsed)) return { ok: true, token: raw };`
 * —— **生の JSON をそのまま Bearer として返す**。`getOAuthTokens` は null を
 * 返すが、Authorization ヘッダに載るのは `getValidToken` の戻り値である
 * (`main.ts:411` / `main.ts:460`)。
 *
 * ここで測る。
 */
describe('getValidToken — 壊れた TokenSet', () => {
  it('★ accessToken を持たない JSON を Bearer として返さない', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    await setToken('github', JSON.stringify({ refreshToken: 'rt_SECRET_VALUE' }));

    const read = await getValidToken('github');
    // 何を返すかはここでは決めない —— **refresh token が出ないこと**が要件
    const asString = read.ok ? read.token : '';
    expect(asString, 'refresh token が Bearer に載っている').not.toContain('rt_SECRET_VALUE');
  });

  it('★ 壊れているなら理由を返す (未設定と混ぜない)', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    await setToken('github', JSON.stringify({ refreshToken: 'rt_x', expiresAt: 1 }));

    const read = await getValidToken('github');
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).not.toBe('absent');
  });

  it('対照: 使える TokenSet は accessToken を返す', async () => {
    const { setOAuthTokens, getValidToken } = await import('../secrets');
    await setOAuthTokens('github', { accessToken: 'at_good' });
    const read = await getValidToken('github');
    expect(read.ok && read.token).toBe('at_good');
  });

  it('対照: 生の PAT はそのまま返す (JSON ではないので TokenSet 判定に入らない)', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    await setToken('github', 'ghp_raw_pat_value');
    const read = await getValidToken('github');
    expect(read.ok && read.token).toBe('ghp_raw_pat_value');
  });

  it('★ 断りの文面は共有の 1 つから採る (ブラウザ版と食い違わない)', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    const { brokenStoredCredentialMessage } = await import('../../shared/vaultToken');
    await setToken('github', JSON.stringify({ refreshToken: 'rt_x' }));
    const read = await getValidToken('github');
    expect(read.ok).toBe(false);
    // 写経していれば、共有関数を書き換えてもここが追従せず落ちる
    const message = !read.ok && read.reason === 'broken-token-set' ? read.message : '';
    expect(message).toBe(brokenStoredCredentialMessage('github'));
  });

  it('対照: 配列も断る (資格情報ではない)', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    await setToken('github', '[1,2,3]');
    const read = await getValidToken('github');
    expect(read.ok).toBe(false);
  });

  it('対照: 数字だけの API キー (JSON の数値として読める) もそのまま返す', async () => {
    const { setToken, getValidToken } = await import('../secrets');
    await setToken('github', '12345');
    const read = await getValidToken('github');
    expect(read.ok && read.token).toBe('12345');
  });
});

// ---------------------------------------------------------------------------
// 保管層の床 — 呼び出し側が関門を忘れても制御文字は入らない (パス 245)
// ---------------------------------------------------------------------------

/**
 * `secrets.setToken` には検証が**1 つも無かった** —— 長さも制御文字も見ず、
 * 規則はすべて `main.ts` の IPC ハンドラ側 (`checkTokenInput`) に在った。
 * ところが `setOAuthTokens` は**ハンドラを経由しない**。
 *
 * 中身は認可サーバの発行値なので制御文字は入りにくいが、**「入りにくい」は
 * 関門ではない**。制御文字がヘッダに載ると `new Headers()` が値ごと文面に
 * 載せて投げ、その文面は `safeErrorMessage` を通って画面へ出る
 * (`shared/__tests__/headerValueLeak.test.ts` が 10 経路で実測)。
 */
describe('setToken の制御文字 — 保管層の床', () => {
  const NUL = String.fromCharCode(0);

  it('★ 制御文字を含む token は断り、ファイルに書かない', async () => {
    const { setToken, listConfiguredServices } = await import('../secrets');
    await expect(setToken('github', `ghp_${NUL}broken`)).rejects.toThrow('制御文字');
    expect(await listConfiguredServices(), '断ったのに書かれている').toEqual([]);
  });

  it('★ 改行も同じく断る', async () => {
    const { setToken } = await import('../secrets');
    await expect(setToken('github', `ghp_${String.fromCharCode(10)}x`)).rejects.toThrow('制御文字');
  });

  it('対照: 制御文字が無ければこれまでどおり保存する', async () => {
    const { setToken, getToken } = await import('../secrets');
    await setToken('github', 'ghp_a_normal_token');
    expect(await getToken('github')).toBe('ghp_a_normal_token');
  });

  /**
   * 床の限界は今も同じ (`JSON.stringify` が逃がす) が、
   * **包む側が断るようになった** (2026-09-14 ・ パス 259)。
   *
   * 両方を同じ検査に留める —— 「床には見えない」を落とすと、
   * 次に包む側を増やした人が「床があるから大丈夥」と読める。
   */
  it('★ 床には見えないが、包む側 (setOAuthTokens) が断る', async () => {
    const { setOAuthTokens, listConfiguredServices } = await import('../secrets');
    const { hasControlChars } = await import('../../shared/tokenInput');
    // 床の限界そのものを标本で示す。
    expect(hasControlChars(`at${NUL}x`)).toBe(true);
    expect(hasControlChars(JSON.stringify({ accessToken: `at${NUL}x` }))).toBe(false);
    // それでも包む側が断るので、保存は起きない。
    await expect(setOAuthTokens('github', { accessToken: `at${NUL}x` })).rejects.toThrow('制御文字');
    expect(await listConfiguredServices(), '断ったのに書かれている').toEqual([]);
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

// ---------------------------------------------------------------------------
// setOAuthTokens の関門 (2026-09-14 ・ パス 259)
// ---------------------------------------------------------------------------

/**
 * **認可サーバの応答 1 つで保管庫全体が塞がってはいけない。**
 *
 * `setOAuthTokens` は `secrets:set` の IPC ハンドラを経由しないので、
 * 入口の天井 (`MAX_TOKEN_INPUT_CHARS`) も制御文字の関門もかかっていなかった。
 * 中身は `oauth.ts` の `JSON.parse(…) as TokenResponse` から来るので、
 * 実行時の型は相手次第である。
 *
 * 実測した帰結 (直す前): 1.2 MB の access_token を保存すると
 * 保管ファイルが 1,600,128 B になり、読み出しの天井 (`MAX_STORE_SIZE` = 1 MB)
 * を越えて github / stripe とも `null`、`listConfiguredServices` は throw、
 * `.prev` も同じ大きさ (パス 134 は新しい内容を控へ置く)、
 * `setToken` も `clearToken` も拒否 —— 読む・書く・消すのすべてが塞がった。
 */
describe('setOAuthTokens — 書く前に見る (ハンドラを経由しない十字路)', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);

  it('★ 大きすぎる access_token を断り、他サービスの資格情報を殺さない', async () => {
    const m = await import('../secrets');
    await m.setToken('github', 'ghp_REAL_1');
    await m.setToken('stripe', 'sk_live_REAL_2');

    await expect(
      m.setOAuthTokens('gmail', { accessToken: 'A'.repeat(1_200_000) }),
    ).rejects.toThrow(/長すぎます/);

    // ファイルは読み出しの天井を越えていない。
    const stat = await fs.stat(storePath());
    expect(stat.size).toBeLessThan(1024 * 1024);

    // ★ 他の資格情報は生きている (ここが欲しい不変条件)。
    vi.resetModules();
    const m2 = await import('../secrets');
    expect(await m2.getToken('github')).toBe('ghp_REAL_1');
    expect(await m2.getToken('stripe')).toBe('sk_live_REAL_2');
    expect(await m2.listConfiguredServices()).toEqual(['github', 'stripe']);
    // 登録し直す道と消す道も残っている。
    await expect(m2.setToken('github', 'ghp_NEW')).resolves.toBeUndefined();
    await expect(m2.clearToken('stripe')).resolves.toBeUndefined();
  });

  it('★ 制御文字入りの access_token を断る (包んでからでは床に見えない)', async () => {
    const m = await import('../secrets');
    await expect(
      m.setOAuthTokens('gmail', { accessToken: 'good' + CR + LF + 'X-Injected: 1' }),
    ).rejects.toThrow(/制御文字/);
    // 1 バイトも書かない。
    await expect(fs.stat(storePath())).rejects.toThrow();
  });

  it('★ 使えない access_token を断る (保存済みとして数えた上で全呼び出しが失敗する形を作らない)', async () => {
    const m = await import('../secrets');
    for (const tokens of [{ accessToken: '' }, { access_token: 'snake' }, {}]) {
      await expect(m.setOAuthTokens('gmail', tokens as never)).rejects.toThrow(
        /アクセストークン/,
      );
    }
  });

  it('普通の TokenSet はこれまでと同じように保存される (対照)', async () => {
    const m = await import('../secrets');
    const tokens = { accessToken: 'ya29.ok', refreshToken: '1//r', expiresAt: 42 };
    await m.setOAuthTokens('gmail', tokens);
    expect(await m.getOAuthTokens('gmail')).toEqual(tokens);
  });
});
