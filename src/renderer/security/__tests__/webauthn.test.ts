/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

import {
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

  it('verifies a non-empty assertion as success', async () => {
    const rawId = new Uint8Array([1, 2]).buffer;
    vi.stubGlobal('navigator', { credentials: { get: () => Promise.resolve({ rawId }) } });
    expect(await verifyBiometric(bufferToBase64url(new Uint8Array([1, 2])))).toBe(true);
  });

  it('returns false when the assertion fails', async () => {
    vi.stubGlobal('navigator', { credentials: { get: () => Promise.reject(new Error('denied')) } });
    expect(await verifyBiometric('AAAA')).toBe(false);
  });
});
