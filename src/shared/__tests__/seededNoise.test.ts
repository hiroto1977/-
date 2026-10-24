import { describe, expect, it } from 'vitest';
import { seededNoise } from '../seededNoise';

describe('seededNoise', () => {
  it('0 以上 1 未満を返す', () => {
    for (let s = 1; s <= 200; s += 1) {
      const v = seededNoise(s);
      expect(v, `seed=${s}`).toBeGreaterThanOrEqual(0);
      expect(v, `seed=${s}`).toBeLessThan(1);
    }
  });

  it('同じ種なら必ず同じ値（決定論）', () => {
    expect(seededNoise(42)).toBe(seededNoise(42));
    expect(seededNoise(12345)).toBe(seededNoise(12345));
  });

  it('種が違えば値も動く', () => {
    const vals = new Set([1, 2, 3, 4, 5].map(seededNoise));
    expect(vals.size).toBe(5);
  });

  it('種 0 でも 0 に貼り付かない（0 は 1 に読み替える）', () => {
    // 0 をそのまま xorshift に入れると出力が 0 のまま動かなくなる。
    expect(seededNoise(0)).toBe(seededNoise(1));
    expect(seededNoise(0)).toBeGreaterThan(0);
  });

  it('int32 へ落としてから読み替える（0 < 種 < 1 も 1 として扱う）', () => {
    // 0.5 | 0 は 0 なので、切り捨てを省くと 0 のまま貼り付く。
    expect(seededNoise(0.5)).toBe(seededNoise(1));
    expect(seededNoise(0.5)).toBeGreaterThan(0);
  });

  it('負の種でも範囲内に収まる', () => {
    const v = seededNoise(-7);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
