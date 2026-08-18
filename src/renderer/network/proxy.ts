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
 *
 * ⚠ 機密性の前提: このプロキシは upstream へ Authorization ヘッダーを *透過* する
 * 必要があるため、プロキシ運用者は転送されるトークンを技術的に閲覧できる。
 * 第三者運用のプロキシではなく **ユーザー自身が管理する** Worker を使うこと
 * (docs/PROXY_EXAMPLE.md)。本クライアントの防御は (a) SSRF 宛先ブロック、
 * (b) レスポンスサイズ上限、(c) プロキシのエラー応答に含まれうるトークンの
 * redactSecrets による秘匿 — に限られる。
 */
import { redactSecrets } from '../../shared/redact';
import {
  describeProxyEndpointFailure,
  normalizeProxyEndpoint,
  reviewStoredProxyConfig,
  type ProxyCredentials,
  type ProxyEndpointFailure,
} from '../../shared/proxyEndpoint';

// Constants + IDB infra below — decorative error strings, default-arrow
// fallbacks, and the request/response envelope structure are pinned by
// the 13 integration tests via `getProxyConfig` / `setProxyConfig` /
// `fetchViaProxy` round-trip + validation cases.
const DB_NAME = 'business-hub-preferences';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'proxy';

/** 設定の形そのものは shared 側が持つ (保存時・読み出し時で同じ検証を通すため)。 */
export type ProxyConfig = ProxyCredentials;

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
    // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
    tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
  });
}

/**
 * 保存されている設定を、**読み出しのたびに検証して**返す。
 *
 * 検証を保存時にしか置かないと、検証が緩かった頃の値や別経路で書かれた値が
 * そのまま資格情報の送り先になる。弾いた理由も返すので、設定画面は
 * 「保存はされているが今の規則では使えない」ことを利用者に言える。
 */
export async function inspectStoredProxyConfig(): Promise<{
  config: ProxyConfig | null;
  rejected: ProxyEndpointFailure | null;
}> {
  return reviewStoredProxyConfig(await readStoredProxyConfig());
}

/** 使える設定だけを返す。弾かれた理由が要るときは inspectStoredProxyConfig。 */
export async function getProxyConfig(): Promise<ProxyConfig | null> {
  return (await inspectStoredProxyConfig()).config;
}

async function readStoredProxyConfig(): Promise<ProxyConfig | null> {
  let db: IDBDatabase;
  // IndexedDB の読み出しが失敗したときの既定。fake-indexeddb では失敗させられず
  // 到達しないが、設定が読めないときに例外を投げず「未設定」として扱う防御として残す。
  /* Stryker disable BlockStatement */
  try {
    db = await openDb();
  } catch {
    return null;
  }
  /* Stryker restore BlockStatement */
  try {
    const cfg = await new Promise<ProxyConfig | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as ProxyConfig | undefined);
      // Stryker disable next-line ArrowFunction,LogicalOperator,StringLiteral: IndexedDB のエラー経路。fake-indexeddb では失敗させられず、`?? new Error(...)` は req/tx.error が必ず入るため到達しない防御。文言も観測されない。
      req.onerror = () => reject(req.error ?? new Error('get failed'));
    });
    return cfg ?? null;
  } finally {
    db.close();
  }
}

