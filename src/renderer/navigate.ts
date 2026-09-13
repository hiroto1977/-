/**
 * アプリ内の画面遷移 — イベント名を 1 箇所に閉じ込める。
 *
 * `servicehub:navigate` という文字列が 6 つの画面と App.tsx に散っていた。
 * 綴りを 1 文字間違えても TypeScript は何も言わず、その導線だけが黙って
 * 効かなくなる。名前をここでしか書かないようにして、綴りの取り違えを型にする。
 *
 * **遷移先で最初にすること (intent)** も同じ入口で渡す。士業のページから
 * 「書類スタジオでこの書式を開く」、経営サマリーから「計算書類を経営サマリーの
 * 数値で組む」のように、遷移先の画面が開いた直後に 1 度だけ行う操作は、
 * URL のハッシュに混ぜず (App.tsx のハッシュ同期は ServiceId だけを読む)、
 * このモジュールが 1 件だけ預かる。遷移先の画面が mount 時に
 * `takeNavigationIntent` で受け取ると消える — 後から別の経路で同じ画面を
 * 開いたときに古い指示が発火しない。
 */

import type { ServiceId } from '../shared/serviceId';

const NAVIGATE_EVENT = 'servicehub:navigate';

/** 遷移先で最初に行う操作。 */
export type NavigationAction =
  /** 書類スタジオ: 計算書類を経営サマリーの数値から組む (取り込みパネルを開く)。 */
  | 'import-overview'
  /** 経営サマリー: 金融機関等提出用の書面を開いた状態で表示する。 */
  | 'bank-sheet';

export interface NavigationIntent {
  /** 書類スタジオで開く書類 (書式 id / `kessan` と 1 点ずつの `kessan-pl` `kessan-bs` `kessan-equity` `kessan-notes` / `teikan-kk` / `teikan-gk` / `shugyo`)。 */
  readonly doc?: string;
  /** 書類スタジオの書式検索に入れる語 (士業とやり取り中の書類の題名など)。 */
  readonly query?: string;
  readonly action?: NavigationAction;
}

let pending: { readonly serviceId: ServiceId; readonly intent: NavigationIntent } | null = null;

/**
 * サイドバーを介さずに別サービスの画面へ移動する。
 * `intent` を付けなければ預かっている指示は捨てる (古い指示を持ち越さない)。
 */
export function navigateTo(serviceId: ServiceId, intent?: NavigationIntent): void {
  pending = intent === undefined ? null : { serviceId, intent };
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: serviceId }));
}

/**
 * 遷移先の画面が mount 時に呼ぶ。自分宛ての指示があれば返して消す。
 * 別の画面宛て・指示なしなら null (預かっている物はそのまま)。
 */
export function takeNavigationIntent(serviceId: ServiceId): NavigationIntent | null {
  if (pending === null || pending.serviceId !== serviceId) return null;
  const { intent } = pending;
  pending = null;
  return intent;
}

/** 検査用: 預かっている指示を捨てる。 */
export function _resetNavigationIntentForTests(): void {
  pending = null;
}

/** 遷移要求を受け取る。戻り値を呼ぶと購読を解除する（useEffect の cleanup 用）。 */
export function onNavigate(handler: (serviceId: string) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<unknown>).detail;
    if (typeof detail === 'string') handler(detail);
  };
  window.addEventListener(NAVIGATE_EVENT, listener);
  return () => window.removeEventListener(NAVIGATE_EVENT, listener);
}
