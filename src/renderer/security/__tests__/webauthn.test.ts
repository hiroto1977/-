import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

import {
  BiometricVerificationUnimplementedError,
  base64urlToBuffer,
  buildCreationOptions,
  buildRequestOptions,
  bufferToBase64url,
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
} from '../webauthn';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webauthn base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 64, 63, 62]);
    const encoded = bufferToBase64url(bytes);
    expect(encoded).not.toMatch(/[+/=]/); // url-safe, unpadded
    expect(Array.from(base64urlToBuffer(encoded))).toEqual(Array.from(bytes));
  });

  it('decodes an ArrayBuffer input too', () => {
    const buf = new Uint8Array([10, 20, 30]).buffer;
    expect(Array.from(base64urlToBuffer(bufferToBase64url(buf)))).toEqual([10, 20, 30]);
  });
});

describe('buildCreationOptions / buildRequestOptions', () => {
  it('requires platform authenticator + user verification', () => {
    const opts = buildCreationOptions('user-1', 'Alice');
    expect(opts.authenticatorSelection?.authenticatorAttachment).toBe('platform');
    expect(opts.authenticatorSelection?.userVerification).toBe('required');
    expect(opts.pubKeyCredParams.map((p) => p.alg)).toContain(-7);
    expect((opts.challenge as Uint8Array).byteLength).toBe(32);
  });

  it('references the credentialId in allowCredentials', () => {
    const id = bufferToBase64url(new Uint8Array([1, 2, 3, 4]));
    const opts = buildRequestOptions(id);
    expect(opts.userVerification).toBe('required');
    const cred = opts.allowCredentials![0]!;
    expect(Array.from(new Uint8Array(cred.id as ArrayBuffer))).toEqual([1, 2, 3, 4]);
  });
});

describe('isBiometricAvailable', () => {
  it('returns false without PublicKeyCredential', async () => {
    vi.stubGlobal('window', {});
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('reflects the platform authenticator probe', async () => {
    vi.stubGlobal('window', {
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
      },
    });
    expect(await isBiometricAvailable()).toBe(true);
  });

  it('returns false when the probe throws', async () => {
    vi.stubGlobal('window', {
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.reject(new Error('nope')),
      },
    });
    expect(await isBiometricAvailable()).toBe(false);
  });
});

describe('registerBiometric / verifyBiometric', () => {
  it('returns the credentialId from a created credential', async () => {
    const rawId = new Uint8Array([9, 8, 7, 6]).buffer;
    vi.stubGlobal('navigator', { credentials: { create: () => Promise.resolve({ rawId }) } });
    const reg = await registerBiometric('uid', 'Bob');
    expect(reg.credentialId).toBe(bufferToBase64url(new Uint8Array([9, 8, 7, 6])));
  });

  it('throws when registration is cancelled (null)', async () => {
    vi.stubGlobal('navigator', { credentials: { create: () => Promise.resolve(null) } });
    await expect(registerBiometric('uid', 'Bob')).rejects.toThrow();
  });

  // 2026-07 監査: 旧実装は assertion の rawId が空でなければ true を返していた
  // （署名・challenge 未検証）。fail-closed 化したので「成功する認証器」でも通らない。
  it('rejects even when the authenticator returns a valid-looking assertion', async () => {
    const rawId = new Uint8Array([1, 2]).buffer;
    vi.stubGlobal('navigator', { credentials: { get: () => Promise.resolve({ rawId }) } });
    await expect(verifyBiometric(bufferToBase64url(new Uint8Array([1, 2])))).rejects.toThrow(
      BiometricVerificationUnimplementedError,
    );
  });

  it('throws without invoking the authenticator ceremony at all', async () => {
    const get = vi.fn();
    vi.stubGlobal('navigator', { credentials: { get } });
    await expect(verifyBiometric('AAAA')).rejects.toThrow(/未実装/);
    expect(get).not.toHaveBeenCalled();
  });
});

/*
 * 冒頭の「維持されている設計上の不変条件」を 1 つずつ固定する。
 *
 * このモジュールは**まだ誰も呼んでいない**。存在理由は、将来これを解錠ゲートへ
 * 配線する人に対して条件を残すことである。だから条件そのものが検査で押さえられて
 * いなければ、モジュールの目的が果たせない — 2026-08-20 の実測で
 * `userVerification: 'required'` を空文字に書き換えても**どの検査も落ちなかった**
 * (68 変異体 61.76%・生存 26)。ここはその穴を塞ぐための節である。
 */