export async function setProxyConfig(cfg: ProxyConfig | null): Promise<void> {
  // 保存するのは**正規化した URL**。検証した文字列と保存する文字列を
  // 一致させておかないと、読み出し側の再検証が別のものを見ることになる。
  let toStore: ProxyConfig | null = null;
  if (cfg !== null) {
    const review = reviewStoredProxyConfig(cfg);
    if (review.config === null) {
      // rejected が null になるのは raw が null/undefined のときだけで、
      // ここは cfg !== null なので必ず理由が付く = `?? 'not-a-url'` は到達しない。
      // Stryker disable next-line StringLiteral
      throw new Error(describeProxyEndpointFailure(review.rejected ?? 'not-a-url'));
    }
    toStore = review.config;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
      // Stryker disable next-line ConditionalExpression: 削除の代わりに null を put しても、
    // 読み出し側 (`reviewStoredProxyConfig`) が null を弾いて同じ「設定なし」になるため観測差が無い。
    // レコードを残さないほうが正しいので delete を維持する。
  if (toStore === null) tx.objectStore(STORE).delete(KEY);
    else tx.objectStore(STORE).put(toStore, KEY);
    await txDone(tx);
  } finally {
    db.close();
  }
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
    // Stryker disable next-line ConditionalExpression: value が無い読み出しでは byteLength も
    // push も無意味で、次のループへ進むだけ。分岐の有無で結果が変わらない (等価変異)。
    if (value) {
      total += value.byteLength;
      // Stryker disable next-line EqualityOperator: total は 1 バイト単位で増えるが、上限ちょうどで
      // 止めるか超えてから止めるかは、上限 10MiB に対して観測できる差にならない
      // (ちょうどのケースを作るにはチャンク境界を制御する必要があり、実装依存になる)。
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
 *
 *  ⚠ LIMITATION — DNS rebinding:
 *  This check operates at the *hostname* level (before any DNS lookup).
 *  An attacker controlling `evil.example.com` can return a public IP
 *  (e.g. 8.8.8.8) on first resolve, then re-resolve to 127.0.0.1 / a
 *  RFC1918 address on a second lookup that happens inside the proxy.
 *  Defeating that requires the *proxy* to re-validate the resolved IP
 *  after `getaddrinfo()` and before its upstream `fetch()` call. The
 *  client-side check here is therefore a *best-effort first line of
 *  defense*; see docs/PROXY_EXAMPLE.md §3 for the proxy-side pattern.
 *
 *  Note: the proxy itself MUST validate too — this is defense-in-depth
 *  on the client side, primarily protecting users of a shared proxy
 *  from a malicious tab tricking the proxy into reaching internal IPs.
 *
 *  Blocked patterns:
 *   - loopback: 127.0.0.0/8, ::1, ::ffff:127.0.0.1, localhost
 *   - link-local + cloud metadata: 169.254.0.0/16 (AWS/GCP/Azure metadata)
 *   - RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - ULA / link-local IPv6: fc00::/7, fe80::/10
 *   - mDNS / common internal TLDs (see INTERNAL_TLDS below) + .home.arpa
 *   - explicit metadata.* hostnames (GCE / Azure)
 *   - IPv6 ↔ IPv4 transition encodings (Round 3 BLOCKING coverage):
 *       · IPv4-mapped two-group:  ::ffff:HHHH:HHHH
 *       · IPv4-compatible (deprecated): ::HHHH:HHHH
 *           (URL normalizes `[::169.254.169.254]` → `[::a9fe:a9fe]`)
 *       · Single-hex-group mapped: ::ffff:HHHH (covers 0.0.0.x range)
 *       · NAT64 well-known prefix (RFC 6052): 64:ff9b::HHHH:HHHH (best-effort)
 *       · 6to4 (RFC 3056): 2002:HHHH:HHHH:: (best-effort)
 */
/** Single-label internal TLDs that should never be reached through the
 *  proxy. Covers mDNS (RFC 6762), common Microsoft AD defaults, IETF
 *  draft-private-use TLDs, and typical home-router zones. Compared
 *  against the *last DNS label only* so that a public name like
 *  `example.localcom.` (no dot before "local") is not flagged. */
const INTERNAL_TLDS: ReadonlySet<string> = new Set([
  'local',     // mDNS (RFC 6762)
  'internal',  // common internal zone
  'lan',       // common home / SMB
  'corp',      // Microsoft AD default
  'intranet',  // Microsoft AD default
  'home',      // common ISP CPE
  'private',   // IETF draft-private-use
]);

export function isPrivateOrReservedTarget(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  // Strip IPv6 brackets if any (URL.hostname returns bracketed form).
  // Stryker disable next-line LogicalOperator,StringLiteral: `URL.hostname` は IPv6 のとき
  // 必ず両端に括弧を付ける (片方だけは作れない) ため、`&&`↔`||` も空文字化も観測差が出ない。
  const bracketless = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Strip a single trailing dot (fully-qualified form). `URL` PRESERVES it for
  // named hosts — `new URL('http://localhost./').hostname === 'localhost.'` —
  // so without this every name-based rule below was bypassable by appending a
  // dot: `localhost.`, `metadata.google.internal.`, `printer.local.`,
  // `x.internal.` all resolve to the same targets as their dotless forms yet
  // failed the exact-equality and last-label checks (2026-07 security audit).
  // IP literals are unaffected — `URL` already normalizes `169.254.169.254.`
  // to `169.254.169.254` — but trimming is harmless for them.
  // 先頭のドットも同じ理由で落とす (2026-08 変異検査)。`URL` は
  // `http://.local/` を hostname `.local` のまま通す。末尾ドットと同様
  // **同じ相手を指す別表記**であり、しかも `..internal` は最終ラベル判定に
  // 当たって遮断されるのに `.internal` は素通りする、という非対称があった
  // (`lastIndexOf('.')` が 0 になり `lastDot > 0` を満たさないため)。
  // Stryker disable next-line Regex: 先頭側・末尾側それぞれを消す変異は、もう一方の
  // 置換が残るため「片側だけ剥がす」形になる。両方向を剥がすことは
  // proxy.test.ts の先頭ドット / 末尾ドット検査で別々に固定している。
  const bare = bracketless.replace(/^\.+/, '').replace(/\.+$/, '');

  // Loopback / common local hostnames.
  if (bare === 'localhost' || bare === 'ip6-localhost' || bare === 'ip6-loopback') return true;

  // Explicit cloud-metadata hostnames.
  // Stryker disable next-line ConditionalExpression,StringLiteral: この名前は最終ラベルが
  // `internal` なので下の INTERNAL_TLDS 規則でも遮断される。明示は多重防御であり、
  // 外しても結果が変わらない (等価変異)。
  if (bare === 'metadata.google.internal') return true;
  if (bare.endsWith('.metadata.cloud.google.com')) return true;

  // Internal TLDs — 最終 DNS ラベルだけを見る。`example.localcom` のような
  // 公開名は (区切りが無いので) 当たらず、`printer.local` は当たる。
  //
  // ラベルが 1 つだけのホスト (`internal` / `local` 単体) も遮断する。
  // 以前は「裸の TLD は DNS で解決しないから」として通していたが、単一ラベルの
  // ホスト名は**検索ドメインの補完で解決する** (`internal` → `internal.corp.example`)。
  // 通す理由が成り立っていなかったので遮断側へ寄せた。公開 API を単一ラベル名で
  // 呼ぶことは無いので、過遮断の実害も無い。
  const lastDot = bare.lastIndexOf('.');
  // Stryker disable next-line ConditionalExpression,EqualityOperator: 先頭ドットを剥がした後の
  // `bare` は `.` で始まらないので lastDot が 0 になることはなく、`>= 0` と `> 0` は同値。
  // ドットが無い場合は三項の else 側で bare 全体をラベルとして扱う。
  const lastLabel = lastDot >= 0 ? bare.slice(lastDot + 1) : bare;
  if (INTERNAL_TLDS.has(lastLabel)) return true;
  // 2-label IETF reserved zone (RFC 8375): `*.home.arpa`.
  if (bare === 'home.arpa' || bare.endsWith('.home.arpa')) return true;

  // IPv4 literal check.
  //
  // Stryker disable next-line Regex
  // Anchor + character-class mutations on the regexes in this function and
  // the two helpers below are equivalent mutations: `URL.hostname.toLowerCase()`
  // returns the bare hostname (no surrounding whitespace, no prefix/suffix),
  // and only lowercase hex / decimal characters are possible by construction.
  // We Stryker-disable the regex bodies here and explicitly test for the
  // semantic outcomes (proxy.test.ts §"isPrivateOrReservedTarget") rather
  // than the regex shape.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4) {
    // オクテットの範囲検査は置かない — **到達しないため**。
    // この関数は `URL` を受け取り、`URL` はドット付き 4 組のうち 1 つでも
    // 255 を超えるとパース時に throw する (実測: `new URL('http://256.1.1.1/')`
    // → ERR_INVALID_URL)。先頭 0 も正規化される (`01.02.03.04` → `1.2.3.4`、
    // `0177.0.0.1` → `127.0.0.1`)。したがって上の正規表現に合致した時点で
    // 各オクテットは 0-255 の整数であることが保証されている。
    // 以前はここに `oct.some((n) => n < 0 || n > 255 || !Number.isInteger(n))`
    // があったが、どのテストでも到達せず変異体 10 個が測れないまま残っていた。
    // 「等価だから黙らせる」のではなく、到達しないコードなので消す。
    const [a, b] = v4.slice(1).map(Number) as [number, number, number, number];
    if (a === 127) return true;                         // 127.0.0.0/8 loopback
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 169 && b === 254) return true;            // 169.254/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16/12
    if (a === 192 && b === 168) return true;            // 192.168/16
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64/10 CGNAT (RFC 6598)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark (RFC 2544)
    if (a >= 224) return true;                          // multicast + reserved
    return false;
  }

  // IPv6 literal (without brackets here). Cover the common forms.
  // Stryker disable next-line ConditionalExpression,StringLiteral: コロンを含まないホストが
  // この分岐へ入っても、中の規則 (v6 表記) にはどれも当たらず末尾で false を返すため観測差が無い。
  if (bare.includes(':')) {
    // Stryker disable next-line ConditionalExpression,StringLiteral: 長形式は `URL` が短縮形へ
    // 正規化するため到達しない (前提は proxy.test.ts「IPv6 の長形式はパーサが短縮形へ正規化する」で固定)。
    // 末尾ドットの件でパーサの読み違いから穴が開いた経緯があるので、防御自体は消さずに残す。
    if (bare === '::1' || bare === '0:0:0:0:0:0:0:1') return true; // loopback
    // Stryker disable next-line ConditionalExpression,StringLiteral: 同上 (長形式は正規化される)。
    if (bare === '::' || bare === '0:0:0:0:0:0:0:0') return true;  // unspecified
    // IPv4-mapped IPv6 (and IPv4-compatible / single-group variants) —
    // extract the embedded v4 and recurse through the v4 check. See
    // `extractMappedV4` below for the full enumeration of accepted forms
    // and Round-3 BLOCKING rationale.
    const embeddedV4 = extractMappedV4(bare);
    // extractMappedV4 は 16 進から 0-255 のオクテットしか組み立てないため
    // `new URL` は throw せず、この catch には到達しない。別のパーサから
    // 呼ばれた場合に備えた安全側の既定 (deny) として残す。
    /* Stryker disable BlockStatement,BooleanLiteral */
    if (embeddedV4 !== null) {
      try {
        return isPrivateOrReservedTarget(new URL(`http://${embeddedV4}/`));
      } catch {
        return true; // unparseable mapped form → safe default deny
      }
    }
    /* Stryker restore BlockStatement,BooleanLiteral */
    // NAT64 (RFC 6052 well-known prefix `64:ff9b::/96`) and 6to4 (RFC 3056
    // `2002::/16`) can also encode an IPv4 address in the trailing bits.
    // Full validation requires parsing the entire 128-bit address; we
    // implement a best-effort extraction for the most common case where
    // the v4 octets appear as the last two hex groups
    // (`64:ff9b::HHHH:HHHH` / `2002:HHHH:HHHH::`). Attackers using
    // arbitrary 6to4 encodings should still be caught by the proxy-side
    // DNS-resolved-IP check (docs/PROXY_EXAMPLE.md §3).
    const nat64Or6to4 = extractEmbeddedV4FromTransitionPrefix(bare);
    // 同上 (NAT64 / 6to4 側も同じ組み立てなので catch には到達しない)。
    /* Stryker disable BlockStatement,BooleanLiteral */
    if (nat64Or6to4 !== null) {
      try {
        return isPrivateOrReservedTarget(new URL(`http://${nat64Or6to4}/`));
      } catch {
        return true;
      }
    }
    /* Stryker restore BlockStatement,BooleanLiteral */
    // ULA fc00::/7 → first byte 0xfc or 0xfd.
    // Stryker disable next-line Regex
    if (/^f[cd][0-9a-f]{0,2}:/i.test(bare)) return true;
    // Link-local fe80::/10.
    // Stryker disable next-line Regex
    if (/^fe[89ab][0-9a-f]?:/i.test(bare)) return true;
    return false;
  }

  return false;
}

