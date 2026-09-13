/** @vitest-environment jsdom */
/**
 * **「未設定」と「確認できない」を分ける —— 設定を置いている 2 つの保管庫。**
 *
 * 実測 (2026-09-06): どちらの読み出しも `catch { return null; }` で、
 * **開けないことを「設定していない」に丸めていた**。出方が 3 つあった:
 *
 *   1. 設定画面の札が「未設定」/「フォルダ未設定」になる —— 設定した本人に
 *      「登録してください」と言う。URL と**共有シークレットを打ち直した末に
 *      同じ所で失敗する**
 *   2. ブラウザ版の shim も同じ案内を出す (`getProxyTransport`)
 *   3. **`fs/folderMirror.ts` が「『設定していない』ではなく失敗として扱う」と
 *      決めて書いた分岐が素通りになる** —— 1 つ下の層が差を消していたので、
 *      上の層はその差を見ることができなかった。`off` は警告を出さない側なので、
 *      フォルダ連携をしている端末で 1 バイトも書かれないまま「書き出しました」と出る
 *
 * `indexedDB.open` を失敗させて、3 つとも留める。
 * (これまで「fake-indexeddb では失敗させられない」と書いて諦めていた経路である ——
 *  差し替えれば届く。)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { inspectStoredProxyConfig, setProxyConfig } from '../network/proxy';
import { loadFolderHandle } from '../fs/fsa';
import { mirrorToFolder } from '../fs/folderMirror';

const realIndexedDb = globalThis.indexedDB;

/** `indexedDB.open` が必ず失敗する端末 (プライベートモード等)。 */
function breakIndexedDb(name = 'InvalidStateError'): void {
  const err = new Error('store unavailable');
  err.name = name;
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req: Record<string, unknown> = { error: err };
      setTimeout(() => {
        (req.onerror as (() => void) | undefined)?.();
      }, 0);
      return req;
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', realIndexedDb);
  // fsa は showDirectoryPicker が無いと「非対応」で早期 return する。
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: () => Promise.reject(new Error('not used')),
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('プロキシ設定 — 読めないことを「未設定」と言わない', () => {
  it('★ 保管先が開けなければ unreadable が付く (config は null のまま)', async () => {
    breakIndexedDb();
    const r = await inspectStoredProxyConfig();
    expect(r.config).toBeNull();
    expect(r.rejected).toBeNull();
    expect(r.unreadable).toBeInstanceOf(Error);
    expect((r.unreadable as Error).name).toBe('InvalidStateError');
  });

  it('対照: 読める端末では unreadable は付かない (未設定と設定済みの両方)', async () => {
    const empty = await inspectStoredProxyConfig();
    expect(empty.unreadable).toBeNull();
    expect(empty.config).toBeNull(); // 本当に未設定

    await setProxyConfig({ url: 'https://proxy.example.com/' });
    const set = await inspectStoredProxyConfig();
    expect(set.unreadable).toBeNull();
    expect(set.config?.url).toContain('proxy.example.com');
    await setProxyConfig(null);
  });
});

describe('フォルダ handle — 読めないことを「未設定」と言わない', () => {
  it('★ 保管先が開けなければ投げる (null で「未選択」に化けない)', async () => {
    breakIndexedDb('QuotaExceededError');
    await expect(loadFolderHandle()).rejects.toThrow();
  });

  it('対照: 読める端末で選んでいなければ null (これは本当に未選択)', async () => {
    await expect(loadFolderHandle()).resolves.toBeNull();
  });

  it('★ 書き出しの写しは、読めない端末を off ではなく failed と呼ぶ', async () => {
    // `folderMirror` は最初からこの区別を持っていた。差を消していたのは 1 つ下の層。
    breakIndexedDb();
    const write = vi.fn<(h: FileSystemDirectoryHandle, f: string, b: Blob) => Promise<void>>(
      async () => undefined,
    );
    const outcome = await mirrorToFolder({ load: loadFolderHandle, write }, 'a.svg', new Blob(['x']));
    expect(outcome).toBe('failed');
    expect(write).not.toHaveBeenCalled();
  });

  it('対照: 読める端末で未選択なら off (警告を出さない側で正しい)', async () => {
    const write = vi.fn<(h: FileSystemDirectoryHandle, f: string, b: Blob) => Promise<void>>(
      async () => undefined,
    );
    const outcome = await mirrorToFolder({ load: loadFolderHandle, write }, 'a.svg', new Blob(['x']));
    expect(outcome).toBe('off');
  });
});
