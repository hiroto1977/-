/**
 * アプリ内の画面遷移 — イベント名を 1 箇所に閉じ込める。
 *
 * `servicehub:navigate` という文字列が 6 つの画面と App.tsx に散っていた。
 * 綴りを 1 文字間違えても TypeScript は何も言わず、その導線だけが黙って
 * 効かなくなる。名前をここでしか書かないようにして、綴りの取り違えを型にする。
 */

import type { ServiceId } from '../shared/serviceId';

const NAVIGATE_EVENT = 'servicehub:navigate';

/** サイドバーを介さずに別サービスの画面へ移動する。 */
export function navigateTo(serviceId: ServiceId): void {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: serviceId }));
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
