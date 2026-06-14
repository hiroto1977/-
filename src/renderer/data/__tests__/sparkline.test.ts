import { describe, expect, it } from 'vitest';
import { sparklinePoints } from '../sparkline';

describe('sparklinePoints', () => {
  it('returns an empty geometry for no values', () => {
    const g = sparklinePoints([]);
    expect(g.points).toEqual([]);
    expect(g.polyline).toBe('');
    expect(g.zeroY).toBeNull();
    expect(g.min).toBe(0); // 空ガードを外す mutant は Math.min(...[])=Infinity になる
    expect(g.max).toBe(0);
  });

  it('positions y using innerH = height − pad×2 (pad / span / v−min matter)', () => {
    // min=10,max=20,span=10,innerH=32−4=28 → yOf(10)=2+28=30, yOf(20)=2。
    // height−pad*2 / pad*2 / v−min の各 ArithmeticOperator をこの座標で殺す。
    const g = sparklinePoints([10, 20], 100, 32, 2);
    expect(g.points).toEqual([{ x: 0, y: 30 }, { x: 100, y: 2 }]);
  });

  it('centers a single point horizontally and vertically', () => {
    const g = sparklinePoints([5], 120, 32);
    expect(g.points).toHaveLength(1);
    expect(g.points[0]!.x).toBe(60); // width / 2
    expect(g.points[0]!.y).toBe(16); // height / 2 (span 0)
  });

  it('maps the max value to the top (small y) and min to the bottom', () => {
    const g = sparklinePoints([0, 10], 100, 30, 0);
    // first point min → bottom (y = height), second max → top (y = 0)
    expect(g.points[0]!).toEqual({ x: 0, y: 30 });
    expect(g.points[1]!).toEqual({ x: 100, y: 0 });
  });

  it('spaces x evenly across the width', () => {
    const g = sparklinePoints([1, 2, 3], 100, 30, 0);
    expect(g.points.map((p) => p.x)).toEqual([0, 50, 100]);
  });

  it('draws a horizontal mid-line when all values are equal', () => {
    const g = sparklinePoints([7, 7, 7], 90, 40);
    expect(g.points.every((p) => p.y === 20)).toBe(true); // height / 2
    expect(g.min).toBe(7);
    expect(g.max).toBe(7);
  });

  it('exposes a zero baseline y only when 0 is within range', () => {
    const withZero = sparklinePoints([-100, 100], 100, 40, 0);
    expect(withZero.zeroY).toBe(20); // yOf(0)=20 — *10 / round の ArithmeticOperator を kill
    const allPositive = sparklinePoints([10, 20, 30], 100, 40, 0);
    expect(allPositive.zeroY).toBeNull();
    // min===0 / max===0 の境界 (<= / >= の厳密性) と max<0 (>= を true 固定) を kill。
    expect(sparklinePoints([0, 10], 100, 40, 0).zeroY).toBe(40); // min=0 → 含む
    expect(sparklinePoints([-10, 0], 100, 40, 0).zeroY).toBe(0); // max=0 → 含む
    expect(sparklinePoints([-20, -10], 100, 40, 0).zeroY).toBeNull(); // max<0 → 範囲外
  });

  it('builds a polyline string matching the points', () => {
    const g = sparklinePoints([0, 10], 100, 30, 0);
    expect(g.polyline).toBe('0,30 100,0');
  });
});
