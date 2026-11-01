/**
 * PKCE の一時秘密を置く host の口。pkceSession.mamori が `extern pure { … } from "./pkceSessionHost"` で読む。
 *
 * `sessionStorage` は触れることが投げる記憶の口で、Mamori では `extern pure global` にできない (T-249)。
 * 3 つの関数は引数の鍵と値をそのまま渡すだけで、鍵の組み立て (`pkce.` の接頭辞) は pkceSession.mamori が持つ。
 */
export function hostSetItem(key: string, value: string): void {
  sessionStorage.setItem(key, value);
}

export function hostGetItem(key: string): string | null {
  return sessionStorage.getItem(key);
}

export function hostRemoveItem(key: string): void {
  sessionStorage.removeItem(key);
}
