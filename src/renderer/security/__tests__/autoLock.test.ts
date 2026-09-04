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

// ===== タブを隠したときのロック (2026-08 変異検査で発覚) ==================
//
// `autoLock.ts` は 85 行を `Stryker disable` しており、pragma には
// 「idle timer fires, activity resets, dispose cleans up, double-lock is
// suppressed をテストが固定する」と書いてあった。外して実測すると
// **63 変異体・55.56%・生存 18 / 未到達 18**。
//
// **`onVisibilityChange` は丸ごと未到達だった。** このファイルの冒頭は
// 「席を離れた / タブを隠した時に自動ロック」を脅威モデルの中核と書いている。
// その中核に、テストが 1 つも触れていなかった。
//
// document.hidden を差し替えて、隠す → 戻す の両方向を通す。

/** `document.hidden` を一時的に差し替える。 */
function withHidden<T>(hidden: boolean, fn: () => T): T {
  const orig = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  try {
    return fn();
  } finally {
    delete (document as unknown as Record<string, unknown>).hidden;
    if (orig) Object.defineProperty(Document.prototype, 'hidden', orig);
  }
}

describe('タブを隠したらロックする (脅威モデルの中核)', () => {
  it('hidden になってから猶予を過ぎるとロックする', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    expect(h.onLock).not.toHaveBeenCalled(); // まだ猶予内
    h.advance(300_000);
    expect(h.onLock).toHaveBeenCalledTimes(1);
  });

  it('猶予の手前ではロックしない', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    h.advance(299_999);
    expect(h.onLock).not.toHaveBeenCalled();
  });

  it('猶予内に戻ってくればロックしない (タイマーを解除する)', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    withHidden(false, () => h.fire(document, 'visibilitychange'));
    h.advance(600_000);
    // idle は戻った時点の操作で伸びるので、この時間ではまだ発火しない。
    expect(h.onLock).not.toHaveBeenCalled();
  });

  it('隠した時刻を記録し、戻ったら消す', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    expect(h.handle.debugState().hiddenSince).toBeNull();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    expect(h.handle.debugState().hiddenSince).toBe(1_000_000);
    withHidden(false, () => h.fire(document, 'visibilitychange'));
    expect(h.handle.debugState().hiddenSince).toBeNull();
  });

  it('戻ってきたら操作扱いにして idle を伸ばす', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    h.setNow(1_500_000);
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    withHidden(false, () => h.fire(document, 'visibilitychange'));
    expect(h.handle.debugState().lastActivity).toBe(1_500_000);
  });

  it('隠したままなら idle より先に hidden 側で施錠する', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    h.advance(300_000); // hidden 猶予 5 分 < idle 猶予 15 分
    expect(h.onLock).toHaveBeenCalledTimes(1);
  });

  it('施錠は 1 度だけ (hidden と idle が両方満期でも二重に呼ばない)', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    h.advance(900_000); // 両方の猶予を超える
    expect(h.onLock).toHaveBeenCalledTimes(1);
  });

  // 既定の 5 分と**違う**猶予で確かめる。ハーネスの既定値 (300,000ms) は
  // ちょうど既定と同じなので、`?? DEFAULT` を潰しても差が出ない。
  it('指定した hidden 猶予を使う (既定に落とさない)', () => {
    _resetAutoLockActiveForTests();
    const onLock = vi.fn();
    const scheduled: number[] = [];
    const visListeners: EventListener[] = [];
    const handle = startAutoLock(
      { onLock, hiddenTimeoutMs: 1_234, idleTimeoutMs: 900_000 },
      {
        now: () => 0,
        setTimeoutFn: (_cb, ms) => { scheduled.push(ms); return scheduled.length; },
        clearTimeoutFn: () => undefined,
        addListener: (_t, type, cb) => { if (type === 'visibilitychange') visListeners.push(cb); },
        removeListener: () => undefined,
      },
    );
    // 上の addListener で捕まえた visibilitychange を叩く
    withHidden(true, () => visListeners[0]?.(new Event('visibilitychange')));
    expect(scheduled).toContain(1_234);
    expect(scheduled).not.toContain(5 * 60 * 1000);
    handle.dispose();
  });

  // 満期の timer が 2 回叩かれても onLock は 1 度だけ。`if (disposed) return` を
  // 外すと 2 回呼ばれる (施錠済みの金庫をもう一度施錠しようとする)。
  it('同じ満期コールバックを 2 回叩いても施錠は 1 度だけ', () => {
    _resetAutoLockActiveForTests();
    const onLock = vi.fn();
    const captured: Array<() => void> = [];
    const handle = startAutoLock(
      { onLock, hiddenTimeoutMs: 300_000, idleTimeoutMs: 900_000 },
      {
        now: () => 0,
        setTimeoutFn: (cb) => { captured.push(cb as () => void); return captured.length; },
        clearTimeoutFn: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    );
    const fire = captured[0];
    fire?.();
    fire?.();
    expect(onLock).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('dispose 後に hidden になってもロックしない', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    h.handle.dispose();
    withHidden(true, () => h.fire(document, 'visibilitychange'));
    h.advance(600_000);
    expect(h.onLock).not.toHaveBeenCalled();
  });
});

