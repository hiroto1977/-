import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * main.ts の IPC 境界。
 *
 * ここはレンダラーが main プロセスへ触れる**唯一の面**で、13 個のハンドラは
 * どれも「不正な入力を戻り値で断る」形に書かれています。ただ 2026-08-22 時点で
 * main.ts には検査が一本もありませんでした — 断り方が正しいかを誰も見ていない。
 *
 * ハンドラはモジュール読み込み時に `ipcMain.handle` で登録されるので、
 * `ipcMain` を記録するモックに差し替えてから import し、登録された関数を
 * 直に叩きます。協力者 (secrets / clients / oauth) はモックにして、
 * ここでは**番人だけ**を見ます。
 */

type Handler = (ev: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
const appListeners = new Map<string, () => void>();
let quitCalls = 0;
let allWindows: unknown[] = [];

let openedExternal: string[] = [];
let shownInFolder: string[] = [];
let openPathCalls: string[] = [];
let openPathResult = '';

/** `app.whenReady()` は解決させない — createWindow は別の関心事なので、
 *  ここでは IPC ハンドラの登録だけを起こす。 */
vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.2.3',
    getPath: () => '/tmp/does-not-matter',
    isPackaged: true,
    whenReady: () => new Promise(() => {}),
    on: (name: string, fn: () => void) => {
      appListeners.set(name, fn);
    },
    quit: () => {
      quitCalls++;
    },
  },
  BrowserWindow: class {
    static getAllWindows() {
      return allWindows;
    }
  },
  ipcMain: {
    handle: (name: string, fn: Handler) => {
      handlers.set(name, fn);
    },
  },
  shell: {
    openExternal: async (url: string) => {
      openedExternal.push(url);
    },
    showItemInFolder: (p: string) => {
      shownInFolder.push(p);
    },
    openPath: async (p: string) => {
      openPathCalls.push(p);
      return openPathResult;
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

// --- 協力者 ---------------------------------------------------------------
let validToken: unknown = { ok: true, token: 'tok' };
let setTokenThrows: Error | null = null;
let clearTokenThrows: Error | null = null;
const setTokenCalls: [string, string][] = [];
const clearTokenCalls: string[] = [];

/** 関門の返り値。Error を入れると投げる側を試せる。 */
let gateResult: string | null | Error = '/root/ok.md';
vi.mock('../shellOpenGate', () => ({
  shellTargetOrNull: async () => {
    if (gateResult instanceof Error) throw gateResult;
    return gateResult;
  },
}));

vi.mock('../secrets', () => ({
  getValidToken: async () => {
    if (validToken instanceof Error) throw validToken;
    return validToken;
  },
  setToken: async (id: string, tok: string) => {
    if (setTokenThrows) throw setTokenThrows;
    setTokenCalls.push([id, tok]);
  },
  clearToken: async (id: string) => {
    if (clearTokenThrows) throw clearTokenThrows;
    clearTokenCalls.push(id);
  },
  listConfiguredServices: async () => ['github'],
  getStorageProtection: async () => ({ encrypted: true, plainCount: 0, file: '/tmp/x' }),
  setOAuthTokens: async () => {},
}));

const fetcherCalls: unknown[] = [];
const actionCalls: unknown[] = [];
vi.mock('../clients', () => ({
  LIVE_FETCHERS: {
    github: async (a: unknown) => { fetcherCalls.push(a); return { rows: [] }; },
    skills: async (a: unknown) => { fetcherCalls.push(a); return { local: true }; },
  },
  LIVE_ACTIONS: { github: { 'create-issue': async (a: unknown) => { actionCalls.push(a); return { id: 1 }; } } },
  LOCAL_SERVICES: new Set(['skills']),
}));

let authorizeResult: unknown = { accessToken: 'SECRET_AT', refreshToken: 'SECRET_RT', scope: 'repo', expiresAt: 999 };
const authorizeConfigs: { clientId?: string }[] = [];
vi.mock('../oauth', () => ({
  authorize: async (config: { clientId?: string }) => {
    authorizeConfigs.push(config);
    if (authorizeResult instanceof Error) throw authorizeResult;
    return authorizeResult;
  },
  isOAuthSupported: (id: string) => id === 'github',
  OAUTH_CONFIGS: {
    github: { id: 'github', clientId: 'built-in-id', tokenUrl: 'https://x.test/t' },
    // クライアント ID が空 = 「OAuth 対応だが未設定」。上書きが無ければ断る。
    slack: { id: 'slack', clientId: '', tokenUrl: 'https://x.test/t' },
  },
}));

/** 登録済みハンドラを名前で呼ぶ。未登録なら落とす (名前の変更に気付くため)。 */
function invoke(name: string, ...args: unknown[]): unknown {
  const fn = handlers.get(name);
  if (!fn) throw new Error(`IPC handler not registered: ${name}`);
  return fn({}, ...args);
}

// **毎テストで読み直す。** `beforeAll` で 1 回だけ読むと、モジュール直下で
// 走る `ipcMain.handle(...)` は変異体が有効になる**前**に評価済みになり、
// 検査が実際に殺していても Stryker は「生存」と報告する (static 変異体)。
// `vi.resetModules()` を挟んで読み直せば、変異体の有効化後に評価される。
beforeEach(async () => {
  handlers.clear();
  appListeners.clear();
  openedExternal = [];
  shownInFolder = [];
  openPathCalls = [];
  openPathResult = '';
  validToken = { ok: true, token: 'tok' };
  setTokenThrows = null;
  clearTokenThrows = null;
  setTokenCalls.length = 0;
  clearTokenCalls.length = 0;
  fetcherCalls.length = 0;
  actionCalls.length = 0;
  authorizeResult = { accessToken: 'SECRET_AT', refreshToken: 'SECRET_RT', scope: 'repo', expiresAt: 999 };
  authorizeConfigs.length = 0;
  gateResult = '/root/ok.md';
  quitCalls = 0;
  allWindows = [];
  vi.resetModules();
  await import('../main');
});

// ---------------------------------------------------------------------------

describe('登録', () => {
  it('13 個のハンドラが登録される', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'action:invoke',
        'app:checkUpdate',
        'app:getVersion',
        'app:openExternal',
        'app:openPath',
        'app:revealInFolder',
        'fetch:snapshot',
        'oauth:authorize',
        'oauth:isSupported',
        'secrets:clear',
        'secrets:list',
        'secrets:protection',
        'secrets:set',
      ].sort(),
    );
  });
});

