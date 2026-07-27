# Ollama 連携のセキュリティ分析

Service Hub の Ollama タブは、ローカルで動く Ollama サーバ
(`http://127.0.0.1:11434`) を **読み出し中心 + 厳格な入力検証** で扱います。
ここでは、Ollama 自体の既知脆弱性と、それに対する本アプリ側の防御策をまとめます。

## 既知の Ollama CVE (確認済み・代表的なもの)

> 最新の完全なリストは https://github.com/ollama/ollama/security/advisories
> および NVD で確認してください。本リポジトリのコードはこれらを参考に防御を
> 設計していますが、Ollama 本体のパッチ追跡は **ユーザの責任** です。

| CVE | 概要 | 影響 | 修正バージョン |
|---|---|---|---|
| **CVE-2024-37032** ("Probllama") | `/api/pull` のパストラバーサル → 任意ファイル上書き → RCE | リモートコード実行（Ollama が任意ホストへ公開されている場合） | **0.1.34** 以降 |
| **CVE-2024-39719** | `/api/create` 経由のファイル存在情報漏洩 | 情報漏洩 | 0.1.46 以降 |
| **CVE-2024-39720** | 不正な GGUF ファイルで OOB read → DoS | DoS | 0.1.46 以降 |
| **CVE-2024-39721** | `/api/create` に `/dev/random` パスを与える DoS | DoS | 0.1.46 以降 |
| **CVE-2024-39722** | `/api/push` 経由のファイルシステム情報漏洩 | 情報漏洩 | 0.1.46 以降 |

→ **Ollama 0.1.46 以降 (推奨: 最新安定版)** を使ってください。Service Hub はバージョン
を取得して `0.1.46` 未満なら警告バッジを表示します。

## Ollama 自体の構造的リスク

CVE になっていない設計上の注意点:

| リスク | 説明 | Service Hub の対応 |
|---|---|---|
| **デフォルト無認証** | Ollama は 127.0.0.1 のみ listen するが、認証機構が無い。`OLLAMA_HOST=0.0.0.0` で公開すると誰でも自由にアクセス可能 | 接続先 URL を `127.0.0.1:11434` にハードコード。ユーザが書き換えても他ホストへ送信しない |
| **CORS が緩い** | 古いバージョンでは `*` Origin 受理。ブラウザベース XSS や DNS rebinding で奪取可能 | Electron なのでブラウザ CORS 経路を踏まない (main プロセスから fetch) |
| **モデル名にパストラバーサル可能だった過去** | `../../../etc/passwd` 等が通った | モデル名を `^[a-z0-9._:/-]+$` 限定で正規表現フィルタ |
| **巨大モデルで OOM** | 70B+ モデルをロードするとホスト OOM | クライアントから直接 pull はせず、ユーザが `ollama pull` で取得済みのモデルだけリストして使う |
| **GGUF ファイルパーサのバグ** | 不正な GGUF で Ollama がクラッシュ | これは Ollama 本体の問題。最新版維持で対処 |
| **無制限のレスポンス** | 大量出力で OOM | レスポンス読み取り時に 10 MB で truncate |
| **長いストリーミング**で UI freeze | streaming 応答が無限に続く | 30 秒タイムアウト + AbortController |
| **テレメトリ** | 古い Ollama で匿名利用統計が外部送信 | アプリ側で制御不可、Ollama 設定で `OLLAMA_DISABLE_TELEMETRY=1` を設定推奨 |

## 未パッチの最新脆弱性（ベンダー報告済み・パッチ未公開）

**モデル / エンジンファイル形状の不備による Out-of-Bounds Read** が報告されています:

- **状態**: ベンダー (Ollama) へ報告済み、公式パッチ未公開
- **影響**: ヒープメモリ領域の不正読み出し → データ漏洩、最悪のシナリオで RCE
- **攻撃ベクトル**: 悪意ある GGUF / 関連エンジンファイルをロード
- **緩和策（公式パッチ無いため運用で対処）**:
  1. **モデルアップロード機能を制限または無効化** (`/api/pull`, `/api/create`, `/api/push` を呼ばない)
  2. **信頼できないユーザ / ネットワーク** に Ollama を公開しない
  3. 外部からモデルを受け入れる場合は **検証済みソースのみ** (Hugging Face 公式の署名付き、Ollama 公式 library のみ)
  4. `~/.ollama/models/` のファイルパーミッションを 0700 に固定
  5. ネットワーク隔離 (firewall で 11434 を inbound deny)

