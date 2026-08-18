/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  ensurePermission,
  isFsaSupported,
  pickFolder,
  writeBlobToFolder,
} from '../fsa';

interface MockWritable {
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

interface MockFileHandle {
  createWritable: () => Promise<MockWritable>;
}

interface MockDirHandle {
  getFileHandle: ReturnType<typeof vi.fn>;
  queryPermission?: ReturnType<typeof vi.fn>;
  requestPermission?: ReturnType<typeof vi.fn>;
}

function makeMockHandle(opts: { initialPermission?: 'granted' | 'prompt' | 'denied' } = {}): MockDirHandle {
  const writable: MockWritable = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const fileHandle: MockFileHandle = {
    createWritable: vi.fn().mockResolvedValue(writable),
  };
  const initial = opts.initialPermission ?? 'granted';
  return {
    getFileHandle: vi.fn().mockResolvedValue(fileHandle),
    queryPermission: vi.fn().mockResolvedValue(initial),
    requestPermission: vi.fn().mockResolvedValue('granted'),
  };
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
});

describe('isFsaSupported', () => {
  it('returns false when window.showDirectoryPicker is missing', () => {
    expect(isFsaSupported()).toBe(false);
  });

  it('returns true when window.showDirectoryPicker is a function', () => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = vi.fn();
    expect(isFsaSupported()).toBe(true);
  });
});

describe('pickFolder — feature detection + cancel paths', () => {
  it('returns null on non-supporting browsers', async () => {
    expect(await pickFolder()).toBeNull();
  });

  it('returns null if user cancels the picker', async () => {
    (window as unknown as Record<string, unknown>).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await pickFolder()).toBeNull();
  });
  // NOTE: The IDB-persistence happy path is covered end-to-end via the
  // standalone HTML smoke test in the build pipeline. fake-indexeddb in
  // node cannot structured-clone the vitest-mocked DirectoryHandle (it
  // contains non-cloneable function refs), so we keep happy-path coverage
  // out of unit tests.
});

describe('ensurePermission', () => {
  it('returns granted immediately when already granted', async () => {
    const handle = makeMockHandle({ initialPermission: 'granted' });
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('granted');
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission when status is prompt', async () => {
    const handle = makeMockHandle({ initialPermission: 'prompt' });
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('granted');
    expect(handle.requestPermission).toHaveBeenCalled();
  });

  it('returns denied when requestPermission yields denied', async () => {
    const handle = makeMockHandle({ initialPermission: 'prompt' });
    handle.requestPermission = vi.fn().mockResolvedValue('denied');
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });

  it('returns denied when no permission APIs exist (very old browsers)', async () => {
    const handle: MockDirHandle = { getFileHandle: vi.fn() };
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });

  it('returns denied when only queryPermission exists (prompt) but no requestPermission', async () => {
    const handle: MockDirHandle = {
      getFileHandle: vi.fn(),
      queryPermission: vi.fn().mockResolvedValue('prompt'),
    };
    const result = await ensurePermission(handle as unknown as FileSystemDirectoryHandle);
    expect(result).toBe('denied');
  });
});

describe('writeBlobToFolder', () => {
  it('writes the blob via createWritable + close', async () => {
    const handle = makeMockHandle();
    await writeBlobToFolder(
      handle as unknown as FileSystemDirectoryHandle,
      'output.svg',
      new Blob(['<svg/>'], { type: 'image/svg+xml' }),
    );
    expect(handle.getFileHandle).toHaveBeenCalledWith('output.svg', { create: true });
  });

  it('rejects empty filename', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, '', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with forward slash', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a/b.svg', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with backslash', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a\\b.svg', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects filename with null byte', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'a\0b', new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects oversize filename (> 256 chars)', async () => {
    const handle = makeMockHandle();
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'x'.repeat(257), new Blob(['x'])),
    ).rejects.toThrow(/filename/);
  });

  it('rejects when permission is denied', async () => {
    const handle = makeMockHandle({ initialPermission: 'denied' });
    handle.requestPermission = vi.fn().mockResolvedValue('denied');
    await expect(
      writeBlobToFolder(handle as unknown as FileSystemDirectoryHandle, 'x.svg', new Blob(['x'])),
    ).rejects.toThrow(/権限/);
  });
});

// ===== IndexedDB への handle 永続化 (2026-08 変異検査) ====================
//
// `fsa.ts` は 128 行 (全 145 行) を `Stryker disable` しており、外して実測すると
// **119 変異体・49.58%・生存 12 / 未到達 48**。未到達の大半が **handle の永続化**
// (`saveFolderHandle` / `loadFolderHandle` / `clearFolderHandle`) だった。
//
// 除外の理由はコメントに書いてあった —「fake-indexeddb が vitest の関数モックを
// structured-clone できないため」。**これは回避できる**: handle として関数を
// 持たない素のオブジェクトを使えば clone できる。`queryPermission` は任意
// メソッドなので、無ければ permission は 'unknown' になる契約である。
//
// この経路は「**次にどのフォルダへ書き込むか**」を決める。永続化した handle が
// 読み戻せなければ、利用者が選んだ場所とは違う場所に書きかねない。
import 'fake-indexeddb/auto';
import { clearFolderHandle, loadFolderHandle } from '../fsa';

function clearPrefsDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-preferences');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/** structured-clone できる handle 代用品 (関数を持たない)。 */
function plainHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

