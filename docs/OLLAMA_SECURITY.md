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

1. **任意 URL の Ollama 接続** — 接続先は `127.0.0.1:11434` 固定。ユーザ設定で他ホスト指定は不可
2. **`/api/pull` の呼び出し** — モデルダウンロードはアプリ内からは禁止。ユーザが CLI でやる
3. **`/api/create` の呼び出し** — 上記 CVE-2024-39719/39721 の根源。アプリ内からは呼ばない
4. **`/api/push` の呼び出し** — 上記 CVE-2024-39722 の根源。同上
5. **任意モデル名の受理** — 正規表現フィルタで制限
6. **ストリーミング (SSE)** — 簡略化のため非同期一発取得のみ。タイムアウト確実
7. **画像 / マルチモーダル入力** — Llava 等の vision モデルは未対応 (画像 base64 が攻撃ベクトルになりうる)

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
