import { describe, expect, it } from 'vitest';
import { assertNonNegativeFinite, floorHundred, isFiniteNumber, nonNeg, round1, round2, yen } from '../num';

describe('yen', () => {
  it('円未満を四捨五入する', () => {
    expect(yen(100.4)).toBe(100);
    expect(yen(100.5)).toBe(101);
    expect(yen(-100.5)).toBe(-100); // Math.round は正の無限大方向へ丸める
    expect(yen(0)).toBe(0);
  });

  it('非有限値はそのまま伝播させる（黙って 0 にしない）', () => {
    expect(yen(NaN)).toBeNaN();
    expect(yen(Infinity)).toBe(Infinity);
  });
});

describe('round1 / round2', () => {
  it('指定桁で丸める', () => {
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
  });

  it('丸める桁が違う', () => {
    expect(round1(1.05)).toBe(1.1);
    expect(round2(1.05)).toBe(1.05);
  });
});

describe('nonNeg', () => {
  it('負値と非有限値を 0 にする', () => {
    expect(nonNeg(5)).toBe(5);
    expect(nonNeg(0)).toBe(0);
    expect(nonNeg(-1)).toBe(0);
    expect(nonNeg(NaN)).toBe(0);
    expect(nonNeg(Infinity)).toBe(0);
    expect(nonNeg(-Infinity)).toBe(0);
  });
});

describe('floorHundred', () => {
  it('100円未満を切り捨てる', () => {
    expect(floorHundred(1099)).toBe(1000);
    expect(floorHundred(1100)).toBe(1100);
    expect(floorHundred(99)).toBe(0);
    expect(floorHundred(0)).toBe(0);
  });

  it('負値は下方向へ切り捨てる（Math.floor の定義どおり）', () => {
    expect(floorHundred(-1)).toBe(-100);
  });
});

describe('assertNonNegativeFinite', () => {
  it('0 以上の有限数は通す', () => {
    expect(() => assertNonNegativeFinite(0, 'x')).not.toThrow();
    expect(() => assertNonNegativeFinite(1_000_000, 'x')).not.toThrow();
  });

  it('負値・非有限値は名前つきで投げる', () => {
    expect(() => assertNonNegativeFinite(-1, 'sales')).toThrow(/sales must be a finite number >= 0 \(got -1\)/);
    expect(() => assertNonNegativeFinite(NaN, 'sales')).toThrow(/got NaN/);
    expect(() => assertNonNegativeFinite(Infinity, 'sales')).toThrow(/got Infinity/);
  });
});

/*
 * `isFiniteNumber` は「型の絞り込みを伴う有限判定」の 1 つの口 (パス 501)。
 * `typeof v === 'number' && Number.isFinite(v)` と同じ答えを返す —— `typeof` の側は
 * 型の絞り込みのためだけに在り、`Number.isFinite` は非数を等しく false にするので、
 * 2 つを並べた形は変異検査で等価変異 (typeof を消しても答えが変わらない) を生む。
 * ここでは**非数 11 値と非有限の数 3 値が false・有限の数だけが true** を値ごと留める (`Number.isFinite` は
 * 型強制をしないので、`'1'` も `new Number(1)` も false)。
 */
describe('isFiniteNumber', () => {
  it('有限の数だけを通す (0 / 負 / 小数 / 最大値)', () => {
    for (const v of [0, -0, 1, -1, 1.5, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE]) {
      expect(isFiniteNumber(v), String(v)).toBe(true);
    }
  });

  it('非有限の数は落とす', () => {
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
  });

  it('数でない値は型強制せずに落とす (文字列の "1" も boxed の Number も)', () => {
    // label は `String(v)` —— `JSON.stringify(1n)` は投げる (BigInt は直列化できない)。
    for (const v of ['1', '', null, undefined, true, {}, [], [1], new Number(1), () => 1, 1n]) {
      expect(isFiniteNumber(v), `${typeof v}: ${String(v)}`).toBe(false);
    }
  });

  it('typeof を並べた形と同じ答え (寄せる前の形との対照)', () => {
    const before = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
    for (const v of [1, NaN, Infinity, '1', null, undefined, {}, [], new Number(1)]) {
      expect(isFiniteNumber(v)).toBe(before(v));
    }
  });
});
