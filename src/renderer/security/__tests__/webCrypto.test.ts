/**
 * **WebCrypto が無いときの 1 文** (2026-09-12 · パス 169)。
 *
 * `crypto.subtle` は安全なコンテキストにしか無い。無い端末で触ると
 * `TypeError: Cannot read properties of undefined (reading 'digest')` になり、
 * **内部 API の名前しか言わない** —— 読んだ人に打てる手が無い。
 * ここは「何が使えないのか・どうすれば使えるのか」を留める。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeCryptoFailure, webCryptoUnavailableReason } from '../webCrypto';

/** `crypto` を丸ごと差し替える (元に戻すのは `vi.unstubAllGlobals`)。 */
function withCrypto(value: unknown): void {
  vi.stubGlobal('crypto', value);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('webCryptoUnavailableReason', () => {
  it('★ 使えるときは null (本物の環境で空振りしていない標本)', () => {
    // この harness (jsdom + Node) には本物の WebCrypto が在る。
    expect(typeof crypto.subtle.digest).toBe('function');
    expect(webCryptoUnavailableReason()).toBeNull();
  });

  it('★ crypto が無ければ理由を返す', () => {
    withCrypto(undefined);
    const reason = webCryptoUnavailableReason();
    expect(reason).not.toBeNull();
    expect(reason!).toContain('WebCrypto');
  });

  it('★ crypto は在るが subtle が無い (平文 http:// の形) でも理由を返す', () => {
    withCrypto({ getRandomValues: () => new Uint8Array(4) });
    expect(webCryptoUnavailableReason()).not.toBeNull();
  });

  it('★ subtle は在るが digest が無い (古い WebView) を「在る」と言わない', () => {
    withCrypto({ subtle: {} });
    expect(webCryptoUnavailableReason()).not.toBeNull();
  });

  it('★ 次の手を述べる (原因の名指しだけで終わらない)', () => {
    withCrypto(undefined);
    const reason = webCryptoUnavailableReason()!;
    // 打てる手が 3 つとも出る。
    expect(reason).toContain('https://');
    expect(reason).toContain('localhost');
    expect(reason).toContain('standalone.html');
    // 原因を 1 つに断定しない (ここから分かるのは「無い」ことだけ)。
    expect(reason).toContain('場合は');
  });
});

describe('describeCryptoFailure', () => {
  it('★ WebCrypto が無いときは、素の TypeError ではなくその説明を出す', () => {
    withCrypto(undefined);
    const out = describeCryptoFailure(new TypeError("Cannot read properties of undefined (reading 'digest')"));
    expect(out).toContain('WebCrypto');
    // 内部 API の名前を前に出さない。
    expect(out).not.toContain('Cannot read properties');
  });

  it('★ 在るのに失敗したときは元の文を残す (調べる手がかりを消さない)', () => {
    expect(webCryptoUnavailableReason()).toBeNull();
    const out = describeCryptoFailure(new Error('operation not supported'));
    expect(out).toContain('operation not supported');
    expect(out).toContain('暗号処理に失敗');
  });

  it('Error でない物を投げられても文になる', () => {
    expect(describeCryptoFailure('壊れた')).toContain('壊れた');
    expect(describeCryptoFailure(undefined)).toContain('暗号処理に失敗');
  });

  it('★ 2 つの文は互いに別物 (片方に畳まれていない)', () => {
    const withReal = describeCryptoFailure(new Error('x'));
    withCrypto(undefined);
    const withMissing = describeCryptoFailure(new Error('x'));
    expect(withMissing).not.toBe(withReal);
  });
});