/** Extract an IPv4 dotted-quad from an IPv6 string that encodes a v4
 *  address in its low 32 bits. Returns null if `bare` doesn't match any
 *  recognised mapped form.
 *
 *  Forms accepted (Round 3 BLOCKING fixes):
 *   - `::ffff:HHHH:HHHH`  — canonical IPv4-mapped (RFC 4291 §2.5.5.2);
 *                           URL normalizes `::ffff:127.0.0.1` to this form.
 *   - `::HHHH:HHHH`       — deprecated IPv4-compatible (RFC 4291 §2.5.5.1);
 *                           URL normalizes `[::169.254.169.254]` to
 *                           `[::a9fe:a9fe]`, which the canonical regex above
 *                           does NOT match, leaving an AWS-IMDS bypass.
 *   - `::ffff:HHHH`       — single-group mapped (e.g. `::ffff:0` for 0.0.0.0,
 *                           `::ffff:1` for 0.0.0.1). URL keeps these as-is
 *                           rather than zero-padding, so a two-group regex
 *                           rejects them and a "this host" (RFC 1122) /
 *                           low-address bypass appears.
 *
 *  NOTE on the dotted-quad form (`::ffff:127.0.0.1`): URL.hostname ALWAYS
 *  re-encodes the embedded v4 to hex (`::ffff:7f00:1`) on construction in
 *  Node ≥ v18 and Chromium, so the dotted form is effectively unreachable
 *  via `new URL(...)`. We still accept it here as a belt-and-suspenders
 *  safeguard for callers that invoke `isPrivateOrReservedTarget` with a
 *  URL built from a non-Web source (e.g. a custom parser); the branch is
 *  intentionally defensive rather than load-bearing in normal flow.
 */
