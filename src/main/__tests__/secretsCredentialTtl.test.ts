import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../secrets';
import { CREDENTIAL_TTL_MS, expiredStoredCredentialMessage } from '../../shared/credentialTtl';

/**
 * **保存した資格情報の有効時間 —— デスクトップ版の保管層** (2026-10-28 · threat: T-213)。
 *
 * 第三者が発行する API キーの期限はアプリから変えられないので、アプリが保管した写しを信用する
 * 時間を短くする。保存した時刻は `at:<ms>:` として平文で付き、読む時と一覧で期限切れを**読まずに
 * 消す**。更新トークンを持つ OAuth の TokenSet は `oauth:` で、認可サーバの期限に従う。
 * この規則より前の記録 (日付が無い) は最初に見た時刻が付く。
 */
let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptStringAsync: async (b: Buffer) => {
      const text = b.toString('utf8');
      // 「復号できない値」の標本: `CORRUPT` と読める物だけ、本物の safeStorage と同じく reject する。
      if (text === 'CORRUPT') throw new Error('decrypt failed');
      return { shouldReEncrypt: false, result: text.replace(/^enc:/, '') };
    },
  },
}));
const CORRUPT_VALUE = Buffer.from('CORRUPT', 'utf8').toString('base64');
const FILE_NAME = 'service-hub-secrets.json';
const encrypted = (token: string): string => Buffer.from(`enc:${token}`, 'utf8').toString('base64');
const readRaw = async (): Promise<Record<string, string>> =>
  JSON.parse(await fs.readFile(path.join(userDataDir, FILE_NAME), 'utf8')) as Record<string, string>;
const writeRaw = (store: Record<string, string>): Promise<void> =>
  fs.writeFile(path.join(userDataDir, FILE_NAME), JSON.stringify(store), 'utf8');

let currentSecretsModule: Promise<typeof import('../secrets')> | null = null;
const secretsModule = (): Promise<typeof import('../secrets')> =>
  (currentSecretsModule ??= rereadModule<typeof import('../secrets')>(import.meta.url, '../secrets'));

