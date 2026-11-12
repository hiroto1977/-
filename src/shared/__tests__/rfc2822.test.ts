import { describe, expect, it } from 'vitest';
import { buildRfc2822, isSafeHeaderValue } from '../rfc2822';
import { utf8ToBase64, utf8ToBase64Url } from '../base64';
import { RFC2822_HEADER_UNSAFE } from '../writeFieldLimits';

/*
 * **RFC 2822 の組み立てと base64 は shared の 1 つ** (2026-09-19 · パス 321)。
 *
 * 2026-09-19 まで `rfc2822Parity.test.ts` が main とブラウザ版の 2 実装に同じ入力を
 * 与えて同じ出力を見ていた。パリティは「両方に在る穴」を見つけられない (0-a-16)。
 * 1 つに畳んだので、ここは実装そのものに当たる —— 出力は golden で固定し、
 * base64 は Node の `Buffer` (別の実装) を証人にして突き合わせる。
 */

describe('buildRfc2822', () => {
  const CASES: [string, string, string][] = [
    ['taro@example.com', 'ご注文ありがとうございます #1001', '本文です'],
    ['a@b.example', 'ASCII subject', 'line1\nline2'],
    ['x+tag@example.co.jp', '日本語の件名 — 記号 & 引用符 "test"', ''],
    ['y@example.com', '', 'body only'],
  ];

  it.each(CASES)('件名は RFC 2047 の base64 に包み、本文は生のまま (to=%s)', (to, subject, body) => {
    const out = buildRfc2822(to, subject, body);
    const expectedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    expect(out).toBe(
      [`To: ${to}`, `Subject: ${expectedSubject}`, 'Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', body].join('\r\n'),
    );
  });

  it('golden: 日本語の件名', () => {
    expect(buildRfc2822('a@b.com', 'やあ', 'hi')).toBe(
      ['To: a@b.com', 'Subject: =?UTF-8?B?44KE44GC?=', 'Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', 'hi'].join('\r\n'),
    );
  });

  const REJECTED: [string, unknown][] = [
    ['CRLF', 'a@b.example\r\nBcc: attacker@evil.example'],
    ['LF', 'a@b.example\nBcc: x@y.example'],
    ['CR', 'a@b.example\rBcc: x@y.example'],
    ['NUL', 'a@b.example\u0000'],
    ['数値', 12345],
    ['null', null],
    ['undefined', undefined],
    ['オブジェクト', { toString: () => 'a@b.example' }],
  ];

  it.each(REJECTED)('%s は安全でないと判定され、台帳の文で throw する', (_label, value) => {
    expect(isSafeHeaderValue(value)).toBe(false);
    expect(() => buildRfc2822(value as string, 's', 'b')).toThrow(RFC2822_HEADER_UNSAFE);
  });

  it('正当なアドレスは通す', () => {
    for (const to of ['a@b.example', 'x+tag@example.co.jp', '"Taro Yamada" <taro@example.com>']) {
      expect(isSafeHeaderValue(to)).toBe(true);
      expect(buildRfc2822(to, 's', 'b')).toContain(`To: ${to}`);
    }
  });

  it('★ 対照: 本文の改行は断らない (ヘッダ行へ連結するのは to だけ)', () => {
    expect(buildRfc2822('a@b.example', 's', 'l1\r\nl2')).toContain('l1\r\nl2');
  });
});

describe('utf8ToBase64 / utf8ToBase64Url', () => {
  const SAMPLES = ['', 'a', 'aa', 'aaa', '~~a', 'やあ', '😾😾😾', 'ご注文ありがとうございます #1001', '\u0000\u00ff'];

  it.each(SAMPLES)('Buffer (別実装) と同じ base64 (%j)', (s) => {
    expect(utf8ToBase64(s)).toBe(Buffer.from(s, 'utf8').toString('base64'));
  });

  it.each(SAMPLES)('base64url は + / = を含まず、Buffer の base64url と一致する (%j)', (s) => {
    const url = utf8ToBase64Url(s);
    expect(url).not.toMatch(/[+/=]/);
    expect(url).toBe(Buffer.from(s, 'utf8').toString('base64url'));
  });

  it('標本: 二重パディング (==) も 1 つ (=) も全部落とす', () => {
    expect(utf8ToBase64('a')).toBe('YQ==');
    expect(utf8ToBase64Url('a')).toBe('YQ');
    expect(utf8ToBase64('aa')).toBe('YWE=');
    expect(utf8ToBase64Url('aa')).toBe('YWE');
  });
});
