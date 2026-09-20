# BYO Proxy 設定ガイド

Notion / Atlassian / Cloudflare 等の API は `Access-Control-Allow-Origin`
ヘッダーを出さないため、ブラウザから直接呼び出せません。本ガイドでは
**Cloudflare Worker** を使って 5 分でプロキシを立ち上げる手順を示します。

> 本リポジトリは投資助言ではなく、業務支援ツールです。プロキシは個人運用
> 前提です。公開サーバとして第三者に開放しないでください。

## 1. プロトコル仕様

クライアントは下記エンベロープを POST 送信します。

```http
POST <proxy-url>
Content-Type: application/json
X-Proxy-Auth: <optional-shared-secret>

{
  "url":     "https://api.notion.com/v1/databases/abc",
  "method":  "POST",
  "headers": { "Authorization": "Bearer secret_xxx", "Content-Type": "application/json" },
  "body":    "{ \"query\": \"\" }"
}
```

プロキシは上流に透過呼び出しを行い、下記エンベロープで返します。

```json
{
  "status":  200,
  "headers": { "content-type": "application/json", ... },
  "body":    "{ ... 上流レスポンス本体 ... }"
}
```

## 2. Cloudflare Worker 実装 (397 行)

`workers.cloudflare.com/dashboard` で **Create Worker** → 下記コードを貼り
付け → **Deploy**。`worker.dev` の URL を Settings → BYO プロキシに登録。

この実装は 3 段の SSRF ガードを持つ。**(a) 上流ホスト allowlist** (主たる
防御線)、**(b) 解決後 IP の再検査** (DNS-over-HTTPS。公開名が私設 IP を
返す `169-254-169-254.sslip.io` / `localtest.me` 系と DNS rebinding 対策)、
**(c) リダイレクト各ホップの再検査** (`redirect: 'manual'`。allowlist 済み
ホストが `302 Location: http://169.254.169.254/` を返す経路を塞ぐ)。
(b) はクライアント側では原理的に実装できない — 残余リスクは §3 参照。(c) はクライアント側も
**追随しない**という形で持つ (`src/shared/httpLimits.ts` の `egressInit`・2026-09-17 パス 301。
Worker のように各ホップを再検査して進むのではなく、転送が来た時点で止まって理由を言う。
例外は `mode: 'no-cors'` の到達確認 1 形だけ —— Fetch 標準が no-cors + manual を network error と
定めるため、資格情報を載せられず応答も読めないその形だけは 'follow' のまま · パス 304)。

