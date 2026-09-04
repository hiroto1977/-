/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useRealtimeTick, DEFAULT_TICK_MS, type RealtimeTickDeps } from '../useRealtimeTick';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * **「毎秒動く」は、動くことと、止まることの両方を測る。**
 *
 * この刻みは画面を進めるためだけのもので、元データの取得はしない
 * (毎秒取りに行くと有料 API の上限に当たり、ブラウザ版では利用者の鍵を
 * 毎秒使う)。だからここで確かめるのは 3 つ:
 *
 *   1. 周期ごとに値が進むこと
 *   2. タブが隠れたら**止まる**こと (見えない画面のために電池を削らない)
 *   3. 戻ったら**その場で 1 回進めてから**再開すること
 *      (再開だけだと最大 1 周期ぶん古い値が見える)
 */

/** 手で回せる時計・タイマー・可視状態。 */
function harness() {
  let now = 1_000_000;
  const timers: Array<{ cb: () => void; ms: number; id: number }> = [];
  let nextId = 1;
  let hidden = false;
  const visibilityCbs: Array<() => void> = [];
  let unsubscribed = 0;

  const deps: RealtimeTickDeps = {
    now: () => now,
    setIntervalFn: (cb, ms) => {
      const id = nextId++;
      timers.push({ cb, ms, id });
      return id;
    },
    clearIntervalFn: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    subscribeVisibility: (cb) => {
      visibilityCbs.push(cb);
      return () => {
        unsubscribed += 1;
      };
    },
    isHidden: () => hidden,
  };

  return {
    deps,
    advance(ms: number) {
      now += ms;
    },
    fire() {
      for (const t of [...timers]) t.cb();
    },
    setHidden(v: boolean) {
      hidden = v;
      for (const cb of [...visibilityCbs]) cb();
    },
    get running() {
      return timers.length;
    },
    get period() {
      return timers[0]?.ms;
    },
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

function mount(intervalMs: number, deps: RealtimeTickDeps): { root: Root; read: () => number; el: HTMLElement } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  let last = 0;
  const Probe = (): null => {
    last = useRealtimeTick(intervalMs, deps);
    return null;
  };
  const root = createRoot(el);
  act(() => {
    root.render(createElement(Probe));
  });
  return { root, read: () => last, el };
}

describe('useRealtimeTick', () => {
  it('★ 周期ごとに値が進む', () => {
    const h = harness();
    const { root, read } = mount(1000, h.deps);
    const first = read();
    act(() => {
      h.advance(1000);
      h.fire();
    });
    expect(read()).toBe(first + 1000);
    act(() => {
      h.advance(1000);
      h.fire();
    });
    expect(read()).toBe(first + 2000);
    act(() => root.unmount());
  });

  it('指定した周期でタイマーを張る', () => {
    const h = harness();
    const { root } = mount(250, h.deps);
    expect(h.period).toBe(250);
    act(() => root.unmount());
  });

  it.each([
    ['0 は既定へ落とす (毎フレームになり画面が固まる)', 0],
    ['負も既定へ落とす', -1000],
    ['NaN も既定へ落とす', Number.NaN],
    ['Infinity も既定へ落とす', Number.POSITIVE_INFINITY],
  ])('★ %s', (_label, bad) => {
    const h = harness();
    const { root } = mount(bad as number, h.deps);
    expect(h.period).toBe(DEFAULT_TICK_MS);
    act(() => root.unmount());
  });

  it('★ タブが隠れたら止まる', () => {
    const h = harness();
    const { root, read } = mount(1000, h.deps);
    expect(h.running).toBe(1);
    act(() => h.setHidden(true));
    expect(h.running).toBe(0);
    // 止まっているので、時計を進めて発火させても何も起きない。
    const frozen = read();
    act(() => {
      h.advance(5000);
      h.fire();
    });
    expect(read()).toBe(frozen);
    act(() => root.unmount());
  });

  it('★ 戻ったら、その場で 1 回進めてから再開する', () => {
    const h = harness();
    const { root, read } = mount(1000, h.deps);
    act(() => h.setHidden(true));
    const frozen = read();
    act(() => {
      h.advance(30_000); // 隠れている間に 30 秒進んだ
      h.setHidden(false);
    });
    // 再開を待たずに、その場で追いついていること。
    expect(read()).toBe(frozen + 30_000);
    expect(h.running).toBe(1);
    act(() => root.unmount());
  });

  it('隠れて戻ってもタイマーは 1 本だけ (二重起動しない)', () => {
    const h = harness();
    const { root } = mount(1000, h.deps);
    act(() => h.setHidden(false)); // 見えている状態で再度 visible イベント
    act(() => h.setHidden(false));
    expect(h.running).toBe(1);
    act(() => root.unmount());
  });

  it('★ 片付ける (タイマーも購読も残さない)', () => {
    const h = harness();
    const { root } = mount(1000, h.deps);
    expect(h.running).toBe(1);
    act(() => root.unmount());
    expect(h.running).toBe(0);
    expect(h.unsubscribed).toBe(1);
  });

  it('最初の値は現在時刻 (0 やプレースホルダを描かない)', () => {
    const h = harness();
    const { root, read } = mount(1000, h.deps);
    expect(read()).toBe(1_000_000);
    act(() => root.unmount());
  });
});
