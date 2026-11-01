// 生成物 —— src/renderer/security/autoLock.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * 自動ロックの管理。
 *
 * BROWSER_REDESIGN.md §3.1 / §4.1 で「席を離れた / タブを隠した時に自動ロック」が脅威モデルの中核。
 * 本モジュールは Vault と分離してテスト可能な形で抽象化する。
 *
 * 動作:
 *   - `visibilitychange` で hidden → タイマー開始 (デフォルト 5 分)
 *   - hidden 状態が継続して閾値超過 → vault.lock() + onLocked() コールバック
 *   - visible に戻ったらタイマー解除
 *   - 別途、操作 idle 15 分でもロック (mousemove / keydown / touchstart で reset)
 *
 * テスト seam: `now` / `setTimeoutFn` / `clearTimeoutFn` / `addListener` / `removeListener` を注入できる。
 *
 * ## Mamori で書いてある (2026-11-01 · MG-015)
 *
 * 元は TypeScript。時計は `extern pure global Date`、タイマーと DOM の口は型の戻しだけを持つ小さな `autoLockHost.ts` から読む
 * (`window` / `document` は網・記憶・DOM の口をメンバに持つので `extern pure global` にできない —— 手探りで見つけた穴 T-249)。入れ子の関数宣言は `const` の arrow へ、複合代入は `x = x + 1` へ替えた。
 */

import { hostSetTimeout, hostClearTimeout, hostHasDocument, hostHasWindow, hostDocumentHidden, hostDocumentTarget, hostWindowTarget } from './autoLockHost';

export interface AutoLockDeps {
  now?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
  addListener?: (target: EventTarget, type: string, cb: EventListener) => void;
  removeListener?: (target: EventTarget, type: string, cb: EventListener) => void;
}

export interface AutoLockOptions {
  /** ロック実行関数 (通常は vault.lock) */
  readonly onLock: () => void;
  /** タブが hidden になってからロックまでの猶予 (ms)。 default 5 min */
  readonly hiddenTimeoutMs?: number;
  /** 最終操作からロックまでの猶予 (ms)。default 15 min */
  readonly idleTimeoutMs?: number;
}

const DEFAULT_HIDDEN_MS = 5 * 60 * 1000;

const DEFAULT_IDLE_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'pointerdown'];

export interface AutoLockHandle {
  /** リスナー / タイマーを全解除。Vault のロック解除時にも呼ぶ。 */
  readonly dispose: () => void;
  /** UI からアクセス可能な内部状態 (テスト用) */
  readonly debugState: () => { lastActivity: number; hiddenSince: number | null };
}

/**
 * 現に動いている自動ロックの数。
 *
 * セキュリティ診断 (`SecurityPage` → `buildDbSecurityReport`) は自動ロックの有無を入力に取る。2026-08 監査の時点で呼び出し元は
 * `false` を**固定で**渡し、実際にはブラウザ版で自動ロックが動いているのに**診断が利用者に「未対応」と告げていた**。
 * 観測できる事実は観測する。`startAutoLock` が 1 つずつ印を足し、`dispose` がその印を外すだけの素朴な集合。
 * (元は数を増減していたが、Mamori に最上位の `let` が無いので集合にした。リセットの後に古い `dispose` が来ても数が負にならない。)
 */
const activeStarts: Set<object> = new Set();

/**
 * 計数が変わったことを知りたい人たち。
 *
 * 計数を**読むだけ**にしていたら、診断画面が**動き出す前に読んで**いた (2026-08-25 実測: アプリ内で移動して開くと自動ロック ✅、
 * 直接ロードして解錠すると ⚠)。React は子の効果を親より先に走らせ、`SecurityPage` は初回描画中に読むので
 * `startAutoLock` はまだ呼ばれていない。変化を伝える口を置き、画面は `useSyncExternalStore` で購読する。
 */
const listeners: Set<() => void> = new Set();

const notifyAutoLockActive = () => {
  for (const cb of listeners) {
    cb();
  }
};

/** 自動ロックが 1 つ以上動いているか。 */
export function isAutoLockActive(): boolean {
  return activeStarts.size > 0;
}

