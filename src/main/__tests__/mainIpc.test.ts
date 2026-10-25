import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import { describeDesktopEraseReport } from '../../shared/eraseReport';

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
let relaunchCalls = 0;
const exitCodes: number[] = [];
let allWindows: unknown[] = [];

let openedExternal: string[] = [];
/** OS が URL を開けない状況を作るための差し込み口 (既定は成功)。 */
let openExternalRejection: Error | null = null;
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
    requestSingleInstanceLock: () => true,
    on: (name: string, fn: () => void) => {
      appListeners.set(name, fn);
    },
    quit: () => {
      quitCalls++;
    },
    relaunch: () => {
      relaunchCalls++;
    },
    exit: (code: number) => {
      exitCodes.push(code);
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
  // 配色の追随 (パス 318) が themeSource を書く。この mock は検査ファイルの中で 1 つで、main を読み直しても
  // 作り直されない —— 前の検査が書いた値は、読む検査の側が戻す (下の「形の合わない値」)。
  nativeTheme: { themeSource: 'system' },
  shell: {
    openExternal: async (url: string) => {
      if (openExternalRejection !== null) throw openExternalRejection;
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

/** app:eraseAll の中身は main/eraseAll.ts (実物のファイルで別に検査)。ここは**再起動の判断**だけを見る。 */
function desktopReport(allDeleted: boolean): import('../../shared/eraseReport').DesktopEraseReport {
  return {
    kind: 'desktop',
    files: { '/tmp/x/service-hub-secrets.json': allDeleted ? 'deleted' : 'failed' },
    renderer: 'deleted',
    allDeleted,
  };
}
let eraseReportImpl: () => Promise<import('../../shared/eraseReport').DesktopEraseReport> = async () => desktopReport(true);
/** 本人確認の門 (T-147)。既定は通す —— 番人の検査はこのファイルの他の describe が見る。 */
let presenceVerdict: { ok: true } | { ok: false; message: string } = { ok: true };
let presenceThrows: Error | null = null;
const presenceRequests: { channel: string; tier: string; summary: string; weight?: number }[] = [];
const threatSignals: { kind: string; where: string }[] = [];
vi.mock('../presenceWiring', () => ({
  reportThreatSignal: (kind: string, where: string) => {
    threatSignals.push({ kind, where });
  },
  requirePresence: (_e: unknown, req: { channel: string; tier: string; summary: string; weight?: number }) => {
    presenceRequests.push(req);
    return presenceThrows ? Promise.reject(presenceThrows) : Promise.resolve(presenceVerdict);
  },
}));

vi.mock('../eraseAll', () => ({
  eraseDesktopData: async () => eraseReportImpl(),
}));
/** 窓の配色の保存 (パス 318)。実ファイルは windowPrefs.test.ts で見るので、ここは main の順序と戻り値だけ。 */
let writePrefsThrows: Error | null = null;
const writtenPrefs: unknown[] = [];
vi.mock('../windowPrefs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../windowPrefs')>();
  return {
    ...real,
    readWindowPrefs: async () => real.DEFAULT_WINDOW_PREFS,
    writeWindowPrefs: async (prefs: unknown) => {
      if (writePrefsThrows) throw writePrefsThrows;
      writtenPrefs.push(prefs);
    },
  };
});
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
    // 資格情報を読まない LOCAL サービス (T-118)。保管ファイルの不調に巻き込まれてはならない。
    kpi: async (a: unknown) => { fetcherCalls.push(a); return { local: 'kpi' }; },
  },
  LIVE_ACTIONS: {
    github: { 'create-issue': async (a: unknown) => { actionCalls.push(a); return { id: 1 }; } },
    assistant: { chat: async () => ({ ok: true }), chatAll: async () => ({ ok: true }), providers: async () => ({ ok: true }) },
    // 資格情報の要らないサービスの action (パス 267 の実測対象)。
    skills: { run: async (a: unknown) => { actionCalls.push(a); return { ran: true }; } },
    kpi: { save: async (a: unknown) => { actionCalls.push(a); return { saved: true }; } },
  },
  LOCAL_SERVICES: new Set(['skills', 'kpi']),
  // 本物は clients/index.ts (localTokenReaders.test.ts が ctx.token の読み手と双方向に突き合わせる)。
  // ここは主プロセスの入口が**呼ぶ**ことだけを見るので、読む 1 件 (skills) と読まない 1 件 (kpi) を置く。
  readsSavedToken: (id: string) => id !== 'kpi',
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

// 依存先は `beforeAll` で 1 度だけ読んでおく —— 検査ごとに読み直すのは `main.ts` の 1 本だけ
// (`rereadModule`)。`vi.resetModules()` で丸ごと読み直すと、依存先の直下の値まで
// 「その検査が覆った」と変異検査に数えられる (パス 495)。先頭の静的 import にしないのは、
// `main.ts` が読み込んだ瞬間に `ipcMain.handle(...)` を呼び、この検査の `handlers` が
// まだ初期化されていない (静的 import は本体より先に評価される) ため。
beforeAll(async () => {
  await import('../main');
});

