import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// 依存先は先頭で読み込む (検査の中で初めて評価した直下の値を、その検査が覆ったと数えさせない)。
import { ERASING_MESSAGE, endErase, secretsPath, setToken } from '../secrets';
import { eraseDesktopData } from '../eraseAll';

let userDataDir = '';
vi.mock('electron', () => ({
  app: {
    getPath: (n: string) => (n === 'userData' ? userDataDir : path.join(userDataDir, `WRONG-${n}`)),
  },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptStringAsync: async (b: Buffer) => ({ shouldReEncrypt: false, result: b.toString('utf8').replace(/^enc:/, '') }),
  },
  session: { defaultSession: { clearStorageData: async () => undefined } },
}));
vi.mock('../oauth', () => ({ OAUTH_CONFIGS: {}, refresh: async () => ({}) }));

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-erase-race-'));
  endErase();
});

const exists = async (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false,
  );

/**
 * 「すべてのデータを削除」は、進行中の資格情報の保存が済んだ後に tmp を rename して
 * **消したはずの中身を戻す**ことが在った (2026-10-16 · パス 524 · threat: T-079)。
 * 直す前の実測 (同じ競合を 300 回): 221 回で本体か `.prev` が復活し、報告は
 * `allDeleted: true` のまま再起動した。
 */
describe('消去と資格情報の保存の競合 (threat: T-079)', () => {
  it('★ 消去と同時に走る保存があっても、消去の後にファイルは残らない (threat: T-079)', async () => {
    let wrote = 0;
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      endErase();
      await setToken('github', 'OLD-SECRET-TOKEN');
      const pending = setToken('slack', `new-${i}`).then(
        () => {
          wrote += 1;
        },
        (e: unknown) => {
          if (e instanceof Error && e.message === ERASING_MESSAGE) refused += 1;
          else throw e;
        },
      );
      for (let k = 0; k < i % 5; k++) await new Promise((r) => setImmediate(r));
      const report = await eraseDesktopData({ targets: [secretsPath()], clearRenderer: async () => undefined });
      await pending;
      expect(report.allDeleted).toBe(true);
      expect(await exists(secretsPath()), `${i} 回目: 本体が復活した`).toBe(false);
      expect(await exists(`${secretsPath()}.prev`), `${i} 回目: .prev が復活した`).toBe(false);
    }
    // 対照: 競合の両側が実際に起きている (どちらかが 0 なら、この検査は競合を作れていない)。
    expect(wrote + refused).toBe(40);
  });

  it('★ 消去が済んだ後の保存は断る (再起動までの間に書き戻させない)', async () => {
    await setToken('github', 'OLD');
    const report = await eraseDesktopData({ targets: [secretsPath()], clearRenderer: async () => undefined });
    expect(report.allDeleted).toBe(true);
    // 文面は定数ではなく字面で留める —— 定数を空にする変異は `toThrow(定数)` では映らない (パス 550)。
    await expect(setToken('slack', 'late')).rejects.toThrow(new Error('データの削除中のため、資格情報を書き込めません。'));
    expect(ERASING_MESSAGE).toBe('データの削除中のため、資格情報を書き込めません。');
    expect(await exists(secretsPath())).toBe(false);
  });

  it('★ 対照: 消去が完了しなかったときは保存を再開する (締め出さない)', async () => {
    await setToken('github', 'OLD');
    const report = await eraseDesktopData({
      targets: [secretsPath()],
      clearRenderer: async () => {
        throw new Error('renderer failed');
      },
    });
    expect(report.allDeleted).toBe(false);
    await setToken('slack', 'after-failure');
    expect(await exists(secretsPath())).toBe(true);
  });
});
