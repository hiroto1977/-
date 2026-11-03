# ローカル LLM（LiteLLM）

Service Hub の AI 機能は、まずこの端末の LiteLLM（OpenAI 互換）へ送り、届かなければ Anthropic へ退避する。株式・事業の助言、全 AI 合議、士業の画面、安全検査、計算、外部サービスそのものはクラウドのままである。

## 既定

| 項目 | 値 |
| --- | --- |
| ベース URL | `http://127.0.0.1:4000/v1` |
| 環境変数（URL） | `SERVICE_HUB_LLM_BASE_URL`（未設定なら上の既定） |
| 環境変数（鍵） | `SERVICE_HUB_LLM_API_KEY`（Bearer。空なら鍵なしで送る） |
| アシスタントの資格情報 | `compatUrl` / `compatModel` / `compatKey`。環境変数が空のとき、URL と鍵はこちらを使う |

アシスタントの「エージェント自動」は LiteLLM の別名 `auto` を使う。画面で提供者を明示したときは、その提供者だけを使う（全 AI 合議も従来どおり）。

ループバックへの平文 http は、鍵を載せていても `src/shared/aiEndpoint.ts` が許す。

別名 `fast` / `balanced` / `smart` / `auto` の振り先は `local-ai/orchestrator/litellm-config.yaml` が持つ。プロキシの待受は `http://127.0.0.1:4000`。

## 用途と別名

| 用途 | 別名 |
| --- | --- |
| 感情分析 | `fast` |
| コンシェルジュの自由質問 | `balanced` |
| アシスタント（自動） | `auto` |
| Gmail の振り分け | `fast` |
| Slack のチャンネル整理 | `fast` |
| 専属カウンセラーの相談 | `balanced` |
| 単純なスキル | `fast` |

別名 `smart` は表に予約してあるが、この移行では使わない。

退避先の Anthropic は、その機能が元々使っていたモデルのままである（感情は高速モデル、スキルとアシスタントは既定の Claude）。

## 資格情報の例

```json
{
  "default": "compat",
  "compatUrl": "http://127.0.0.1:4000/v1",
  "compatModel": "auto",
  "compatKey": "（SERVICE_HUB_LLM_API_KEY と同じ値）",
  "anthropic": "sk-ant-…"
}
```

`compatKey` と `anthropic` はリポジトリに書かない。環境変数か、アプリの保管庫にだけ置く。

## 見送ったもの

`.claude/agents/scout.md` は開発時の読み取り専用エージェント定義である。タスク階層の検査、整合性チェーン、指示ファイルの台帳が名前と frontmatter を固定している。検索スクリプトへ置き換えると、その定義を読んでいる検査とチェーンが同時に壊れる。実行時の Service Hub の機能ではない。

TODO: scout を検索スクリプトへ寄せるなら、チェーンと taskTierPolicy の台帳を同時に更新する別の変更で行う。
