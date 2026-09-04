import { describe, expect, it } from 'vitest';
import { buildRfc2822 as buildMain, isSafeHeaderValue as safeMain } from '../gmail';
import {
  buildRfc2822 as buildWeb,
  isSafeHeaderValue as safeWeb,
} from '../../../renderer/data/saasWriteWeb';

/*
 * RFC 2822 の組み立ては **2 か所にしか無い** —— renderer は main を import
 * できない (プロセス境界) ので、ブラウザ版は自前の写しを持つしかない。
 *
 * 写しがある以上、片方だけが緩む/変わることが起こりうる。実際 2026-08-22 に
 * `clients/shopify.ts` が **3 つ目の写し**を持っていて、そこだけ `To:` の
 * CR/LF 検査が抜けていた (`lint:forbidden` に規則を足して 3 つ目を禁じた)。
 *
 * 残る 2 つが同じ判断をし続けることを機械で留める。
 */
describe('buildRfc2822 は main とブラウザ版で一致する', () => {
  const CASES: [string, string, string][] = [
    ['taro@example.com', 'ご注文ありがとうございます #1001', '本文です'],
    ['a@b.example', 'ASCII subject', 'line1\nline2'],
    ['x+tag@example.co.jp', '日本語の件名 — 記号 & 引用符 "test"', ''],
    ['y@example.com', '', 'body only'],
  ];

  it.each(CASES)('同じ入力から同じ出力 (to=%s)', (to, subject, body) => {
    expect(buildWeb(to, subject, body)).toBe(buildMain(to, subject, body));
  });

  it('どちらも MIME-Version と引用符つき charset を出す', () => {
    const out = buildMain('a@b.example', 's', 'b');
    expect(out).toContain('MIME-Version: 1.0');
    expect(out).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(buildWeb('a@b.example', 's', 'b')).toBe(out);
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

  it.each(REJECTED)('%s はどちらの実装でも安全でないと判定される', (_label, value) => {
    expect(safeMain(value)).toBe(false);
    expect(safeWeb(value)).toBe(false);
  });

  it.each(REJECTED)('%s はどちらの実装でも throw する', (_label, value) => {
    expect(() => buildMain(value as string, 's', 'b')).toThrow();
    expect(() => buildWeb(value as string, 's', 'b')).toThrow();
  });

  it('正当なアドレスはどちらも通す', () => {
    for (const to of ['a@b.example', 'x+tag@example.co.jp', '"Taro Yamada" <taro@example.com>']) {
      expect(safeMain(to)).toBe(true);
      expect(safeWeb(to)).toBe(true);
    }
  });
});
