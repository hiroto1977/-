# 必要なときだけ繋ぐ MCP サーバ

2026-11-05 から、Grok の MCP サーバ (`grok` → `@joemccann/xai-mcp-server@1.0.7`) は
**既定では起動しません**。`.claude/settings.json` の `mcpServers` は Claude Code が
セッション開始のたびに全部起動し、`env` の資格情報もそのたびに渡るためです。このサーバは
**xAI の公式ではなく** (個人 maintainer の名前空間)、生きた鍵 `XAI_API_KEY` を受け取ります。

## 使うとき (明示的に繋ぐ)

```sh
XAI_API_KEY=... claude --mcp-config .claude/mcp-on-demand/grok.json
```

- その 1 セッションだけ `grok` サーバが起動します。セッションを閉じれば止まり、常駐しません。
- 鍵は `${XAI_API_KEY}` の参照なので、**その起動時の環境に在るときだけ**渡ります。
  ふだんのシェルに `XAI_API_KEY` を置いておく必要はありません。
- 何も付けずに `claude` を起動したときは、Grok のサーバも鍵も一切関与しません (既定 OFF)。

## 門と鎖

- `npm run lint:mcp-servers` が `.claude/mcp-on-demand/` を台帳 `ON_DEMAND_LEDGER` と双方向に照合します。
  必要時サーバを `settings.json` へ戻すと鳴ります (自動起動に戻るため)。1 ファイル 1 サーバ・
  ファイル名 = サーバ名・最上位の鍵は `mcpServers` だけ・素の名前は 0 件まで。
- `.claude/mcp-on-demand/grok.json` は整合性チェーン (`chain:verify`) と CODEOWNERS の保護対象です。
- 版を上げるときは tarball を読み直し、台帳と設定の両方を同じ版へ直してください。
- 検査: `src/shared/__tests__/mcpOnDemand.test.ts` (既定 OFF / 明示 ON / 戻すと鳴る)。

新しく「必要なときだけ」にしたいサーバは、`.claude/mcp-on-demand/<名前>.json` を置き、
`ON_DEMAND_LEDGER` に理由つきで足してください。
