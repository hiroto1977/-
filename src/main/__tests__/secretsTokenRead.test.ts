import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * 「保存されていない」と「保存されているが読めない」の区別 (2026-08 監査)。
 *
 * 監査前は `decode` がキーチェーン不在で `null` を返し、呼び出し側は未設定と
 * 解釈して画面に「トークン未設定」と出していた。利用者がその案内どおり貼り直すと
 * `encode` は `plain:` (base64 の難読化のみ) で保存する — 暗号化されていた資格情報が
 * 誤った案内のせいで平文相当へ格下げされる。さらに `decryptString` は壊れた値で
 * throw し、その呼び出しが IPC ハンドラの try の外にあったため UI が止まっていた。
 *
 * secrets.ts は Electron ランタイムを要するので `electron` をモックする。
 */
let encryptionAvailable = true;
let decryptThrows = false;
let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptString: (b: Buffer) => {
      if (decryptThrows) throw new Error('Error while decrypting the ciphertext provided to safeStorage');
      return b.toString('utf8').replace(/^enc:/, '');
    },
  },
}));

const FILE_NAME = 'service-hub-secrets.json';

/** OS キーチェーンで暗号化された値の保存形 (base64 of `enc:<token>`)。 */
function encrypted(token: string): string {
  return Buffer.from(`enc:${token}`, 'utf8').toString('base64');
}
function plain(token: string): string {
  return `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
}
async function writeRawStore(store: Record<string, string>): Promise<void> {
  await fs.writeFile(path.join(userDataDir, FILE_NAME), JSON.stringify(store), 'utf8');
}

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-token-read-'));
  encryptionAvailable = true;
  decryptThrows = false;
  vi.resetModules();
});
afterEach(async () => {
  await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('readStoredToken', () => {
  it('キーチェーンがあれば復号して返す', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    expect(await readStoredToken('github')).toEqual({ ok: true, token: 'ghp_x' });
  });

  it('保存されていなければ absent', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({});
    expect(await readStoredToken('github')).toEqual({ ok: false, reason: 'absent' });
  });

  it('キーチェーンが無い時、暗号化済みの値は undecryptable (absent ではない)', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    encryptionAvailable = false;
    const r = await readStoredToken('github');
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== 'undecryptable') throw new Error(`unreachable: ${JSON.stringify(r)}`);
    expect(r.message).toContain('OS キーチェーン');
    // 貼り直すと格下げになることを案内に含める (これが元の事故の入口だった)。
    expect(r.message).toContain('暗号化されない形');
  });

  it('キーチェーンが無くても plain: の値は読める', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({ github: plain('ghp_x') });
    encryptionAvailable = false;
    expect(await readStoredToken('github')).toEqual({ ok: true, token: 'ghp_x' });
  });

  it('復号が throw しても投げ返さず undecryptable として返す', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    decryptThrows = true;
    const r = await readStoredToken('github');
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== 'undecryptable') throw new Error(`unreachable: ${JSON.stringify(r)}`);
    expect(r.message).toContain('壊れている');
  });

  it('プロトタイプ由来のキーを保存値として読まない', async () => {
    const { readStoredToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    for (const key of ['__proto__', 'constructor', 'toString']) {
      expect(await readStoredToken(key), key).toEqual({ ok: false, reason: 'absent' });
    }
  });
});

describe('getToken (薄い読み口)', () => {
  it('読めた時は文字列、読めない時は null', async () => {
    const { getToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    expect(await getToken('github')).toBe('ghp_x');
    encryptionAvailable = false;
    expect(await getToken('github')).toBeNull();
    expect(await getToken('slack')).toBeNull();
  });
});

describe('getValidToken', () => {
  it('生トークンはそのまま返す', async () => {
    const { getValidToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    expect(await getValidToken('github')).toEqual({ ok: true, token: 'ghp_x' });
  });

  it('OAuth の TokenSet は accessToken を返す', async () => {
    const { getValidToken } = await import('../secrets');
    const tokens = { accessToken: 'ya29.a', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 };
    await writeRawStore({ drive: encrypted(JSON.stringify(tokens)) });
    expect(await getValidToken('drive')).toEqual({ ok: true, token: 'ya29.a' });
  });

  it('TokenSet でない JSON は生文字列として返す', async () => {
    const { getValidToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('{"unrelated":1}') });
    expect(await getValidToken('github')).toEqual({ ok: true, token: '{"unrelated":1}' });
  });

  it('未設定は absent を伝える (「読めない」と混同しない)', async () => {
    const { getValidToken } = await import('../secrets');
    await writeRawStore({});
    expect(await getValidToken('github')).toEqual({ ok: false, reason: 'absent' });
  });

  it('保存済みだが読めない場合は undecryptable を伝える', async () => {
    const { getValidToken } = await import('../secrets');
    await writeRawStore({ github: encrypted('ghp_x') });
    encryptionAvailable = false;
    const r = await getValidToken('github');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('undecryptable');
    expect(r.reason === 'undecryptable' ? r.message : '').toContain('OS キーチェーン');
  });
});
