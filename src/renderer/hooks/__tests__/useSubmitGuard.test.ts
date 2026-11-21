/** @vitest-environment jsdom */
/**
 * `useSubmitGuard` —— 押しただけの操作を 1 度に 1 つしか走らせない (パス 124)。
 *
 * 見るのは 3 つ: 同じ tick の 2 度目は落ちる (戻り値 false・task は 1 度)、
 * 終われば次は走る、task が投げても関門は開き直る (拒否は握り潰さない)。
 */
import { describe, expect, it } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useSubmitGuard, type SubmitGuard } from '../useSubmitGuard';

// act() が state の更新を描画まで流すように (無いと警告が出て、更新が act を抜けるまで届かない)。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onReady }: { onReady: (g: SubmitGuard) => void }): ReactElement | null {
  onReady(useSubmitGuard());
  return null;
}

async function mountGuard(): Promise<{ latest: () => SubmitGuard; unmount: () => void }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let guard: SubmitGuard | null = null;
  await act(async () => {
    root.render(createElement(Probe, { onReady: (g) => { guard = g; } }));
  });
  return {
    latest: () => {
      if (guard === null) throw new Error('guard not ready');
      return guard;
    },
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe('useSubmitGuard', () => {
  it('★ 同じ tick の 2 度目は走らせない (task は 1 度・2 度目は false)', async () => {
    const { latest, unmount } = await mountGuard();
    let calls = 0;
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const task = async (): Promise<void> => { calls += 1; await pending; };
    let first: Promise<boolean> | null = null;
    let second: Promise<boolean> | null = null;
    try {
      await act(async () => {
        first = latest().run(task);
        second = latest().run(task);
        // 関門が効いていれば task は 1 度しか始まらない。**先に件数を見る** —— 2 度目の await を
        // 先に置くと、関門が無い版では 2 度目が task (release 待ち) を待って 30 秒で切れ、
        // 落ちる理由が「timeout」になる (対照 B の実測 2026-09-09)。
        expect(calls).toBe(1);
        // 2 度目は即座に落ちる (task を待たない)
        expect(await second).toBe(false);
      });
      // act を抜けて描画が進んだ後 —— 1 度目がまだ走っている間は busy (ボタンは disabled)
      expect(latest().busy).toBe(true);
      await act(async () => {
        release();
        expect(await first).toBe(true);
      });
      expect(latest().busy).toBe(false);
    } finally {
      // 落ちても task を解放して外す (宙に浮いた act が次の検査を巻き添えにしない)
      release();
      unmount();
    }
  });

  it('前の実行が終われば次は走る (対照)', async () => {
    const { latest, unmount } = await mountGuard();
    let calls = 0;
    await act(async () => {
      expect(await latest().run(async () => { calls += 1; })).toBe(true);
    });
    await act(async () => {
      expect(await latest().run(async () => { calls += 1; })).toBe(true);
    });
    expect(calls).toBe(2);
    unmount();
  });

  it('task が投げても関門は開き直り、拒否はそのまま返る (握り潰さない)', async () => {
    const { latest, unmount } = await mountGuard();
    await act(async () => {
      await expect(latest().run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    });
    expect(latest().busy).toBe(false);
    let ran = false;
    await act(async () => {
      expect(await latest().run(() => { ran = true; })).toBe(true);
    });
    expect(ran).toBe(true);
    unmount();
  });
});
