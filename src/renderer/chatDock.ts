/**
 * AI チャット欄をどこに置くか (2026-09-26)。
 *
 * 「すっきり」のデザインで**広い画面**なら、コンシェルジュはサイドバーと画面の間の**列**になる
 * (サイドバー | AI チャット | 画面 の 3 列)。それ以外 (かわいい・タブレット・スマホ) は、
 * 今までどおり右下の 🤖 から開く**浮いた窓**。
 *
 * 判定は**ここ 1 か所** —— CSS にも同じ幅を書くと、ずれたとき (拡大率・端数) に列が崩れる
 * (欄だけが 2 列目に残り、画面が次の行へ落ちる)。App.tsx はこの答えで `.chat-docked` を付け、
 * CSS はその組の有無だけを見る。
 */
import { useSyncExternalStore } from 'react';
import { currentDesign, subscribeDesign, type DesignChoice } from './theme';

/**
 * 3 列にする画面の幅。サイドバー 248px + 欄 360px + 画面の最小 ~590px。
 * 1280px の画面で画面側に 672px 残る —— このアプリの画面は 412px (スマホ) でも崩れない作りなので足りる。
 */
export const CHAT_DOCK_MIN_WIDTH = 1200;
export const CHAT_DOCK_QUERY = `(min-width: ${CHAT_DOCK_MIN_WIDTH}px)`;

/** 列にするか。デザインと画面の幅だけで決まる (純関数 —— 検査はここを直接叩く)。 */
export function shouldDockChat(design: DesignChoice, wide: boolean): boolean {
  return design === 'clean' && wide;
}

type MatchMediaHost = { matchMedia?: (query: string) => MediaQueryList };

/**
 * `matchMedia` の答え。**無い・投げる環境 (jsdom・古い WebView) は `false`** —— 列にできるか
 * 分からないときは浮いた窓 (どの幅でも崩れない形) に倒す。
 */
export function mediaMatches(query: string, win: MatchMediaHost = typeof window === 'undefined' ? {} : window): boolean {
  if (typeof win.matchMedia !== 'function') return false;
  try {
    return win.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function subscribeMedia(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia(query);
  } catch {
    return () => {};
  }
  if (typeof mql.addEventListener !== 'function') return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** 画面の幅の問いに追随する (窓を広げ狭めすると描き直す)。 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMedia(query, onChange),
    () => mediaMatches(query),
    () => false,
  );
}

/** いま効いているデザイン (設定画面で選び直すと描き直す)。 */
export function useDesign(): DesignChoice {
  return useSyncExternalStore(subscribeDesign, () => currentDesign(), () => currentDesign());
}

/** App.tsx が読む 1 つの答え: チャットを列にするか。 */
export function useChatDocked(): boolean {
  const design = useDesign();
  const wide = useMediaQuery(CHAT_DOCK_QUERY);
  return shouldDockChat(design, wide);
}
