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

## 2. Cloudflare Worker 実装 (約 50 行)

`workers.cloudflare.com/dashboard` で **Create Worker** → 下記コードを貼り
付け → **Deploy**。`worker.dev` の URL を Settings → BYO プロキシに登録。

```js
// proxy-worker.js
const SHARED_SECRET = ''; // 任意。空文字なら未認証で受け入れる

// 上流ホスト allowlist。BYO の前提でも、ここを絞っておくと
// たとえクライアントが侵害されても被害を局所化できる。
const UPSTREAM_ALLOWLIST = new Set([
  'api.notion.com',
  'api.atlassian.com',
  'api.cloudflare.com',
  // 自分が使うホストだけを明示的に列挙する。
]);

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

    // Optional shared-secret auth
    if (SHARED_SECRET) {
      if (request.headers.get('X-Proxy-Auth') !== SHARED_SECRET) {
        return json({ error: 'unauthorized' }, 401);
      }
    }

    let env;
    try {
      env = await request.json();
    } catch {
      return json({ error: 'invalid JSON envelope' }, 400);
    }

    if (typeof env.url !== 'string') return json({ error: 'url required' }, 400);
    let u;
    try {
      u = new URL(env.url);
    } catch {
      return json({ error: 'malformed URL' }, 400);
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      return json({ error: 'http(s) only' }, 400);
    }

    // ★ DNS rebinding 対策 — hostname allowlist
    // クライアント側 (isPrivateOrReservedTarget) は hostname 段階のチェック
    // しかできない。攻撃者は `evil.example.com` を 1 回目 8.8.8.8 / 2 回目
    // 127.0.0.1 と返して bypass しうる。Worker 側で allowlist を強制すれば
    // どのみち攻撃ドメインは upstream に届かないため、これが最強の防御。
    if (!UPSTREAM_ALLOWLIST.has(u.hostname)) {
      return json({ error: 'upstream host not in allowlist' }, 403);
    }

    // Cloudflare Workers の `fetch` は Cloudflare の DNS リゾルバで
    // 名前解決するため、`getaddrinfo()` を自前で呼ぶ手段は無いが、
    // allowlist で「危ない名前は最初から弾く」方針で実質的に等価な
    // 保護が得られる。専用 IP リゾルバを呼べる環境 (Node.js / Deno) では、
    // `dns.lookup(env.url のホスト)` の結果 IP が
    // 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
    // 169.254.0.0/16 などに該当しないことを fetch 前に再検証すべし。

    const upstream = await fetch(env.url, {
      method: env.method ?? 'GET',
      headers: env.headers ?? {},
      body: env.body,
    });
    const body = await upstream.text();
    const headers = {};
    upstream.headers.forEach((v, k) => { headers[k] = v; });

    return json({ status: upstream.status, headers, body }, 200);
  },
};

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
- **上流ホストを allowlist する** (例: notion.com / atlassian.net のみ受け入れる) — 上の Worker 例ではこれを既定で組み込んでいる
- **DNS rebinding 対策はプロキシ側の責任**: クライアントは hostname 段階の
  best-effort チェック (`isPrivateOrReservedTarget` in `src/renderer/network/proxy.ts`) しか行えない。
  攻撃者は同じ hostname を 1 回目=公開 IP / 2 回目=127.0.0.1 と返すことで
  そのチェックを bypass できる。Worker 側では (a) hostname allowlist、
  (b) 解決後 IP が RFC1918 / loopback / 169.254 / multicast でないかの
  再検証 — のどちらか (理想は両方) を入れること
- 月の Worker 無料枠は十分余裕あり (1 日 10 万リクエストまで)

## 4. ホスト先の選択肢

| サービス | 月額 | 設定難度 | 備考 |
|---|---|:---:|---|
| **Cloudflare Workers** | 無料 (~100k req/day) | ★ | 上記コードのまま動作 |
| Vercel Functions | 無料 (~100 GB-hours) | ★ | `pages/api/proxy.ts` に同等コードを配置 |
| Deno Deploy | 無料 (~1M req/月) | ★ | `Deno.serve(...)` で同等 |
| AWS Lambda + API Gateway | $0.20/百万 req | ★★ | 高い柔軟性 |

## 5. アプリでの使い方

1. 本アプリの「SE 設定」 → 「BYO プロキシ」 → 「設定する」
2. Worker の URL (例: `https://my-proxy.foo.workers.dev/`) を貼り付け
3. (任意) 同じ共有秘密を入力
4. 保存

Notion / Atlassian / Cloudflare 連携を行うと、自動でこのプロキシ経由になります。