describe('app:openExternal — 開いてよい URL だけ', () => {
  it('http / https は OS のブラウザへ渡す', async () => {
    await invoke('app:openExternal', 'https://example.com/a?b=1');
    await invoke('app:openExternal', 'http://example.com/');
    expect(openedExternal).toEqual(['https://example.com/a?b=1', 'http://example.com/']);
  });

  it('http(s) 以外のスキームは一つも通さない', async () => {
    // javascript: と data: はコード実行、file: はローカル読み出し、
    // OS 独自スキーム (ssh: / ms-windows-store: 等) はハンドラ起動に繋がる。
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ssh://evil.example',
      'ms-windows-store://pdp/?productid=x',
      'vbscript:msgbox(1)',
      'chrome://settings',
      'about:blank',
      'ftp://evil.example/x',
    ]) {
      await invoke('app:openExternal', url);
    }
    expect(openedExternal).toEqual([]);
  });

  it('URL として読めない文字列は黙って捨てる (投げない)', async () => {
    for (const v of ['', 'not a url', '///', '   ']) {
      await expect(invoke('app:openExternal', v)).resolves.toBeUndefined();
    }
    expect(openedExternal).toEqual([]);
  });

  it('文字列でなければ何もしない', async () => {
    for (const v of [undefined, null, 42, {}, ['https://example.com']]) {
      await invoke('app:openExternal', v);
    }
    expect(openedExternal).toEqual([]);
  });

  it('大文字のスキームも弾く (JavaScript: など)', async () => {
    await invoke('app:openExternal', 'JavaScript:alert(1)');
    await invoke('app:openExternal', 'JAVASCRIPT:alert(1)');
    expect(openedExternal).toEqual([]);
  });
});

