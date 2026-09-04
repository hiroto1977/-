import { describe, expect, it } from 'vitest';
import { safeErrorMessage, ERROR_MESSAGE_MAX_LENGTH, redactSecrets } from '../redact';

/*
 * `safeErrorMessage` — 例外を「利用者へ見せてよい 1 行」にする規則。
 *
 * 2026-08-22 まで main.ts の中にだけ private に置いてあり、ブラウザ版の
 * `web-shim.ts` は main の役目をそのまま引き受けているのに同じ関門が
 * ありませんでした。片側にしか無い関門は、新しい経路が足されたときに効きます。
 */

describe('safeErrorMessage', () => {
  it('Error のメッセージを取り出す', () => {
    expect(safeErrorMessage(new Error('普通の失敗'))).toBe('普通の失敗');
  });

  it('Error でないものは文字列にする', () => {
    expect(safeErrorMessage('文字列で投げられた')).toBe('文字列で投げられた');
    expect(safeErrorMessage(42)).toBe('42');
    expect(safeErrorMessage(null)).toBe('null');
    expect(safeErrorMessage(undefined)).toBe('undefined');
    expect(safeErrorMessage({ a: 1 })).toBe('[object Object]');
  });

  it('資格情報を伏せる — 線上の形も JSON の形も', () => {
    const wire = safeErrorMessage(
      new Error('upstream 401: Authorization: Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    );
    expect(wire).not.toContain('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(wire).toContain('[REDACTED]');

    // プロキシがヘッダを JSON にして返す形。コロン直結ではないので、
    // 昔の規則ではここが素通りしていた。
    const json = safeErrorMessage(
      new Error('proxy 500: {"headers":{"authorization":"Bearer sk-ant-abcdefghijklmnopqrstuvwxyz01"}}'),
    );
    expect(json).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz01');
  });

  it('Error でない値に混ざった資格情報も伏せる', () => {
    // `String(x)` を先に通すので、投げられたのが Error でなくても素通りしない。
    const out = safeErrorMessage({
      toString: () => 'ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(out).not.toContain('ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('長すぎるメッセージは上限で切る', () => {
    const out = safeErrorMessage(new Error('あ'.repeat(ERROR_MESSAGE_MAX_LENGTH + 500)));
    expect(out).toHaveLength(ERROR_MESSAGE_MAX_LENGTH);
  });

  it('上限ちょうどは切らない', () => {
    const out = safeErrorMessage(new Error('あ'.repeat(ERROR_MESSAGE_MAX_LENGTH)));
    expect(out).toHaveLength(ERROR_MESSAGE_MAX_LENGTH);
  });

  it('伏字は冪等 — 既に伏せてある文字列を通しても形が変わらない', () => {
    // これが成り立つので、経路の途中で伏せてある文字列を、出口でもう一度
    // 通してよい (関門を二重に置ける)。
    for (const s of [
      'proxy 401: {"headers":{"authorization":"Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}',
      'GitHub 403: sk-ant-abcdefghijklmnopqrstuvwxyz012345',
      'Authorization: Basic dXNlcjpwYXNzd29yZGxvbmc=',
      '{"access_token":"ya29.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      'ふつうの失敗',
    ]) {
      const once = redactSecrets(s);
      expect(redactSecrets(once), s).toBe(once);
      expect(safeErrorMessage(new Error(once)), s).toBe(once);
    }
  });

  it('秘密が無ければそのまま通す (読みにくくしない)', () => {
    const msg = 'ネットワークに接続できません (ECONNREFUSED 127.0.0.1:11434)';
    expect(safeErrorMessage(new Error(msg))).toBe(msg);
  });
});
