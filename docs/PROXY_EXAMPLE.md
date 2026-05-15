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

## 2. Cloudflare Worker 実装 (約 30 行)

`workers.cloudflare.com/dashboard` で **Create Worker** → 下記コードを貼り
付け → **Deploy**。`worker.dev` の URL を Settings → BYO プロキシに登録。

```js
// proxy-worker.js
const SHARED_SECRET = ''; // 任意。空文字なら未認証で受け入れる

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
- 上流ホストを allowlist する (例: notion.com / atlassian.net のみ受け入れる) のがベター
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
