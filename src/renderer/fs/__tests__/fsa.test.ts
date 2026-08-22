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

  /*
   * DB 名 / ストア名 / キー名を**外から**確かめる。
   *
   * 名前が変わること自体が事故である —— 利用者が選んだ書き出し先の記憶は
   * アプリ更新をまたいで残る必要があり、DB 名・ストア名・キー名のどれかが
   * 変われば **前に選んだフォルダを黙って忘れる** (エラーは出ない。次の
   * エクスポートが「まだ選ばれていない」扱いになるだけ)。
   *
   * 往復 (保存 → loadFolderHandle) では捕まらない: 書く側と読む側が同じ定数を
   * 見るので、3 つとも `""` に変えても一致し続ける。だから **生の indexedDB で
   * 名前を直書きして**取りに行く。
   *
   * さらに `vi.resetModules()` + 動的 import が要る。この 3 つはモジュール
   * 定数なので、静的 import のままだとファイル読み込み時に評価が済んでしまい、
   * 変異検査が変異体を有効にする頃には**もう畳み込まれている** (覆われた
   * static 変異体)。実測でここは 3 件生存していて、読み直しを入れて 0 件に
   * なった —— stryker.config.json の注記どおり「定数表の類は構造的に殺せない
   * のではなく、読み直せば殺せる」。
   */
  it('保存先の DB 名 / ストア名 / キー名が変わっていない', async () => {
    vi.resetModules();
    const fresh = (await import('../fsa')) as typeof import('../fsa');

    (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker = () =>
      Promise.resolve(plainHandle('named-folder'));
    await fresh.pickFolder();

    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('business-hub-preferences');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      // DB 名かストア名が変われば、ここで開いたのは別の DB / 別のストアなので
      // 'kv' は無い (DB 名が変わった場合は空の DB が新規作成される)。
      expect([...raw.objectStoreNames]).toContain('kv');

      const value = await new Promise<unknown>((resolve, reject) => {
        const tx = raw.transaction('kv', 'readonly');
        const get = tx.objectStore('kv').get('fsa-directory-handle');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
      // キー名が変われば undefined。
      expect(value).toMatchObject({ name: 'named-folder' });
    } finally {
      raw.close();
    }
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

  /*
   * `..` は封じ込めの中心にある脱出記号。2026-08-22 まで `isSafeFilename` は
   * セパレータしか見ておらず、`..` はここを素通りして `getFileHandle('..')` へ
   * 届いていた。実ブラウザは仕様どおり TypeError にするが、**この mock は
   * 受け取っていた** —— つまり前提が崩れても検査は 1 件も落ちなかった。
   */
  it.each([['.'], ['..']])('%s は断る (フォルダの外を指す)', async (name) => {
    const h = handleFor();
    await expect(
      writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, name, new Blob(['x'])),
    ).rejects.toThrow('filename が不正です');
  });

  it.each([['..foo'], ['foo..'], ['...'], ['.hidden'], ['a.b']])(
    '%s は通す (正当なファイル名を巻き込まない)',
    async (name) => {
      const h = handleFor();
      await expect(
        writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, name, new Blob(['x'])),
      ).resolves.toBeUndefined();
    },
  );

  it('断ったときは権限確認も getFileHandle も一度も呼ばない (最初に止める)', async () => {
    const h = handleFor();
    await expect(
      writeBlobToFolder(h as unknown as FileSystemDirectoryHandle, '..', new Blob(['x'])),
    ).rejects.toThrow('filename が不正です');
    expect(h.getFileHandle).not.toHaveBeenCalled();
    expect(h.queryPermission).not.toHaveBeenCalled();
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