describe('secrets:set / secrets:clear — サービス id の検査', () => {
  it('知らないサービス id は保存しない', async () => {
    for (const id of ['nope', '__proto__', 'constructor', 'prototype', 'toString', '']) {
      expect(await invoke('secrets:set', id, 'ghp_valid_token_value')).toEqual({
        ok: false,
        code: 'invalid_service',
        message: 'unknown service id',
      });
    }
    expect(setTokenCalls).toEqual([]);
  });

  it('サービス id が文字列でなくても落ちない', async () => {
    for (const id of [undefined, null, 42, {}, []]) {
      const r = (await invoke('secrets:set', id, 'ghp_valid_token_value')) as { ok: boolean };
      expect(r.ok).toBe(false);
    }
    expect(setTokenCalls).toEqual([]);
  });

  it('正しい id と token なら保存する', async () => {
    expect(await invoke('secrets:set', 'github', 'ghp_valid_token_value')).toEqual({ ok: true });
    expect(setTokenCalls).toEqual([['github', 'ghp_valid_token_value']]);
  });

  it('保存に失敗したら理由を返す (黙って成功にしない)', async () => {
    setTokenThrows = new Error('disk full');
    const r = (await invoke('secrets:set', 'github', 'ghp_valid_token_value')) as {
      ok: boolean;
      code: string;
    };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('write_failed');
  });

  /*
   * **保存の失敗も伏字の合流点を通す。**
   *
   * 13 本のハンドラのうち、生の `e.message` を返していたのはここだけだった ——
   * しかも**資格情報が生きている唯一のハンドラ**である (2026-08-22)。
   * 今日の `setToken` は fs エラーしか投げないので実害は userData のパスが
   * 画面に出る程度だが、片側だけ関門の外に居る状態を残さない。
   */
  it('保存の失敗に混ざった秘密は伏せて返す', async () => {
    setTokenThrows = new Error(`write failed for ghp_${'a'.repeat(36)} at /home/u/.config`);
    const r = (await invoke('secrets:set', 'github', 'ghp_valid_token_value')) as {
      ok: boolean;
      message: string;
    };
    expect(r.message).not.toContain('a'.repeat(36));
    expect(r.message).toContain('ghp_');
  });

  it('保存の失敗が長すぎても切って返す', async () => {
    setTokenThrows = new Error('x'.repeat(5000));
    const r = (await invoke('secrets:set', 'github', 'ghp_valid_token_value')) as {
      message: string;
    };
    // 上限は `ERROR_MESSAGE_MAX_LENGTH` (2000)。数字を写経せず「入力より短い」
    // ことと「上限以内」の両方を見る。
    expect(r.message.length).toBeLessThan(5000);
    expect(r.message.length).toBeLessThanOrEqual(2000);
  });

  it('secrets:clear も知らない id を断る', async () => {
    expect(await invoke('secrets:clear', '__proto__')).toEqual({
      ok: false,
      message: 'unknown service id',
    });
    expect(clearTokenCalls).toEqual([]);
  });

  it('削除に失敗したら理由を返す (消したつもりを作らない)', async () => {
    clearTokenThrows = new Error('keychain locked');
    const r = (await invoke('secrets:clear', 'github')) as { ok: boolean; message: string };
    expect(r).toEqual({ ok: false, message: 'keychain locked' });
  });

  it('secrets:clear は正しい id なら消す', async () => {
    expect(await invoke('secrets:clear', 'github')).toEqual({ ok: true });
    expect(clearTokenCalls).toEqual(['github']);
  });
});