**Service Hub の実装はこの未パッチ脆弱性への対応として、危険な書き込みエンドポイントを
1 つも呼ばない設計**になっています。アプリ内からモデルダウンロードはできず、ユーザが CLI
で `ollama pull` した既存モデルを read-only でリストするだけ。これにより本アプリ自体が
このゼロデイの攻撃ベクトルになることはありません。

**多層防御として `src/main/clients/ollama.ts` に `ALLOWED_ENDPOINTS` 集合をハードコード**し、
`withTimeout()` ヘルパで fetch 直前に runtime 検証します。これにより、将来このファイルを
編集する開発者が誤って `/api/pull`・`/api/create`・`/api/push`・`/api/copy`・`/api/delete`・
`/api/blobs`・`/api/upload` を呼ぼうとしても、`FetchError("ollama endpoint not in allowlist")`
で即座に拒否されます (回帰テストあり: `src/main/clients/__tests__/ollama.test.ts`)。

さらに、Ollama が起動して接続できる毎リクエストで `UNPATCHED_OOB_NOTICE` を
snapshot の `warnings[]` に追加し、UI のステータスバーで継続的にユーザへ注意喚起します
(運用上 CLI 経由でモデルを取得する際に「検証済みソースのみ」を選ぶよう誘導)。

ただし **Ollama 本体は別経路（curl / 別アプリ / ネットワーク）から攻撃される可能性あり**。
本ドキュメントの「推奨される Ollama 運用設定」のネットワーク隔離手順を徹底してください。

## Service Hub の Ollama 連携で具体的にやらないこと

これは「**実装拒否ライン**」。攻撃面を最小化するため敢えて未対応:

1. **任意 URL の Ollama 接続** — Electron 版は `127.0.0.1:11434` 固定 (`OLLAMA_BASE`)。
   ブラウザ版のみ接続先を設定できるが、許可されるのは後述の **3 経路だけ**で、
   平文 http による別ホスト接続は拒否する (`isAllowedOllamaBase`)
2. **`/api/pull` の呼び出し** — モデルダウンロードはアプリ内からは禁止。ユーザが CLI でやる
3. **`/api/create` の呼び出し** — 上記 CVE-2024-39719/39721 の根源。アプリ内からは呼ばない
4. **`/api/push` の呼び出し** — 上記 CVE-2024-39722 の根源。同上
5. **任意モデル名の受理** — 正規表現フィルタで制限
6. **ストリーミング (SSE)** — 簡略化のため非同期一発取得のみ。タイムアウト確実
7. **画像 / マルチモーダル入力** — Llava 等の vision モデルは未対応 (画像 base64 が攻撃ベクトルになりうる)

## ブラウザ版 (`build:web`) の連携

Electron 版は main プロセスから叩くのでブラウザの CORS 経路を踏まないが、
ブラウザ版は踏む。制約は `src/shared/ollama.ts` に 1 つだけ置き、
Electron / ブラウザ / CLI の 3 経路で共有する（片方だけ緩い状態を作らないため）。

**許可する接続先は 3 通りだけ** (`isAllowedOllamaBase`):

| # | 経路 | 許可する理由 |
|---|------|-------------|
| 1 | ループバック (`127.0.0.1` / `localhost` / `::1`) | 同一端末で動かす通常ケース。Secure Contexts 仕様で "potentially trustworthy" なので https ページからでも mixed content にならない |
| 2 | **ページ自身と同じホスト名**への http | PC で配信したページをスマホから開く構成。利用者は既にそのホストからアプリを読み込んでおり、新たな到達先を与えていない (内部探索には使えない) |
| 3 | 任意の **https** エンドポイント | cloudflared / Tailscale Serve 等のトンネル。相手が CORS で明示的に許可しない限り読めないため、ホスト名を絞らなくても踏み台にならない |

