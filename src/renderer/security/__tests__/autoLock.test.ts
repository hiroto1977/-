/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { _resetAutoLockActiveForTests, isAutoLockActive, startAutoLock } from '../autoLock';

interface ListenerEntry {
  target: EventTarget;
  type: string;
  cb: EventListener;
}

/** 観測用テストの依存: タイマーもリスナーも実物を触らない。 */
function stubDeps() {
  return {
    now: () => 1_000_000,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  };
}

function makeHarness() {
  const listeners: ListenerEntry[] = [];
  const onLock = vi.fn();
  let timeoutId = 0;
  const timers = new Map<number, { cb: () => void; ms: number; createdAt: number }>();
  let nowVal = 1_000_000;

  const handle = startAutoLock(
    { onLock, hiddenTimeoutMs: 300_000, idleTimeoutMs: 900_000 },
    {
      now: () => nowVal,
      setTimeoutFn: (cb, ms) => {
        timeoutId += 1;
        timers.set(timeoutId, { cb, ms, createdAt: nowVal });
        return timeoutId;
      },
      clearTimeoutFn: (h) => {
        timers.delete(h as number);
      },
      addListener: (target, type, cb) => listeners.push({ target, type, cb }),
      removeListener: (target, type, cb) => {
        const i = listeners.findIndex((l) => l.target === target && l.type === type && l.cb === cb);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  );

  return {
    handle,
    onLock,
    listeners,
    timers,
    setNow: (ms: number) => { nowVal = ms; },
    advance: (ms: number) => {
      nowVal += ms;
      // Fire any timers whose deadline has now passed (single round).
      const due: number[] = [];
      for (const [id, { ms: mms, createdAt }] of timers.entries()) {
        if (createdAt + mms <= nowVal) due.push(id);
      }
      for (const id of due) {
        const t = timers.get(id);
        timers.delete(id);
        if (t) t.cb();
      }
    },
    fire(target: EventTarget, type: string) {
      for (const l of listeners) {
        if (l.target === target && l.type === type) l.cb(new Event(type));
      }
    },
  };
}

describe('startAutoLock', () => {
  it('installs visibilitychange + activity listeners on document/window', () => {
    const h = makeHarness();
    const types = h.listeners.map((l) => l.type);
    expect(types).toContain('visibilitychange');
    expect(types).toContain('mousemove');
    expect(types).toContain('keydown');
    expect(types).toContain('touchstart');
    expect(types).toContain('pointerdown');
    h.handle.dispose();
  });

  it('schedules idle timer on start', () => {
    const h = makeHarness();
    expect(h.timers.size).toBeGreaterThan(0);
    h.handle.dispose();
  });

  it('fires onLock after idle timeout', () => {
    const h = makeHarness();
    h.advance(900_001); // > 15 min
    expect(h.onLock).toHaveBeenCalled();
  });

  it('does NOT fire onLock if activity resets the idle timer', () => {
    const h = makeHarness();
    h.advance(800_000);
    h.fire(window, 'mousemove'); // reset
    h.advance(800_000);
    expect(h.onLock).not.toHaveBeenCalled();
    h.advance(200_000); // total reach idle threshold from last activity
    expect(h.onLock).toHaveBeenCalled();
  });

  it('dispose() removes all listeners + cancels timers', () => {
    const h = makeHarness();
    h.handle.dispose();
    expect(h.listeners).toHaveLength(0);
    expect(h.timers.size).toBe(0);
  });

  it('only locks once even if multiple timers fire', () => {
    const h = makeHarness();
    h.advance(900_001);
    h.advance(900_001);
    expect(h.onLock).toHaveBeenCalledTimes(1);
  });

  it('uses sensible defaults when timeouts are omitted', () => {
    const onLock = vi.fn();
    const handle = startAutoLock(
      { onLock },
      {
        now: () => 0,
        setTimeoutFn: (_cb, ms) => {
          // Default idle = 15 min = 900_000
          expect(ms).toBe(900_000);
          return 1;
        },
        clearTimeoutFn: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    );
    handle.dispose();
  });
});

describe('isAutoLockActive — 診断が観測できる事実', () => {
  /**
   * 2026-08 監査の回帰。`SecurityPage` は自動ロックの有無を `false` 固定で
   * 診断へ渡しており、ブラウザ版で実際に動いているのに「未対応」と表示していた。
   * 診断の目的は現状を正しく写すことなので、観測できる事実は観測する。
   */
  it('起動していなければ false', () => {
    _resetAutoLockActiveForTests();
    expect(isAutoLockActive()).toBe(false);
  });

  it('起動すると true、dispose で false に戻る', () => {
    _resetAutoLockActiveForTests();
    const handle = startAutoLock({ onLock: () => undefined }, stubDeps());
    expect(isAutoLockActive()).toBe(true);
    handle.dispose();
    expect(isAutoLockActive()).toBe(false);
  });

  it('二重 dispose で false を下回らない (次の起動が検出されなくならない)', () => {
    _resetAutoLockActiveForTests();
    const handle = startAutoLock({ onLock: () => undefined }, stubDeps());
    handle.dispose();
    handle.dispose();
    expect(isAutoLockActive()).toBe(false);
    const again = startAutoLock({ onLock: () => undefined }, stubDeps());
    expect(isAutoLockActive()).toBe(true);
    again.dispose();
  });

  it('dispose し忘れた計数を 0 に戻せる (テスト間の漏れを断つ)', () => {
    _resetAutoLockActiveForTests();
    startAutoLock({ onLock: () => undefined }, stubDeps()); // 意図的に dispose しない
    expect(isAutoLockActive()).toBe(true);
    _resetAutoLockActiveForTests();
    expect(isAutoLockActive()).toBe(false);
  });

  it('2 つ動いていれば 1 つ dispose しても true のまま', () => {
    _resetAutoLockActiveForTests();
    const a = startAutoLock({ onLock: () => undefined }, stubDeps());
    const b = startAutoLock({ onLock: () => undefined }, stubDeps());
    a.dispose();
    expect(isAutoLockActive()).toBe(true);
    b.dispose();
    expect(isAutoLockActive()).toBe(false);
  });
});