const T0 = 1_800_000_000_000;
let now = T0;
beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-cred-ttl-'));
  currentSecretsModule = null;
  now = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('secrets — 保存した資格情報の有効時間 (threat: T-213)', () => {
  it('★ 保存した値は時刻の包み `at:<ms>:` を持ち、有効時間の中は読める', async () => {
    const m = await secretsModule();
    await m.setToken('github', 'ghp_x');
    expect((await readRaw()).github).toBe(`at:${T0}:${encrypted('ghp_x')}`);
    now = T0 + CREDENTIAL_TTL_MS; // 境界ちょうどは生きている
    expect(await m.readStoredToken('github')).toEqual({ ok: true, token: 'ghp_x' });
    expect(await m.listConfiguredServices()).toEqual(['github']);
  });

  it('★ 有効時間を過ぎた鍵は読まずに消し、理由を言う (使い捨て · threat: T-213)', async () => {
    const m = await secretsModule();
    await m.setToken('github', 'ghp_x');
    await m.setToken('slack', 'xoxb-y');
    now = T0 + CREDENTIAL_TTL_MS + 1;
    expect(await m.readStoredToken('github')).toEqual({
      ok: false,
      reason: 'expired',
      message: expiredStoredCredentialMessage('github'),
    });
    // 読んだ瞬間にファイルから消えている。隣の鍵は触らない。
    expect(Object.keys(await readRaw())).toEqual(['slack']);
    expect(await m.getValidToken('github')).toEqual({ ok: false, reason: 'absent' });
  });

  it('★ 一覧は期限切れを出さず、その場で消す', async () => {
    const m = await secretsModule();
    await m.setToken('github', 'ghp_x');
    now = T0 + 60_000;
    await m.setToken('slack', 'xoxb-y');
    now = T0 + CREDENTIAL_TTL_MS + 1; // github だけ期限切れ
    expect(await m.listConfiguredServices()).toEqual(['slack']);
    expect(Object.keys(await readRaw())).toEqual(['slack']);
  });

  it('★ 未来の時刻 (書き換えられた包み) は期限切れ', async () => {
    const m = await secretsModule();
    await writeRaw({ github: `at:${T0 + 24 * 60 * 60 * 1000}:${encrypted('ghp_x')}` });
    expect((await m.readStoredToken('github')).ok).toBe(false);
    expect(await readRaw()).toEqual({});
  });

  it('★ 更新トークンを持つ OAuth の TokenSet は `oauth:` で保存され、有効時間の外 (認可サーバの期限に従う)', async () => {
    const m = await secretsModule();
    await m.setOAuthTokens('github', { accessToken: 'at', refreshToken: 'rt', expiresAt: T0 + 10 * 24 * 60 * 60 * 1000 });
    expect((await readRaw()).github).toMatch(/^oauth:/);
    now = T0 + 30 * 24 * 60 * 60 * 1000;
    expect(await m.getValidToken('github')).toEqual({ ok: true, token: 'at' });
    expect(await m.listConfiguredServices()).toEqual(['github']);
  });

  it('対照: refreshToken の無い TokenSet (貼り付け式) は普通の鍵と同じく有効時間が掛かる', async () => {
    const m = await secretsModule();
    await m.setToken('drive', JSON.stringify({ accessToken: 'ya29.x' }));
    expect((await readRaw()).drive).toMatch(/^at:\d+:/);
    now = T0 + CREDENTIAL_TTL_MS + 1;
    expect((await m.getValidToken('drive')).ok).toBe(false);
  });

  it('★ この規則より前の記録 (日付が無い) は、最初に見た時刻が付き、そこから有効時間が始まる', async () => {
    const m = await secretsModule();
    await writeRaw({ github: encrypted('ghp_old') });
    expect(await m.readStoredToken('github')).toEqual({ ok: true, token: 'ghp_old' });
    expect((await readRaw()).github).toBe(`at:${T0}:${encrypted('ghp_old')}`);
    now = T0 + CREDENTIAL_TTL_MS + 1;
    expect((await m.readStoredToken('github')).ok).toBe(false);
  });

  it('★ 日付の無い OAuth の TokenSet は `oauth:` へ移り、締め出されない', async () => {
    const m = await secretsModule();
    await writeRaw({ github: encrypted(JSON.stringify({ accessToken: 'at', refreshToken: 'rt' })) });
    expect(await m.listConfiguredServices()).toEqual(['github']);
    expect((await readRaw()).github).toMatch(/^oauth:/);
  });

  it('★ 壊れた包み (時刻が数でない) は期限切れとして消す', async () => {
    const m = await secretsModule();
    await writeRaw({ github: `at:yesterday:${encrypted('ghp_x')}`, slack: `at:${encrypted('x')}` });
    expect(await m.listConfiguredServices()).toEqual([]);
  });

  it('対照: plain: の繰り上げ暗号化は包み (時刻) を保つ', async () => {
    const m = await secretsModule();
    const plain = `plain:${Buffer.from('ghp_old', 'utf8').toString('base64')}`;
    await writeRaw({ github: `at:${T0 - 1000}:${plain}` });
    await m.setToken('slack', 'xoxb-y');
    expect((await readRaw()).github).toBe(`at:${T0 - 1000}:${encrypted('ghp_old')}`);
  });

  it('★ 区切りの無い包みは、数字だけで時刻に読めても期限切れ (`at:<数字>` を日付として拾わない)', async () => {
    // `at:` の後に `:` が無い = 壊れた包み。末尾の 1 字を落とすと今の時刻になる数字を置き、
    // 「区切りが無い」の判定を外すと `Number(先頭)` が生きた時刻に読めてしまう形を当てる。
    const m = await secretsModule();
    await writeRaw({ github: `at:${T0}0` });
    const read = await m.readStoredToken('github');
    expect(read.ok).toBe(false);
    expect((read as { reason: string }).reason).toBe('expired');
    expect(await readRaw()).toEqual({});
  });

  it('対照: plain: の繰り上げ暗号化は `oauth:` の包みも保つ (包みの種類を落とさない)', async () => {
    const m = await secretsModule();
    const json = JSON.stringify({ accessToken: 'at', refreshToken: 'rt' });
    const plain = `plain:${Buffer.from(json, 'utf8').toString('base64')}`;
    await writeRaw({ github: `oauth:${plain}` });
    await m.setToken('slack', 'xoxb-y');
    expect((await readRaw()).github).toBe(`oauth:${encrypted(json)}`);
    now = T0 + CREDENTIAL_TTL_MS + 1; // oauth: は有効時間の外のまま (at: の slack は期限切れで消える)
    expect(await m.listConfiguredServices()).toEqual(['github']);
  });

  it('★ 日付のある記録だけの一覧・読みは、保管ファイルを書き直さない (読むだけで更新時刻が動かない)', async () => {
    const m = await secretsModule();
    await m.setToken('github', 'ghp_x');
    await m.setToken('slack', 'xoxb-y');
    const file = path.join(userDataDir, FILE_NAME);
    const before = await fs.readFile(file, 'utf8');
    const mtime = (await fs.stat(file)).mtimeMs;
    now = T0 + 1000;
    expect((await m.listConfiguredServices()).sort()).toEqual(['github', 'slack']);
    expect(await m.readStoredToken('github')).toEqual({ ok: true, token: 'ghp_x' });
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect((await fs.stat(file)).mtimeMs).toBe(mtime);
  });

  it('★ 2 つの一覧が重なっても、日付の無い記録は 1 重に包まれ、読める (包みの上に包まない)', async () => {
    const m = await secretsModule();
    await writeRaw({ github: encrypted('ghp_old') });
    const [a, b] = await Promise.all([m.listConfiguredServices(), m.listConfiguredServices()]);
    expect(a).toEqual(['github']);
    expect(b).toEqual(['github']);
    expect((await readRaw()).github).toBe(`at:${T0}:${encrypted('ghp_old')}`);
    expect(await m.readStoredToken('github')).toEqual({ ok: true, token: 'ghp_old' });
  });

  it('★ 期限切れを消した同じ一覧で、日付の無い記録には時刻が付く (消した鍵は飛ばして続ける)', async () => {
    const m = await secretsModule();
    await writeRaw({ old: `at:${T0 - CREDENTIAL_TTL_MS - 1}:${encrypted('x')}`, github: encrypted('ghp_old') });
    expect(await m.listConfiguredServices()).toEqual(['github']);
    const raw = await readRaw();
    expect(raw).not.toHaveProperty('old');
    expect(raw.github).toBe(`at:${T0}:${encrypted('ghp_old')}`);
  });

  it('★ 日付の無い記録のうち、読めない物 (壊れた値) には時刻を付けず、ファイルも書き直さない', async () => {
    const m = await secretsModule();
    await m.setToken('slack', 'xoxb-y');
    const file = path.join(userDataDir, FILE_NAME);
    const stored = await readRaw();
    await writeRaw({ ...stored, github: CORRUPT_VALUE });
    const before = await fs.readFile(file, 'utf8');
    const mtime = (await fs.stat(file)).mtimeMs;
    now = T0 + 1000;
    expect((await m.listConfiguredServices()).sort()).toEqual(['github', 'slack']);
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect((await fs.stat(file)).mtimeMs).toBe(mtime);
  });

  it('対照: 保管ファイルが読めない状態では、期限切れでも消しに行かない (読めないものの上に書かない)', async () => {
    const m = await secretsModule();
    await writeRaw({ github: `at:${T0 - CREDENTIAL_TTL_MS - 1}:${encrypted('ghp_x')}` });
    await fs.writeFile(path.join(userDataDir, FILE_NAME), 'x'.repeat(2 * 1024 * 1024), 'utf8');
    const read = await m.readStoredToken('github');
    expect(read.ok).toBe(false);
    expect((read as { reason: string }).reason).toBe('store-unreadable');
  });
});
