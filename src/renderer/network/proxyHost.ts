/**
 * `proxy.mamori` の薄い壁 (2026-11-10 · MG-055)。
 *
 * ブラウザの口 (IndexedDB / `fetch` / `Response` / `Headers` / 保管庫) は Mamori の `extern pure global` にできない
 * (宣言した名前が副作用の判断を持つ口に届くため) ので、ここへ閉じ込める。**判断は持たない** ——
 * 値を渡して結果を返す・渡された物をそのまま書くだけ。判断 (宛先の検査・平文 http と userinfo とポートの拒否・
 * 封筒の解析・MAC の 3 状態・転送への非追随・応答サイズの上限・失敗本文の伏字) は `proxy.mamori` が持つ。
 *
 * ここに残る「判断らしい物」は 1 つだけで、`hostFlattenHeaders` が `Headers` / 配列 / 物の 3 形を 1 つの物にならす
 * 機械的な正規化 (どれを通すか・捨てるかの判断は無い —— 元の実装と同じ)。
 */
import { egressInit } from '../../shared/httpLimits';
import { getVault } from '../security/vault';

/**
 * **この DB は平文である。** `sharedSecret` (Worker への簡易認証) もここに入る (経緯と脅威の見積もりは `proxy.mamori`)。
 */
const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'proxy';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Stryker disable next-line ConditionalExpression: DB_VERSION が 1 のあいだ onupgradeneeded は
      // 新規作成時にしか走らず contains は常に false。将来のバージョン上げに備えた防御 (等価変異)。
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

// Stryker disable next-line BlockStatement: 本体を空にすると undefined を返すが、
// `await undefined` は即座に解決し、fake-indexeddb ではトランザクションが
// 別途コミットされるため観測差が出ない (等価変異)。
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
  });
}

/** 保管された生の値を読む。**開けなければ投げる** (「無い」と「確認できない」を混ぜない —— 判断は `proxy.mamori`)。 */
export async function hostReadStoredRecord(): Promise<unknown> {
  const db = await openDb();
  try {
    const cfg = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    return cfg ?? null;
  } finally {
    db.close();
  }
}

/** 渡された記録をそのまま書く (`null` なら消す)。何を書くかは呼び手が決めている。 */
export async function hostWriteStoredRecord(record: object | null): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    // Stryker disable next-line ConditionalExpression: 削除の代わりに null を put しても、
    // 読み出し側 (`reviewStoredProxyConfig`) が null を弾いて同じ「設定なし」になるため観測差が無い。
    // レコードを残さないほうが正しいので delete を維持する。
    if (record === null) tx.objectStore(STORE).delete(KEY);
    else tx.objectStore(STORE).put(record, KEY);
    await txDone(tx);
  } finally {
    db.close();
  }
}

/** 保管庫が解錠中か (事実だけ)。 */
export function hostVaultUnlocked(): boolean {
  return getVault().isUnlocked();
}

/** master 鍵で認証タグを付ける (タグは不透明な物で、呼び手は中を読まない)。 */
export function hostAuthTag(domain: string, data: string): Promise<unknown> {
  return getVault().authTag(domain, data);
}

/** タグが今の `data` を認証しているか (形が違うタグは保管庫が false にする)。 */
export function hostVerifyAuthTag(domain: string, data: string, tag: unknown): Promise<boolean> {
  return getVault().verifyAuthTag(domain, data, tag as Parameters<ReturnType<typeof getVault>['verifyAuthTag']>[2]);
}

/** 物の欄を 1 つ読む (呼び手は物であることを先に確かめている —— 型は `unknown` で、物でない値は渡さない約束)。 */
export function hostField(value: unknown, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

/** `RequestInit.headers` の 3 形 (`Headers` / 配列 / 物) を 1 つの平らな物にならす。 */
export function hostFlattenHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const flat: Record<string, string> = {};
  // Stryker disable next-line ConditionalExpression: headers が無いまま中へ入っても、
  // instanceof も Array.isArray も false で `Object.assign(flat, undefined)` は無操作なので同じ結果。
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => {
        flat[k] = v;
      });
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) flat[k] = v;
    } else {
      Object.assign(flat, headers as Record<string, string>);
    }
  }
  return flat;
}

/**
 * 呼ぶ時点の `fetch` を呼ぶ。**`fetch` を値として束縛しない** (後から差し替えた物にも追随する)。
 * 転送に追随しない規則 (`egressInit`) はこの壁でも掛ける (冪等) —— 別の呼び手がこの口を使っても転送へ追随しない。
 */
export function hostFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, egressInit({ ...init }));
}

/** `Response` を作る (本文を持てない status の判断は呼び手が `null` を渡して表す)。 */
export function hostMakeResponse(body: string | null, status: number, headers: Record<string, string>): Response {
  return new Response(body, { status, headers });
}