```js
// proxy-worker.js
const SHARED_SECRET = ''; // 任意。空文字なら未認証で受け入れる

// 上流ホスト allowlist。BYO の前提でも、ここを絞っておくと
// たとえクライアントが侵害されても被害を局所化できる。
// これが *主たる* 防御線。以下の IP 検査は多層防御に過ぎない。
const UPSTREAM_ALLOWLIST = new Set([
  'api.notion.com',          // Notion ページ作成
  'slack.com',               // Slack メッセージ送信
  'api.atlassian.com',       // Atlassian (一部)
  // Atlassian (Jira) は自分のサイト host も必要: 例 'your-team.atlassian.net'
  'www.googleapis.com',      // Google カレンダー / Drive
  'gmail.googleapis.com',    // Gmail 下書き
  'public-api.wordpress.com',// WordPress.com 下書き
  'api.canva.com',           // Canva フォルダ
  'api.cloudflare.com',      // Cloudflare DNS / キャッシュ
  'haveibeenpwned.com',      // メール漏洩チェック (HIBP)
  'www.virustotal.com',      // URL スキャン (VirusTotal)
  // GitHub (api.github.com) は CORS 許可済みのためプロキシ不要。
  // 自分が使うホストだけを明示的に列挙する。
]);

// Workers に `node:dns` は無く `getaddrinfo()` を自前で呼べないため、
// 解決後 IP の検証は DNS-over-HTTPS (RFC 8484 / JSON 形式) で行う。
const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

// Location ホップ上限。1 ホップごとに allowlist + DoH 検査 (最大 2 subrequest)
// を回すため、無制限に追うとリダイレクトループで CPU time と subrequest 枠を
// 使い切る。実運用の API リダイレクトは 3 で足りる。
const MAX_REDIRECTS = 3;

// 上流本文の上限。10 MiB —— アプリ側の `MAX_HTTP_RESPONSE_BYTES`
// (`src/shared/httpLimits.ts`) と同じ値にする。**2 つの数はテストで結ばれている**
// (`src/renderer/network/__tests__/proxyWorkerParity.test.ts`)。
//
// 上のホップ上限と**同じ理由**で要る。あちらは「無制限に追うと CPU time と
// subrequest 枠を使い切る」と書いてあるのに、**バイト数の側には 2026-09-20 まで
// 上限が無かった** (`await upstream.text()` が素で置かれていた)。
// 実測 (Node 22・上流が大きな 200 を返す):
//
//     64 MiB の応答  → rss +223 MiB / 2,034 ms
//    256 MiB の応答  → rss +956 MiB / 6,787 ms
//    上限つき        → どちらも断り / rss +0〜1 MiB / 26〜32 ms
//
// **Workers の isolate は 128 MiB** なので、64 MiB の応答 1 つで Worker ごと
// 落ちる。`text()` は UTF-16 の文字列にするので ASCII でも 2 倍になり、
// その後の `JSON.stringify` でもう 1 部増える —— だから「64 MiB」では済まない。
// クライアント側の上限は**この Worker が返した封筒**に掛かるので、
// Worker が先に落ちる限り一度も効かない。**読む所で切る。**
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024;

// ホストが変わるリダイレクトでは持ち越さないヘッダー。allowlist 内に留まる
// としても、Notion のトークンを別ホストへ渡す必要は無い (横展開の防止)。
const CREDENTIAL_HEADERS = /^(authorization|cookie|proxy-authorization|x-proxy-auth)$/i;

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Auth',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    // Optional shared-secret auth.
    // 比較は定数時間で行う: `!==` は最初の不一致文字で抜けるため、応答時間から
    // 先頭何文字が合っているかを 1 文字ずつ絞り込める (総当りが桁違いに軽くなる)。
    if (SHARED_SECRET) {
      if (!timingSafeEqualStr(request.headers.get('X-Proxy-Auth'), SHARED_SECRET)) {
        return json({ error: 'unauthorized' }, 401);
      }
    }

    // `envelope` と命名する: Workers の 2nd 引数 `env` (バインディング) と
    // 同名にすると、後から KV / Secret を足したとき静かに壊れる。
    let envelope;
    try {
      envelope = await request.json();
    } catch {
      return json({ error: 'invalid JSON envelope' }, 400);
    }

    if (typeof envelope.url !== 'string') return json({ error: 'url required' }, 400);
    let target;
    try {
      target = new URL(envelope.url);
    } catch {
      return json({ error: 'malformed URL' }, 400);
    }

    // 初回宛先: allowlist + 解決後 IP の両方を通す。
    const initialDenial = await denyReason(target);
    if (initialDenial) return json({ error: initialDenial }, 403);

    let method = typeof envelope.method === 'string' ? envelope.method.toUpperCase() : 'GET';
    let body = envelope.body;
    let headers = { ...(envelope.headers ?? {}) };
    let upstream;

    for (let hop = 0; ; hop++) {
      // `redirect: 'manual'` が必須。既定の 'follow' は Location 先を
      // *一切検査せずに* 取得するため、allowlist 済みホストが
      // `302 Location: http://169.254.169.254/` を返すだけで SSRF が成立し、
      // クライアントはそのホップを観測できない。
      upstream = await fetch(target.href, { method, headers, body, redirect: 'manual' });

      if (!isRedirect(upstream.status)) break;
      const location = upstream.headers.get('location');
      if (!location) break; // 3xx だが Location 無し → そのまま返す
      if (hop >= MAX_REDIRECTS) return json({ error: 'too many redirects' }, 502);

      let next;
      try {
        next = new URL(location, target); // 相対 Location を解決
      } catch {
        return json({ error: 'malformed redirect Location' }, 502);
      }
      // `Location: file:///etc/passwd` や `Location: data:...` を早期に落とす。
      // denyReason 内でも判定するが、意図を明示するため二重に書く。
      if (next.protocol !== 'https:' && next.protocol !== 'http:') {
        return json({ error: 'redirect blocked: http(s) only' }, 403);
      }
      const denial = await denyReason(next);
      if (denial) return json({ error: `redirect blocked: ${denial}` }, 403);

      if (next.origin !== target.origin) {
        // **origin** で比べる (2026-09-20 · パス 345)。`host` だけを見ていた頃は
        // `https://api.notion.com` → `http://api.notion.com` の転送で host が等しく、
        // **平文へ落ちるのに `Authorization` を持ち越していた**。上の `denyReason` が
        // 平文を拒むようになったので今は先に落ちるが、資格情報を持ち越さない条件は
        // 「同じ scheme・同じ host・同じ port」= origin が正しい (多層防御)。
        // クロス origin なので資格情報を落とす。
        headers = Object.fromEntries(
          Object.entries(headers).filter(([k]) => !CREDENTIAL_HEADERS.test(k)),
        );
      }
      // 301/302/303 の POST は GET に落として body を捨てる (fetch 仕様と同じ)。
      // 307/308 はメソッドと body を保持する。
      if (upstream.status !== 307 && upstream.status !== 308 && method !== 'GET' && method !== 'HEAD') {
        method = 'GET';
        body = undefined;
      }
      target = next;
    }

    const text = await readCappedText(upstream);
    if (text === null) {
      return json({ error: `upstream response exceeds ${MAX_UPSTREAM_BYTES} bytes` }, 502);
    }
    const outHeaders = {};
    upstream.headers.forEach((v, k) => { outHeaders[k] = v; });

    return json({ status: upstream.status, headers: outHeaders, body: text }, 200);
  },
};

