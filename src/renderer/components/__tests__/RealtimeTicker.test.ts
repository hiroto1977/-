/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { RealtimeTicker, type RealtimeRow } from '../RealtimeTicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * **描いて、進めて、止めるところまで見る。**
 *
 * 純粋関数 (`shared/realtimeProjection.ts`) と刻み (`useRealtimeTick`) は
 * それぞれ別に留めてあるが、**組み上げたものが実際に描けるか**は
 * どちらの検査にも出てこない。0 除算・NaN・空配列で落ちる形は、
 * 画面に出して初めて分かる。
 */

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(rows: readonly RealtimeRow[], props: Record<string, unknown> = {}): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(RealtimeTicker, { rows, ...props }));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const ROWS: RealtimeRow[] = [
  { label: '所得税', annual: 500_000, color: '#f00' },
  { label: '手取り', annual: 4_000_000, color: '#0f0' },
];

describe('RealtimeTicker', () => {
  it('行のラベルと年額を描く', () => {
    const el = render(ROWS);
    expect(el.textContent).toContain('所得税');
    expect(el.textContent).toContain('手取り');
    expect(el.textContent).toContain('リアルタイム');
  });

  it('★ 小数 2 桁で出す (整数だと年額 500 万でも 6 秒に 1 度しか動かない)', () => {
    const el = render([{ label: 'x', annual: 5_000_000 }]);
    // 「1,234.56 円」の形が出ていること。
    expect(el.textContent).toMatch(/\d+\.\d{2} 円/);
  });

  it('★ 1 秒進めたら表示が変わる', () => {
    vi.useFakeTimers();
    const el = render([{ label: 'x', annual: 100_000_000 }]);
    const before = el.textContent ?? '';
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = el.textContent ?? '';
    expect(after).not.toBe(before);
  });

  it.each([
    ['年額 0', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['負の年額 (赤字)', -1_200_000],
  ])('★ %s でも落ちず、NaN を画面へ出さない', (_label, annual) => {
    const el = render([{ label: 'x', annual: annual as number }]);
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).not.toContain('Infinity');
  });

  it('行が空でも落ちない', () => {
    const el = render([]);
    expect(el.textContent).toContain('リアルタイム');
  });

  it('折れ線は最初 (点が 1 つ) でも描ける', () => {
    const el = render([{ label: 'x', annual: 1000 }]);
    expect(el.querySelectorAll('svg').length).toBe(1);
  });

  it('★ 折れ線は上限を超えて伸びない (毎秒足すので上限が要る)', () => {
    vi.useFakeTimers();
    const el = render([{ label: 'x', annual: 100_000_000 }], { windowPoints: 5 });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    const poly = el.querySelector('polyline');
    expect(poly).not.toBeNull();
    const points = (poly?.getAttribute('points') ?? '').trim().split(/\s+/);
    expect(points.length).toBeLessThanOrEqual(5);
  });

  it('注記を差し替えられる', () => {
    const el = render(ROWS, { note: 'これは注記です' });
    expect(el.textContent).toContain('これは注記です');
  });

  it('刻みを注記に出す (既定 1 秒)', () => {
    const el = render(ROWS);
    expect(el.textContent).toContain('画面の刻みは 1 秒');
  });

  it('★ 取り直しはしないと明示する (毎秒 API を叩かないことが仕様)', () => {
    const el = render(ROWS);
    expect(el.textContent).toContain('元データの取り直しはこの刻みでは行いません');
  });
});
