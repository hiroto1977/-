import { describe, expect, it } from 'vitest';
import { expandV6Groups, isNonGloballyReachableV6, isPrivateOrReservedTarget } from '../../../shared/privateTarget';

/**
 * IANA の特殊用途表で Globally Reachable: False の IPv6 5 範囲 (2026-10-27 · threat: T-204)。
 * 綴りの接頭辞では範囲を表せない (`::` に畳まれる位置は値で変わる) ので、**群の数値を総当たりに近く並べ、
 * 独立に書いた数値の参照と突き合わせる**。参照はこの検査の中に別に持つ (実装の写しではなく定義から)。
 */
type G = readonly number[];
const reference = (g: G): boolean => {
  const [a, b, c, d] = g as [number, number, number, number];
  if (a === 0x0100) return b === 0 && c === 0 && d === 0; // 100::/64
  if (a === 0x3fff) return b >> 12 === 0; // 3fff::/20 = 先頭 16 bit + 次の 4 bit
  if (a === 0x2001) return (b === 2 && c === 0) || b >> 4 === 1; // 2001:2::/48 と 2001:10::/28
  return a === 0x5f00; // 5f00::/16
};
const full = (g: G): string => g.map((x) => x.toString(16)).join(':');
/** `URL` が正規化した綴り (角括弧なし) を得る —— アプリが実際に見る形。 */
const normalized = (g: G): string => new URL(`http://[${full(g)}]/`).hostname.replace(/^\[|\]$/g, '');

const TAILS: readonly (readonly number[])[] = [
  [0, 0, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0xffff, 0xffff, 0xffff, 0xffff], [0, 5, 0, 0], [5, 0, 0, 5],
];
const FIRST: readonly number[] = [
  0x0100, 0x0101, 0x0001, 0x1000, 0x00ff, 0x3fff, 0x3ffe, 0x4000, 0x2001, 0x2002, 0x2000, 0x5f00, 0x5eff, 0x5f01, 0x1f00, 0x0000, 0xffff,
];
const SECOND: readonly number[] = [
  0, 1, 2, 3, 0x0f, 0x10, 0x11, 0x1f, 0x20, 0x100, 0x110, 0x0fff, 0x1000, 0x8000, 0xffff, 0xdb8, 0x0abc,
];
const THIRD: readonly number[] = [0, 1, 0xffff];
const FOURTH: readonly number[] = [0, 1];

describe('IPv6 の特殊用途 5 範囲 (threat: T-204)', () => {
  it('★ 数値の参照と、全組み合わせで一致する (正規化後の綴りに対して)', () => {
    let n = 0;
    let blocked = 0;
    for (const a of FIRST) for (const b of SECOND) for (const c of THIRD) for (const d of FOURTH) for (const t of TAILS) {
      const g: G = [a, b, c, d, ...t];
      const want = reference(g);
      const text = normalized(g);
      expect(isNonGloballyReachableV6(text), `${text} (${full(g)})`).toBe(want);
      n += 1;
      if (want) blocked += 1;
    }
    // 走査が空虚でない: 塞ぐ側と通す側の両方が十分な数ある
    expect(n).toBeGreaterThan(5000);
    expect(blocked).toBeGreaterThan(200);
    expect(n - blocked).toBeGreaterThan(2000);
  });

  it('★ 100::/64 の外で `100::` で始まる綴りを塞がない (最初の正規表現版の穴)', () => {
    const g: G = [0x100, 0, 0, 1, 5, 6, 7, 8];
    expect(normalized(g).startsWith('100::')).toBe(true); // 綴りの接頭辞は同じ
    expect(isNonGloballyReachableV6(normalized(g))).toBe(false);
    expect(isNonGloballyReachableV6(normalized([0x100, 0, 0, 0, 5, 6, 7, 8]))).toBe(true);
  });

  it('★ 実物の入口 isPrivateOrReservedTarget も 5 範囲を塞ぎ、隣の公開空間は通す', () => {
    const url = (h: string): URL => new URL(`http://[${h}]/`);
    for (const h of ['100::1', '3fff::1', '2001:2::1', '2001:10::1', '2001:1f::1', '5f00::1']) {
      expect(isPrivateOrReservedTarget(url(h)), h).toBe(true);
    }
    for (const h of ['2001:4860:4860::8888', '2001:1::1', '2001:20::1', '2001:3::1', '3fff:1000::1', '5f01::1', '101::1']) {
      expect(isPrivateOrReservedTarget(url(h)), h).toBe(false);
    }
  });

  it('対照: 解析できない綴りは塞がない (他の規則の仕事)', () => {
    for (const bad of ['', 'zz::1', '1:2:3', '1::2::3', '1:2:3:4:5:6:7:8:9', '12345::1', '1:2:3:4:5:6:7::8']) {
      expect(isNonGloballyReachableV6(bad), bad).toBe(false);
    }
    // 8 群ちょうどに `::` は付けられない (fill < 1)
    expect(isNonGloballyReachableV6('100:0:0:0:0:0:0::1')).toBe(false);
  });

  it('★ 展開そのものを値で確かめる (`::` の位置・群の数・不正な群)', () => {
    expect(expandV6Groups('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]); // 先頭が空
    expect(expandV6Groups('1::')).toEqual([1, 0, 0, 0, 0, 0, 0, 0]); // 末尾が空
    expect(expandV6Groups('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(expandV6Groups('1:2::7:8')).toEqual([1, 2, 0, 0, 0, 0, 7, 8]);
    expect(expandV6Groups('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 省略なしの 8 群
    expect(expandV6Groups('FFFF:aBc::1')).toEqual([0xffff, 0xabc, 0, 0, 0, 0, 0, 1]); // 大文字小文字
    // `::` が 1 群ちょうどを表す境界 (fill = 1) は通し、0 群 (fill = 0) は断る
    expect(expandV6Groups('1:2:3:4:5:6:7::')).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(expandV6Groups('::2:3:4:5:6:7:8')).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
    expect(expandV6Groups('1:2:3:4::5:6:7:8')).toBeNull();
  });

  it('★ 展開は不正な綴りを null にする (群の形・群の数・`::` の数)', () => {
    for (const bad of [
      'zz::1', // 先頭側の群が 16 進でない
      '1::zz', // 末尾側の群が 16 進でない
      'g1::1', // 先頭に 16 進でない字 (末尾だけ合っても断る)
      '12345::1', // 5 桁 (後ろの 4 桁だけ合っても断る)
      '1:2:3:4:5:6:7', // `::` が無いのに 7 群
      '1:2:3:4:5:6:7:8:9', // 9 群
      '1::2::3', // `::` が 2 つ
      '1:::2', // コロンが 3 つ
      ':1::2', // 先頭に単独のコロン
    ]) {
      expect(expandV6Groups(bad), bad).toBeNull();
    }
  });
});

