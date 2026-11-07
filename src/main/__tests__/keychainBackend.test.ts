import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `realKeychainAvailable` (threat: T-041 · パス 520)。
 *
 * `safeStorage` の可否 (`isAsyncEncryptionAvailable()`) は Linux で `basic_text` (ハードコードされた鍵) でも true を
 * 返す。設定画面の「OS キーチェーン」の札と `plain:` への倒し込みはこの述語を読むので、
 * ここが緩めば gnome-keyring の無い Linux で「暗号化済み」を名乗る形へ戻る。
 *
 * 代役は検査ごとに差し替える (backend の綴り・`getSelectedStorageBackend` の有無)。
 * `process.platform` は `Object.defineProperty` で上書きし、必ず戻す。
 */
const state = { available: true, backend: 'gnome_libsecret', hasBackendFn: true };

vi.mock('electron', () => ({
  get safeStorage() {
    const base: Record<string, unknown> = {
      isAsyncEncryptionAvailable: async () => state.available,
      encryptStringAsync: async (v: string) => Buffer.from(v, 'utf8'),
      decryptStringAsync: async (b: Buffer) => ({ shouldReEncrypt: false, result: b.toString('utf8') }),
    };
    if (state.hasBackendFn) base.getSelectedStorageBackend = () => state.backend;
    return base;
  },
}));

const { realKeychainAvailable, HARDCODED_KEY_BACKEND } = await import('../keychainBackend');

const realPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  state.available = true;
  state.backend = 'gnome_libsecret';
  state.hasBackendFn = true;
  setPlatform('linux');
});
afterEach(() => setPlatform(realPlatform));

describe('realKeychainAvailable (threat: T-041)', () => {
  it('暗号化の API が無ければ false (backend が何であれ)', async () => {
    state.available = false;
    expect(await realKeychainAvailable()).toBe(false);
    state.backend = 'basic_text';
    expect(await realKeychainAvailable()).toBe(false);
  });

  it('★ Linux の basic_text (ハードコードされた鍵) は暗号化 API が true でも false (threat: T-041)', async () => {
    state.backend = 'basic_text';
    expect(HARDCODED_KEY_BACKEND).toBe('basic_text');
    expect(await realKeychainAvailable()).toBe(false);
  });

  it.each(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6', 'unknown'])(
    'Linux の %s は本当のキーチェーン (unknown は ready 前の値 —— 暗号化 API の可否に従う)',
    async (backend) => {
      state.backend = backend;
      expect(await realKeychainAvailable()).toBe(true);
    },
  );

  it('Linux 以外では backend を訊かない (macOS / Windows の safeStorage は OS の鍵)', async () => {
    setPlatform('darwin');
    state.backend = 'basic_text'; // 他の OS では意味を持たない綴り
    expect(await realKeychainAvailable()).toBe(true);
    setPlatform('win32');
    expect(await realKeychainAvailable()).toBe(true);
  });

  it('代役が getSelectedStorageBackend を持たなければ暗号化 API の可否に従う (投げない)', async () => {
    state.hasBackendFn = false;
    state.backend = 'basic_text';
    expect(await realKeychainAvailable()).toBe(true);
    state.available = false;
    expect(await realKeychainAvailable()).toBe(false);
  });
});
