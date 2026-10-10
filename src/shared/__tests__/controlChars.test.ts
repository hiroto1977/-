import { describe, expect, it } from 'vitest';
import { hasControlChar } from '../controlChars';

/** 制御文字はソースに直接書かず、コードから作る（エディタや diff で消えるため）。 */
const ch = (code: number): string => String.fromCharCode(code);

describe('hasControlChar', () => {
  it('普通の文字列は false', () => {
    expect(hasControlChar('')).toBe(false);
    expect(hasControlChar('https://api.example.com/v1')).toBe(false);
    expect(hasControlChar('株式会社サンプル 123')).toBe(false);
  });

  it('C0 制御文字を検出する', () => {
    for (const code of [0x00, 0x01, 0x08, 0x09, 0x0a, 0x0d, 0x1b, 0x1f]) {
      expect(hasControlChar(`a${ch(code)}b`), `0x${code.toString(16)}`).toBe(true);
    }
  });

  it('DEL (0x7f) も検出する', () => {
    expect(hasControlChar(`ab${ch(0x7f)}`)).toBe(true);
  });

  // 境界。0x20 は空白そのもので、ここを落とすと普通の文章が通らなくなる。
  it('0x20 (空白) と 0x7e は制御文字ではない', () => {
    expect(hasControlChar(ch(0x20))).toBe(false);
    expect(hasControlChar(ch(0x7e))).toBe(false);
  });

  it('0x80 以上（DEL の次）は制御文字として扱わない', () => {
    expect(hasControlChar(ch(0x80))).toBe(false);
    expect(hasControlChar('あ')).toBe(false);
  });

  it('文字列のどの位置にあっても見つける', () => {
    expect(hasControlChar(`${ch(0x00)}abc`)).toBe(true);
    expect(hasControlChar(`abc${ch(0x00)}`)).toBe(true);
    expect(hasControlChar(`ab${ch(0x00)}c`)).toBe(true);
  });

  // サロゲートペアを 1 文字として走査していること（for...of の性質）。
  // charCodeAt(0) を code unit ごとに見る実装だと、絵文字の上位サロゲート
  // (0xd83d 等) は 0x20 未満ではないので誤検出はしないが、
  // 走査単位が変わっていないことをここで固定しておく。
  it('絵文字など複数コード単位の文字で誤検出しない', () => {
    expect(hasControlChar('🙂')).toBe(false);
    expect(hasControlChar('a🙂b')).toBe(false);
  });
});
