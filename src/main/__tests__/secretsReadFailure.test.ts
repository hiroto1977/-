import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../secrets';

/**
 * **読めなかった理由を、断りの文がそのまま運ぶ** (2026-10-28 · パス 550 · threat: T-061 の続き)。
 *
 * `readStore` は本体も控えも読めないとき `{}` を返しつつ `lastReadDegraded` に理由を置き、
 * `readStoredToken` / `listConfiguredServices` がそれを断りの文に載せる。変異検査 (run #214) で
 * その理由の組み立て (`code ?? 'unknown'`・`読み取りに失敗 (${code})`・`console.error`) が
 * 生き残った —— 既存の検査は「断ったこと」(reason) だけを見て、**何を理由に断ったか**を見て
 * いなかった。理由が消えると、利用者は「読めなかった」とだけ言われて直す手 (権限・ディレクトリ・
 * ディスク) を選べない。
 */
let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptStringAsync: async (b: Buffer) => ({ shouldReEncrypt: false, result: b.toString('utf8').replace(/^enc:/, '') }),
  },
}));
vi.mock('../oauth', () => ({ OAUTH_CONFIGS: {}, refresh: async () => ({}) }));

// 読みの失敗を注入する継ぎ目: `failure` が置かれている間だけ `readFileWithBackup` が投げる。
const failure: { error: Error | null } = { error: null };
vi.mock('../atomicWrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../atomicWrite')>();
  return {
    ...actual,
    readFileWithBackup: async (...args: Parameters<typeof actual.readFileWithBackup>) => {
      if (failure.error) throw failure.error;
      return actual.readFileWithBackup(...args);
    },
  };
});

let currentSecretsModule: Promise<typeof import('../secrets')> | null = null;
const secretsModule = (): Promise<typeof import('../secrets')> =>
  (currentSecretsModule ??= rereadModule<typeof import('../secrets')>(import.meta.url, '../secrets'));

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-read-fail-'));
  currentSecretsModule = null;
  failure.error = null;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('secrets — 読めなかった理由は断りの文に載る (threat: T-061)', () => {
  it('★ OS の誤りの code (EACCES) が、読みの断り・一覧の断り・ログの 3 つに載る', async () => {
    const m = await secretsModule();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    failure.error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const read = await m.readStoredToken('github');
    expect(read.ok).toBe(false);
    expect(read).toMatchObject({ reason: 'store-unreadable', message: '保管ファイルを読めませんでした (読み取りに失敗 (EACCES))。' });
    await expect(m.listConfiguredServices()).rejects.toThrow(/読み取りに失敗 \(EACCES\)/);
    const line = logged.mock.calls.map((c) => String(c[0])).find((l) => l.includes('[secrets]'));
    expect(line).toContain(m.secretsPath());
    expect(line).toContain('(EACCES)');
    expect(line).toContain('could not be read');
  });

  it('★ code を持たない誤りは `unknown` と名乗る (空欄にしない)', async () => {
    const m = await secretsModule();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failure.error = new Error('boom without code');
    const read = await m.readStoredToken('github');
    expect(read).toMatchObject({ ok: false, reason: 'store-unreadable', message: '保管ファイルを読めませんでした (読み取りに失敗 (unknown))。' });
  });

  it('★ 読み直したモジュール直下の文 (ERASING_MESSAGE) は字面で主張する (読み直す検査は直下の値を全部覆う)', async () => {
    // この検査は secrets.ts を読み直すので、その直下の定数の変異体は**この検査だけ**で走る
    // (`rereadModule.ts` の docblock)。`eraseVsSecretsWrite.test.ts` の同じ主張は読み込み時点の値を
    // 見るので変異体に届かず、run #215 で `ERASING_MESSAGE = ""` が唯一の生存だった。
    const m = await secretsModule();
    expect(m.ERASING_MESSAGE).toBe('データの削除中のため、資格情報を書き込めません。');
  });

  it('対照: 読めるようになれば、断りは消えて普通に読める', async () => {
    const m = await secretsModule();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await m.setToken('github', 'ghp_x');
    failure.error = Object.assign(new Error('eio'), { code: 'EIO' });
    expect((await m.readStoredToken('github')).ok).toBe(false);
    failure.error = null;
    expect(await m.readStoredToken('github')).toEqual({ ok: true, token: 'ghp_x' });
  });
});