function extractMappedV4(bare: string): string | null {
  // Order matters: a unified regex with `(?:::ffff:|::)` would mis-match
  // `::ffff:0` as `::` + (`ffff`, `0`) = 255.255.0.0 instead of the
  // intended single-group form 0.0.0.0. We therefore try the more
  // specific (longer-prefix) shapes first.

  // (1) Canonical IPv4-mapped two-group: ::ffff:HHHH:HHHH
  //     URL normalizes `::ffff:127.0.0.1` to this form.
  // Stryker disable next-line Regex
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16);
    const lo = parseInt(mapped[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (2) Single hex group: ::ffff:HHHH → interpreted as 0.0.HH.HH (the
  //     high 16 bits are implicitly zero). Covers `::ffff:0` = 0.0.0.0
  //     and `::ffff:1` = 0.0.0.1, both of which RFC 1122 §3.2.1.3
  //     reserves as "this host on this network".
  // Stryker disable next-line Regex
  const single = /^::ffff:([0-9a-f]{1,4})$/i.exec(bare);
  // Stryker disable next-line ConditionalExpression,BlockStatement: この分岐を外すと下の 2 グループ用
  // 正規表現に当たるが、そちらは hi=0xffff から 255.255.x.x を返し a >= 224 で必ず遮断される。
  // 1 グループ側も a = 0 で必ず遮断されるため、遮断/通過の別が付かない (等価変異)。
  if (single) {
    const lo = parseInt(single[1]!, 16);
    // Stryker disable next-line StringLiteral: この分岐は上の注記のとおり、通っても
    // 通らなくても必ず遮断側に落ちるため、組み立てた文字列を変えても観測差が出ない。
    return `0.0.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (3) Deprecated IPv4-compatible two-group: ::HHHH:HHHH (no `ffff`).
  //     This is the form URL.hostname normalizes `[::169.254.169.254]`
  //     to (`[::a9fe:a9fe]`), so it is the critical Round-3 BLOCKING-A
  //     gap. We intentionally exclude `::1`, `::0`, and `::HHHH` (single
  //     group) here — those are handled either by the explicit loopback
  //     equality check upstream or by being public single-group v6
  //     addresses (no v4 embedding possible in only 16 bits worth of
  //     low-order data).
  // Stryker disable next-line Regex
  const compat = /^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (compat) {
    const hi = parseInt(compat[1]!, 16);
    const lo = parseInt(compat[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // (4) Dotted-quad mapped form. See JSDoc above for why this is
  //     defensive rather than load-bearing — Node v18+/Chromium always
  //     re-encode this to hex on URL construction.
  // Stryker disable next-line Regex
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(bare);
  // Stryker disable next-line ConditionalExpression,BlockStatement: Node v18+ / Chromium は
  // ドット付き mapped 形式を必ず 16 進へ再符号化するため (`[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`)、
  // `URL` 経由では到達しない。別のパーサから呼ばれた場合に備えた防御として残す。
  if (mappedDotted) {
    return mappedDotted[1]!;
  }
  return null;
}

/** Best-effort extraction of the embedded IPv4 from NAT64 (RFC 6052
 *  well-known prefix `64:ff9b::/96`) and 6to4 (RFC 3056 `2002::/16`)
 *  addresses. Returns the dotted-quad string or null if the input does
 *  not match the supported subset. See `isPrivateOrReservedTarget`
 *  caller for scope rationale. */
function extractEmbeddedV4FromTransitionPrefix(bare: string): string | null {
  // NAT64: `64:ff9b::HHHH:HHHH` (v4 in low 32 bits after `::`). The
  // canonical RFC 6052 form embeds the v4 as the final two hex groups.
  // Stryker disable next-line Regex
  const nat64 = /^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
  if (nat64) {
    const hi = parseInt(nat64[1]!, 16);
    const lo = parseInt(nat64[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  // 6to4: `2002:HHHH:HHHH::...`. The v4 address sits in the 2nd-3rd
  // hex groups (16 bits each, big-endian). We only catch the common
  // `2002:HHHH:HHHH::` shape; longer forms with arbitrary subnet/iface
  // suffixes need the proxy-side resolved-IP check for full coverage.
  // Stryker disable next-line Regex
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})::?/i.exec(bare);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1]!, 16);
    const lo = parseInt(sixToFour[2]!, 16);
    return `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
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
  // Stryker disable next-line ConditionalExpression: headers が無いまま中へ入っても、
  // instanceof も Array.isArray も false で `Object.assign(flat, undefined)` は無操作なので同じ結果。
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
    // Forward the NORMALIZED url — the exact string the SSRF guard validated —
    // never the raw input. Otherwise the object we check and the string we send
    // can disagree whenever the proxy's URL parser differs from WHATWG:
    // `https://public.com\@169.254.169.254/` parses to hostname `public.com`
    // here (allowed) but a non-WHATWG parser on the proxy side may read the
    // authority as `169.254.169.254`. `parsed.href` collapses that ambiguity
    // (it normalizes to `https://public.com/@169.254.169.254/`), so client and
    // proxy cannot be made to disagree (2026-07 security audit).
    url: parsed.href,
    method: typeof init.method === 'string' ? init.method.toUpperCase() : 'GET',
    headers: flatHeaders,
    body: typeof init.body === 'string' ? init.body : undefined,
  };

  // 送り先も**呼び出し側から渡されたまま**では使わない。この関数は export
  // されていて、保存経路を通らない cfg でも呼べる。資格情報が乗る口なので
  // ここでも同じ規則で確かめ、正規化した URL へ送る。
  const proxyChecked = normalizeProxyEndpoint(cfg.url);
  if (!proxyChecked.ok) throw new Error(describeProxyEndpointFailure(proxyChecked.reason));

  const proxyHeaders: Record<string, string> = { 'content-type': 'application/json' };
  // `&&` の左だけで足りる — undefined も空文字も falsy なので `.length > 0` は
  // 一度も結果を変えない (変異検査で redundant と判明)。
  if (cfg.sharedSecret) {
    proxyHeaders['x-proxy-auth'] = cfg.sharedSecret;
  }

  const proxyRes = await fetch(proxyChecked.url, {
    method: 'POST',
    headers: proxyHeaders,
    body: JSON.stringify(envelope),
  });

  if (!proxyRes.ok) {
    const body = await proxyRes.text().catch(() => '');
    // A misbehaving proxy may echo the forwarded request (incl. the
    // Authorization header) back in its error body. Redact before surfacing.
    throw new Error(`proxy ${proxyRes.status}: ${redactSecrets(body.slice(0, 200))}`);
  }

  // Defense-in-depth: cap response body before json() to prevent OOM on
  // a compromised/malicious proxy returning a huge payload.
  // `proxyRes.headers` is optional in test mocks, hence the `?.get` chain.
  // We require `cl > 0` (not just `cl > cap`) because:
  //   - a malicious / buggy proxy could return `Content-Length: -1`, which
  //     is finite and ≤ cap and would slip past the header gate;
  //   - real implementations never send a negative or NaN length, so
  //     ignoring such headers and falling through to `readWithCap` (which
  //     enforces the cap at the byte-stream level) is the safe behaviour.
  const clHeader = proxyRes.headers?.get?.('content-length');
  const cl = clHeader ? Number(clHeader) : 0;
  // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator: ヘッダーが無い
  // ときは cl = 0 で、いずれの部分条件を潰しても `0 > 上限` が false になり素通りする。
  // 上限そのものの境界は proxy.test.ts の Content-Length 検査 4 本で固定している。
  if (Number.isFinite(cl) && cl > 0 && cl > MAX_PROXY_RESPONSE_BYTES) {
    throw new Error(`proxy response too large (${cl} > ${MAX_PROXY_RESPONSE_BYTES} bytes)`);
  }
  const bodyText = await readWithCap(proxyRes, MAX_PROXY_RESPONSE_BYTES);
  // Empty-body fast path: `JSON.parse('')` throws SyntaxError, so when the
  // proxy returns no body we substitute an empty envelope; the Response
  // constructor below then falls back to status 502 + empty body — i.e.
  // we surface "proxy returned nothing" as a bad-gateway, not as a crash.
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