// **毎テストで読み直す。** `beforeAll` で 1 回だけ読むと、モジュール直下で
// 走る `ipcMain.handle(...)` は変異体が有効になる**前**に評価済みになり、
// 検査が実際に殺していても Stryker は「生存」と報告する (static 変異体)。
// `rereadModule` で読み直せば、変異体の有効化後に評価される。
beforeEach(async () => {
  handlers.clear();
  appListeners.clear();
  openedExternal = [];
  openExternalRejection = null;
  shownInFolder = [];
  openPathCalls = [];
  openPathResult = '';
  presenceVerdict = { ok: true };
  presenceThrows = null;
  presenceRequests.length = 0;
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
  relaunchCalls = 0;
  exitCodes.length = 0;
  eraseReportImpl = async () => desktopReport(true);
  writePrefsThrows = null;
  writtenPrefs.length = 0;
  allWindows = [];
  await rereadModule<typeof import('../main')>(import.meta.url, '../main');
});

// ---------------------------------------------------------------------------

describe('登録', () => {
  it('15 個のハンドラが登録される', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'action:invoke',
        'app:checkUpdate',
        'app:eraseAll',
        'app:getVersion',
        'app:openExternal',
        'app:openPath',
        'app:revealInFolder',
        'app:setColorScheme',
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

describe('app:eraseAll — デスクトップ版の「すべてのデータを削除」 (パス 137)', () => {
  it('★ 全部消えた時だけ再起動する (relaunch → exit 0)。返してから —— 画面が「再起動します」を出せる', async () => {
    vi.useFakeTimers();
    try {
      const report = (await invoke('app:eraseAll')) as { kind: string; allDeleted: boolean };
      expect(report).toMatchObject({ kind: 'desktop', allDeleted: true });
      expect(relaunchCalls).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(relaunchCalls).toBe(1);
      expect(exitCodes).toEqual([0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('手順が投げても IPC を reject しない — error つきの報告を返し、再起動しない', async () => {
    eraseReportImpl = async () => {
      throw new Error('disk on fire');
    };
    vi.useFakeTimers();
    try {
      const report = (await invoke('app:eraseAll')) as { kind: string; allDeleted: boolean; error?: string };
      expect(report).toMatchObject({ kind: 'desktop', allDeleted: false });
      expect(report.error).toContain('disk on fire');
      await vi.advanceTimersByTimeAsync(1000);
      expect(relaunchCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  /*
   * **手順が投げたときの報告は、どこまで消えたか分からない形** (2026-09-30 · パス 502)。
   *
   * 上の検査は `kind` と `allDeleted` と `error` しか見ない。`files` が空 (どのファイルが消えたか**分からない**)・
   * `renderer` が `failed` (画面側の保存領域が消えたとは言えない) という残りの 2 欄は、
   * 画面 (`describeDesktopEraseReport`) が「残っている可能性」の文を組む材料で、値が違えば文も違う。
   */
  it('★ 手順が投げた報告は、files が空・renderer は failed・allDeleted は偽 (消えたと言わない)', async () => {
    eraseReportImpl = async () => {
      throw new Error('disk on fire');
    };
    const report = (await invoke('app:eraseAll')) as import('../../shared/eraseReport').DesktopEraseReport;
    expect(report).toEqual({
      kind: 'desktop',
      files: {},
      renderer: 'failed',
      allDeleted: false,
      error: expect.stringContaining('disk on fire'),
    });
    // 画面の文 (共有の describeDesktopEraseReport) は「残っている可能性」と言い、画面側の保存領域を名指ししない
    const text = describeDesktopEraseReport(report) ?? '';
    expect(text).toContain('データは残っている可能性');
  });

  it('★ 残った物が在れば再起動しない — 報告を返し、画面が名指しする', async () => {
    eraseReportImpl = async () => desktopReport(false);
    vi.useFakeTimers();
    try {
      const report = (await invoke('app:eraseAll')) as { kind: string; allDeleted: boolean };
      expect(report).toMatchObject({ kind: 'desktop', allDeleted: false });
      await vi.advanceTimersByTimeAsync(1000);
      expect(relaunchCalls).toBe(0);
      expect(exitCodes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('app:setColorScheme — 窓の下地と配色の追随 (パス 318)', () => {
  function fakeWindow() {
    return {
      colors: [] as string[],
      setBackgroundColor(c: string) {
        this.colors.push(c);
      },
    };
  }

  it('★ 形の合う値なら、今ある窓の下地・Electron の配色・userData の順に効く', async () => {
    const w1 = fakeWindow();
    const w2 = fakeWindow();
    allWindows = [w1, w2];
    expect(await invoke('app:setColorScheme', 'dark', '#1B1520')).toEqual({ ok: true });
    expect(w1.colors).toEqual(['#1b1520']);
    expect(w2.colors).toEqual(['#1b1520']);
    const electron = await import('electron');
    expect(electron.nativeTheme.themeSource).toBe('dark');
    expect(writtenPrefs).toEqual([{ scheme: 'dark', background: '#1b1520' }]);
  });

  it('★ 形の合わない値は何も変えずに断る (scheme も色も)', async () => {
    const w = fakeWindow();
    allWindows = [w];
    // electron の mock は main の読み直しをまたいで同じ object なので、前の検査が書いた themeSource を戻す。
    const electron = await import('electron');
    electron.nativeTheme.themeSource = 'system';
    const bad: [unknown, unknown][] = [
      ['system', '#1b1520'],
      ['Dark', '#1b1520'],
      ['dark', 'red'],
      ['dark', '#fff'],
      ['dark', 'javascript:alert(1)'],
      [1, '#1b1520'],
      ['dark', null],
    ];
    for (const [s, b] of bad) {
      const r = (await invoke('app:setColorScheme', s, b)) as { ok: boolean; message?: string };
      expect(r.ok, JSON.stringify([s, b])).toBe(false);
      expect(r.message).toContain('配色の値が不正');
    }
    expect(w.colors).toEqual([]);
    expect(writtenPrefs).toEqual([]);
    expect(electron.nativeTheme.themeSource).toBe('system');
  });

  it('★ 保存に失敗しても窓の色は変わっていて、失敗は戻り値で言う (reject しない)', async () => {
    writePrefsThrows = new Error('EACCES: permission denied');
    const w = fakeWindow();
    allWindows = [w];
    const r = (await invoke('app:setColorScheme', 'dark', '#1b1520')) as { ok: boolean; message?: string };
    expect(w.colors).toEqual(['#1b1520']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('EACCES');
  });

  it('窓が 1 つも無くても保存はする (次に作る窓のため)', async () => {
    allWindows = [];
    expect(await invoke('app:setColorScheme', 'light', '#fff7fa')).toEqual({ ok: true });
    expect(writtenPrefs).toEqual([{ scheme: 'light', background: '#fff7fa' }]);
  });
});

describe('app:openExternal — 開いてよい URL だけ', () => {
  it('http / https は OS のブラウザへ渡す', async () => {
    await invoke('app:openExternal', 'https://example.com/a?b=1');
    await invoke('app:openExternal', 'http://example.com/');
    expect(openedExternal).toEqual(['https://example.com/a?b=1', 'http://example.com/']);
  });

  /*
   * **OS 側が開けなかったときに reject しない。**
   *
   * `shell.openExternal` は既定ブラウザ未設定や `xdg-open` 不在で reject する。
   * この口の約束は `Promise<void>` でレンダラーに受け皿が無いため、reject を
   * そのまま返すと呼び出し元で未処理の rejection になる。握り潰さず main の
   * 記録には残す、というのが本体の設計 (`main.ts` の注記)。
   *
   * その catch は **どのテストも通っていなかった** (2026-08-24 の変異検査が
   * NoCoverage として指した)。差し込み口を足して両方向を固定する。
   */
  it('OS が開けなくても reject しない (記録は残す)', async () => {
    openExternalRejection = new Error('xdg-open not found');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(invoke('app:openExternal', 'https://example.com/')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain('openExternal');
    } finally {
      spy.mockRestore();
    }
  });

  it('開けたときは記録を残さない (対照)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await invoke('app:openExternal', 'https://example.com/');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
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
    // 上限は `ERROR_MESSAGE_MAX_CHARS` (2000)。数字を写経せず「入力より短い」
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

  /*
   * **「保管ファイルを読めなかった」を「トークン未設定」と言わない** (2026-09-06)。
   *
   * 読めなかったとき `readStore` は `{}` を返すので、`readStoredToken` は
   * `absent` を名乗り、ここは「トークン未設定」と案内していた —— 保存済みの
   * 利用者は鍵を貼り直そうとし、`setToken` に (正しく) 断られる。
   */
  it('★ 保管ファイルが読めないときは理由を伝える (「トークン未設定」と言わない)', async () => {
    validToken = { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (too large)。' };
    const r = (await invoke('fetch:snapshot', 'github')) as { ok: boolean; code: string; message: string };
    expect(r).toEqual({
      ok: false,
      code: 'not_configured',
      message: '保管ファイルを読めませんでした (too large)。',
    });
    expect(fetcherCalls, '読めないのに取りに行っている').toEqual([]);
  });

  it('★ ローカルのサービスでも黙らない (資格情報が要らないのは「未設定」のときだけ)', async () => {
    validToken = { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (broken JSON)。' };
    const r = (await invoke('fetch:snapshot', 'skills')) as { ok: boolean; message: string };
    expect(r.ok).toBe(false);
    expect(r.message).toContain('保管ファイルを読めませんでした');
  });

  it('★ 資格情報を読まない LOCAL サービスは、保管ファイルの不調に巻き込まれない (threat: T-118)', async () => {
    validToken = { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (broken JSON)。' };
    expect(await invoke('fetch:snapshot', 'kpi')).toEqual({ ok: true, data: { local: 'kpi' } });
    expect(fetcherCalls).toEqual([{ token: '' }]);
    expect(await invoke('action:invoke', 'kpi', 'save', {})).toEqual({ ok: true, data: { saved: true } });
    expect(actionCalls).toEqual([{ token: '', payload: {} }]);
  });

  it('★ 資格情報を読む LOCAL サービスと、LOCAL でないサービスは、不調を伝えて断るまま (threat: T-118)', async () => {
    validToken = { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (broken JSON)。' };
    for (const id of ['skills', 'github']) {
      const r = (await invoke('fetch:snapshot', id)) as { ok: boolean; code: string };
      expect(r.ok, id).toBe(false);
      expect(r.code, id).toBe('not_configured');
    }
    const a = (await invoke('action:invoke', 'skills', 'run', {})) as { ok: boolean; code: string };
    expect(a).toMatchObject({ ok: false, code: 'not_configured' });
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

  /*
   * **資格情報の要らないサービスの action が、デスクトップ版で 1 度も呼ばれなかった**
   * (2026-09-15 · パス 267)。
   *
   * `action:invoke` は全サービスに有効なトークンを要求しており、実測すると
   * `{ok: false, code: 'not_configured', message: 'トークン未設定'}` を返して
   * action 関数の呼び出し回数は **0** だった。同じ入口の `fetch:snapshot` は
   * 30 行上で `LOCAL_SERVICES` を見ているのに、**書き込み側だけがその規則を
   * 持っていなかった** —— ブラウザ版 (`web-shim`) はトークンを要求しないので
   * 同じボタンが動いており、ビルド間の非対称だった。
   *
   * ここを留めるのは**構造**である (`LOCAL_SERVICES` を引く 1 行)。サービスごとの
   * 台帳は要らない —— ハンドラが集合を直接読むので、新しいローカルサービスが
   * action を登録しても同じ道を通る。
   */
  it('★ 資格情報の要らないサービス (LOCAL_SERVICES) の action は、トークンが無くても呼ぶ', async () => {
    validToken = { ok: false, reason: 'absent' };
    expect(await invoke('action:invoke', 'skills', 'run', { q: 'x' })).toEqual({
      ok: true,
      data: { ran: true },
    });
    // トークンは空文字で渡る (fetch:snapshot と同じ)。
    expect(actionCalls).toEqual([{ token: '', payload: { q: 'x' } }]);
  });

  it('★ 対照: 資格情報の要るサービスは、トークンが無ければ今までどおり断る', async () => {
    validToken = { ok: false, reason: 'absent' };
    expect(await invoke('action:invoke', 'github', 'create-issue', {})).toEqual({
      ok: false,
      code: 'not_configured',
      message: 'トークン未設定',
    });
    expect(actionCalls).toEqual([]);
  });

  it('★ ローカルでも「未設定ではない」理由なら断る (復号できない / 保管ファイルが読めない)', async () => {
    // ここを `absent` と同じに扱うと、鍵を貼り直せば直ると思わせてしまう。
    // 条件は fetch:snapshot と 1 文字も変えていない。
    for (const read of [
      { ok: false, reason: 'undecryptable', message: 'キーチェーンが使えません' },
      { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (broken JSON)。' },
    ]) {
      actionCalls.length = 0;
      validToken = read;
      expect(await invoke('action:invoke', 'skills', 'run', {})).toEqual({
        ok: false,
        code: 'not_configured',
        message: read.message,
      });
      expect(actionCalls).toEqual([]);
    }
  });

  it('★ ローカルサービスに保存済みのトークンが在れば、それを渡す (security の HIBP/VT と同じ)', async () => {
    validToken = { ok: true, token: 'local-tok' };
    expect(await invoke('action:invoke', 'skills', 'run', {})).toEqual({ ok: true, data: { ran: true } });
    expect(actionCalls).toEqual([{ token: 'local-tok', payload: {} }]);
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

  it('★ action も、保管ファイルが読めないときは理由を伝える', async () => {
    validToken = { ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (too large)。' };
    expect(await invoke('action:invoke', 'github', 'create-issue', {})).toEqual({
      ok: false,
      code: 'not_configured',
      message: '保管ファイルを読めませんでした (too large)。',
    });
    expect(actionCalls).toEqual([]);
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

  it('★ 認可は同時に 1 つだけ: 進行中の間の 2 つ目は始めずに断り、終われば次を受ける (threat: T-139)', async () => {
    let release: (v: unknown) => void = () => undefined;
    authorizeResult = new Promise((resolve) => {
      release = resolve;
    });
    const first = invoke('oauth:authorize', 'github') as Promise<{ ok: boolean }>;
    // 2 つ目以降は待受を作らない (authorize を呼ばない)。
    await Promise.resolve();
    const second = (await invoke('oauth:authorize', 'github')) as { ok: boolean; code: string };
    const third = (await invoke('oauth:authorize', 'github', 'abcdefgh.apps.googleusercontent.com')) as { code: string };
    expect(second).toEqual({
      ok: false,
      code: 'authorize_busy',
      message: '別の認可が進行中です。開いたブラウザでの手続きを終えるか、5 分ほど待ってからやり直してください',
    });
    expect(third.code).toBe('authorize_busy');
    expect(authorizeConfigs).toHaveLength(1);
    release({ accessToken: 'SECRET_AT', refreshToken: 'SECRET_RT', scope: 'repo', expiresAt: 999 });
    expect((await first).ok).toBe(true);
    // 対照: 終わったあとは次の認可を受ける (フラグが残らない)。失敗で終わった場合も同じ。
    authorizeResult = new Error('user cancelled');
    expect(((await invoke('oauth:authorize', 'github')) as { code: string }).code).toBe('authorize_failed');
    authorizeResult = { accessToken: 'a', refreshToken: 'r', scope: 'repo', expiresAt: 1 };
    expect(((await invoke('oauth:authorize', 'github')) as { ok: boolean }).ok).toBe(true);
  });

  it('★ クライアント ID を上書きしない認可も、本人確認の門 (egress 段階) を通り、断られたら始めない (threat: T-185)', async () => {
    presenceRequests.length = 0;
    const ok = (await invoke('oauth:authorize', 'github')) as { ok: boolean };
    expect(ok.ok).toBe(true);
    expect(presenceRequests).toHaveLength(1);
    expect(presenceRequests[0]).toMatchObject({ channel: 'oauth:authorize', tier: 'egress', summary: 'github の認可ページをブラウザで開きます' });
    // 門が断る (信頼できない送り手・速度超過・警戒) と、待受を作らず認可を始めない
    presenceVerdict = { ok: false, message: '信頼できない呼び出し元のため断りました。' };
    try {
      authorizeConfigs.length = 0;
      const refused = (await invoke('oauth:authorize', 'github')) as { ok: boolean; code: string; message: string };
      expect(refused).toEqual({ ok: false, code: 'authorize_failed', message: '信頼できない呼び出し元のため断りました。' });
      expect(authorizeConfigs).toEqual([]);
    } finally {
      presenceVerdict = { ok: true };
    }
    // 上書きするときは今までどおり資格情報の書き換えとして確認する
    presenceRequests.length = 0;
    await invoke('oauth:authorize', 'github', 'abcdefgh.apps.googleusercontent.com');
    expect(presenceRequests[0]).toMatchObject({ channel: 'oauth:authorize', tier: 'credential-write' });
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
  /**
   * `Response` の必要な面だけを持つ替え玉。
   *
   * **`text` も持たせる。** 本文は 2026-08-31 から `readBodyWithCap` で読む
   * (ブラウザ版の同じ口だけが上限つきで、こちらが素通しだった)。あちらは
   * `res.body` を持たない素朴なモックのために `text()` へ落ちるので、
   * 替え玉にも `text` が要る。
   */
  const res = (body: unknown, ok = true): unknown => ({
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

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
      return res({});
    });
    expect(seen![0]).toBe('https://api.github.com/repos/hiroto1977/-/releases/latest');
    expect((seen![1].headers as Record<string, string>).accept).toBe('application/vnd.github+json');
  });

  it('新しい版があれば伝える', async () => {
    const r = (await withFetch(async () =>
      res({ tag_name: 'v9.9.9', html_url: 'https://github.com/hiroto1977/-/releases/tag/v9.9.9' }),
    )) as { status: string };
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
    const r = (await withFetch(async () =>
      res(
        { tag_name: 'v99.99.99', html_url: 'https://github.com/hiroto1977/-/releases/tag/v99.99.99' },
        false,
      ),
    )) as { status: string };
    expect(r.status).toBe('unknown');
  });

  /*
   * **上限は実行対象で変わらない。** ブラウザ版の同じ口は `readCappedText` を
   * 通していたのに、こちらは `res.json()` の素通しだった (2026-08-31)。
   * 宛先は定数で https だが、同じ問いに答えが 2 つある状態を残さない。
   */
  it('上限を超える本文は読み切らずに「判定不能」へ倒す', async () => {
    /*
     * **替え玉は「上限を外したら通る」形にする。**
     *
     * 最初は `body` だけを持つ替え玉を書いたが、対照が鳴らなかった ——
     * 上限を外して `res.json()` に戻しても、その替え玉には `json` が無いので
     * TypeError で落ち、やはり `unknown` になる。**どちらでも通る検査**
     * だった。`json` は正しい更新情報を返すようにして、上限を外したら
     * `update-available` になる (= 検査が落ちる) ようにしておく。
     */
    const chunk = new TextEncoder().encode('A'.repeat(1024 * 1024));
    let sent = 0;
    const r = (await withFetch(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v9.9.9',
        html_url: 'https://github.com/hiroto1977/-/releases/tag/v9.9.9',
      }),
      body: new ReadableStream<Uint8Array>({
        pull(c) {
          if (sent >= 12) {
            c.close();
            return;
          }
          sent += 1;
          c.enqueue(chunk);
        },
      }),
    }))) as { status: string };
    // 投げずに「判定不能」へ寄せる (更新確認の失敗でアプリが使えなくならない)。
    expect(r.status).toBe('unknown');
  });

  it('応答が JSON でなくても投げない', async () => {
    const r = (await withFetch(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => 'これは JSON ではない',
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


describe('本人確認の門 — 画面から独立した確認が通らなければ何も実行しない (threat: T-147)', () => {
  const DENY = { ok: false as const, message: '確認が許可されなかったため実行しませんでした。' };

  it('★ app:eraseAll は確認が通らなければ消さず、再起動もしない', async () => {
    presenceVerdict = DENY;
    const report = (await invoke('app:eraseAll')) as { allDeleted: boolean; error?: string };
    expect(report.allDeleted).toBe(false);
    expect(report.error).toBe(DENY.message);
    expect(relaunchCalls).toBe(0);
    expect(presenceRequests.map((r) => [r.channel, r.tier])).toEqual([['app:eraseAll', 'destructive']]);
  });

  it('★ secrets:clear は確認が通らなければ消さない', async () => {
    presenceVerdict = DENY;
    expect(await invoke('secrets:clear', 'github')).toEqual({ ok: false, message: DENY.message });
    expect(clearTokenCalls).toEqual([]);
    expect(presenceRequests[0]).toMatchObject({ channel: 'secrets:clear', tier: 'destructive' });
  });

  it('★ secrets:set は確認が通らなければ書かず、確認の文に値を載せない', async () => {
    presenceVerdict = DENY;
    const r = (await invoke('secrets:set', 'github', 'ghp_SECRETVALUE1234567890')) as { ok: boolean; message?: string };
    expect(r.ok).toBe(false);
    expect(setTokenCalls).toEqual([]);
    expect(presenceRequests[0]).toMatchObject({ channel: 'secrets:set', tier: 'credential-write' });
    expect(presenceRequests[0]!.summary).not.toContain('ghp_SECRETVALUE');
  });

  it('★ action:invoke は確認が通らなければ action を呼ばない (段階は台帳から・書く内容を見せる)', async () => {
    presenceVerdict = DENY;
    const r = (await invoke('action:invoke', 'github', 'create-issue', { title: 'T', body: 'B' })) as {
      ok: boolean;
      code?: string;
    };
    expect(r).toMatchObject({ ok: false, code: 'action_failed' });
    expect(actionCalls).toEqual([]);
    expect(presenceRequests[0]).toMatchObject({ channel: 'github/create-issue', tier: 'external-write' });
    expect(presenceRequests[0]!.summary).toContain('title: "T"');
  });

  it('★ action:invoke は呼び出しの重みを門へ渡す (全 AI 合議は提供者の数だけの費用・threat: T-152)', async () => {
    await invoke('action:invoke', 'assistant', 'chatAll', { messages: [] });
    expect(presenceRequests.at(-1)).toMatchObject({ channel: 'assistant/chatAll', weight: 5 });
    await invoke('action:invoke', 'assistant', 'chat', { messages: [] });
    expect(presenceRequests.at(-1)).toMatchObject({ channel: 'assistant/chat', weight: 1 });
  });

  it('★ 欄が 24 を超える payload は見せ方を工夫せず断る (先頭に飾りの欄を並べて本文を隠させない・threat: T-156)', async () => {
    const decoys = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`d${i}`, 'ok']));
    const r = await invoke('action:invoke', 'github', 'create-issue', { ...decoys, title: 'ATTACKER' });
    expect(r).toEqual({ ok: false, code: 'action_failed', message: '送る欄が多すぎるため断りました (通常の操作は 24 欄以内です)。' });
    expect(presenceRequests).toEqual([]);
    expect(actionCalls).toEqual([]);
    // 24 欄ちょうどは通常どおり確認へ進む。
    await invoke('action:invoke', 'github', 'create-issue', decoys);
    expect(presenceRequests).toHaveLength(1);
  });

  it('★ 読み取りの段階は欄が多くても断らない (確認を出さないので隠す先が無い・欄の幅の門は書き込み側だけ・threat: T-156)', async () => {
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`d${i}`, 'ok']));
    const r = await invoke('action:invoke', 'assistant', 'providers', wide);
    expect(r).not.toMatchObject({ code: 'action_failed', message: expect.stringContaining('欄が多すぎる') });
    expect(presenceRequests.at(-1)).toMatchObject({ channel: 'assistant/providers', tier: 'read' });
  });

  it('台帳に無い action でも (登録があれば) 最も厳しい段階で確かめる', async () => {
    await invoke('action:invoke', 'github', 'create-issue', {});
    expect(presenceRequests.at(-1)?.tier).toBe('external-write');
  });

  it('存在しない service / action の断りは確認より先 (ダイアログを出さない)', async () => {
    await invoke('action:invoke', 'no-such', 'x', {});
    await invoke('action:invoke', 'github', 'nope', {});
    expect(presenceRequests).toEqual([]);
  });

  it('★ 確認の呼び出し自体が投げても IPC は reject せず、何も実行しない (4 つの口とも・理由は伏字を通して返す)', async () => {
    presenceThrows = new Error('dialog exploded');
    const r1 = (await invoke('app:eraseAll')) as { allDeleted: boolean; error?: string };
    expect(r1).toEqual({ kind: 'desktop', files: {}, renderer: 'failed', allDeleted: false, error: 'dialog exploded' });
    expect(await invoke('secrets:clear', 'github')).toEqual({ ok: false, message: 'dialog exploded' });
    expect(await invoke('secrets:set', 'github', 'ghp_x1234567890abcdef')).toEqual({
      ok: false,
      code: 'write_failed',
      message: 'dialog exploded',
    });
    expect(await invoke('action:invoke', 'github', 'create-issue', {})).toEqual({
      ok: false,
      code: 'action_failed',
      message: 'dialog exploded',
    });
    expect(clearTokenCalls).toEqual([]);
    expect(setTokenCalls).toEqual([]);
    expect(actionCalls).toEqual([]);
    expect(relaunchCalls).toBe(0);
  });

  it('★ 確認の文面は何が起きるかを具体的に言う (削除・全消去)・断られた全消去の報告の形', async () => {
    presenceVerdict = DENY;
    await invoke('secrets:clear', 'github');
    expect(presenceRequests.at(-1)).toMatchObject({ channel: 'secrets:clear', summary: 'github の保存済み資格情報を削除します。' });
    const r = await invoke('app:eraseAll');
    expect(presenceRequests.at(-1)).toMatchObject({
      channel: 'app:eraseAll',
      summary: 'このアプリの資格情報・記録・設定をすべて削除して再起動します。元に戻せません。',
    });
    expect(r).toEqual({ kind: 'desktop', files: {}, renderer: 'failed', allDeleted: false, error: DENY.message });
  });

  it('★ secrets:set の確認は新しい値の長さと末尾 4 文字を見せる (横取りされても見分けがつく)。全体は見せない', async () => {
    const token = 'ghp_ABCDEFGHIJKLMNOP1234';
    await invoke('secrets:set', 'github', token);
    const summary = presenceRequests[0]!.summary;
    expect(summary).toContain(`全 ${token.length} 文字`);
    expect(summary).toContain('末尾「…1234」');
    expect(summary).not.toContain('ABCDEFGH');
    presenceRequests.length = 0;
    await invoke('secrets:set', 'github', 'abcd1234');
    expect(presenceRequests[0]!.summary).toBe(
      'github の資格情報を置き換えます。新しい値: 全 8 文字。心当たりが無ければ「実行しない」を選んでください。',
    );
  });

  it('★ app:openExternal は速度の制限を通り、断られたら開かない (確認は出さない段階)', async () => {
    presenceVerdict = DENY;
    await invoke('app:openExternal', 'https://example.com/a');
    expect(openedExternal).toEqual([]);
    expect(presenceRequests[0]).toMatchObject({ channel: 'app:openExternal', tier: 'egress', summary: 'https://example.com/a' });
    presenceVerdict = { ok: true };
    await invoke('app:openExternal', 'https://example.com/a');
    expect(openedExternal).toEqual(['https://example.com/a']);
    presenceThrows = new Error('x');
    openedExternal.length = 0;
    await invoke('app:openExternal', 'https://example.com/a');
    expect(openedExternal).toEqual([]);
  });

  it('★ oauth:authorize は、自分のクライアント ID を渡したときは資格情報の書き換えとして確かめる。断られたら認可を始めない', async () => {
    // 上書きしない認可は egress 段階 (確認は出さず、送り手・速度・警戒だけ · T-185)
    await invoke('oauth:authorize', 'github');
    expect(presenceRequests).toHaveLength(1);
    expect(presenceRequests[0]).toMatchObject({ channel: 'oauth:authorize', tier: 'egress' });
    presenceRequests.length = 0;
    expect(authorizeConfigs).toHaveLength(1);
    authorizeConfigs.length = 0;
    presenceVerdict = DENY;
    const r = (await invoke('oauth:authorize', 'github', 'abcdefgh.apps.googleusercontent.com')) as { ok: boolean; code?: string };
    expect(r).toMatchObject({ ok: false, code: 'authorize_failed' });
    expect(authorizeConfigs).toEqual([]);
    expect(presenceRequests[0]).toMatchObject({ channel: 'oauth:authorize', tier: 'credential-write' });
    expect(presenceRequests[0]!.summary).toContain('abcdefgh.apps.googleusercontent.com');
  });

  it('確認の呼び出しが投げても oauth:authorize は reject せず認可を始めない', async () => {
    presenceThrows = new Error('boom');
    const r = (await invoke('oauth:authorize', 'github', 'abcdefgh.apps.googleusercontent.com')) as { ok: boolean };
    expect(r).toEqual({ ok: false, code: 'authorize_failed', message: 'boom' });
    expect(authorizeConfigs).toEqual([]);
  });
});

describe('速度の上限と記録だけを掛ける 5 つの口 (threat: T-159)', () => {
  const DENIED = { ok: false as const, message: '短時間に操作が集中したため断りました。' };

  it('★ 各口は段階つきで門を呼ぶ (read は取得・更新確認・配色 / local-write は OS で開く 2 つ)・確認は出さない呼び方', async () => {
    await invoke('fetch:snapshot', 'github');
    await invoke('app:setColorScheme', 'dark', '#1b1520');
    await invoke('app:revealInFolder', 'x');
    await invoke('app:openPath', 'x');
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    try {
      await invoke('app:checkUpdate');
    } finally {
      globalThis.fetch = orig;
    }
    expect(presenceRequests.map((r) => [r.channel, r.tier])).toEqual([
      ['fetch:snapshot', 'read'],
      ['app:setColorScheme', 'read'],
      ['app:revealInFolder', 'local-write'],
      ['app:openPath', 'local-write'],
      ['app:checkUpdate', 'read'],
    ]);
  });

  it('★ 門が断ったら、副作用 (取得・配色・OS で開く・通信) は 1 つも起きず、理由を返す', async () => {
    presenceVerdict = DENIED;
    let netCalls = 0;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      netCalls += 1;
      return { ok: true };
    }) as unknown as typeof fetch;
    try {
      expect(await invoke('fetch:snapshot', 'github')).toEqual({ ok: false, code: 'fetch_failed', message: DENIED.message });
      expect(await invoke('app:setColorScheme', 'dark', '#1b1520')).toEqual(DENIED);
      expect(await invoke('app:revealInFolder', 'x')).toEqual(DENIED);
      expect(await invoke('app:openPath', 'x')).toEqual(DENIED);
      const verdict = (await invoke('app:checkUpdate')) as { kind: string };
      expect(verdict.kind).not.toBe('update-available');
    } finally {
      globalThis.fetch = orig;
    }
    expect(fetcherCalls).toEqual([]);
    expect(writtenPrefs).toEqual([]);
    expect(shownInFolder).toEqual([]);
    expect(openPathCalls).toEqual([]);
    expect(netCalls).toBe(0);
  });

  it('★ 門が投げても IPC は reject せず、同じ形で断る', async () => {
    presenceThrows = new Error('gate exploded');
    expect(await invoke('fetch:snapshot', 'github')).toEqual({ ok: false, code: 'fetch_failed', message: 'gate exploded' });
    expect(await invoke('app:setColorScheme', 'dark', '#1b1520')).toEqual({ ok: false, message: 'gate exploded' });
    expect(await invoke('app:revealInFolder', 'x')).toEqual({ ok: false, message: 'gate exploded' });
    expect(await invoke('app:openPath', 'x')).toEqual({ ok: false, message: 'gate exploded' });
    expect(((await invoke('app:checkUpdate')) as { kind: string }).kind).not.toBe('update-available');
    expect(openPathCalls).toEqual([]);
    expect(writtenPrefs).toEqual([]);
  });

  it('★ 知らない id・文字列でない引数の連打も数える (門を引数の検査より先に置く)', async () => {
    await invoke('fetch:snapshot', 'no-such-service');
    await invoke('fetch:snapshot', { a: 1 });
    await invoke('app:openPath', 42);
    expect(presenceRequests.map((r) => [r.channel, r.summary])).toEqual([
      ['fetch:snapshot', 'fetch:snapshot'],
      ['fetch:snapshot', 'fetch:snapshot'],
      ['app:openPath', '(文字列ではない)'],
    ]);
  });

  it('★ 見出しの決め方: 引数を渡さない口は口の名前・パスを渡す口は文字列ならそのまま・それ以外 (undefined / null を含む) は「(文字列ではない)」', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    try {
      await invoke('app:checkUpdate');
    } finally {
      globalThis.fetch = orig;
    }
    await invoke('app:setColorScheme', 'dark', '#1b1520');
    await invoke('app:revealInFolder', 42);
    await invoke('app:revealInFolder');
    await invoke('app:openPath', null);
    await invoke('fetch:snapshot');
    expect(presenceRequests.map((r) => [r.channel, r.summary])).toEqual([
      ['app:checkUpdate', 'app:checkUpdate'],
      ['app:setColorScheme', 'app:setColorScheme'],
      ['app:revealInFolder', '(文字列ではない)'],
      ['app:revealInFolder', '(文字列ではない)'],
      ['app:openPath', '(文字列ではない)'],
      ['fetch:snapshot', 'fetch:snapshot'],
    ]);
  });

  it('★ 開く口の確認の見出しにはパスそのものが載る (警戒中に確認が出るとき、何を開くか見える)', async () => {
    await invoke('app:openPath', '/exports/report.html');
    await invoke('app:revealInFolder', '/exports/report.svg');
    expect(presenceRequests.map((r) => r.summary)).toEqual(['/exports/report.html', '/exports/report.svg']);
  });
});
