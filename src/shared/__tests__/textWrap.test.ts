import { describe, expect, it } from 'vitest';
import { wrapLines } from '../textWrap';

describe('wrapLines', () => {
  it('指定文字数で折り返す', () => {
    expect(wrapLines('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
  });

  it('ちょうど割り切れるときに空の行を作らない', () => {
    expect(wrapLines('abcdef', 3)).toEqual(['abc', 'def']);
  });

  it('幅より短ければそのまま 1 行', () => {
    expect(wrapLines('abc', 10)).toEqual(['abc']);
  });

  it('段落（改行）を保持する', () => {
    expect(wrapLines('abcd\nefgh', 3)).toEqual(['abc', 'd', 'efg', 'h']);
  });

  it('空段落は空行として残す（詰めない）', () => {
    expect(wrapLines('ab\n\ncd', 5)).toEqual(['ab', '', 'cd']);
    expect(wrapLines('', 5)).toEqual(['']);
  });

  it('全角も 1 文字として数える', () => {
    expect(wrapLines('あいうえお', 2)).toEqual(['あい', 'うえ', 'お']);
  });

  it('サロゲートペアを途中で割らない', () => {
    // 絵文字は UTF-16 で 2 単位。コードポイントで進めるので分断されない。
    const out = wrapLines('👨‍👩‍👦x', 2);
    expect(out.join('')).toBe('👨‍👩‍👦x');
    for (const line of out) expect(line).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it('幅 1 なら 1 文字ずつ', () => {
    expect(wrapLines('abc', 1)).toEqual(['a', 'b', 'c']);
  });
});
