/** @vitest-environment jsdom */
/**
 * **ブラウザ版の書き出しは、どこに収まったかを結果に載せる。**
 *
 * 2026-09-06 まで `web-shim.ts` の `saveToLibrary` は
 * 「ライブラリへ put → 失敗は `catch {}`」「フォルダは許可が `granted` のときだけ試す」
 * で、**呼び出し側には何も返していなかった**。ここは invoke の経路で
 * `libraryCopy` / `folderCopy` が実際に載ることを測る (関数単体は
 * `fs/__tests__/folderMirror.test.ts`、画面は `pages/__tests__/exportWarningVisible.test.ts`)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** テストごとに差し替える保存先の振る舞い。 */
const state = {
  putThrows: false,
  handle: null as null | { handle: FileSystemDirectoryHandle; permission: 'granted' | 'prompt' | 'denied' | 'unknown' },
  writeThrows: false,
  writes: [] as string[],
};

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => null,
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({
    put: async () => {
      if (state.putThrows) throw new Error('QuotaExceededError');
    },
    list: async () => [],
  }),
}));
vi.mock('../fs/fsa', () => ({
  isFsaSupported: () => true,
  loadFolderHandle: async () => state.handle,
  writeBlobToFolder: async (_h: FileSystemDirectoryHandle, filename: string) => {
    if (state.writeThrows) throw new Error('NotFoundError');
    state.writes.push(filename);
  },
  pickFolder: async () => null,
  ensurePermission: async () => 'granted',
  clearFolderHandle: async () => {},
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; data?: Record<string, unknown>; message?: string };
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

/** テンプレートの書き出しを 1 回。カタログの先頭 id を使う。 */
async function exportTemplate(): Promise<Record<string, unknown>> {
  const hub = await loadHub();
  const { TEMPLATE_CATALOG_FOR_WEB } = await import('../web-templates');
  const r = await hub.invoke('templates', 'export-template', {
    templateId: TEMPLATE_CATALOG_FOR_WEB[0]!.id,
    params: {},
  });
  expect(r.ok, r.message).toBe(true);
  return r.data!;
}

const FAKE_HANDLE = { name: 'exports' } as unknown as FileSystemDirectoryHandle;

beforeEach(() => {
  state.putThrows = false;
  state.handle = null;
  state.writeThrows = false;
  state.writes.length = 0;
  // jsdom は createObjectURL を持たないので、ダウンロード経路を通す最小の実装を置く
  // (これが無いと `downloaded: false` になり、測りたい欄と混ざる)。
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:x';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('web-shim: 書き出しの収まった先', () => {
  it('フォルダ未設定なら libraryCopy=saved / folderCopy=off', async () => {
    const data = await exportTemplate();
    expect(data.libraryCopy).toBe('saved');
    expect(data.folderCopy).toBe('off');
    expect(data.downloaded).toBe(true);
  });

  it('★ ライブラリへの put が投げたら libraryCopy=failed (書き出し自体は成功のまま)', async () => {
    state.putThrows = true;
    const data = await exportTemplate();
    expect(data.libraryCopy).toBe('failed');
    expect(data.path).toMatch(/\.svg$/);
  });

  it('★ 許可が prompt に戻っていたら folderCopy=permission で、書き込みは試さない', async () => {
    state.handle = { handle: FAKE_HANDLE, permission: 'prompt' };
    const data = await exportTemplate();
    expect(data.folderCopy).toBe('permission');
    expect(state.writes).toEqual([]);
  });

  it('許可があればフォルダへ書いて folderCopy=saved', async () => {
    state.handle = { handle: FAKE_HANDLE, permission: 'granted' };
    const data = await exportTemplate();
    expect(data.folderCopy).toBe('saved');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toBe(data.path);
  });

  it('★ 許可の状態が分からない (unknown) 環境でも書きに行く', async () => {
    state.handle = { handle: FAKE_HANDLE, permission: 'unknown' };
    const data = await exportTemplate();
    expect(data.folderCopy).toBe('saved');
    expect(state.writes).toHaveLength(1);
  });

  it('フォルダへの書き込みが投げたら folderCopy=failed', async () => {
    state.handle = { handle: FAKE_HANDLE, permission: 'granted' };
    state.writeThrows = true;
    const data = await exportTemplate();
    expect(data.folderCopy).toBe('failed');
  });

  it('★ 両方が失敗しても action は成功を返す (端末へのダウンロードは走っている)', async () => {
    state.putThrows = true;
    state.handle = { handle: FAKE_HANDLE, permission: 'granted' };
    state.writeThrows = true;
    const data = await exportTemplate();
    expect(data.libraryCopy).toBe('failed');
    expect(data.folderCopy).toBe('failed');
    expect(data.downloaded).toBe(true);
  });
});