/**
 * 上流の本文を上限つきで読む。超えたら読むのをやめて `null` を返す。
 *
 * `await res.text()` は**全部読み終えてから**長さが分かるので、上限を
 * 「読んだ後で測る」形にすると費用は払い終えている (実測は
 * `MAX_UPSTREAM_BYTES` の注記)。だから 1 チャンクずつ数えて、超えた時点で
 * `cancel()` する。Workers に `Buffer` は無いので `Uint8Array` で連結する。
 */
async function readCappedText(res) {
  if (!res.body) return ''; // 204 / 304 など本文の無い応答
  const reader = res.body.getReader();
  const parts = [];
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    if (seen > MAX_UPSTREAM_BYTES) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(seen);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(all);
}

function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * 定数時間の文字列比較。長さが違えば即 false でよい (長さ自体は秘密でない)。
 * WebCrypto の timingSafeEqual は Workers に無いので XOR 累積で自前実装する。
 */
function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 宛先を拒否する理由 (string) / 通す場合は null。allowlist → 平文 http → 解決後 IP の順。
 *
 * **平文 http を拒む** (2026-09-20 · パス 345)。この Worker が上流へ送る要求には
 * 利用者の `Authorization` がそのまま載る。2026-09-20 まで `http:` を通しており、
 * 実測で `http://api.notion.com/v1/x` は `null` (通す) を返した。
 * 許可リストの 10 ホストはすべて https の公開 SaaS で、**平文で呼ぶ正当な用途は無い**
 * (LAN / loopback はクライアント側の `isPrivateOrReservedTarget` が別に拒む)。
 *
 * 順序は「具体的な理由が先」。許可リスト外の `http://evil.example` には
 * 「リストに無い」と答えるほうが読み手の役に立つ。
 */
async function denyReason(u) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'http(s) only';
  if (!UPSTREAM_ALLOWLIST.has(u.hostname)) return 'upstream host not in allowlist';
  if (u.protocol !== 'https:') return 'plaintext http upstream is not allowed (credentials would travel in the clear)';
  return await resolvedIpDenyReason(u.hostname);
}

/** DoH で A / AAAA を引き、返った全アドレスを isBlockedIp に掛ける。
 *  クライアント側 (isPrivateOrReservedTarget) は hostname 文字列しか見られない
 *  ため、`169-254-169-254.sslip.io` や `localtest.me` のような「公開名 →
 *  私設 IP」はここでしか止まらない。 */
