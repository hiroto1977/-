import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * getStorageProtection() — the report that makes the keychain-less `plain:`
 * fallback visible in the UI (2026-07 audit follow-up: the risk was only ever
 * logged to stdout, which a GUI user never sees).
 *
 * secrets.ts needs the live Electron runtime, so `electron` is mocked: `app`
 * points userData at a temp dir and `safeStorage` is switched per test.
 */
let encryptionAvailable = true;
let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    // Reversible stand-in for the OS keychain: enough to prove the code path
    // does not take the `plain:` branch.
    encryptString: (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  },
}));

const FILE_NAME = 'service-hub-secrets.json';

async function writeRawStore(store: Record<string, string>): Promise<void> {
  await fs.writeFile(path.join(userDataDir, FILE_NAME), JSON.stringify(store), 'utf8');
}

describe('getStorageProtection', () => {
  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-secrets-'));
    encryptionAvailable = true;
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('reports encrypted with no plain values on a keychain-backed device', async () => {
    const { getStorageProtection } = await import('../secrets');
    await writeRawStore({ github: 'enc:ghp_x', slack: 'enc:xoxb_y' });

    const r = await getStorageProtection();
    expect(r.encrypted).toBe(true);
    expect(r.plainCount).toBe(0);
    expect(r.file).toBe(path.join(userDataDir, FILE_NAME));
  });

  it('reports encrypted:false when the OS keychain is unavailable', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = await import('../secrets');

    const r = await getStorageProtection();
    expect(r.encrypted).toBe(false);
  });

  it('counts only the values still under the plain: obfuscation', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = await import('../secrets');
    await writeRawStore({
      github: `plain:${Buffer.from('ghp_x', 'utf8').toString('base64')}`,
      slack: `plain:${Buffer.from('xoxb_y', 'utf8').toString('base64')}`,
      notion: 'enc:secret_z', // already encrypted → must not be counted
    });

    const r = await getStorageProtection();
    expect(r.plainCount).toBe(2);
  });

  it('returns zero counts when nothing is stored yet', async () => {
    const { getStorageProtection } = await import('../secrets');
    const r = await getStorageProtection();
    expect(r.plainCount).toBe(0);
    expect(r.encrypted).toBe(true);
  });

  it('never returns secret material — only booleans, a count and the path', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = await import('../secrets');
    await writeRawStore({ github: `plain:${Buffer.from('ghp_SUPERSECRET', 'utf8').toString('base64')}` });

    const r = await getStorageProtection();
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain('ghp_SUPERSECRET');
    expect(serialized).not.toContain('SUPERSECRET');
    /*
     * **鍵の一覧を固定するのは、秘密を載せる欄が黙って増えないため。**
     * 増やすときは「その欄に秘密が載りうるか」を人が見ることになる。
     * `mechanism` は 3 値の列挙で、店の中身から作らない (2026-08-23 追加)。
     */
    // `durability` は 3 値の列挙 ('file' | 'persistent' | 'best-effort')。
    // デスクトップ版は定数 'file'、ブラウザ版は `navigator.storage.persisted()` の
    // 戻り値から作るので、**店の中身は一切通らない** (2026-08-25 追加)。
    expect(Object.keys(r).sort()).toEqual([
      'durability',
      'encrypted',
      'file',
      'mechanism',
      'plainCount',
    ]);
  });

  it('mechanism は 3 値の列挙しか返さない (自由文字列を載せない)', async () => {
    const { getStorageProtection } = await import('../secrets');

    encryptionAvailable = true;
    expect((await getStorageProtection()).mechanism).toBe('os-keychain');

    encryptionAvailable = false;
    expect((await getStorageProtection()).mechanism).toBe('obfuscated');
  });
});