describe('fetch:snapshot — 取得の入口', () => {
  it('知らないサービス id は断る', async () => {
    // 文言まで見る。id の番人を外しても `Object.hasOwn` が拾って同じ code を
    // 返すので、code だけでは番人が消えたことに気付けない。
    for (const id of ['nope', '__proto__', 'constructor', undefined, 42]) {
      expect(await invoke('fetch:snapshot', id)).toEqual({
        ok: false,
        code: 'not_implemented',
        message: 'unknown service id',
      });
    }
    expect(fetcherCalls).toEqual([]);
  });

  it('fetcher が投げても reject しない', async () => {
    const { LIVE_FETCHERS } = (await import('../clients')) as unknown as {
      LIVE_FETCHERS: Record<string, unknown>;
    };
    const original = LIVE_FETCHERS.github;
    LIVE_FETCHERS.github = async () => {
      throw new Error('upstream exploded');
    };
    try {
      const r = (await invoke('fetch:snapshot', 'github')) as { ok: boolean; code: string };
      expect(r.ok).toBe(false);
      expect(r.code).toBe('fetch_failed');
    } finally {
      LIVE_FETCHERS.github = original;
    }
  });

  it('取得できたら data を返す', async () => {
    expect(await invoke('fetch:snapshot', 'github')).toEqual({ ok: true, data: { rows: [] } });
    expect(fetcherCalls).toEqual([{ token: 'tok' }]);
  });

  it('資格情報が未設定なら not_configured', async () => {
    validToken = { ok: false, reason: 'absent' };
    const r = (await invoke('fetch:snapshot', 'github')) as { ok: boolean; code: string };
    expect(r).toEqual({ ok: false, code: 'not_configured', message: 'トークン未設定' });
    expect(fetcherCalls).toEqual([]);
  });

  it('「保存済みだが読めない」は理由をそのまま伝える', async () => {
    validToken = { ok: false, reason: 'undecryptable', message: 'キーチェーンが使えません' };
    const r = (await invoke('fetch:snapshot', 'github')) as { message: string };
    expect(r).toEqual({ ok: false, code: 'not_configured', message: 'キーチェーンが使えません' });
  });

  it('資格情報の読み出しが投げても reject しない (画面が止まらない)', async () => {
    validToken = new Error('decrypt exploded');
    const r = (await invoke('fetch:snapshot', 'github')) as { ok: boolean; code: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('fetch_failed');
  });
});

describe('action:invoke — 書き込み側の入口', () => {
  it('知らないサービス id を断る', async () => {
    expect(await invoke('action:invoke', '__proto__', 'create-issue', {})).toEqual({
      ok: false,
      code: 'action_not_found',
      message: 'unknown service id',
    });
    expect(actionCalls).toEqual([]);
  });

  it('プロトタイプ由来の action 名では呼ばない', async () => {
    // `actions['toString']` は Object.prototype 経由で関数が取れてしまう。
    // `Object.hasOwn` を通していないと、ここで任意の組み込み関数を呼べる。
    for (const name of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(await invoke('action:invoke', 'github', name, {})).toEqual({
        ok: false,
        code: 'action_not_found',
        message: `github に action "${name}" は登録されていません`,
      });
    }
    expect(actionCalls).toEqual([]);
  });

  it('action 名の形を検査する (空・長すぎ・文字列でない)', async () => {
    // 形の断りは「登録されていません」とは別の文言。ここを混ぜると、
    // 形の検査を外しても未登録側が拾って同じ code になり、気付けない。
    for (const name of ['', 'a'.repeat(65), undefined, null, 42, {}]) {
      expect(await invoke('action:invoke', 'github', name, {})).toEqual({
        ok: false,
        code: 'action_not_found',
        message: 'invalid action name',
      });
    }
    expect(actionCalls).toEqual([]);
  });

  it('64 文字ちょうどの action 名は形では弾かない', async () => {
    const r = (await invoke('action:invoke', 'github', 'a'.repeat(64), {})) as { message: string };
    // 形は通り、「登録されていません」の側で断られる。
    expect(r.message).toContain('登録されていません');
  });

  it('登録済みの action は payload とともに呼ぶ', async () => {
    expect(await invoke('action:invoke', 'github', 'create-issue', { title: 't' })).toEqual({
      ok: true,
      data: { id: 1 },
    });
    expect(actionCalls).toEqual([{ token: 'tok', payload: { title: 't' } }]);
  });

  it('payload が素のオブジェクトでなければ空オブジェクトに倒す', async () => {
    for (const p of [undefined, null, 42, 'str', ['a'], true]) {
      actionCalls.length = 0;
      await invoke('action:invoke', 'github', 'create-issue', p);
      expect(actionCalls).toEqual([{ token: 'tok', payload: {} }]);
    }
  });

  it('資格情報の読み出しが投げても reject しない', async () => {
    validToken = new Error('boom');
    expect(await invoke('action:invoke', 'github', 'create-issue', {})).toEqual({
      ok: false,
      code: 'action_failed',
      message: 'boom',
    });
  });

  it('action 本体が投げても reject しない', async () => {
    const { LIVE_ACTIONS } = (await import('../clients')) as unknown as {
      LIVE_ACTIONS: Record<string, Record<string, unknown>>;
    };
    const original = LIVE_ACTIONS.github!['create-issue'];
    LIVE_ACTIONS.github!['create-issue'] = async () => {
      throw new Error('write exploded');
    };
    try {
      const r = (await invoke('action:invoke', 'github', 'create-issue', {})) as {
        ok: boolean;
        code: string;
      };
      expect(r.ok).toBe(false);
      expect(r.code).toBe('action_failed');
    } finally {
      LIVE_ACTIONS.github!['create-issue'] = original;
    }
  });

  it('資格情報が無ければ action を呼ばない', async () => {
    validToken = { ok: false, reason: 'absent' };
    expect(await invoke('action:invoke', 'github', 'create-issue', {})).toEqual({
      ok: false,
      code: 'not_configured',
      message: 'トークン未設定',
    });
    expect(actionCalls).toEqual([]);
  });
});

describe('oauth:isSupported / oauth:authorize', () => {
  it('知らない id は false', async () => {
    expect(await invoke('oauth:isSupported', '__proto__')).toBe(false);
    expect(await invoke('oauth:isSupported', 42)).toBe(false);
    expect(await invoke('oauth:isSupported', 'github')).toBe(true);
  });

  it('知らない id では認可を始めない', async () => {
    expect(await invoke('oauth:authorize', '__proto__')).toEqual({
      ok: false,
      code: 'not_supported',
      message: 'unknown service id',
    });
    expect(authorizeConfigs).toEqual([]);
  });

  it('クライアント ID の形が不正なら組み込みの値を使う (上書きしない)', async () => {
    // 制御文字・空白・短すぎ・長すぎは通さない。通してしまうと、認可 URL の
    // 組み立てに任意の文字列が混ざる。**上書きが効かなかったこと**まで見る —
    // ok:true だけでは、不正な値がそのまま使われても通ってしまう。
    for (const bad of ['short', 'a'.repeat(201), 'has space', 'has\nnewline', 'has\0nul', 'a;b', '', 42, null]) {
      authorizeConfigs.length = 0;
      const r = (await invoke('oauth:authorize', 'github', bad)) as { ok: boolean };
      expect(r.ok).toBe(true);
      expect(authorizeConfigs[0]!.clientId).toBe('built-in-id');
    }
  });

  it('正しい形のクライアント ID は前後の空白を落として使う', async () => {
    const r = (await invoke(
      'oauth:authorize',
      'github',
      '  abcdefgh.apps.googleusercontent.com  ',
    )) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(authorizeConfigs[0]!.clientId).toBe('abcdefgh.apps.googleusercontent.com');
  });

  it('上限ちょうどの長さ (8 / 200 文字) は通す', async () => {
    for (const id of ['a'.repeat(8), 'a'.repeat(200)]) {
      authorizeConfigs.length = 0;
      await invoke('oauth:authorize', 'github', id);
      expect(authorizeConfigs[0]!.clientId).toBe(id);
    }
  });

  it('OAuth 設定が無いサービスは断る', async () => {
    const r = (await invoke('oauth:authorize', 'notion')) as { ok: boolean; code: string };
    expect(r).toEqual({
      ok: false,
      code: 'not_supported',
      message: 'このサービスは OAuth 未対応、または OAuth クライアント ID 未設定',
    });
    expect(authorizeConfigs).toEqual([]);
  });

  it('クライアント ID 未設定のサービスは、正しい上書きがあれば通す', async () => {
    const bare = (await invoke('oauth:authorize', 'slack')) as { ok: boolean; code: string };
    expect(bare.ok).toBe(false);
    expect(bare.code).toBe('not_supported');
    expect(authorizeConfigs).toEqual([]);

    const withOverride = (await invoke('oauth:authorize', 'slack', 'supplied-client-id')) as {
      ok: boolean;
    };
    expect(withOverride.ok).toBe(true);
    expect(authorizeConfigs[0]!.clientId).toBe('supplied-client-id');
  });

  it('認可が失敗したら理由を返す', async () => {
    authorizeResult = new Error('user cancelled');
    const r = (await invoke('oauth:authorize', 'github')) as { ok: boolean; code: string };
    expect(r.ok).toBe(false);
    expect(r.code).toBe('authorize_failed');
  });

  it('成功しても access token は返さない (scope と期限だけ)', async () => {
    const r = (await invoke('oauth:authorize', 'github')) as { data: Record<string, unknown> };
    expect(r.data).toEqual({ scope: 'repo', expiresAt: 999 });
    // レンダラーへトークンそのものを渡さない (保存は main 側で完結する)。
    expect(JSON.stringify(r)).not.toContain('SECRET_AT');
    expect(JSON.stringify(r)).not.toContain('SECRET_RT');
  });
});

describe('読み出し専用のハンドラ', () => {
  it('app:getVersion は版番号を返す', async () => {
    expect(await invoke('app:getVersion')).toBe('1.2.3');
  });

  it('secrets:list は設定済みのサービス id', async () => {
    expect(await invoke('secrets:list')).toEqual(['github']);
  });

  it('secrets:protection は秘密そのものを返さない', async () => {
    const r = (await invoke('secrets:protection')) as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual(['encrypted', 'file', 'plainCount']);
  });
});

describe('secrets:set — 資格情報そのものの検査', () => {
  it('空・空白だけ・長すぎは断る (規則は shared/tokenInput.ts に 1 つ)', async () => {
    for (const tok of ['', '   ', 'a'.repeat(65_537), undefined, null, 42]) {
      const r = (await invoke('secrets:set', 'github', tok)) as { ok: boolean; code: string };
      expect(r.ok).toBe(false);
      expect(r.code).toBe('invalid_token');
    }
    expect(setTokenCalls).toEqual([]);
  });

  it('上限ちょうど (65536 文字) は保存する', async () => {
    const tok = 'a'.repeat(65_536);
    expect(await invoke('secrets:set', 'github', tok)).toEqual({ ok: true });
    expect(setTokenCalls).toEqual([['github', tok]]);
  });

  it('前後の空白は落として保存する', async () => {
    await invoke('secrets:set', 'github', '  ghp_padded  ');
    expect(setTokenCalls).toEqual([['github', 'ghp_padded']]);
  });

  /*
   * 検査の名前 (「文字列にして返す」) と期待値 (固定の文言) が食い違っていた。
   * 2026-08-22 にこのハンドラを `safeErrorMessage` へ寄せた時点で、名前の側が
   * 正しくなった —— 他の 9 本のハンドラは元から `String(err)` を返しており、
   * ここだけが理由を捨てて固定文言に潰していた。このハンドラ自身の説明も
   * 「弾いた理由を**返す**」と書いている。
   */
  it('Error でないものが投げられても文字列にして返す', async () => {
    setTokenThrows = 'plain string failure' as unknown as Error;
    const r = (await invoke('secrets:set', 'github', 'ghp_x_valid')) as {
      ok: boolean;
      message: string;
    };
    expect(r.ok).toBe(false);
    expect(r.message).toBe('plain string failure');
  });
});

describe('fetch:snapshot — ローカルのサービス', () => {
  it('fetcher が登録されていないサービスは not_implemented', async () => {
    expect(await invoke('fetch:snapshot', 'slack')).toEqual({
      ok: false,
      code: 'not_implemented',
      message: 'slack はライブフェッチ未対応',
    });
  });

  it('ローカルのサービスは資格情報が無くても動く (空文字を渡す)', async () => {
    validToken = { ok: false, reason: 'absent' };
    const r = (await invoke('fetch:snapshot', 'skills')) as { ok: boolean };
    // ここが not_configured で止まると、ディスクだけ読むサービスが
    // 「トークン未設定」で使えなくなる。
    expect(r).toEqual({ ok: true, data: { local: true } });
    expect(fetcherCalls).toEqual([{ token: '' }]);
  });

  it('ローカルでないサービスは資格情報が無ければ止まる', async () => {
    validToken = { ok: false, reason: 'absent' };
    const r = (await invoke('fetch:snapshot', 'github')) as { code: string };
    expect(r.code).toBe('not_configured');
    expect(fetcherCalls).toEqual([]);
  });

  it('ローカルでも「保存済みだが読めない」なら黙らない', async () => {
    validToken = { ok: false, reason: 'undecryptable', message: '鍵が変わっています' };
    const r = (await invoke('fetch:snapshot', 'skills')) as { code: string; message: string };
    expect(r).toEqual({ ok: false, code: 'not_configured', message: '鍵が変わっています' });
  });
});

describe('action:invoke — 読めない資格情報', () => {
  it('「保存済みだが読めない」は理由をそのまま伝える', async () => {
    validToken = { ok: false, reason: 'undecryptable', message: '鍵が変わっています' };
    const r = (await invoke('action:invoke', 'github', 'create-issue', {})) as { message: string };
    expect(r).toEqual({ ok: false, code: 'not_configured', message: '鍵が変わっています' });
  });

  it('未設定は汎用の文言 (理由を漏らさない)', async () => {
    validToken = { ok: false, reason: 'absent' };
    const r = (await invoke('action:invoke', 'github', 'create-issue', {})) as { message: string };
    expect(r.message).toBe('トークン未設定');
  });
});

describe('app:revealInFolder / app:openPath — 関門の外は開かない', () => {
  it('関門が断ったら理由を返し、OS を呼ばない', async () => {
    gateResult = null;
    for (const name of ['app:revealInFolder', 'app:openPath']) {
      const r = (await invoke(name, '/etc/passwd')) as { ok: boolean; message: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain('書き出し先の外');
    }
    expect(shownInFolder).toEqual([]);
    expect(openPathCalls).toEqual([]);
  });

  it('関門を通ったら実体パスで OS を呼ぶ', async () => {
    expect(await invoke('app:revealInFolder', 'x')).toEqual({ ok: true });
    expect(shownInFolder).toEqual(['/root/ok.md']);
    expect(await invoke('app:openPath', 'x')).toEqual({ ok: true });
    expect(openPathCalls).toEqual(['/root/ok.md']);
  });

  it('openPath は OS の失敗文字列を握り潰さない', async () => {
    // `shell.openPath` は成功で空文字、失敗でエラー文字列を返す契約。
    // 戻り値を捨てると、開けなくても呼び出し側には成功と見える。
    openPathResult = 'no application associated';
    expect(await invoke('app:openPath', 'x')).toEqual({
      ok: false,
      message: 'no application associated',
    });
  });

  it('関門が投げても reject しない', async () => {
    gateResult = new Error('realpath exploded');
    for (const name of ['app:revealInFolder', 'app:openPath']) {
      const r = (await invoke(name, 'x')) as { ok: boolean; message: string };
      expect(r.ok).toBe(false);
      expect(r.message).toContain('realpath exploded');
    }
  });
});

describe('app:checkUpdate — 取得もインストールもしない', () => {
  const withFetch = async (impl: () => Promise<unknown>): Promise<unknown> => {
    const orig = globalThis.fetch;
    globalThis.fetch = impl as typeof fetch;
    try {
      return await invoke('app:checkUpdate');
    } finally {
      globalThis.fetch = orig;
    }
  };

  it('公開されているリリース情報だけを、定数の送り先から読む', async () => {
    // 送り先が変数になると、応答を差し替えられて任意の URL を案内先にできる。
    let seen: [string, RequestInit] | null = null;
    await withFetch(async (...a: unknown[]) => {
      seen = a as unknown as [string, RequestInit];
      return { ok: true, json: async () => ({}) };
    });
    expect(seen![0]).toBe('https://api.github.com/repos/hiroto1977/-/releases/latest');
    expect((seen![1].headers as Record<string, string>).accept).toBe('application/vnd.github+json');
  });

  it('新しい版があれば伝える', async () => {
    const r = (await withFetch(async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v9.9.9', html_url: 'https://github.com/hiroto1977/-/releases/tag/v9.9.9' }),
    }))) as { status: string };
    expect(r.status).toBe('update-available');
  });

  it('通信できなければ「判定不能」に寄せる (アプリは使えたまま)', async () => {
    const r = (await withFetch(async () => {
      throw new Error('offline');
    })) as { status: string };
    expect(r.status).toBe('unknown');
  });

  it('応答が 2xx でなければ、本文が読めても信用しない', async () => {
    // 本文だけ見て判断すると、502 のエラーページに紛れ込ませた JSON や
    // 差し替えられた応答を「新しい版が出ています」として案内してしまう。
    const r = (await withFetch(async () => ({
      ok: false,
      json: async () => ({
        tag_name: 'v99.99.99',
        html_url: 'https://github.com/hiroto1977/-/releases/tag/v99.99.99',
      }),
    }))) as { status: string };
    expect(r.status).toBe('unknown');
  });

  it('応答が JSON でなくても投げない', async () => {
    const r = (await withFetch(async () => ({
      ok: true,
      json: async () => {
        throw new Error('not json');
      },
    }))) as { status: string };
    expect(r.status).toBe('unknown');
  });
});

describe('アプリの寿命', () => {
  it('macOS 以外では全部の窓を閉じたら終了する', async () => {
    const orig = process.platform;
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      appListeners.get('window-all-closed')!();
      expect(quitCalls).toBe(1);
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      appListeners.get('window-all-closed')!();
      expect(quitCalls).toBe(1); // macOS では終了しない
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true });
    }
  });
});