async function resolvedIpDenyReason(hostname) {
  // IP リテラル (`[::1]` 含む) は DNS を引く意味が無いので直接判定する。
  const literal = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(literal) || literal.includes(':')) {
    return isBlockedIp(literal) ? `literal IP is private/reserved (${literal})` : null;
  }

  const addresses = [];
  for (const type of ['A', 'AAAA']) {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`;
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/dns-json' } });
    } catch {
      // fail closed: DoH が落ちている間は「検査できない宛先」を通さない。
      // 可用性を優先して通す運用に変えるなら、allowlist だけが残ることを
      // 理解した上で行う (§3 残余リスク)。
      return `DNS lookup failed (${type})`;
    }
    if (!res.ok) return `DNS lookup failed (${type}: HTTP ${res.status})`;
    let dns;
    try {
      dns = await res.json();
    } catch {
      return `malformed DNS response (${type})`;
    }
    for (const answer of dns.Answer ?? []) {
      // 1 = A, 28 = AAAA。CNAME (5) の data はホスト名なので飛ばす —
      // CNAME チェーンの終端に A/AAAA が入るため検査対象は網羅される。
      if (answer.type === 1 || answer.type === 28) addresses.push(String(answer.data));
    }
  }
  // 解決結果ゼロを許すと「検査対象が無い = 素通り」になる。split-horizon DNS
  // (公開側 NXDOMAIN / 内部で私設 IP) を通しかねないので拒否する。
  if (addresses.length === 0) return 'host does not resolve to any A/AAAA record';
  for (const ip of addresses) {
    if (isBlockedIp(ip)) return `resolves to blocked address ${ip}`;
  }
  return null;
}

/** 私設 / 予約レンジなら true。src/renderer/network/proxy.ts の
 *  isPrivateOrReservedTarget と同じレンジを塞ぐ。解析できない入力は
 *  true (deny) を返す — パーサ差異を攻撃者に有利に働かせない。
 *
 *  **この「同じレンジ」は機械が支えている。** 以前は文だけで、実際には
 *  2026-08-25 の時点で 8 か所ずれていた (client のみ: 192.0.0/24 /
 *  TEST-NET 3 本 / 192.88.99/24 / 2001:db8::/32、Worker のみ: fec0::/10 /
 *  ff00::/8)。今はこの関数を md から取り出して client と同じ標本へ当てる
 *  検査がある: src/renderer/network/__tests__/proxyWorkerParity.test.ts */
function isBlockedIp(ip) {
  if (typeof ip !== 'string' || ip.length === 0) return true;
  const bare0 = ip.trim().toLowerCase();
  const bare = bare0.startsWith('[') && bare0.endsWith(']') ? bare0.slice(1, -1) : bare0;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (v4) {
    const oct = v4.slice(1).map(Number);
    if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = oct;
    if (a === 0) return true;                             // 0.0.0.0/8 "this host" (RFC 1122)
    if (a === 10) return true;                            // 10.0.0.0/8 (RFC 1918)
    if (a === 127) return true;                           // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;              // 169.254.0.0/16 link-local = 169.254.169.254 (IMDS)
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12 (RFC 1918)
    if (a === 192 && b === 168) return true;              // 192.168.0.0/16 (RFC 1918)
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64.0.0/10 CGNAT (RFC 6598)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark (RFC 2544)
    // 「私設」ではないが公開経路に出ない予約。client 側 (proxy.ts) が
    // 2026-08-25 にここを足したとき、**この Worker だけ取り残されていた**
    // (実測: 下の 5 つはすべて素通り)。要求を実際に投げるのはこちらなので、
    // 片側だけ塞いでも防いだことにならない。
    const c = oct[2];
    if (a === 192 && b === 0 && c === 0) return true;     // 192.0.0.0/24 IETF プロトコル割当 (RFC 6890, DS-Lite / NAT64)
    if (a === 192 && b === 0 && c === 2) return true;     // 192.0.2.0/24 TEST-NET-1 (RFC 5737)
    if (a === 198 && b === 51 && c === 100) return true;  // 198.51.100.0/24 TEST-NET-2 (RFC 5737)
    if (a === 203 && b === 0 && c === 113) return true;   // 203.0.113.0/24 TEST-NET-3 (RFC 5737)
    if (a === 192 && b === 88 && c === 99) return true;   // 192.88.99.0/24 6to4 リレー anycast (RFC 3068 / 7526 で廃止)
    if (a >= 224) return true;                            // 224/4 multicast + 240/4 reserved
    return false;
  }

  if (!bare.includes(':')) return true; // IP でもない文字列 → deny
  const g = expandV6(bare);
  if (g === null) return true;
  const embedded = (hi, lo) => `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
  // `[from, to)` の全グループがゼロか。prefix 判定を数値で行うのは、IPv6 の
  // 文字列正規化 (`::` の位置・ゼロ省略・大文字小文字) が実装ごとに違うため。
  const allZero = (from, to) => g.slice(from, to).every((x) => x === 0);

  if (allZero(0, 8)) return true;                          // :: unspecified
  if (allZero(0, 7) && g[7] === 1) return true;            // ::1 loopback
  // v4 を内包する形式は低 32bit を展開して v4 ルールに掛け直す。
  // ::ffff:0:0/96 IPv4-mapped (RFC 4291 §2.5.5.2)
  if (allZero(0, 5) && g[5] === 0xffff) return isBlockedIp(embedded(g[6], g[7]));
  // 64:ff9b::/96 NAT64 well-known prefix (RFC 6052)。g[0..1] が prefix なので
  // ゼロ検査は g[2..5] に対して行う (g[0] から見ると当然ゼロではない)。
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) return isBlockedIp(embedded(g[6], g[7]));
  // 2002::/16 6to4 (RFC 3056) — v4 は 2〜3 番目のグループ
  if (g[0] === 0x2002) return isBlockedIp(embedded(g[1], g[2]));
  // ::a.b.c.d IPv4-compatible (RFC 4291 §2.5.5.1, 非推奨)。`[::169.254.169.254]`
  // は URL パーサで `[::a9fe:a9fe]` に正規化されるため、この分岐が必要。
  if (allZero(0, 6)) return isBlockedIp(embedded(g[6], g[7]));

  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (RFC 3879 で廃止だが実装が残る)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  // 2001:db8::/32 文書用 (RFC 3849)。IPv4 の TEST-NET と同じ理由。
  // client 側と同じく、2001::/16 全体には当てない (2001:4860:: など正当な公開空間が居る)。
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  return false;
}

