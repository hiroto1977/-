import { useEffect, useState } from 'react';

/**
 * 毎秒 (既定) 進む時計。**画面を動かすためだけの刻み**である。
 *
 * ## 描画の刻みと、取得の刻みは別
 *
 * 「秒単位でリアルタイム更新」を素朴に作ると、1 秒ごとに元データを
 * 取りに行く形になりがちだが、それは有料 API の上限に当たり、
 * ブラウザ版では利用者の鍵を 1 秒ごとに使う。**取得は別の刻み**で行い、
 * ここは時刻由来の値 (`shared/realtimeProjection.ts`) を進めるだけにする。
 *
 * ## タブが隠れたら止める
 *
 * このアプリはタブ非表示で自動施錠する (`security/autoLock.ts`)。見えて
 * いない画面のために 1 秒タイマーを回し続けるのは、電池を削るだけで
 * 誰も得をしない。`visibilitychange` で止め、戻ったら**その場で 1 回
 * 進めてから**再開する —— 再開だけだと最大 1 秒ぶん古い値が見えるため。
 *
 * ## テストの差し込み口
 *
 * `autoLock.ts` と同じ流儀で、時計とタイマーと購読を注入できる。
 * 仮想 DOM も本物のタイマーも要らずに「1 秒進んだら値が進む」ことを測れる。
 */
export interface RealtimeTickDeps {
  now?: () => number;
  setIntervalFn?: (cb: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  /** 可視状態の購読。解除関数を返すこと。 */
  subscribeVisibility?: (cb: () => void) => () => void;
  isHidden?: () => boolean;
}

/** 既定の刻み。利用者への表示は秒単位なので 1 秒。 */
export const DEFAULT_TICK_MS = 1000;

function defaultSubscribeVisibility(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * いまの時刻 (ms) を返し、`intervalMs` ごとに進める。
 *
 * `intervalMs` に 0 以下や数でない値を渡したら既定へ落とす —— 0 を渡すと
 * `setInterval` が実質毎フレームになり、画面が固まる。
 */
export function useRealtimeTick(intervalMs: number = DEFAULT_TICK_MS, deps: RealtimeTickDeps = {}): number {
  const now = deps.now ?? (() => Date.now());
  const setIntervalFn = deps.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms));
  const clearIntervalFn = deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const subscribeVisibility = deps.subscribeVisibility ?? defaultSubscribeVisibility;
  const isHidden = deps.isHidden ?? defaultIsHidden;
  const period = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_TICK_MS;

  const [at, setAt] = useState<number>(() => now());

  useEffect(() => {
    let handle: unknown = null;

    const stop = (): void => {
      if (handle !== null) {
        clearIntervalFn(handle);
        handle = null;
      }
    };
    const start = (): void => {
      if (handle !== null) return; // 二重起動しない
      handle = setIntervalFn(() => setAt(now()), period);
    };

    const sync = (): void => {
      if (isHidden()) {
        stop();
        return;
      }
      // 戻ってきたら**その場で 1 回進める**。再開だけだと最大 1 周期ぶん古い。
      setAt(now());
      start();
    };

    sync();
    const unsubscribe = subscribeVisibility(sync);
    return () => {
      unsubscribe();
      stop();
    };
    // deps の関数は呼び出し側が毎回作り直しうるので、周期だけを依存にする
    // (毎レンダーで張り直すと 1 秒ごとにタイマーが作り直され、刻みがぶれる)。
  }, [period]);

  return at;
}