/** 計数の変化を購読する。戻り値を呼ぶと解除。 */
export function subscribeAutoLockActive(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
  listeners.delete(cb);
};
}

/** テスト用: 計数を 0 に戻す。 */
export function _resetAutoLockActiveForTests(): void {
  activeStarts.clear();
  notifyAutoLockActive();
}

export function startAutoLock(opts: AutoLockOptions, deps: AutoLockDeps = {}): AutoLockHandle {
  const now = deps.now ?? (() => Date.now());
  const setTimeoutFn = deps.setTimeoutFn ?? ((cb, ms) => hostSetTimeout(cb, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => hostClearTimeout(h));
  const addListener = deps.addListener ?? ((t, kind, cb) => t.addEventListener(kind, cb));
  const removeListener = deps.removeListener ?? ((t, kind, cb) => t.removeEventListener(kind, cb));
  const hiddenMs = opts.hiddenTimeoutMs ?? DEFAULT_HIDDEN_MS;
  const idleMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_MS;
  const startToken = {};
  activeStarts.add(startToken);
  notifyAutoLockActive();
  let lastActivity = now();
  let hiddenSince: number | null = null;
  let hiddenTimer: unknown = null;
  let idleTimer: unknown = null;
  let disposed = false;
  // dispose → リスナー → onActivity → lockAndDispose → dispose と輪になるので (Mamori は前方参照を断る)、先に空の関数で宣言して後で据える。
  let activityListener: EventListener = () => {

};
  let visibilityListener: EventListener = () => {

};
  const dispose = () => {
  if (disposed) return;
  disposed = true;
  activeStarts.delete(startToken);
  notifyAutoLockActive();
  if (hiddenTimer !== null) {
    clearTimeoutFn(hiddenTimer);
  }
  if (idleTimer !== null) {
    clearTimeoutFn(idleTimer);
  }
  if (hostHasDocument()) {
    removeListener(hostDocumentTarget(), 'visibilitychange', visibilityListener);
  }
  if (hostHasWindow()) {
    for (const ev of ACTIVITY_EVENTS) {
      removeListener(hostWindowTarget(), ev, activityListener);
    }
  }
};
  const lockAndDispose = () => {
  if (disposed) return;
  opts.onLock();
  dispose();
};
  const scheduleIdle = () => {
  if (idleTimer !== null) {
    clearTimeoutFn(idleTimer);
  }
  idleTimer = setTimeoutFn(lockAndDispose, idleMs);
};
  const onActivity = () => {
  // 時計が自動ロックの時間を超えて進んでいたら、タイマーの発火を待たずにその場でロックする (パス 524 · T-080)。
  // スリープ・サスペンド・背景のタイマー間引きでは、タイマーが遅れている間に最初の操作が届くと、
  // 直前の「再設定」が期限切れの金庫を延命させた (実測: 8 時間後の mousemove 1 回で onLock 0 回)。
  if (now() - lastActivity >= idleMs) {
    lockAndDispose();
    return;
  }
  lastActivity = now();
  scheduleIdle();
};
  const onVisibilityChange = () => {
  if (!hostHasDocument()) return;
  if (hostDocumentHidden()) {
    hiddenSince = now();
    hiddenTimer = setTimeoutFn(lockAndDispose, hiddenMs);
  } else {
    // 隠れていた時間が上限を超えていたら、タイマーを待たずにロックする (T-080)。
    const wasHiddenFor = hiddenSince === null ? 0 : now() - hiddenSince;
    if (wasHiddenFor >= hiddenMs) {
      lockAndDispose();
      return;
    }
    hiddenSince = null;
    if (hiddenTimer !== null) {
      clearTimeoutFn(hiddenTimer);
      hiddenTimer = null;
    }
    onActivity();
  }
};
  activityListener = () => onActivity();
  visibilityListener = () => onVisibilityChange();
  if (hostHasDocument()) {
    addListener(hostDocumentTarget(), 'visibilitychange', visibilityListener);
  }
  if (hostHasWindow()) {
    for (const ev of ACTIVITY_EVENTS) {
      addListener(hostWindowTarget(), ev, activityListener);
    }
  }
  scheduleIdle();
  return { dispose, debugState: () => ({ lastActivity, hiddenSince }) };
}
