# データ保護監査レポート — 漏洩・損壊・消失は防げるか

> AI オーケストレーション(5 専門チーム: 保存データ暗号 / 通信・漏洩 / 完全性・消失 /
> プラットフォーム堅牢化 / 脅威モデル統括)による実コード監査の総括。各チームが
> 実ファイルを読み、Service Hub 固有の所見をまとめた。

## 結論（先に明言）

**「ローカルを含む全環境でデータ漏洩・損壊・消失を 100% 防ぐ」ことは技術的に不可能。**
アプリ層だけでは次の 3 点を排除できないため:

1. **物理・OS 層** — メモリダンプ / スワップ流出 / ディスク物理読出し / バックアップソフトによる暗号化前複製。
2. **言語層** — JavaScript には確定的なメモリ zero-out 保証がなく、平文トークンが GC 後も RAM に残りうる。
3. **環境前提** — Linux で OS キーチェーン未導入時は `safeStorage` が使えず、`plain:base64`(=暗号化ではない)にフォールバックする。

達成できるのは **「多層防御による実用上のリスク大幅低減」**。本監査では現状を「一般的な Electron アプリの 2〜3 倍の成熟度」と評価した。

## 現状サマリ（実コード所見）

| 領域 | 現状 | 評価 |
|---|---|---|
| トークン暗号化 (Vault) | WebCrypto AES-GCM-256 + PBKDF2 60万回, 鍵 `extractable:false`, メモリ zero-out | 業界水準以上 |
| OAuth トークン (Electron) | OS キーチェーン時は暗号化 / 無い時 `plain:base64` | 環境依存・要警告 |
| 業務レコード (IndexedDB) | **平文 JSON** | 最優先の改善余地 |
| ブラウザに残る物の在庫 | 下の「在庫」節に**全件**。`npm run lint:storage` が台帳と突き合わせる | 2026-08-25 に補完 |
| 通信 | 外部 SaaS の fetcher はすべて HTTPS（平文 http はローカル推論サーバ向けの経路のみ — `docs/SECURITY.md`） / `redactSecrets` でエラー時トークン秘匿 | 良好（網羅拡張余地） |
| Electron 堅牢化 | `contextIsolation`+`nodeIntegration:false`+`sandbox`+CSP+IPC 入力検証 | 優良 |
| RBAC / プラン | 権限昇格防止・最後のオーナー保護・シート/機能ゲート | 正しい |
| バックアップ完全性 | （従来）破損検知なし → **SHA-256 を追加**。改ざん検知は暗号化バックアップ (AES-GCM) の側 | 改善実施 |

## ブラウザに残る物の在庫（全件）

**この表に無い保存先は、問われもしない。** 2026-08-25 までこの文書は
4 つの IndexedDB のうち **2 つ (ライブラリ / preferences) を挙げておらず**、
`sessionStorage` は媒体ごと抜けていた。挙げていなければ「暗号化されているか」
「消えたらどうなるか」を誰も問わないので、**在庫の欠落は評価の欠落**である。

台帳は `scripts/lint-storage-ledger.cjs` の `STORES` にあり、
`npm run lint:storage` が **(a) ソースの実際の保存箇所** と **(b) この文書**
の両方へ突き合わせる。**秘密や利用者が書いた物を持つ行は、ここに名前で
載っていないとゲートが落ちる。**

「立ち退き」は、ブラウザが空き容量や長期の無操作で**その生成元の保存領域を
まとめて消す**こと (Safari の ITP は無操作 7 日)。実測 2026-08-25 で
`navigator.storage.persisted()` は `false`、`persist()` も断られた ——
つまり**下の IndexedDB / localStorage は全部その対象**である。

### IndexedDB

| データベース | 中身 | 保護 | 立ち退き | バックアップ |
|---|---|---|---|---|
| `business-hub-vault` | API キー・トークン | **AES-GCM-256** (マスターパスワード由来の鍵 / PBKDF2-SHA-256 60 万回) | 消える | **入らない**（再登録が要る） |
| `business-hub-data` | 業務レコード（売上・KPI・CRM・不動産・士業） | **平文 JSON**（レコード暗号化のエンジンは在るが**有効化する UI が無く** `isEncryptionEnabled()` は常に false） | 消える | **入る**（唯一） |
| `business-hub-library` | ライブラリの書類（blob） | **平文**。50 MB / 100 件を超えると**アプリ自身が古いものから消す**（画面に明記） | 消える | **入らない** |
| `business-hub-preferences` | プロキシ設定（**共有秘密**を含む）/ 保存先フォルダの許可 | **平文** | 消える | **入らない** |

`business-hub-preferences` の共有秘密が漏れたとき何が起きるかは測ってある ——
`docs/PROXY_EXAMPLE.md` の Worker は秘密の照合とは**別に** `denyReason(target)`
で宛先を検査し、DoH で解決してから private/reserved を弾く。
**秘密だけを得ても SSRF にはならず**、公開宛先への中継に使えるだけである
（Worker の持ち主の帯域の話に留まる）。保管庫へ移すには「解錠前に proxy を
使う経路」の可否を決める必要があるため、現状を書くに留めている。

### Cache Storage（Service Worker・GitHub Pages 公開版だけ）

| キャッシュ | 中身 | 保護 | 立ち退き | バックアップ |
|---|---|---|---|---|
| `service-hub-v2` | アプリシェル（`app.html` / `index.html` / `manifest.webmanifest` / `icon.svg`） | **平文**。ただし入るのは**公開されている静的資産だけ** | 消える（再取得されるので実害なし） | **入らない**（要らない） |

**2026-08-26 まで、この媒体は在庫にも台帳にも無かった。** `lint:storage` は
IndexedDB / localStorage / sessionStorage の 3 つしか走査しておらず、
renderer に `caches.open(…)` を足しても ✅ を返した（実測）。
`document.cookie =` と OPFS も同じく走査の外だった。**「保存先は台帳どおりです」
という一文が、3 媒体についてしか真でなかった**ということである。

入る物を**アプリシェルだけ**に保つのは `assets/sw.js` の 2 つの判定である:

- **同一オリジンの GET 以外には介入しない** — 第三者 API（GitHub / HIBP など）の
  応答が端末に残らない。2026-07 の監査前は全 GET を焼いており、**業務データや
  漏洩調査の結果が平文で無期限に残り、Vault（AES-GCM・自動ロック）の保護を
  迂回しうる**状態だった
- **`res.ok` の応答だけを焼く** — 5xx / 404 をアプリシェルとして固定しない

この 2 つは `src/shared/__tests__/serviceWorker.test.ts` が留めており、
どちらかが戻れば CI が落ちる。上の表の「中身」と「保護」の欄は、
**その 2 つの検査が生きていることに依存している**。

なお Cache Storage は生成元ごとに持たれるので、`hiroto1977.github.io` を
共有する他の Pages サイトとはパスではなく**生成元**で隣り合う。
独自ドメインで生成元を分ける案は未決（`docs/REMAINING_WORK.md`）。

### cookie / OPFS（0 件 — 使っていない）

どちらも**現在ゼロ**で、`lint:storage` が走査するようになったので黙って
増えることはない（足すと「台帳に無い保存先」で落ちる）。
`src/renderer/fs/fsa.ts` の `createWritable()` は File System Access API で
**利用者が選んだ場所**へ書くもので、生成元に紐づくブラウザ保存領域ではない。

### localStorage（20 キー・すべて平文・すべて立ち退きの対象・バックアップに入らない）

利用者が書いた内容が入るもの（**秘密ではないが、漏れれば中身が読まれる**）:

- `assistant-history` / `chatbot-history` / `chatbot-requests` — 会話の中身
- `servicehub.docstudio.v1` / `servicehub.teamradar.draft.v1` — 下書き
- `emotions.store` — 気分の記録

鍵材料:

- `servicehub.recordEncryption` — レコード暗号化の設定と**鍵導出の salt**。
  **バックアップに入らない**ので、暗号化を有効にしたまま書き出した
  バックアップは他の端末で開けない（`BackupPanel` が警告を出す理由）。

残りは配色・お気に入り・最近開いたサービス・プラン・招待コードの引き換え状態・
Ollama の接続先とポート・銘柄のウォッチリスト・クライアント ID 2 種
（`google-client-id` / `ms365-client-id` — **これらは秘密ではない**）。

### sessionStorage（タブを閉じれば消える）

| キー | 中身 | 備考 |
|---|---|---|
| `pkce.verifier` | PKCE の `code_verifier` | **秘密**。認可コードと組で握られるとトークン交換を完了できる |
| `pkce.state` | OAuth の `state` | CSRF 照合用。`safeStateEquals` で定数時間比較・不一致は throw |
| `pkce.clientId` / `pkce.redirectUri` | 交換に使う値 | 秘密ではない |

出口は `clearPkceSession()` の 1 つで、**呼び出し側の `finally`** から呼ぶ。
以前は成功経路にしか掃除が無く、**`state` 不一致（= CSRF の疑い）で落ちたときに
いちばん消したい verifier が残っていた**（2026-08-23 に修正、検査で固定）。

