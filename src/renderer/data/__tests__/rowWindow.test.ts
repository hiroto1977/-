import { describe, expect, it } from 'vitest';
import { nextShown, ROW_WINDOW_STEP, windowRows } from '../rowWindow';

/*
 * 一覧の窓の純関数 (2026-10-19 · パス 538 · R-3)。窓は切り捨てではない —— 残りの件数を言い、
 * 「さらに表示」を繰り返せば必ず全件に届く。
 */
const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('windowRows / nextShown', () => {
  it('★ 件数が窓以下なら全部・超えたら先頭の窓だけ (残りの件数を言う)', () => {
    expect(windowRows(rows(0), ROW_WINDOW_STEP)).toEqual({ visible: [], hidden: 0, total: 0 });
    expect(windowRows(rows(ROW_WINDOW_STEP), ROW_WINDOW_STEP).hidden).toBe(0);
    const w = windowRows(rows(ROW_WINDOW_STEP + 1), ROW_WINDOW_STEP);
    expect(w.visible).toHaveLength(ROW_WINDOW_STEP);
    expect(w.hidden).toBe(1);
    expect(w.total).toBe(ROW_WINDOW_STEP + 1);
    expect(w.visible[0]).toBe(0); // 先頭 (新しい側) から
  });

  it('★ 「さらに表示」を繰り返せば必ず全件に届く (切り捨てではない・逃げ口が閉じない)', () => {
    const all = rows(1234);
    let shown = ROW_WINDOW_STEP;
    let guard = 0;
    while (windowRows(all, shown).hidden > 0) {
      shown = nextShown(shown);
      guard += 1;
      expect(guard).toBeLessThan(100);
    }
    expect(windowRows(all, shown).visible).toEqual(all);
  });

  it('★ 不正な shown (NaN / 負 / 窓未満 / 無限) は最初の窓へ倒れ、描く件数は窓を超えない', () => {
    for (const bad of [Number.NaN, -5, 0, 1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const w = windowRows(rows(5000), bad);
      expect(w.visible.length, String(bad)).toBeLessThanOrEqual(ROW_WINDOW_STEP);
      expect(nextShown(bad), String(bad)).toBe(ROW_WINDOW_STEP * 2);
    }
  });
});
