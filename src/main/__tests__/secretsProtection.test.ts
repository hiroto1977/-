import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as secretsModule from '../secrets';

/*
 * getStorageProtection() — the report that makes the keychain-less `plain:`
 * fallback visible in the UI (2026-07 audit follow-up: the risk was only ever
 * logged to stdout, which a GUI user never sees).
 *
 * secrets.ts needs the live Electron runtime, so `electron` is mocked: `app`
 * points userData at a temp dir and `safeStorage` is switched per test.
 */
let encryptionAvailable = true;
let backend = 'gnome_libsecret';
let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    getSelectedStorageBackend: () => backend,
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
    backend = 'gnome_libsecret';
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('reports encrypted with no plain values on a keychain-backed device', async () => {
    const { getStorageProtection } = secretsModule;
    await writeRawStore({ github: 'enc:ghp_x', slack: 'enc:xoxb_y' });

    const r = await getStorageProtection();
    expect(r.encrypted).toBe(true);
    expect(r.plainCount).toBe(0);
    expect(r.file).toBe(path.join(userDataDir, FILE_NAME));
  });

  it('reports encrypted:false when the OS keychain is unavailable', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = secretsModule;

    const r = await getStorageProtection();
    expect(r.encrypted).toBe(false);
  });

  it('counts only the values still under the plain: obfuscation', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = secretsModule;
    await writeRawStore({
      github: `plain:${Buffer.from('ghp_x', 'utf8').toString('base64')}`,
      slack: `plain:${Buffer.from('xoxb_y', 'utf8').toString('base64')}`,
      notion: 'enc:secret_z', // already encrypted → must not be counted
    });

    const r = await getStorageProtection();
    expect(r.plainCount).toBe(2);
  });

  it('returns zero counts when nothing is stored yet', async () => {
    const { getStorageProtection } = secretsModule;
    const r = await getStorageProtection();
    expect(r.plainCount).toBe(0);
    expect(r.encrypted).toBe(true);
  });

  it('never returns secret material — only booleans, a count and the path', async () => {
    encryptionAvailable = false;
    const { getStorageProtection } = secretsModule;
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

  /*
   * `durability` は**値まで**留める。上の検査は鍵が在ることを見ているが、
   * 空文字に潰れても鳴らなかった (変異検査で 1 件生存、2026-08-30 実測)。
   * 画面の「保存の持続性」欄がこれを読むので、空なら表示が消える。
   */
  it("★ durability は 'file' (この保管は実ファイル)", async () => {
    const { getStorageProtection } = secretsModule;
    expect((await getStorageProtection()).durability).toBe('file');
  });

  it('mechanism は 3 値の列挙しか返さない (自由文字列を載せない)', async () => {
    const { getStorageProtection } = secretsModule;

    encryptionAvailable = true;
    expect((await getStorageProtection()).mechanism).toBe('os-keychain');

    encryptionAvailable = false;
    expect((await getStorageProtection()).mechanism).toBe('obfuscated');
  });
});

/*
 * threat: T-041 (パス 520)。gnome-keyring も kwallet も無い Linux で Chromium は `basic_text`
 * (ハードコードされた鍵) へ倒れ、`isEncryptionAvailable()` は true のまま。2026-10-14 まで
 * この報告はそれを `os-keychain` と名乗り、書く側も basic_text で包んで ⚠ を出さなかった。
 */
describe('Linux の basic_text を os-keychain と名乗らない (threat: T-041)', () => {
  const realPlatform = process.platform;
  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-secrets-'));
    encryptionAvailable = true;
    backend = 'basic_text';
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });
  afterEach(async () => {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('★ basic_text では encrypted: false / mechanism: obfuscated (threat: T-041)', async () => {
    const { getStorageProtection } = secretsModule;
    const r = await getStorageProtection();
    expect(r.encrypted).toBe(false);
    expect(r.mechanism).toBe('obfuscated');
  });

  it('★ basic_text では setToken が plain: で書き、plainCount に数えられる (threat: T-041)', async () => {
    const { setToken, getStorageProtection } = secretsModule;
    await setToken('github', 'ghp_' + 'a'.repeat(36));
    const raw = JSON.parse(await fs.readFile(path.join(userDataDir, FILE_NAME), 'utf8')) as Record<string, string>;
    expect(raw.github).toMatch(/^plain:/);
    expect((await getStorageProtection()).plainCount).toBe(1);
  });

  it('★ basic_text へは plain: の値を「昇格」させない (threat: T-041)', async () => {
    const { setToken } = secretsModule;
    await writeRawStore({ slack: 'plain:' + Buffer.from('xoxb_y', 'utf8').toString('base64') });
    await setToken('github', 'ghp_' + 'a'.repeat(36));
    const raw = JSON.parse(await fs.readFile(path.join(userDataDir, FILE_NAME), 'utf8')) as Record<string, string>;
    expect(raw.slack).toMatch(/^plain:/);
  });

  it('対照: gnome_libsecret なら封緘し os-keychain を名乗る', async () => {
    backend = 'gnome_libsecret';
    const { setToken, getStorageProtection } = secretsModule;
    await setToken('github', 'ghp_' + 'a'.repeat(36));
    const raw = JSON.parse(await fs.readFile(path.join(userDataDir, FILE_NAME), 'utf8')) as Record<string, string>;
    expect(raw.github).not.toMatch(/^plain:/);
    expect(Buffer.from(raw.github ?? '', 'base64').toString('utf8')).toMatch(/^enc:/);
    expect((await getStorageProtection()).mechanism).toBe('os-keychain');
  });
});
