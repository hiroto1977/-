import { describe, expect, it } from 'vitest';
import { sparklinePoints } from '../sparkline';

describe('sparklinePoints', () => {
  it('returns an empty geometry for no values', () => {
    const g = sparklinePoints([]);
    expect(g.points).toEqual([]);
    expect(g.polyline).toBe('');
    expect(g.zeroY).toBeNull();
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
    expect(withZero.zeroY).not.toBeNull();
    const allPositive = sparklinePoints([10, 20, 30], 100, 40, 0);
    expect(allPositive.zeroY).toBeNull();
  });

  it('builds a polyline string matching the points', () => {
    const g = sparklinePoints([0, 10], 100, 30, 0);
    expect(g.polyline).toBe('0,30 100,0');
  });
});
