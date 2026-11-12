import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostCanAskPlatformAuthenticator } from '../webauthnHost';

/*
 * webauthn.mamori の薄い壁 (webauthnHost.ts) —— 「プラットフォーム認証器を問える環境か」の判定を、3 つの環境で直接留める。
 * (変異検査が教えた穴: `window` が無い環境 / `window` はあるが `PublicKeyCredential` が無い環境 / 両方が在る環境の 3 つが
 *  webauthn.test.ts では「利用可能か」の答えに混ざって、どの条件が効いているか見分けられなかった)
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hostCanAskPlatformAuthenticator', () => {
  it('window が無い環境 (Node / main プロセス) では false', () => {
    vi.stubGlobal('window', undefined);
    expect(hostCanAskPlatformAuthenticator()).toBe(false);
  });

  it('window は在るが PublicKeyCredential が無い環境では false', () => {
    vi.stubGlobal('window', {});
    expect(hostCanAskPlatformAuthenticator()).toBe(false);
    vi.stubGlobal('window', { PublicKeyCredential: undefined });
    expect(hostCanAskPlatformAuthenticator()).toBe(false);
  });

  it('window と PublicKeyCredential が両方在る環境では true', () => {
    vi.stubGlobal('window', { PublicKeyCredential: {} });
    expect(hostCanAskPlatformAuthenticator()).toBe(true);
  });
});
