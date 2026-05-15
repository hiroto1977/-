/**
 * BYO Proxy — CORS ブロックされる API (Notion / Atlassian / Cloudflare 等)
 * をユーザー自身が運用するプロキシ経由で呼び出すための薄いラッパー。
 *
 * プロトコル (docs/PROXY_EXAMPLE.md §1):
 *   client → proxy:   POST <proxy-url>
 *     Content-Type: application/json
 *     X-Proxy-Auth: <secret>   (optional)
 *     Body: { url, method, headers, body }
 *
 *   proxy → upstream: 透過呼び出し
 *
 *   proxy → client:   200 OK
 *     Body: { status, headers, body }
 */

const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'proxy';

export interface ProxyConfig {
  /** Cloudflare Worker / Vercel Function 等の URL */
  readonly url: string;
  /** 任意の共有秘密 (HMAC ヘッダーで送信) */
  readonly sharedSecret?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('preferences open failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
  });
}

export async function getProxyConfig(): Promise<ProxyConfig | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  const cfg = await new Promise<ProxyConfig | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as ProxyConfig | undefined);
    req.onerror = () => reject(req.error ?? new Error('get failed'));
  });
  db.close();
  return cfg ?? null;
}

export async function setProxyConfig(cfg: ProxyConfig | null): Promise<void> {
  if (cfg !== null) {
    if (typeof cfg.url !== 'string' || cfg.url.length === 0 || cfg.url.length > 1024) {
      throw new Error('proxy URL が不正です');
    }
    try {
      const u = new URL(cfg.url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('proxy URL は http(s) スキームのみ対応');
      }
    } catch (e) {
      if (e instanceof Error && /proxy URL/.test(e.message)) throw e;
      throw new Error('proxy URL の形式が不正です');
    }
    if (cfg.sharedSecret !== undefined && (typeof cfg.sharedSecret !== 'string' || cfg.sharedSecret.length > 256)) {
      throw new Error('共有秘密が不正です (256 字以内)');
    }
  }
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  if (cfg === null) tx.objectStore(STORE).delete(KEY);
  else tx.objectStore(STORE).put(cfg, KEY);
  await txDone(tx);
  db.close();
}

interface ProxyResponseEnvelope {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

/** プロキシ経由で target URL を呼び出し、Response 互換オブジェクトを返す。 */
export async function fetchViaProxy(targetUrl: string, init: RequestInit, cfg: ProxyConfig): Promise<Response> {
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    throw new Error('target URL is required');
  }
  // Defense-in-depth: reject obviously bad target URLs before forwarding.
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('target URL の形式が不正です');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('target URL は http(s) のみ対応');
  }

  // Convert RequestInit headers to a flat object.
  const flatHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        flatHeaders[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) flatHeaders[k] = v;
    } else {
      Object.assign(flatHeaders, init.headers as Record<string, string>);
    }
  }

  const envelope = {
    url: targetUrl,
    method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
    headers: flatHeaders,
    body: typeof init.body === 'string' ? init.body : undefined,
  };

  const proxyHeaders: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.sharedSecret && cfg.sharedSecret.length > 0) {
    proxyHeaders['x-proxy-auth'] = cfg.sharedSecret;
  }

  const proxyRes = await fetch(cfg.url, {
    method: 'POST',
    headers: proxyHeaders,
    body: JSON.stringify(envelope),
  });

  if (!proxyRes.ok) {
    const body = await proxyRes.text().catch(() => '');
    throw new Error(`proxy ${proxyRes.status}: ${body.slice(0, 200)}`);
  }

  const env = (await proxyRes.json()) as ProxyResponseEnvelope;
  // Reconstruct a Response that callers can treat normally.
  return new Response(env.body ?? '', {
    status: typeof env.status === 'number' ? env.status : 502,
    headers: env.headers ?? {},
  });
}

/** Service id → CORS 直接呼び出しが不可能で proxy 必須かどうか。 */
export const PROXY_REQUIRED_SERVICES: ReadonlySet<string> = new Set([
  'notion',
  'atlassian',
  'cloudflare',
]);
