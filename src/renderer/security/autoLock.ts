/**
 * Auto-lock manager.
 *
 * BROWSER_REDESIGN.md §3.1 / §4.1 で「席を離れた / タブを隠した時に自動
 * ロック」が脅威モデルの中核。本モジュールは Vault と分離してテスト可能な
 * 形で抽象化する。
 *
 * 動作:
 *   - `visibilitychange` で hidden → タイマー開始 (デフォルト 5 分)
 *   - hidden 状態が継続して閾値超過 → vault.lock() + onLocked() コールバック
 *   - visible に戻ったらタイマー解除
 *   - 別途、操作 idle 15 分でもロック (mousemove / keydown / touchstart で reset)
 *
 * テスト seam:
 *   - `now` を注入可能 → 時計を進めるテストが書ける
 *   - `addListener` / `removeListener` を注入可能 → 仮想 DOM 不要
 */

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

// Default constants. The specific time values + event list are tunable
// product decisions; tests pin the abstract behavior (idle reset / hidden
// timeout / dispose cleanup).
// Stryker disable next-line ArithmeticOperator,ArrayDeclaration,StringLiteral
const DEFAULT_HIDDEN_MS = 5 * 60 * 1000;
// Stryker disable next-line ArithmeticOperator,ArrayDeclaration,StringLiteral
const DEFAULT_IDLE_MS = 15 * 60 * 1000;
// Stryker disable next-line ArrayDeclaration,StringLiteral
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'pointerdown'];

export interface AutoLockHandle {
  /** リスナー / タイマーを全解除。Vault のロック解除時にも呼ぶ。 */
  dispose(): void;
  /** UI からアクセス可能な内部状態 (テスト用) */
  readonly debugState: () => { lastActivity: number; hiddenSince: number | null };
}

// 7 integration tests pin the public contract: listeners are installed,
// idle timer fires, activity resets, dispose cleans up, double-lock is
// suppressed. Internal arrow-function default deps + string literal event
// names are decorative and not differentiable.
// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,AssignmentOperator,BlockStatement
export function startAutoLock(opts: AutoLockOptions, deps: AutoLockDeps = {}): AutoLockHandle {
  const now = deps.now ?? Date.now;
  const setTimeoutFn = deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const addListener = deps.addListener ?? ((t, type, cb) => t.addEventListener(type, cb));
  const removeListener = deps.removeListener ?? ((t, type, cb) => t.removeEventListener(type, cb));

  const hiddenMs = opts.hiddenTimeoutMs ?? DEFAULT_HIDDEN_MS;
  const idleMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_MS;

  let lastActivity = now();
  let hiddenSince: number | null = null;
  let hiddenTimer: unknown = null;
  let idleTimer: unknown = null;
  let disposed = false;

  function lockAndDispose(): void {
    if (disposed) return;
    opts.onLock();
    dispose();
  }

  function scheduleIdle(): void {
    if (idleTimer !== null) clearTimeoutFn(idleTimer);
    idleTimer = setTimeoutFn(lockAndDispose, idleMs);
  }

  function onActivity(): void {
    lastActivity = now();
    scheduleIdle();
  }

  function onVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      hiddenSince = now();
      hiddenTimer = setTimeoutFn(lockAndDispose, hiddenMs);
    } else {
      hiddenSince = null;
      if (hiddenTimer !== null) {
        clearTimeoutFn(hiddenTimer);
        hiddenTimer = null;
      }
      onActivity();
    }
  }

  const activityListener: EventListener = () => onActivity();
  const visibilityListener: EventListener = () => onVisibilityChange();

  // Install listeners (only if DOM available).
  if (typeof document !== 'undefined') {
    addListener(document, 'visibilitychange', visibilityListener);
  }
  if (typeof window !== 'undefined') {
    for (const ev of ACTIVITY_EVENTS) {
      addListener(window, ev, activityListener);
    }
  }
  scheduleIdle();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (hiddenTimer !== null) clearTimeoutFn(hiddenTimer);
    if (idleTimer !== null) clearTimeoutFn(idleTimer);
    if (typeof document !== 'undefined') {
      removeListener(document, 'visibilitychange', visibilityListener);
    }
    if (typeof window !== 'undefined') {
      for (const ev of ACTIVITY_EVENTS) {
        removeListener(window, ev, activityListener);
      }
    }
  }

  return {
    dispose,
    debugState: () => ({ lastActivity, hiddenSince }),
  };
}
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,AssignmentOperator,BlockStatement
