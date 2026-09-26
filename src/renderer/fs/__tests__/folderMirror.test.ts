/**
 * **PC の指定フォルダへ写す判断。**
 *
 * ★ の 2 件が、2026-09-06 まで無かった振る舞いを留めている:
 *
 *   - 許可が `prompt` に戻っているときは `permission` を返す (以前は黙って飛ばし、
 *     呼び出し側にも画面にも何も残らなかった)。
 *   - 許可の状態が分からない (`unknown`) ときは**書きに行く** (以前は飛ばしていた。
 *     `queryPermission` を持たない実装で、書ける環境なのに書かなかった)。
 */
import { describe, expect, it, vi } from 'vitest';
import { REAL_MIRROR, mirrorToFolder, type MirrorDeps } from '../folderMirror';

const HANDLE = { name: 'exports' } as unknown as FileSystemDirectoryHandle;
const BLOB = new Blob(['x']);

function deps(over: Partial<MirrorDeps>): MirrorDeps {
  return {
    load: async () => ({ handle: HANDLE, permission: 'granted' }),
    write: async () => {},
    ...over,
  };
}

describe('mirrorToFolder', () => {
  it('許可があれば書いて saved', async () => {
    const write = vi.fn(async () => {});
    const r = await mirrorToFolder(deps({ write }), 'a.svg', BLOB);
    expect(r).toBe('saved');
    expect(write).toHaveBeenCalledWith(HANDLE, 'a.svg', BLOB);
  });

  it('★ 許可が prompt に戻っていたら permission を返し、書きに行かない', async () => {
    const write = vi.fn(async () => {});
    const r = await mirrorToFolder(
      deps({ load: async () => ({ handle: HANDLE, permission: 'prompt' }), write }),
      'a.svg',
      BLOB,
    );
    expect(r).toBe('permission');
    expect(write).not.toHaveBeenCalled();
  });

  it('許可が denied でも permission (利用者の打ち手は同じ = 取り直す)', async () => {
    const r = await mirrorToFolder(
      deps({ load: async () => ({ handle: HANDLE, permission: 'denied' }) }),
      'a.svg',
      BLOB,
    );
    expect(r).toBe('permission');
  });

  it('★ 許可の状態が分からない (unknown) ときは書きに行く', async () => {
    const write = vi.fn(async () => {});
    const r = await mirrorToFolder(
      deps({ load: async () => ({ handle: HANDLE, permission: 'unknown' }), write }),
      'a.svg',
      BLOB,
    );
    expect(r).toBe('saved');
    expect(write).toHaveBeenCalledOnce();
  });

  it('フォルダ未設定 (handle が無い) は off —— 失敗ではない', async () => {
    const write = vi.fn(async () => {});
    const r = await mirrorToFolder(deps({ load: async () => null, write }), 'a.svg', BLOB);
    expect(r).toBe('off');
    expect(write).not.toHaveBeenCalled();
  });

  it('書き込みが投げたら failed (投げ返さない)', async () => {
    const r = await mirrorToFolder(
      deps({ write: async () => { throw new Error('NotFoundError'); } }),
      'a.svg',
      BLOB,
    );
    expect(r).toBe('failed');
  });

  it('handle の保管先が読めない (load が投げる) なら failed —— off に丸めない', async () => {
    // 「設定していない」と「設定を読めない」は利用者の打ち手が違う。
    const r = await mirrorToFolder(
      deps({ load: async () => { throw new Error('IndexedDB unavailable'); } }),
      'a.svg',
      BLOB,
    );
    expect(r).toBe('failed');
  });

  it('実物の配線は fsa の 2 関数を指している', () => {
    expect(typeof REAL_MIRROR.load).toBe('function');
    expect(typeof REAL_MIRROR.write).toBe('function');
  });
});