describe('webauthn — 不変条件を固定する', () => {
  it('登録も検証も userVerification は required (所持だけでは通さない)', () => {
    // 'preferred' や '' に緩めると、認証器が生体/PIN を省いても通る。
    // 「所持の演出」に戻さないための一線。
    expect(buildCreationOptions('u', 'U').authenticatorSelection?.userVerification).toBe('required');
    expect(buildRequestOptions('AAAA').userVerification).toBe('required');
  });

  it('プラットフォーム認証器に限る (秘密鍵を端末外へ出さない)', () => {
    const sel = buildCreationOptions('u', 'U').authenticatorSelection!;
    expect(sel.authenticatorAttachment).toBe('platform');
    expect(sel.residentKey).toBe('preferred');
  });

  it('公開鍵アルゴリズムは ES256 と RS256 の 2 つ、種別は public-key', () => {
    const params = buildCreationOptions('u', 'U').pubKeyCredParams;
    expect(params).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ]);
    // COSE の識別子は負値。符号を落とすと別のアルゴリズムを指す。
    for (const p of params) expect(p.alg).toBeLessThan(0);
  });

  it('attestation は none (端末を識別できる情報を要求しない)', () => {
    expect(buildCreationOptions('u', 'U').attestation).toBe('none');
  });

  it('RP 名と利用者名を空にしない', () => {
    const o = buildCreationOptions('uid-1', 'Alice');
    expect(o.rp.name).not.toBe('');
    expect(o.rp.name.length).toBeGreaterThan(0);
    expect(o.user.name).toBe('Alice');
    expect(o.user.displayName).toBe('Alice');
    expect(Array.from(new Uint8Array(o.user.id as ArrayBuffer))).toEqual(
      Array.from(new TextEncoder().encode('uid-1')),
    );
  });

  it('allowCredentials の種別も public-key', () => {
    const cred = buildRequestOptions('AAAA').allowCredentials![0]!;
    expect(cred.type).toBe('public-key');
  });

  it('タイムアウトを置く (無期限に待たせない)', () => {
    expect(buildCreationOptions('u', 'U').timeout).toBe(60_000);
    expect(buildRequestOptions('AAAA').timeout).toBe(60_000);
  });

  it('challenge は毎回変わる (使い回すとリプレイできる)', () => {
    const a = buildCreationOptions('u', 'U').challenge as Uint8Array;
    const b = buildCreationOptions('u', 'U').challenge as Uint8Array;
    expect(a.byteLength).toBe(32);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('webauthn — base64url の境界', () => {
  it('パディングは末尾だけ落とす (途中の = を消さない)', () => {
    // `/=+$/` を `/=+/` に緩めると、途中に現れた `=` まで落ちて復号がずれる。
    // base64 の `=` は末尾にしか出ないが、規則としてはここを固定しておく。
    for (let n = 1; n <= 8; n += 1) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37) % 256);
      const encoded = bufferToBase64url(bytes);
      expect(encoded).not.toContain('=');
      expect(Array.from(base64urlToBuffer(encoded))).toEqual(Array.from(bytes));
    }
  });

  it('パディングの無い入力をそのまま復号できる', () => {
    // `atob` は仕様上 `=` を取り除いてから復号するので、こちらで戻す必要が
    // ない。長さ % 4 が 2 / 3 / 0 のいずれでも同じ結果になることを見る
    // (戻す処理を足すと、結果の変わらない算術が変異体として残るだけ)。
    for (const n of [1, 2, 3]) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 53) % 256);
      const encoded = bufferToBase64url(bytes);
      expect(encoded).not.toContain('=');
      expect(Array.from(base64urlToBuffer(encoded))).toEqual(Array.from(bytes));
      // パディングを付けても同じ結果 (= 付ける意味が無い) ことも固定する。
      const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
      expect(Array.from(base64urlToBuffer(padded))).toEqual(Array.from(bytes));
    }
  });

  it('復号の長さは元と一致する (1 バイトも増減しない)', () => {
    // `i < binary.length` を `<=` に緩めると末尾に undefined が入り、
    // credentialId が別物になる。
    for (let n = 0; n <= 32; n += 1) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 91) % 256);
      const out = base64urlToBuffer(bufferToBase64url(bytes));
      expect(out.length, `n=${n}`).toBe(n);
      expect(Array.from(out), `n=${n}`).toEqual(Array.from(bytes));
    }
  });

  it('URL 安全な字だけを出す', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    const encoded = bufferToBase64url(bytes);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(base64urlToBuffer(encoded))).toEqual(Array.from(bytes));
  });
});

describe('webauthn — 能力検出は fail-closed', () => {
  it('window が無ければ false (Node / main から読まれても壊れない)', async () => {
    vi.stubGlobal('window', undefined);
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('PublicKeyCredential が無ければ probe を呼ばずに false', async () => {
    // 片方だけ見る形に崩すと、無い側で `undefined.isUserVerifying...` を呼んで
    // 投げる (= 例外が上へ抜ける) か、true を返してしまう。
    vi.stubGlobal('window', {});
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('probe が false を返せば false (true に読み替えない)', async () => {
    vi.stubGlobal('window', {
      PublicKeyCredential: {
        isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
      },
    });
    expect(await isBiometricAvailable()).toBe(false);
  });
});

describe('webauthn — 登録の失敗と検証の拒否は言葉で返す', () => {
  it('登録がキャンセルされたら、そう分かる文言で投げる', async () => {
    vi.stubGlobal('navigator', { credentials: { create: () => Promise.resolve(null) } });
    await expect(registerBiometric('uid', 'Bob')).rejects.toThrow(
      '生体認証の登録がキャンセルされました。',
    );
  });

  it('未実装であることと、実装時の参照先を必ず伝える', async () => {
    // 文言そのものが成果物 — 空にすると「なぜ拒否されたのか」が画面から消え、
    // 誤配線した人が原因に辿り着けない。
    const err = await verifyBiometric('AAAA').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BiometricVerificationUnimplementedError);
    const e = err as Error;
    expect(e.name).toBe('BiometricVerificationUnimplementedError');
    expect(e.message).toContain('署名・challenge・origin 検証');
    expect(e.message).toContain('解錠ゲートには使えません');
    expect(e.message).toContain('fail-closed');
    expect(e.message).toContain('src/renderer/security/webauthn.ts');
    expect(e.message).toContain('不変条件');
  });
});
