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
| 通信 | 全 fetcher HTTPS / `redactSecrets` でエラー時トークン秘匿 | 良好（網羅拡張余地） |
| Electron 堅牢化 | `contextIsolation`+`nodeIntegration:false`+`sandbox`+CSP+IPC 入力検証 | 優良 |
| RBAC / プラン | 権限昇格防止・最後のオーナー保護・シート/機能ゲート | 正しい |
| バックアップ完全性 | （従来）改ざん・破損検知なし → **本リリースで SHA-256 を追加** | 改善実施 |

## 本リリースで実装した独自セキュリティ機能

1. **バックアップ完全性検証 (SHA-256)** — `data/backup.ts`。バックアップ JSON に records の
   SHA-256 チェックサムを埋め込み、復元時に再計算して照合。破損・改ざんを検知して復元を拒否する
   (損壊対策)。再フォーマットには強く、内容変更に反応。旧バックアップ(checksum 無し)は後方互換で許容。
2. **置換復元の確認ダイアログ** — `components/BackupPanel.tsx`。「既存データ全削除→復元」前に確認を挟み、
   誤操作によるデータ消失を防止。
3. **Shopify コネクタのエラー時トークン秘匿** — `clients/shopify.ts` の `postExpectOk` に `redactSecrets`
   を適用。連携先(Discord webhook 等)が応答にトークンを反射してもエラー経由で漏れない(漏洩対策)。
4. **`redactSecrets` の Atlassian トークン対応** — `ATATT…` 形式を秘匿対象に追加。
5. **暗号化バックアップ (AES-GCM-256)** — `security/dataCrypto.ts` + `data/backup.ts`。
   パスフレーズ指定でバックアップ全体を PBKDF2-SHA256(21万回)→ AES-GCM で封緘
   (漏洩対策: バックアップファイルは最も持ち出されやすい流出経路)。誤パスワード・
   改ざんは GCM 認証で復号失敗となる。SHA-256 完全性と二層で保護。

## 優先度の高い残対策（漏洩 / 損壊 / 消失 別）

| 優先 | 対策 | 主に効く脅威 | 備考 |
|---|---|---|---|
| 1 | ~~業務レコードを AES-GCM 暗号化~~ → **暗号エンジン + ストア配線は実装済み** (`recordCipher.ts` + `store.configureCipher`/`reencryptAll`)。残りは常時有効化の UI/ロック解除フロー配線のみ | 漏洩 | 既定は平文(後方互換)。封緘後はキー無しで閲覧不可 |
| 2 | Electron `secrets` の keychain 非依存パスフレーズ暗号化 + 未初期化警告 UI | 漏洩 | `plain:base64` フォールバック解消 |
| 3 | ~~`secrets.json` の atomic write~~ → **実装済み** (`atomicWrite.ts`: fsync + dir fsync + `.prev` バックアップ + temp 後始末、読取りは `.prev` フォールバック) | 消失 | 強制終了/電源断時のトークン破損・消失を防止 |
| 4 | CSV / 復元の一括取込をトランザクション化（部分取込のロールバック） | 損壊 | `importAll` への集約 |
| 5 | プロキシ封筒の Authorization マスク / IPC payload からの宛先トークン排除 | 漏洩 | 第三者 Worker ログ対策 |

## STRIDE 対応状況（要約）

- Spoofing: OAuth PKCE / Bearer / Basic。
- Tampering: HTTPS・IPC 入力検証・**バックアップ SHA-256（本リリース）**。
- Repudiation: `audit-log` 機能フラグ（Business+）。完全な監査ログは将来。
- Information Disclosure: 業務レコードの保存時 AES-GCM 暗号化エンジン (`recordCipher`) を
  実装し、`field-level` で `data` を封緘可能に (既定は後方互換の平文; 常時有効化 UI は次段)。
- DoS: timeout / サイズ上限 / レート制御。
- Elevation of Privilege: RBAC の昇格防止・最後のオーナー保護で対処済み。

> 生メトリクス（サービス数・テスト数等）は [`ARCHITECTURE.md`](./ARCHITECTURE.md) を正とする。
