/**
 * **開いた窓の焦点の道** (2026-10-07 · パス 506) —— 開いたら中へ・Esc で閉じる・閉じたら元へ戻す。
 *
 * ## なぜ要るか (実測)
 *
 * パス 503 / 504 は**開く前**の画面しか測っていなかった。浮いた AI コンシェルジュ (`role="dialog"`) を
 * キーボードで開くと (2026-10-07 · 実機の Chromium):
 *
 * | 操作 | 直す前 |
 * | --- | --- |
 * | 🤖 に焦点を置いて Enter | 焦点は 🤖 に残る (スマホでは 🤖 が隠れるので **body へ落ちる**) |
 * | その直後に Tab | **窓の中へ入らず** 文書の外 (次に Shift+Tab しか届かない —— 窓が 🤖 より前に描かれていた) |
 * | Esc | **閉じない** (ドロワーは閉じるのに) |
 * | 見出しの ✕ で閉じる | 焦点は **body** (元の 🤖 へ戻らない) |
 * | 「要望リストの消去の確認」(`alertdialog`) が出る | 焦点は押したボタンに残り、Esc で消えない |
 *
 * WCAG 2.4.3 (焦点の順序) · 2.1.2 (キーボードの罠を作らないだけでなく、入れること) · WAI-ARIA APG の dialog:
 * 開いたら中の 1 つへ焦点を運び、Esc で閉じ、閉じたら開いた物へ戻す。
 *
 * ## 規則は 1 つ
 *
 * `role="dialog"` / `role="alertdialog"` を描く部品は、この hook を通す (`dialogSitesCensus.test.ts` が構文木で
 * 両方向に見る)。最初に置く焦点は印 `data-dialog-initial` を持つ操作子 (alertdialog では**取り消す側**を印に —— APG は
 * 「最も害の少ない操作」へ置くと言う)、無ければ最初の操作子。戻す先は名指し (`returnTo`) が文書に残っていればそれ、
 * 無ければ開いた時に焦点を持っていた物。Esc は IME の取り消しと見分ける (`keyIntent.ts` の判定 1 つ)。
 *
 * ## ここが見ない物
 *
 * 焦点を窓の中に**閉じ込める**ことはしない (浮いたコンシェルジュは非モーダル —— 画面は操作できるままが正しい)。
 * モーダルな暗幕 (スマホのドロワー) は `App.tsx` が本文を `inert` にして閉じ込める。
 */
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { isCancelEscape } from '../keyIntent';

/** 開いたとき最初に焦点を置く操作子の印。 */
export const DIALOG_INITIAL_MARK = 'data-dialog-initial';

/** キーボードで焦点を取れる物 (無効化された物は除く)。 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** 開いたとき最初に焦点を置く物: 印を持つ操作子が在ればそれ、無ければ最初の操作子、1 つも無ければ null。 */
export function initialFocusTarget(root: ParentNode | null): HTMLElement | null {
  if (root === null) return null;
  const marked = root.querySelector<HTMLElement>(`[${DIALOG_INITIAL_MARK}]`);
  if (marked !== null && !isDisabled(marked)) return marked;
  for (const el of root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) if (!isDisabled(el)) return el;
  return null;
}

/** 閉じたとき焦点を戻す先: 名指しの先が文書に在ればそれ、無ければ開いた時に焦点を持っていた物 (body は除く)、無ければ null。 */
export function restoreTarget(returnTo: HTMLElement | null, opener: Element | null): HTMLElement | null {
  if (returnTo !== null && returnTo.isConnected && !isDisabled(returnTo)) return returnTo;
  if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body && !isDisabled(opener)) return opener;
  return null;
}

export interface DialogFocusOptions {
  /** 窓が開いているか (false → true で中へ運び、true → false で戻す)。 */
  readonly open: boolean;
  /** Esc で閉じる手 (窓の状態を持つ側が渡す)。 */
  readonly onClose: () => void;
  /** 閉じたとき焦点を戻す先 (開いた物)。省略すると開いた時に焦点を持っていた物。 */
  readonly returnTo?: RefObject<HTMLElement | null>;
}

export interface DialogFocusHandlers {
  /** 窓の要素に付ける。Esc (IME の取り消しではない) で `onClose` を呼び、外 (App の Esc = ドロワーを閉じる) へは伝えない。 */
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}

/**
 * 窓 (`ref`) が開いたら中へ焦点を運び、閉じたら戻す。Esc で閉じる手を返す。
 * 状態 (`open`) は呼び手が持つ —— この hook は焦点だけを扱う (窓の中に閉じ込めない)。
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, opts: DialogFocusOptions): DialogFocusHandlers {
  const { open, returnTo } = opts;
  const onCloseRef = useRef(opts.onClose);
  onCloseRef.current = opts.onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    initialFocusTarget(ref.current)?.focus();
    return () => {
      // 閉じた (`open` が false になった) か、窓ごと外れたとき。描き直しの後に走るので、戻す先 (🤖 など) は既に描かれている。
      restoreTarget(returnTo?.current ?? null, opener)?.focus();
    };
  }, [open, ref, returnTo]);

  return {
    onKeyDown: (e) => {
      if (!isCancelEscape(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    },
  };
}
