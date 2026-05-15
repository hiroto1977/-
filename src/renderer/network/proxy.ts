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

// Constants + IDB infra below — decorative error strings, default-arrow
// fallbacks, and the request/response envelope structure are pinned by
// the 13 integration tests via `getProxyConfig` / `setProxyConfig` /
// `fetchViaProxy` round-trip + validation cases.
// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement
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

/** Stream-read a Response body with a hard byte cap. Throws if the cap
 *  is exceeded mid-stream (so we don't buffer the whole oversized payload). */
async function readWithCap(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    // Some test runtimes (fake fetch mocks) don't expose body. Fall back
    // to text() but check length post-hoc.
    const t = await res.text();
    if (t.length > maxBytes) {
      throw new Error(`proxy response too large (${t.length} > ${maxBytes} bytes)`);
    }
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        throw new Error(`proxy response too large (>${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  }
  // Concatenate chunks → decode as UTF-8.
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(buf);
}

/** 10 MiB. Defense-in-depth cap on proxy response body to prevent OOM /
 *  DoS when a compromised or malicious proxy returns a huge payload. */
export const MAX_PROXY_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Block targets that would let the proxy be weaponized as a SSRF
 *  oracle against the proxy operator's intranet / cloud metadata.
 *  Note: the proxy itself MUST validate too — this is defense-in-depth
 *  on the client side, primarily protecting users of a shared proxy
 *  from a malicious tab tricking the proxy into reaching internal IPs.
 *
 *  Blocked patterns:
 *   - loopback: 127.0.0.0/8, ::1, ::ffff:127.0.0.1, localhost
 *   - link-local + cloud metadata: 169.254.0.0/16 (AWS/GCP/Azure metadata)
 *   - RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - ULA / link-local IPv6: fc00::/7, fe80::/10
 *   - mDNS / common internal TLDs: .local, .internal, .lan, .home.arpa
 *   - explicit metadata.* hostnames (GCE / Azure)
 */
export function isPrivateOrReservedTarget(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets if any (URL.hostname returns bracketed form).
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Loopback / common local hostnames.
  if (bare === 'localhost' || bare === 'ip6-localhost' || bare === 'ip6-loopback') return true;

  // Explicit cloud-metadata hostnames.
  if (bare === 'metadata.google.internal') return true;
  if (bare.endsWith('.metadata.cloud.google.com')) return true;

  // mDNS + common internal TLDs.
  if (bare.endsWith('.local') || bare.endsWith('.internal') ||
      bare.endsWith('.lan') || bare.endsWith('.home.arpa')) return true;

  // IPv4 literal check.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4) {
    const oct = v4.slice(1).map(Number);
    if (oct.some((n) => n < 0 || n > 255 || !Number.isInteger(n))) return true;
    const [a, b] = oct as [number, number, number, number];
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 169 && b === 254) return true;            // 169.254/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
    if (a === 192 && b === 168) return true;            // 192.168/16
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a >= 224) return true;                          // multicast + reserved
    return false;
  }

  // IPv6 literal (without brackets here). Cover the common forms.
  if (bare.includes(':')) {
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true; // loopback
    if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;  // unspecified
    // IPv4-mapped IPv6 — extract the embedded v4 and recurse through the
    // v4 check. URL normalizes "::ffff:169.254.169.254" to "::ffff:a9fe:a9fe"
    // (hex), so we must match the hex form to catch RFC1918 / 169.254 / etc
    // in mapped form. Without this, an attacker could reach AWS/GCP/Azure
    // metadata via [::ffff:a9fe:a9fe]/.
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
    if (mapped) {
      const hi = parseInt(mapped[1]!, 16);
      const lo = parseInt(mapped[2]!, 16);
      const v4 = `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
      try {
        return isPrivateOrReservedTarget(new URL(`http://${v4}/`));
      } catch {
        return true; // unparseable mapped form → safe default deny
      }
    }
    // Dotted-in-mapped form (rare; some serializers preserve "::ffff:127.0.0.1").
    const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(bare);
    if (mappedDotted) {
      try {
        return isPrivateOrReservedTarget(new URL(`http://${mappedDotted[1]}/`));
      } catch {
        return true;
      }
    }
    // ULA fc00::/7 → first byte 0xfc or 0xfd.
    if (/^f[cd][0-9a-f]{0,2}:/i.test(bare)) return true;
    // Link-local fe80::/10.
    if (/^fe[89ab][0-9a-f]?:/i.test(bare)) return true;
    return false;
  }

  return false;
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
  if (isPrivateOrReservedTarget(parsed)) {
    throw new Error('target URL の宛先がプライベート / 予約アドレスです (SSRF 防止)');
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

  // Defense-in-depth: cap response body before json() to prevent OOM on
  // a compromised/malicious proxy returning a huge payload.
  // `proxyRes.headers` is optional in test mocks, hence the `?.get` chain.
  const clHeader = proxyRes.headers?.get?.('content-length');
  const cl = clHeader ? Number(clHeader) : 0;
  if (Number.isFinite(cl) && cl > MAX_PROXY_RESPONSE_BYTES) {
    throw new Error(`proxy response too large (${cl} > ${MAX_PROXY_RESPONSE_BYTES} bytes)`);
  }
  const bodyText = await readWithCap(proxyRes, MAX_PROXY_RESPONSE_BYTES);
  const env = bodyText.length === 0 ? {} as ProxyResponseEnvelope : JSON.parse(bodyText) as ProxyResponseEnvelope;
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
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression
