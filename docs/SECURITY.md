# セキュリティ脅威モデル + 緩和策

Service Hub の脅威モデルと、それに対する具体的な防御。実装後の見直しは
GitHub Issues / PR ベースで運用。

## 脅威モデル

| 攻撃者 | 想定アクセスレベル | 目的 |
|---|---|---|
| **A1 ローカル非特権** | 同一マシン上の別ユーザ | 他ユーザのトークンを盗む |
| **A2 ローカル特権** | 同一マシンで該当ユーザのファイルを読める | トークン取得 |
| **A3 攻撃ウェブサイト** | ブラウザ経由 | XSS / redirect 経由でアプリ操作 |
| **A4 中間者 (MITM)** | ネットワーク経路 | API リクエストの傍受 / 改ざん |
| **A5 悪意あるサービスサイト** | サイト URL を保存させる | アプリ経由で別サイトに資格情報を送らせる |
| **A6 CVE のあるサードパーティ** | 依存ライブラリ経由 | 任意コード実行 |
| **A7 Ollama** | ローカル LLM サーバの既知 / 未パッチ脆弱性 | メモリ漏洩 / RCE / DoS |

## 緩和策一覧

### A1, A2: トークン保管

| 攻撃 | 緩和 | 実装場所 |
|---|---|---|
| 別ユーザによる secrets.json 読み取り | `mode: 0o600` (owner-only read) | `src/main/secrets.ts` `writeStore` |
| 同一ユーザのファイル流出 | OS keychain (`safeStorage`) で AES 暗号化 | `src/main/secrets.ts` `encode/decode` |
| keychain 非利用環境 | plain-base64 フォールバック（**警告: 暗号化ではない**） | 同上 |

**plain-base64 は実質平文**。Linux で gnome-keyring / kwallet が無い場合、
ファイルアクセスを得た攻撃者はトークンを即時取得可能。これを根本解決するには
ユーザパスフレーズによるキー導出が必要（未実装、roadmap）。

### A3: XSS / 悪意ある外部コンテンツ

| 攻撃 | 緩和 |
|---|---|
| Renderer での任意スクリプト実行 | Content-Security-Policy (`src/renderer/index.html`): `script-src 'self'` で外部・インラインスクリプト全拒否 |
| `<base>` タグ注入による相対 URL 乗っ取り | `base-uri 'self'` |
| `<form>` POST による情報抜き出し | `form-action 'none'` |
| `<iframe>` 経由クリックジャック | `frame-src 'none'` |
| `<object>` プラグイン | `object-src 'none'` |
| ノードアクセス権限剥奪 | `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` |
| renderer から file:// 等のスキーム経由でファイル読み出し | `app:openExternal` IPC が http(s) のみ受理 |
| 新 window 開放 | `setWindowOpenHandler` で全部 deny + `openExternal` 経由 |

### A7: Ollama (ローカル LLM サーバ)

| 攻撃 | 緩和 |
|---|---|
| Ollama 既知 CVE (Probllama / CVE-2024-37032 系統) | `MIN_SAFE_VERSION = 0.1.46` をクライアントにハードコード、起動時に `/api/version` で照合 → 古ければ警告バッジ |
| 未パッチ OOB read 脆弱性 (モデル/エンジンファイル形状由来) | `/api/pull` / `/api/create` / `/api/push` をクライアントから呼ばない設計。悪意あるモデルロードの経路を遮断 |
| 接続先改ざん (`OLLAMA_HOST` 設定や IPC 経由で別ホスト誘導) | **Ollama サービスページの経路** (`main/clients/ollama.ts`) は URL を `http://127.0.0.1:11434` に **ハードコード**し、renderer / IPC ペイロードでは変更不可。**AI プロバイダ経路** (`shared/ai/providers.ts`) は別で、利用者が設定でベース URL を変えられる (鍵を送らないため平文 http の宛先を絞っていない — `shared/aiEndpoint.ts` に理由)。送られるのはプロンプトで API キーは載らないが、**公開ホストを平文で指定すれば内容は経路上で読める** |
| モデル名へのパストラバーサル / コマンドインジェクション | `^[a-z0-9][a-z0-9._:/-]+$` 正規表現で sanitize、`..` 含有を別途 reject |
| 巨大レスポンスによる OOM / DoS | 30s timeout (AbortController)、10 MB レスポンス上限、stream:false 固定 |
| Ollama 自体のネットワーク露出 | 運用文書 (`docs/OLLAMA_SECURITY.md`) で `OLLAMA_HOST=127.0.0.1:11434` 固定 + firewall を推奨 |

詳細は `docs/OLLAMA_SECURITY.md`。

### A4: MITM

| 攻撃 | 緩和 |
|---|---|
| API トラフィック傍受 | 外部 SaaS の fetcher は**すべて https**。平文 http は**ローカル推論サーバ向けの 2 経路だけ** — `clients/ollama.ts` の `http://127.0.0.1:11434` (固定) と、AI プロバイダの鍵を送らない構成 (上記) |
| Atlassian の Basic auth が http で送られる | `parseAtlassianToken` が **`https://` 必須**、`http://` を hard reject |
| OAuth リダイレクト改ざん | **PKCE (RFC 7636)** で `code` を verifier 必須化 — code を傍受しても token 交換不可。**PKCE 非対応の 3 つ (Notion / WordPress.com / Atlassian 3LO — いずれも提供側の仕様書に `code_challenge` の記載が無い)** は confidential client として **client secret** が交換に必須で、同じ性質を別の仕組みで満たす。「PKCE も secret も無い public client」は存在しないことを `oauth.test.ts` が検査する |
| OAuth state CSRF | `randomBytes(16)` 由来の state を検証 |
| OAuth callback ホスト偽装 | ループバックサーバが `Host` ヘッダを 127.0.0.1/localhost/[::1] のみ許可 |

### A5: 悪意ある保存先 URL

| 攻撃 | 緩和 |
|---|---|
| Atlassian site に攻撃サイトを保存 → 認証情報送信 | `parseAtlassianToken` が `https://` + 解釈可能な URL を要求 |
| WordPress site_id にスクリプト | `encodeURIComponent` で path escape |
| Cloudflare zone id にスクリプト | 同上 |
| openExternal を javascript: 等で誘導 | http(s) のみ許可 |

### A6: サプライチェーン

| 攻撃 | 緩和 |
|---|---|
| 既知 CVE のあるパッケージ | `npm audit --omit=dev` で **production 0 件** を維持 (CI の段)。dev deps の CVE は出荷物に入らないので件数は落とさないが、**自分で押さえた版 (セキュリティの床) は `lint:deps` の台帳が守る** —— 宣言が消える・指定が緩む・lockfile が下回るのいずれでも落ちる。床がまだ十分かは `npm run audit:floors` (勧告データベースに出る・定期点検) |
| 不審な新規依存追加 | PR ごとの diff レビュー、`package-lock.json` 同梱 |
| build chain の改ざん | `electron-builder` を pin (`^26.15.3`)、取得元は registry のみ・integrity 必須 (`lint:deps`) |

## ネットワーク呼び出しの全リスト

すべて https。各サービスがアクセスするドメインを明示:

| サービス | アクセス先 |
|---|---|
| GitHub | `api.github.com` |
| WordPress.com | `public-api.wordpress.com` |
| Atlassian | `{site}.atlassian.net` (https のみ) |
| Notion | `api.notion.com` |
| Google (Drive/Calendar/Gmail) | `www.googleapis.com`, `gmail.googleapis.com`, `accounts.google.com`, `oauth2.googleapis.com` |
| Slack | `slack.com` |
| Canva | `api.canva.com` |
| Skills (Anthropic) | `api.anthropic.com` |
| Security (HIBP/VT) | `haveibeenpwned.com`, `www.virustotal.com` |
| Cloudflare | `api.cloudflare.com` |
| Emotions (Anthropic) | `api.anthropic.com` |

`shell.openExternal` 経由でユーザブラウザに開かれる URL は別管理 — 各サービスタブの
「開く」ボタン経由のみ、http(s) のみ許可。

## 継続監視 (2026-10-11 · パス 509)

「侵入される前に検知し、解析し、対策し続ける」ために、リポジトリが自分で回している門と
予定実行を一覧にする。**どれも端末や利用者のアカウントは見ていない** —— 見られるのは
このリポジトリの中身 (コード・依存・workflow・資格情報の混入) だけである。

| 層 | 何を検知するか | いつ | 結果の行き先 | 対策 |
|---|---|---|---|---|
| 資格情報の混入 (`lint:secrets`) | 追跡ファイルに発行元の接頭辞を持つ鍵の形 (GitHub / AWS / Slack / Anthropic / OpenAI / Google / Stripe / PEM) | 全 PR・push (ci.yml と verify:all) | 赤 = 取り込まれない | 台帳 `ALLOWED` に無い一致は落ちる。見本だけが台帳に載る (件数と理由つき・双方向) |
| 悪意のあるコードの形 (`lint:malware`) | 依存のインストール時に走るコード (取得・シェル・復号)・復号した値を実行する形・環境変数の全体を外へ送る形・実行と通信が同じファイルに在る形・難読化の塊 (追跡ファイル・インストール時のフック・`--artifact` で配る HTML) | 全 PR・push (ci.yml と verify:all) | 赤 = 台帳に無い一致・重大な一致 | 台帳 `ACCEPTED` に件数と理由つきで載せる (増えたら落ちる)。**検知の限界**: 署名の DB を持つ従来型のウイルス対策ではなく、既知の形の組み合わせを見る。端末の保護ではない |
| 危険な API・難読化 (`lint:forbidden`) | eval・innerHTML・nodeIntegration 等 | 全 PR | 赤 | 修正 |
| workflow の守り (`lint:workflow-security`) | 権限の既定・第三者 action の可動タグ・pull_request_target・`${{ }}` の埋め込み | 全 PR | 赤 | 修正 |
| 依存の勧告 (`dependency-audit`) | `npm audit` (全体と本番) と、床 (`SECURITY_FLOORS`) を勧告データベースに当てた結果 | **毎日** 07:00 JST | 常設 Issue 1 つ (要対応 0 件なら閉じる) | 人が直す。床は `npm run audit:floors` で測り直す |
| 依存の更新 (`.github/dependabot.yml`) | 版の更新と、リポジトリ設定で有効にした場合のセキュリティ更新 | 毎週 (通常の更新) | 更新 PR (グループ化・上限 5 本) | PR が CI を通す = 検証は既存の門 |
| 変異検査 (`mutation.yml`) | 検査が本当に守っているか | 週次 + 触ったファイル | Actions の失敗 | 検査を足す |

## 人が GitHub の設定で有効にする物 (リポジトリの外では設定できない)

これは **リポジトリの設定** で、コードでは有効にできない。確かめる場所は Settings → Code security。

1. **Secret scanning** と **Push protection** —— 鍵を push の時点で止める。`lint:secrets` は
   追跡ファイルの**今の内容**しか見ない。履歴に残った鍵は GitHub 側の走査が見る。
2. **Dependabot alerts** と **Dependabot security updates** —— `dependabot.yml` は通常の更新だけを
   決める。脆弱な版を直す PR は、この設定を有効にしないと作られない。
3. **Code scanning (CodeQL)** —— 公開リポジトリでも有効化できる。ワークフローを足すと SHA 固定の
   action が要るので、設定から有効にする方が安全。

## 正直に言う: 侵入を事前に止めることはできない物

- **端末・利用者のアカウントへの侵入**は、このリポジトリからは見えない。EDR・SIEM・
  ブラウザ側の監視の仕事で、アプリの範囲外である。
- **勧告は公開後に出る**。毎日の確認は「公開から最大 1 日で気付く」であって、「公開前に止める」ではない。
- **悪意のあるコードの形 (`lint:malware`) は、既知の形の組み合わせしか見ない。** 分割・遅延・
  暗号化された悪意 (復号の鍵を別の場所に置く等) は見逃す。偽陽性は台帳 `ACCEPTED` に件数と理由で
  載せている (2026-10-11 時点で 8 件・すべて固定のコマンドか公式の取得スクリプト)。
  **依存の中身の全部は読まない** —— インストール時に走る部分と、その部分が呼ぶ .js だけを見る。
- **履歴の中の鍵**は `lint:secrets` の対象外 (今の内容だけを見る)。履歴は上の 1. の GitHub 側の走査か、
  `git log -p` の手動の点検で見る。

## 残課題（roadmap）

1. **パスフレーズベース暗号化** — keychain 非利用環境でも本物の AES 暗号化
2. **電子署名** — macOS Developer ID + Windows EV 証明書（`docs/REMAINING_WORK.md` Phase 7-1）
3. **自動アップデートの TLS 検証** — `electron-updater` 導入時にコード署名で integrity 確認
4. **CSP nonce** — 現状 `'self'` 一括許可、将来的に script に nonce を付ける
5. **Subresource Integrity** — 外部 CDN を使わない設計なので現状不要だが、追加時は SRI 必須

## レビューチェックリスト

新しい fetcher / action を追加する PR で確認するもの:

- [ ] エンドポイント URL は https
- [ ] ユーザ入力の URL は `new URL().protocol === 'https:'` で検証
- [ ] ユーザ入力の path 部分は `encodeURIComponent`
- [ ] `Authorization` ヘッダを log 出力していない
- [ ] エラーメッセージで API キーを echo していない (`message.slice(0, 200)` のみ)
- [ ] OAuth フローは PKCE + state 検証 を満たす

## 関連

法令を踏まえたトラブル防止ルール（個人情報保護法／不正アクセス禁止法／各士業法／景表法 等
への対応と担保状況）は [docs/COMPLIANCE_RULES.md](./COMPLIANCE_RULES.md) を参照。