平文 http で**別ホスト**は常に拒否する — 内部ネットワーク探索の踏み台化と、
プロンプトの平文送信を防ぐため。認証情報つき URL・パス/クエリつき URL も拒否。

叩くのは `/api/version`・`/api/tags`・`/api/chat` の 3 本のみ (`OLLAMA_READ_PATHS`)。
チャットは Electron 版と同じ検証を通す: モデル名検証・NUL 拒否・system 8 KB /
prompt 32 KB クランプ・`stream:false`・120 秒タイムアウト・応答サイズ上限
(`src/renderer/network/ollamaWeb.ts` の `chatOllama`)。

**失敗理由の切り分け**: 通常 fetch が失敗したら `mode:'no-cors'` で再試行する。
no-cors が通れば「到達しているが CORS 拒否」、両方失敗なら「未起動 / ポート違い」。
利用者にはどちらも『つながらない』に見えるが、前者は `OLLAMA_ORIGINS` を足せば直るので
取り違えると「壊れている」と誤解される。HTTP 403 も同じ直し方なので同列に扱う。

**エラー応答の翻訳**: Ollama は失敗時に `{"error": "…"}` を返す。生の英語をそのまま
出すと次に何をすべきか分からないため、`describeOllamaError` で種類 (未取得モデル /
メモリ不足 / 推論プロセス異常 / origin 拒否 / エンドポイント不在) に分類し、日本語の
説明と手順に変換する。未取得モデルのときだけ `/api/tags` を引いて、実際にあるモデル名と
近いモデルの提案 (`llama3.2` → `llama3.2:latest`) を添える。

E2E は `npm run e2e:ollama` (実 chromium + スタブ Ollama)。未起動 / CORS 未許可 /
接続成功 / **チャット往復** / 別端末経路 / 許可外拒否 の 6 状態を実機で固定している。
ブラウザを介さない経路として `npm run ollama` (CLI) もあり、こちらは CORS も
mixed content も原理的に発生しない。

## 推奨される Ollama 運用設定

`~/.bashrc` / `~/.zshrc` 等で:

```bash
# Ollama を必ず localhost にバインド (デフォルト)
export OLLAMA_HOST=127.0.0.1:11434

# 不要な外部 telemetry を無効化
export OLLAMA_DISABLE_TELEMETRY=1

# 同時実行モデル数を制限（OOM 防止）
export OLLAMA_MAX_LOADED_MODELS=1

# モデルストアの位置を確認（権限 0700 推奨）
chmod 700 ~/.ollama
```

systemd 等で動かす場合は `User=` を非特権ユーザにし、`Restart=on-failure` でクラッシュ
からの自動復旧（DoS CVE 対策）。

## 監査ログとの統合

Ollama は何もログ出力しないため、Service Hub 側で「いつ何のモデルにどんなプロンプトを
送ったか」を Emotions タブの analyses[] のように記録できます（現在は未実装、roadmap）。
個人情報が含まれるため `safeStorage` を介した暗号化推奨。

## バージョン確認の動作

Service Hub は起動時 (および「更新」ボタン押下時) に:

1. `GET http://127.0.0.1:11434/api/version` で Ollama のバージョンを取得
2. メジャー・マイナー・パッチを `0.1.46` と比較
3. それ未満なら **警告バッジ「Outdated — known CVEs」** をステータスバーに表示
4. 「アップグレード手順」を `docs/OLLAMA_SECURITY.md`（本ファイル）へリンク

接続不可（Ollama が起動していない）の場合はバッジが `Not running` になり、
モデルリストは空 + チャットフォーム無効化。

## アップグレード手順

```bash
# macOS / Linux (公式インストーラ)
curl -fsSL https://ollama.com/install.sh | sh

# 既存インストールがあれば差分更新
ollama --version  # まず現バージョン確認
# その後上記スクリプトを再実行で in-place 更新

# Docker
docker pull ollama/ollama:latest
docker compose up -d
```

更新後 `ollama --version` で 0.1.46 以上を確認してください。