describe('リスナーの登録と解除', () => {
  it('visibilitychange と操作イベント 4 種を登録する', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    const types = h.listeners.map((l) => l.type).sort();
    expect(types).toEqual(['keydown', 'mousemove', 'pointerdown', 'touchstart', 'visibilitychange']);
  });

  it('visibilitychange は document に、操作イベントは window に付ける', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    const vis = h.listeners.find((l) => l.type === 'visibilitychange');
    const move = h.listeners.find((l) => l.type === 'mousemove');
    expect(vis?.target).toBe(document);
    expect(move?.target).toBe(window);
  });

  it('dispose ですべて外す', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    expect(h.listeners.length).toBe(5);
    h.handle.dispose();
    expect(h.listeners.length).toBe(0);
  });

  it('dispose を 2 回呼んでも壊れない', () => {
    _resetAutoLockActiveForTests();
    const h = makeHarness();
    h.handle.dispose();
    h.handle.dispose();
    expect(h.listeners.length).toBe(0);
  });
});

// ===== 依存を注入しないとき (既定の実物を使う経路) ========================
//
// 既定の `setTimeout` / `addEventListener` を包む矢印関数はすべて未到達だった。
// 実物を使う経路が動くことは、本番で唯一通る道なので押さえておく。

describe('依存を注入しない既定経路', () => {
  it('実物の setTimeout / addEventListener で起動し、dispose で後始末する', () => {
    _resetAutoLockActiveForTests();
    const onLock = vi.fn();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const winAddSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener');
    try {
      const handle = startAutoLock({ onLock, hiddenTimeoutMs: 50, idleTimeoutMs: 50 });
      expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(winAddSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(isAutoLockActive()).toBe(true);
      handle.dispose();
      expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(winRemoveSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(isAutoLockActive()).toBe(false);
    } finally {
      addSpy.mockRestore(); winAddSpy.mockRestore();
      removeSpy.mockRestore(); winRemoveSpy.mockRestore();
    }
  });

  it('実物のタイマーで idle 施錠が起きる', async () => {
    _resetAutoLockActiveForTests();
    const onLock = vi.fn();
    const handle = startAutoLock({ onLock, hiddenTimeoutMs: 10_000, idleTimeoutMs: 10 });
    await new Promise((r) => setTimeout(r, 40));
    expect(onLock).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  // 既定の clearTimeout 経路。dispose が実物のタイマーを本当に止めるかを見る
  // (止めていなければ、解除したはずの自動ロックが後から施錠しに来る)。
  it('dispose すると実物のタイマーも止まる', async () => {
    _resetAutoLockActiveForTests();
    const onLock = vi.fn();
    const handle = startAutoLock({ onLock, hiddenTimeoutMs: 10_000, idleTimeoutMs: 10 });
    handle.dispose();
    await new Promise((r) => setTimeout(r, 40));
    expect(onLock).not.toHaveBeenCalled();
  });

  // 上の検査だけでは「解除している」ことの証拠にならない — `lockAndDispose` が
  // `disposed` で早期 return するため、解除し忘れても onLock は呼ばれない。
  // 実際に clearTimeout を呼んでいることを直接見る。
  it('dispose は実物の clearTimeout を呼ぶ', () => {
    _resetAutoLockActiveForTests();
    const spy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const handle = startAutoLock({ onLock: () => undefined, idleTimeoutMs: 10_000 });
      const before = spy.mock.calls.length;
      handle.dispose();
      expect(spy.mock.calls.length).toBeGreaterThan(before);
    } finally { spy.mockRestore(); }
  });

  it('now を注入しなければ実時計を使う', () => {
    _resetAutoLockActiveForTests();
    const before = Date.now();
    const handle = startAutoLock({ onLock: () => undefined, idleTimeoutMs: 10_000 });
    const { lastActivity } = handle.debugState();
    expect(lastActivity).toBeGreaterThanOrEqual(before);
    expect(lastActivity).toBeLessThan(before + 5_000);
    handle.dispose();
  });

  it('猶予を指定しなければ既定 (hidden 5 分 / idle 15 分) を使う', () => {
    _resetAutoLockActiveForTests();
    const calls: number[] = [];
    const handle = startAutoLock(
      { onLock: () => undefined },
      {
        now: () => 0,
        setTimeoutFn: (_cb, ms) => { calls.push(ms); return calls.length; },
        clearTimeoutFn: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      },
    );
    expect(calls).toContain(15 * 60 * 1000); // idle 既定
    handle.dispose();
  });
});
