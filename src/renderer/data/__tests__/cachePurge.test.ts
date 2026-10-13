/**
 * キャッシュパージの確認文と URL 一覧の読み取り (2026-09-12 · パス 154)。
 */
import { describe, expect, it } from 'vitest';
import { purgeEverythingConfirmMessage, purgeUrlList } from '../cachePurge';

describe('purgeUrlList', () => {
  it('1 行 1 URL で読み、前後の空白を落とす', () => {
    expect(purgeUrlList('  https://a.example/x.css  \nhttps://a.example/y.js'))
      .toEqual(['https://a.example/x.css', 'https://a.example/y.js']);
  });

  it('空行は落とす (CRLF も LF も同じ)', () => {
    expect(purgeUrlList('a\r\n\r\nb\n   \nc')).toEqual(['a', 'b', 'c']);
  });

  it('空の入力は空の一覧 (「1 件だけ空文字を送る」にしない)', () => {
    expect(purgeUrlList('')).toEqual([]);
    expect(purgeUrlList('   \n  \n')).toEqual([]);
  });
});

describe('purgeEverythingConfirmMessage', () => {
  it('範囲をゾーン名で言い、取り消せないことと配信元への影響を言う', () => {
    const m = purgeEverythingConfirmMessage('example.com');
    expect(m).toContain('example.com のキャッシュを全て削除します。');
    expect(m).toContain('元に戻せません');
    expect(m).toContain('配信元');
    expect(m).toContain('よろしいですか？');
  });

  it('前後の空白は落とす', () => {
    expect(purgeEverythingConfirmMessage('  example.com  ')).toContain('example.com のキャッシュ');
  });

  /**
   * **名前が無いときに名前を騙らない。** 空文字をそのまま埋め込むと
   * 「 のキャッシュを全て削除します。」という、何を消すのか読めない文になる。
   */
  it('★ ゾーン名が空なら「選択したゾーン」と言う (空文字を埋め込まない)', () => {
    for (const empty of ['', '   ', '\t\n']) {
      const m = purgeEverythingConfirmMessage(empty);
      expect(m).toContain('選択したゾーン のキャッシュを全て削除します。');
      expect(m.startsWith(' ')).toBe(false);
    }
    // 走査が実物に当たる標本 —— 空文字を素通しすれば先頭が空白になる。
    expect(` のキャッシュを全て削除します。`.startsWith(' ')).toBe(true);
  });

  it('4 つの文はすべて「。」か「？」で終わる (連結して読める)', () => {
    for (const line of purgeEverythingConfirmMessage('a.example').split('\n')) {
      expect(/[。？]$/.test(line)).toBe(true);
    }
  });
});
