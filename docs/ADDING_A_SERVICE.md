# 新しいサービスを追加する

## 1 行 scaffold

```bash
npm run scaffold -- <id> "<Label>" <ICON> [bearer|oauth|json]
```

| 引数 | 例 | 制約 |
|---|---|---|
| `<id>` | `linear` | lowercase / digits / `-`, 先頭はアルファベット |
| `<Label>` | `"Linear"` | サイドバー / 画面ヘッダに表示される人間向け文字列 |
| `<ICON>` | `LN` | サイドバーアイコン (最大 4 文字、英大文字推奨) |
| `auth-kind` | `bearer` | 省略時 `bearer` |

### auth-kind の選び方

| kind | 認証方式 | 例 |
|---|---|---|
| `bearer` | PAT / API token を `Authorization: Bearer <token>` で送る | GitHub PAT, Notion integration token, Slack bot token |
| `oauth` | OAuth アクセストークンを `Authorization: Bearer <token>` で送る (UX 表記が違うだけで wire は同じ) | Google Drive/Calendar/Gmail, Canva |
| `json` | `{email, token, site}` を JSON で受け取り Basic auth | Atlassian Cloud |

## 例

```bash
npm run scaffold -- linear "Linear" LN bearer
```

これで生成される / 更新されるもの:

```
  create src/main/clients/linear.ts          # フェッチャー (TODO 入りひな型)
  create src/main/clients/__tests__/linear.test.ts  # 1 件のハッピーパステスト
  create src/renderer/pages/LinearPage.tsx   # 標準レイアウトのページ
  patch  src/shared/serviceId.ts             # ServiceId に 'linear' を追加
  patch  src/main/clients/index.ts           # LIVE_FETCHERS に登録
  patch  src/renderer/services.ts            # SERVICES 配列に追加
  patch  src/renderer/data/snapshot.ts       # SNAPSHOT.linear = { items: [] }
```

> **連携スタブの集約:** `{ items, count }` だけを描画する純 snapshot 連携先は、
> scaffold 後に bespoke page/fetcher を消し、`createConnectorStubPage`
> (`src/renderer/pages/ConnectorStubPage.tsx`) と `makeConnectorStubFetcher`
> (`src/main/clients/connectorStub.ts`) に寄せられる。`services.ts` の
> `page:` を factory 呼び出しにし、`<id>.ts` は型 alias + re-export の薄い
> ラッパにすると、`lint:test-coverage` / `client module count` の不変条件を
> 保ったまま重複を除去できる (Microsoft365/Dropbox 等 10 連携先が実例)。

## scaffold 後にやること

1. `src/main/clients/linear.ts` の TODO:
   - URL を実エンドポイントに置換
   - レスポンスの型 (`LinearListResponse`) を実際の API に合わせる
   - 必要なら `Promise.all` で複数エンドポイントを叩く
2. `src/renderer/services.ts` の description プレースホルダを書き換える
3. テストを実 API レスポンスに合わせて拡張 (オプショナル)
4. 検証:
   ```bash
   npm run typecheck
   npm test
   npm run dev    # サイドバーに新タブが出現
   ```

### 書き込み action (`serviceHub.invoke`) を足すとき

1. **入力の欄**は `src/shared/writeFieldLimits.ts` の台帳に載せ、handler は `checkWriteFields` で断る (パス 110 / 111)。
   画面の `maxLength` は台帳の値を読む (数を写さない)。
2. **戻り値の形**は `src/shared/actionData.ts` の `ActionDataMap` に `'service/action'` の鍵で載せる (パス 116)。
   main の handler は `Promise<ActionData<'service/action'>>` を宣言し、ブラウザ版の双子も同じ型を返し、
   画面は `invoke<ActionData<'service/action'>>('service', 'action', …)` と読む ——
   `invoke<{ … }>` と形をその場で書くと `renderer/__tests__/invokeDataTypes.test.ts` が落ちる
   (写しがずれても `tsc` は黙るので、写しを禁じている)。
   **台帳は全域** (パス 117): main の `ACTIONS` に登録した鍵は必ず台帳に載せる —— 載せないと同じ検査の
   両方向の突き合わせが落ちる。構造化された形 (推奨・状態など) は `shared/*.ts` に 1 つだけ置いて台帳から
   結ぶ (main / ブラウザ版 / 画面に写しを作らない)。`ACTIONS` を `Object.fromEntries(…)` で組むなら、走査
   (`pages/__tests__/aiEgressPairs.helpers.ts` の `actionEntries`) が読める形 (CONNECTORS の表) にする ——
   読めない形は「読めない」として鳴る。ブラウザ版の双子は関数の戻り値 `Promise<ActionResult<ActionData<'…'>>>`
   か、dispatch の中の `ok<ActionData<'…'>>(…)` で同じ型を宣言する。
3. `docs/ARCHITECTURE.md` §3.2 の action 行 (payload の欄と検証) を足す —— `verify:arch` が登録済み action と突き合わせる。

## なぜこの形か

- **single source of truth**: ServiceId は `src/shared/serviceId.ts` の `SERVICE_IDS` 配列だけが真実。preload / main / renderer はここから import。
- **マーカーコメント**: scaffold は `// SCAFFOLD:ADD_*_ABOVE` / `_BELOW` を grep して挿入位置を決める。AST パーサ非依存で、CI 不要、Node 標準だけで動く。
- **失敗時の安全性**: id が既存 / マーカー欠落 / 不正引数の場合は何も書かずに exit 1。

## 取り消し

scaffold は idempotent でなく、`git` 経由で undo するのが最速:

```bash
git status
git checkout -- src/shared/serviceId.ts src/main/clients/index.ts src/renderer/services.ts src/renderer/data/snapshot.ts
rm src/main/clients/<id>.ts src/main/clients/__tests__/<id>.test.ts src/renderer/pages/<Pascal>Page.tsx
```

## 既存テンプレートのカスタマイズ

scaffold のテンプレートは `scripts/scaffold-service.cjs` 内のテンプレートリテラル
にハードコードされている。チームの規約 (リクエスト ID ヘッダ、retry, etc.) を
追加したい場合はそこを編集する。
