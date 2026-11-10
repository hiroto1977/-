import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * **main.mamori の薄い壁 (mainHost.ts) の振る舞いを値ごとに留める (MG-059)。**
 * 判断は main.mamori が持つ。ここが持つのは「値を渡して結果を返す」口だけなので、
 * 返す値・渡す値・自分の鍵だけを引くことを 1 つずつ見る (変異検査の生存を殺す)。
 */
const themeSource = { current: 'system' };
vi.mock('electron', () => ({
  app: { isPackaged: false, name: 'x' },
  BrowserWindow: class {},
  dialog: {},
  ipcMain: {},
  nativeTheme: {
    get themeSource() {
      return themeSource.current;
    },
    set themeSource(v: string) {
      themeSource.current = v;
    },
  },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const host = await import('../mainHost');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  themeSource.current = 'system';
});

describe('mainHost —— 薄い壁', () => {
  it('hostEnv: 在る名前は値・無い名前は空文字 (undefined を返さない)', () => {
    vi.stubEnv('MG059_PROBE', 'abc');
    expect(host.hostEnv('MG059_PROBE')).toBe('abc');
    expect(host.hostEnv('MG059_NOT_SET_ANYWHERE')).toBe('');
    vi.unstubAllEnvs();
  });

  it('パスは main.js の 1 つ上を根にする (icon / preload / dist / index.html)', () => {
    const here = path.dirname(path.resolve(__dirname, '../mainHost.ts'));
    expect(host.hostIconPath()).toBe(path.join(here, '..', 'build', 'icon.png'));
    expect(host.hostPreloadPath()).toBe(path.join(here, 'preload.js'));
    expect(host.hostDistRoot()).toBe(path.join(here, '..', 'dist'));
    expect(host.hostIndexHtml()).toBe(path.join(here, '../dist/index.html'));
  });

  it('hostConsoleError は stderr (console.error) へそのまま渡す', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    host.hostConsoleError('boom');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('boom');
  });

  it('hostSetTimeout は ms だけ遅らせて 1 回だけ実行する', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    host.hostSetTimeout(run, 500);
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('hostPlatform は process.platform', () => {
    expect(host.hostPlatform()).toBe(process.platform);
  });

  it('hostApplyNativeTheme は electron の themeSource を置く', () => {
    host.hostApplyNativeTheme('dark');
    expect(themeSource.current).toBe('dark');
    host.hostApplyNativeTheme('light');
    expect(themeSource.current).toBe('light');
  });

  it('hostTimeoutSignal は締切つきの信号 (まだ中止していない・短い締切で中止する)', async () => {
    const live = host.hostTimeoutSignal(60_000);
    expect(live.aborted).toBe(false);
    const short = host.hostTimeoutSignal(5);
    await new Promise((r) => setTimeout(r, 40));
    expect(short.aborted).toBe(true);
  });

  it('hostFetch は呼ぶ時点の fetch を呼び、転送に追随しない規則 (redirect: manual) を掛ける', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const stub = vi.fn(async (input: string, init: RequestInit) => {
      calls.push([input, init]);
      return new Response('ok');
    });
    vi.stubGlobal('fetch', stub);
    const res = await host.hostFetch('https://example.invalid/x', { headers: { a: 'b' } });
    expect(await res.text()).toBe('ok');
    expect(stub).toHaveBeenCalledTimes(1);
    expect(calls[0]![0]).toBe('https://example.invalid/x');
    expect(calls[0]![1].redirect).toBe('manual');
    expect(calls[0]![1].headers).toEqual({ a: 'b' });
    vi.unstubAllGlobals();
  });

  it('hostParseJson は JSON を読み、読めなければ投げる', () => {
    expect(host.hostParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(() => host.hostParseJson('{')).toThrow();
  });

  it('hostAsRecord は渡された物をそのまま返す (型の読み替えだけ)', () => {
    const o = { a: 1 };
    expect(host.hostAsRecord(o)).toBe(o);
  });

  it('lookupFetcher / lookupAction / lookupOAuthConfig は自分の鍵だけを引く (prototype の鍵は引かない)', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(host.lookupFetcher(key as never)).toBeUndefined();
      expect(host.lookupAction(key as never, 'x')).toBeUndefined();
      expect(host.lookupAction('github', key)).toBeUndefined();
      expect(host.lookupOAuthConfig(key as never)).toBeUndefined();
    }
    expect(typeof host.lookupFetcher('github')).toBe('function');
    expect(host.lookupAction('github', 'no-such-action')).toBeUndefined();
    expect(host.lookupOAuthConfig('github')).toBeUndefined();
    expect(host.lookupOAuthConfig('drive')).toBeDefined();
  });
});