/** IPv6 文字列を 16bit × 8 グループの数値配列に展開する。`::` 圧縮と
 *  末尾 dotted-quad (`::ffff:127.0.0.1`) の両方を扱う。解析不能なら null。 */
function expandV6(input) {
  let s = input;
  const pct = s.indexOf('%');
  if (pct !== -1) s = s.slice(0, pct); // ゾーン ID (`fe80::1%eth0`) は判定に不要

  // 末尾 dotted-quad を 2 グループの hex に変換 (RFC 4291 §2.2-3)。
  const tail = /^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(s);
  if (tail) {
    const o = tail[2].split('.').map(Number);
    if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${tail[1]}${(((o[0] << 8) | o[1]) >>> 0).toString(16)}:${(((o[2] << 8) | o[3]) >>> 0).toString(16)}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null; // `::` は 1 回のみ
  const parseGroups = (part) => {
    if (part === '') return [];
    const out = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = parseGroups(halves[1]);
  if (rest === null) return null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null; // `::` は 1 グループ以上を圧縮していなければ不正
  return [...head, ...new Array(fill).fill(0), ...rest];
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

## 3. セキュリティ留意点

- URL は **公開リポジトリにコミットしない** (誰でも使われる)
- `SHARED_SECRET` を設定し、Settings 画面で同じ値を入力すると簡易認証
- **上流ホストを allowlist する** (例: notion.com / atlassian.net のみ受け入れる) — 上の Worker 例ではこれを既定で組み込んでいる。
  **これが主たる防御線**であり、以下の IP 検査はその上に重ねる多層防御に過ぎない。
  allowlist を空にしたり `*` 相当に緩めた時点で、Worker は誰でも使える
  オープンプロキシになる
- **DNS rebinding / 公開ワイルドカード DNS 対策はプロキシ側の責任**:
  クライアントは hostname 文字列しか見られない (`isPrivateOrReservedTarget` in
  `src/shared/privateTarget.ts`、`src/renderer/network/proxy.ts` が re-export —
  DNS リゾルバを持たない)。したがって
  `169-254-169-254.sslip.io` / `customer1.169.254.169.254.nip.io` /
  `localtest.me` のような **公開名 → 私設 IP** や、同じ名前を
  1 回目=公開 IP / 2 回目=127.0.0.1 と返す rebinding は client 側では
  原理的に防げない。上の Worker はこれを `resolvedIpDenyReason()` で
  塞いでいる (DoH で A / AAAA を引き `isBlockedIp()` に掛ける)
- **上流は https だけ** (2026-09-20 · パス 345): この Worker が上流へ送る要求には
  利用者の `Authorization` がそのまま載る。2026-09-20 まで `denyReason` は
  `http:` も通しており、実測で `http://api.notion.com/v1/x` が `null` (通す) を返した。
  さらに資格情報を落とす条件が `next.host !== target.host` だったため、
  **`https://api.notion.com` → `http://api.notion.com` の転送では host が等しく、
  平文へ落ちるのに `Authorization` を持ち越していた** —— 許可リスト内の上流が
  `302 Location: http://` を 1 つ返すだけで、利用者のトークンが素のまま流れる。
  今は `denyReason` が平文を拒み、資格情報の持ち越しは **origin** で判定する
  (同じ scheme・host・port)。クライアント側 (`fetchViaProxy`) も同じく https を要求し、
  両者は `proxyWorkerParity.test.ts` が同じ標本へ当てて結んでいる
- **上流本文には上限を掛ける** (2026-09-20 · パス 343): `await upstream.text()` は
  全部読み終えてから長さが分かるので、読んだ後で測る形では費用を払い終えている。
  上の Worker は `readCappedText()` で 1 チャンクずつ数え、`MAX_UPSTREAM_BYTES`
  (10 MiB・アプリ側の `MAX_HTTP_RESPONSE_BYTES` と同値) を超えた時点で
  `cancel()` して 502 を返す。実測 (Node 22): 上限なしで 64 MiB の応答を読むと
  **rss +223 MiB / 2,034 ms**、256 MiB で **rss +956 MiB / 6,787 ms**。
  **Workers の isolate は 128 MiB** なので 64 MiB の応答 1 つで Worker ごと落ちる。
  クライアント側の上限は**この Worker が返した封筒**に掛かるため、
  Worker が先に落ちる限り一度も効かない
- **リダイレクトは各ホップを再検査する**: `fetch` の既定 `redirect: 'follow'`
  は Location 先を一切検査せずに取得するため、allowlist 済みホストが
  `302 Location: http://169.254.169.254/` を返すだけで SSRF が成立し、
  そのホップはクライアントから観測できない。上の Worker は
  `redirect: 'manual'` + ホップ毎の `denyReason()` (allowlist + 解決後 IP)
  + `MAX_REDIRECTS` 上限で対処し、http(s) 以外の `Location` は拒否する。
  上流ホストが変わるホップでは `Authorization` / `Cookie` を落とす
  (allowlist 内でもトークンを横展開しない)

### 3.1 残余リスク (Worker 側でも消せないもの)

上の実装でも以下は残る。**allowlist が一次防御であり、IP 検査は多層防御**
という前提を崩さないこと。

- **DoH と実 fetch の間の TOCTOU (rebinding の TTL レース)**: Workers は
  「この IP に繋げ」と固定する手段 (Node の `lookup` フックや IP 直指定 +
  SNI/Host 上書き) を持たない。DoH で公開 IP を確認した直後に TTL 0 の
  レコードを 127.0.0.1 に差し替えられると、実 `fetch` は私設 IP に到達しうる。
  つまり **`isBlockedIp` は rebinding を「難しくする」だけで「不可能にはしない」**。
  rebinding を確実に止めるのは allowlist (攻撃者ドメインがそもそも通らない)
- **リゾルバへの信頼と遅延**: 解決後 IP 検査は `cloudflare-dns.com` の応答を
  信じる設計であり、(a) 信頼の依存先が 1 つ増える (リゾルバが汚染されれば
  検査は無意味になる)、(b) 宛先ごとに最大 2 subrequest ぶんの往復レイテンシが
  上流呼び出しの手前に加算される (数値は自環境で計測すること)。
  DoH 障害時は **fail closed** (403) にしてある — 可用性を優先して
  素通りさせる運用に変えるなら、その瞬間から allowlist だけが防御になると
  理解した上で行う
- **split-horizon / 内部リゾルバとの不一致**: Worker の `fetch` が使う
  リゾルバと `DOH_ENDPOINT` のリゾルバは別物であり、両者の答えが一致する
  保証は無い。A/AAAA が 0 件の宛先は fail closed で拒否している
- **IPv6 transition prefix の網羅は best-effort**: `isBlockedIp` は
  `::ffff:0:0/96` (IPv4-mapped)、`::/96` (IPv4-compatible)、
  `64:ff9b::/96` (RFC 6052 well-known NAT64)、`2002::/16` (RFC 3056 6to4)
  を数値展開して内部 IPv4 に落として検証する。一方、**ネットワーク固有の
  NAT64 prefix (RFC 6052 §2.2 の /32・/40・/48・/56・/64 や RFC 8215 の
  `64:ff9b:1::/48`) は値が任意なため列挙できない**。ここは allowlist のみが砦
- **許可リストのホストが https を話し続ける保証は無い**: 上流が恒久的に
  平文へ移行した場合、この Worker はその宛先を通さなくなる (可用性より
  資格情報の保護を採る)。許可リストは 10 の公開 SaaS で、いずれも https 専用である。
- **上限内の応答でも封筒は膨らむ**: `text()` は UTF-16 の文字列を作るので
  ASCII でも 2 倍、その後の `JSON.stringify` でもう 1 部増える。10 MiB の本文で
  概ね 30 MiB 程度を一度に確保する計算になり、128 MiB の isolate では
  **同時に走る他のリクエストと分け合う**。上限を下げる余地は運用側にある
  (下げるときは `MAX_HTTP_RESPONSE_BYTES` と一緒に下げること —— 2 つの数は
  テストで結ばれている)
- **プロキシ運用者はトークンを閲覧できる**: 本プロトコルは `Authorization`
  を上流へ透過する必要があるため、Worker の運用者は転送されるトークンを
  技術的に読める。**第三者運用のプロキシを登録しないこと**
- 月の Worker 無料枠は十分余裕あり (1 日 10 万リクエストまで)。ただしホップ
  毎の DoH 呼び出しは subrequest 数を消費する (Free プランは 1 リクエスト
  あたり 50 subrequest)

## 4. ホスト先の選択肢

| サービス | 月額 | 設定難度 | 備考 |
|---|---|:---:|---|
| **Cloudflare Workers** | 無料 (~100k req/day) | ★ | 上記コードのまま動作 |
| Vercel Functions | 無料 (~100 GB-hours) | ★ | `pages/api/proxy.ts` に同等コードを配置 |
| Deno Deploy | 無料 (~1M req/月) | ★ | `Deno.serve(...)` で同等 |
| AWS Lambda + API Gateway | $0.20/百万 req | ★★ | 高い柔軟性 |

Node.js / Deno ランタイム (Vercel / Lambda / 自前サーバ) を選ぶ場合は、
DoH の代わりに `node:dns` の `dns.lookup()` を使い、さらに
**`http.Agent` の `lookup` フックで検査済みの IP を固定** できる。これにより
§3.1 の TOCTOU (DoH と実 fetch の間の TTL レース) を実際に閉じられる —
Workers では不可能な唯一の強化点なので、SSRF 耐性を最優先するなら
Node 系ランタイムを選ぶこと。`isBlockedIp` はそのままコピーして使える。

## 5. アプリでの使い方

1. 本アプリの「SE 設定」 → 「BYO プロキシ」 → 「設定する」
2. Worker の URL (例: `https://my-proxy.foo.workers.dev/`) を貼り付け
3. (任意) 同じ共有秘密を入力
4. 保存

Notion / Atlassian / Cloudflare 連携を行うと、自動でこのプロキシ経由になります。
