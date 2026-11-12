import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

/**
 * `secrets.mamori` の薄い壁 (`secretsHost.ts`) —— 判断を持たず、値を渡して結果を返すだけであること (2026-11-12 · MG-069)。
 *
 * 壁は判断を持たないので、検査が見るのは「渡した物がそのまま OS の口へ届き、返った物がそのまま戻る」ことだけである。
 * 失敗をここで受けない (復号の失敗を言い換えるのは呼び手の判断) ことも留める。
 */
const seen: { getPath: string[]; encrypt: string[]; decrypt: Buffer[]; available: number } = { getPath: [], encrypt: [], decrypt: [], available: 0 };
const state: { available: boolean; decryptThrows: boolean } = { available: true, decryptThrows: false };
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      seen.getPath.push(name);
      return path.join(path.sep, 'tmp', 'user-data-sample');
    },
  },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => {
      seen.available += 1;
      return state.available;
    },
    encryptStringAsync: async (v: string) => {
      seen.encrypt.push(v);
      return Buffer.from(`enc:${v}`, 'utf8');
    },
    decryptStringAsync: async (b: Buffer) => {
      seen.decrypt.push(b);
      if (state.decryptThrows) throw new Error('decrypt failed in OS');
      return { shouldReEncrypt: true, result: b.toString('utf8').replace(/^enc:/, '') };
    },
  },
}));

import {
  hostBase64ToUtf8,
  hostDecryptAvailable,
  hostDecryptFromBase64,
  hostEncryptToBase64,
  hostLogError,
  hostLogWarn,
  hostNow,
  hostUserDataPath,
  hostUtf8ByteLength,
  hostUtf8ToBase64,
} from '../secretsHost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  seen.getPath.length = 0;
  seen.encrypt.length = 0;
  seen.decrypt.length = 0;
  seen.available = 0;
  state.available = true;
  state.decryptThrows = false;
});

describe('secretsHost —— 資格情報の保管の薄い壁', () => {
  it('hostUserDataPath は userData の下の道を返す (訊く名前は userData だけ)', () => {
    expect(hostUserDataPath('service-hub-secrets.json')).toBe(path.join(path.sep, 'tmp', 'user-data-sample', 'service-hub-secrets.json'));
    expect(seen.getPath).toEqual(['userData']);
  });

  it('hostEncryptToBase64 は渡した文字列を OS の口で暗号化し、base64 にして返す', async () => {
    const out = await hostEncryptToBase64('tok-日本語');
    expect(seen.encrypt).toEqual(['tok-日本語']);
    expect(out).toBe(Buffer.from('enc:tok-日本語', 'utf8').toString('base64'));
    // base64 であること (生の bytes や utf8 の文字列を返さない)
    expect(out).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(out).not.toContain('enc:');
  });

  it('hostDecryptFromBase64 は base64 を bytes に戻して OS の口へ渡し、平文だけを返す (往復する)', async () => {
    const sealed = await hostEncryptToBase64('往復する値');
    expect(await hostDecryptFromBase64(sealed)).toBe('往復する値');
    expect(seen.decrypt).toHaveLength(1);
    expect(seen.decrypt[0]?.toString('utf8')).toBe('enc:往復する値');
  });

  it('★ 復号の失敗はそのまま投げる (ここで受けない —— 言い換えるのは呼び手)', async () => {
    state.decryptThrows = true;
    await expect(hostDecryptFromBase64(Buffer.from('enc:x', 'utf8').toString('base64'))).rejects.toThrow('decrypt failed in OS');
  });

  it('hostDecryptAvailable は OS の答えをそのまま返す (true も false も)', async () => {
    expect(await hostDecryptAvailable()).toBe(true);
    state.available = false;
    expect(await hostDecryptAvailable()).toBe(false);
    expect(seen.available).toBe(2);
  });

  it('hostUtf8ToBase64 / hostBase64ToUtf8 は UTF-8 で往復する (既知の値つき)', () => {
    expect(hostUtf8ToBase64('abc')).toBe('YWJj');
    expect(hostBase64ToUtf8('YWJj')).toBe('abc');
    // 多バイト: latin1 で読むと別の文字になる値
    expect(hostUtf8ToBase64('鍵😀')).toBe(Buffer.from('鍵😀', 'utf8').toString('base64'));
    expect(hostBase64ToUtf8(hostUtf8ToBase64('鍵😀'))).toBe('鍵😀');
    expect(hostBase64ToUtf8('6Y21')).toBe('鍵');
  });

  it('hostUtf8ByteLength は文字数ではなく UTF-8 の byte 数を返す', () => {
    expect(hostUtf8ByteLength('')).toBe(0);
    expect(hostUtf8ByteLength('abc')).toBe(3);
    expect(hostUtf8ByteLength('鍵')).toBe(3);
    expect(hostUtf8ByteLength('😀')).toBe(4);
    expect('😀'.length).toBe(2);
  });

  it('hostNow は今の時刻 (epoch ms) を返す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_123);
    expect(hostNow()).toBe(1_800_000_000_123);
    vi.setSystemTime(1_800_000_000_456);
    expect(hostNow()).toBe(1_800_000_000_456);
  });

  it('hostLogError / hostLogWarn は文をそのまま、それぞれの口へ 1 度だけ出す', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hostLogError('[secrets] 読めない');
    expect(err.mock.calls).toEqual([['[secrets] 読めない']]);
    expect(warn).not.toHaveBeenCalled();
    hostLogWarn('[secrets] 警告');
    expect(warn.mock.calls).toEqual([['[secrets] 警告']]);
    expect(err).toHaveBeenCalledTimes(1);
  });
});