## 本リリースで実装した独自セキュリティ機能

1. **バックアップ完全性検証 (SHA-256)** — `data/backup.ts`。バックアップ JSON に records の
   SHA-256 チェックサムを埋め込み、復元時に再計算して照合。**破損**を検知して復元を拒否する
   （改ざん検知ではない —— 鍵が無いので、書き換えた側が計算し直せば通る。実測は
   `src/renderer/data/__tests__/backup.test.ts`）
   (損壊対策)。再フォーマットには強く、内容変更に反応。旧バックアップ(checksum 無し)は後方互換で許容。
2. **置換復元の確認ダイアログ** — `components/BackupPanel.tsx`。「既存データ全削除→復元」前に確認を挟み、
   誤操作によるデータ消失を防止。
3. **Shopify コネクタのエラー時トークン秘匿** — `clients/shopify.ts` の `postExpectOk` に `redactSecrets`
   を適用。連携先(Discord webhook 等)が応答にトークンを反射してもエラー経由で漏れない(漏洩対策)。
4. **`redactSecrets` の Atlassian トークン対応** — `ATATT…` 形式を秘匿対象に追加。
5. **暗号化バックアップ (AES-GCM-256)** — `security/dataCrypto.ts` + `data/backup.ts`。
   パスフレーズ指定でバックアップ全体を PBKDF2-SHA256(21万回)→ AES-GCM で封緘
   (漏洩対策: バックアップファイルは最も持ち出されやすい流出経路)。誤パスワード・
   改ざんは GCM 認証タグで復号失敗となる。**改ざんに耐えるのはこちらだけ**で、
   平文側の SHA-256 が担うのは破損検知である（二層ではなく役割が違う）。

## 優先度の高い残対策（漏洩 / 損壊 / 消失 別）

| 優先 | 対策 | 主に効く脅威 | 備考 |
|---|---|---|---|
| 1 | ~~業務レコードを AES-GCM 暗号化~~ → **エンジン + 有効化/アンロック/解除のオーケストレーションまで実装済み** (`recordCipher.ts` + `recordEncryption.ts`: enable/unlock/disable, KCV 検証, `store.configureCipher`/`reencryptAll(from)`)。誤パスフレーズは false を返すだけ (ロックアウトしない)。残りは設定 UI/起動時アンロック画面の配線のみ | 漏洩 | 既定は平文(後方互換)。封緘後はキー無しで閲覧不可 |
| 2 | Electron `secrets` の keychain 非依存パスフレーズ暗号化 + 未初期化警告 UI | 漏洩 | `plain:base64` フォールバック解消 |
| 3 | ~~`secrets.json` の atomic write~~ → **実装済み** (`atomicWrite.ts`: fsync + dir fsync + `.prev` バックアップ + temp 後始末、読取りは `.prev` フォールバック) | 消失 | 強制終了/電源断時のトークン破損・消失を防止 |
| 4 | ~~CSV 一括取込のトランザクション化~~ → **実装済み** (`store.insertMany` = 単一 IndexedDB tx で全件 commit/全件 abort)。SalesPage/KpiPage の CSV 取込を per-row ループから `addMany` に置換。復元 (`importAll`) は元から単一 tx で atomic | 損壊 | 取込途中失敗での部分書込みを防止 |
| 5 | プロキシ漏洩緩和 → **一部実装**: プロキシのエラー応答に反射したトークンを `redactSecrets` で秘匿 (`shared/redact.ts` に集約し main/renderer 共有) + 機密性の前提を明文化。upstream へは Authorization 透過が必須のため、第三者運用プロキシでは運用者がトークンを閲覧可能 → 自己運用を推奨 (本質的な残リスク) | 漏洩 | 第三者 Worker ログ対策 |

## STRIDE 対応状況（要約）

- Spoofing: OAuth PKCE / Bearer / Basic。
- Tampering: HTTPS・IPC 入力検証・**バックアップ SHA-256（本リリース）**。
- Repudiation: `audit-log` 機能フラグ（Business+）。完全な監査ログは将来。
- Information Disclosure: 業務レコードの保存時 AES-GCM 暗号化エンジン (`recordCipher`) を
  実装し、`field-level` で `data` を封緘可能に (既定は後方互換の平文; 常時有効化 UI は次段)。
- DoS: timeout / サイズ上限 / レート制御。
- Elevation of Privilege: RBAC の昇格防止・最後のオーナー保護で対処済み。

> 生メトリクス（サービス数・テスト数等）は [`ARCHITECTURE.md`](./ARCHITECTURE.md) を正とする。