describe('フォルダ handle の永続化', () => {
  beforeEach(async () => {
    await clearPrefsDb();
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker =
      () => Promise.resolve(plainHandle('picked'));
  });

  afterEach(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('保存していなければ null', async () => {
    expect(await loadFolderHandle()).toBeNull();
  });

  /** picker を差し替えて pickFolder 経由で保存する (保存は pickFolder の中で起きる)。 */
  async function pickAndSave(name: string): Promise<void> {
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker =
      () => Promise.resolve(plainHandle(name));
    await pickFolder();
  }

  it('選んだ handle を読み戻せる', async () => {
    await pickAndSave('my-folder');
    const loaded = await loadFolderHandle();
    expect(loaded?.handle.name).toBe('my-folder');
  });

  it('queryPermission を持たない handle は permission unknown', async () => {
    await pickAndSave('my-folder');
    expect((await loadFolderHandle())?.permission).toBe('unknown');
  });

  it('選び直すと新しい handle になる', async () => {
    await pickAndSave('first');
    await pickAndSave('second');
    expect((await loadFolderHandle())?.handle.name).toBe('second');
  });

  it('clearFolderHandle で消える (連携解除)', async () => {
    await pickAndSave('my-folder');
    await clearFolderHandle();
    expect(await loadFolderHandle()).toBeNull();
  });

  it('保存していない状態で clearFolderHandle を呼んでも壊れない', async () => {
    await expect(clearFolderHandle()).resolves.toBeUndefined();
  });

  // 実ブラウザでは FileSystemDirectoryHandle はメソッドごと structured-clone
  // されるが、fake-indexeddb は再現できない。読み出し経路だけ差し替えて
  // 「queryPermission を持つ handle が返る」状況を作る。
  // ここは再読み込み後に**再度許可を求めるかどうか**を決める分岐なので、
  // 未到達のままにしない。
  function stubRead(result: unknown): () => void {
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = (() => {
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        const db = {
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const r: Record<string, unknown> = { result };
                queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
                return r;
              },
            }),
          }),
          close: () => undefined,
        };
        req.result = db;
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req;
    }) as unknown as typeof indexedDB.open;
    return () => { indexedDB.open = original; };
  }

  it('queryPermission が granted を返せばそのまま granted', async () => {
    const restore = stubRead({
      kind: 'directory',
      name: 'stored',
      queryPermission: () => Promise.resolve('granted'),
    });
    try {
      expect((await loadFolderHandle())?.permission).toBe('granted');
    } finally { restore(); }
  });

  it('queryPermission が prompt を返せば prompt', async () => {
    const restore = stubRead({
      kind: 'directory',
      name: 'stored',
      queryPermission: () => Promise.resolve('prompt'),
    });
    try {
      expect((await loadFolderHandle())?.permission).toBe('prompt');
    } finally { restore(); }
  });

  it('queryPermission が投げたら unknown に落とす (例外にしない)', async () => {
    const restore = stubRead({
      kind: 'directory',
      name: 'stored',
      queryPermission: () => Promise.reject(new Error('boom')),
    });
    try {
      expect((await loadFolderHandle())?.permission).toBe('unknown');
    } finally { restore(); }
  });

  it('非対応環境では読み込まない (null)', async () => {
    await pickAndSave('my-folder');
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    expect(await loadFolderHandle()).toBeNull();
  });
});

// ===== ファイル名の境界 =================================================
//
// `isSafeFilename` は「選んだフォルダの外へ書かせない」ための門。
// 長さの上限 (256) がちょうどで通ることを固定していなかった。

describe('ファイル名の境界', () => {
  function handleFor(): MockDirHandle {
    return makeMockHandle({ initialPermission: 'granted' });
  }

  it('256 文字ちょうどは通す (上限)', async () => {
    const h = handleFor();
    await expect(
      writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, 'a'.repeat(256), new Blob(['x'])),
    ).resolves.toBeUndefined();
  });

  it('257 文字は断る (上限の外)', async () => {
    const h = handleFor();
    await expect(
      writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, 'a'.repeat(257), new Blob(['x'])),
    ).rejects.toThrow('filename が不正です');
  });

  it('1 文字は通す (下限)', async () => {
    const h = handleFor();
    await expect(
      writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, 'a', new Blob(['x'])),
    ).resolves.toBeUndefined();
  });
});

// ===== 権限は readwrite で問い合わせる ===================================
//
// `{ mode: 'readwrite' }` が落ちると読み取り権限の判定になり、書き込めない
// 相手を「許可済み」と見なす。問い合わせに渡している引数を直接見る。

describe('権限の問い合わせ方', () => {
  it('queryPermission に readwrite を渡す', async () => {
    const h = makeMockHandle({ initialPermission: 'granted' });
    await ensurePermission(h as unknown as FileSystemDirectoryHandle);
    expect(h.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('requestPermission にも readwrite を渡す', async () => {
    const h = makeMockHandle({ initialPermission: 'prompt' });
    await ensurePermission(h as unknown as FileSystemDirectoryHandle);
    expect(h.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('フォルダ選択も readwrite で要求する', async () => {
    const picker = vi.fn().mockResolvedValue(plainHandle('picked'));
    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = picker;
    try {
      await pickFolder();
      expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' });
    } finally {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    }
  });
});
