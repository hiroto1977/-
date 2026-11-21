import { describe, it, expect } from 'vitest';
import {
  projectPoint,
  groundTransform,
  GROUND_ZOOM,
  GROUND_SHIFT_PCT,
  TILT_DEG,
  PERSPECTIVE_K,
} from '../villageProject';

describe('villageProject — 傾けた地面への投影', () => {
  it('地面の中心は景色の中心 (+ ずらし) に投影され、拡大率は GROUND_ZOOM', () => {
    const c = projectPoint(50, 50);
    expect(c.x).toBeCloseTo(50, 9);
    expect(c.y).toBeCloseTo(50 + GROUND_SHIFT_PCT, 9);
    expect(c.scale).toBeCloseTo(GROUND_ZOOM, 9);
  });

  it('手前 (y 大) ほど大きく・下に、奥 (y 小) ほど小さく・上に見える (単調)', () => {
    let prev = projectPoint(0, -40);
    for (let y = -30; y <= 140; y += 10) {
      const p = projectPoint(50, y);
      expect(p.y).toBeGreaterThan(prev.y);
      expect(p.scale).toBeGreaterThan(prev.scale);
      prev = p;
    }
  });

  it('左右対称: 中心から等しく離れた x は中心から等しい距離に投影される', () => {
    const l = projectPoint(20, 70);
    const r = projectPoint(80, 70);
    expect(50 - l.x).toBeCloseTo(r.x - 50, 9);
    expect(l.y).toBeCloseTo(r.y, 9);
  });

  it('奥行き方向は縮む: 同じ 10% の y の差は、傾けない (cos だけ) より手前で大きく奥で小さい', () => {
    const rad = (TILT_DEG * Math.PI) / 180;
    const flat = 10 * GROUND_ZOOM * Math.cos(rad);
    const far = projectPoint(50, 10).y - projectPoint(50, 0).y;
    const near = projectPoint(50, 100).y - projectPoint(50, 90).y;
    expect(far).toBeLessThan(flat);
    expect(near).toBeGreaterThan(flat);
  });

  it('景色の外 (地面は景色より広い) と極端な値でも有限の数になる', () => {
    for (const y of [-200, -50, 0, 100, 150, 400, 10000]) {
      const p = projectPoint(120, y);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.scale)).toBe(true);
      expect(p.scale).toBeGreaterThan(0);
    }
  });

  it('CSS の変換は投影と同じ値 (傾き・拡大・遠近は景色の高さに比例)', () => {
    expect(groundTransform(500)).toBe(
      `perspective(${Math.round(PERSPECTIVE_K * 500)}px) rotateX(${TILT_DEG}deg) scale(${GROUND_ZOOM})`,
    );
    expect(groundTransform(1000)).toContain(`perspective(${Math.round(PERSPECTIVE_K * 1000)}px)`);
  });
});
