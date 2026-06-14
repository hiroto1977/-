# セキュリティ・チェーン（ブロックチェーン型・改竄検知の仕組み）

リポジトリの**完全性（integrity）**を、ブロックチェーンと同じ原理＝**前ブロックの
ハッシュを参照する追記専用のハッシュ連鎖**で守る仕組み。Linux / クラウドストレージ /
GitHub / Obsidian / Docker / サンドボックス / 生体認証の**7本の柱**を、単一の
台帳（`security/integrity-chain.json`）に束ね、CI が「合意検証」として強制する。

> 中央集権のサーバや暗号通貨は使わない。「分散・改竄不能・連鎖検証・所持証明」という
> ブロックチェーンの**性質**を、既存の技術スタックだけで再現する（permissioned ledger）。

## 1. 中核：Integrity Chain（ハッシュ連鎖台帳）

`scripts/integrity-chain.cjs` が保護対象ファイル群を SHA-256 でハッシュ化し、
二分 Merkle ルートに畳み込み、ブロックとして連鎖させる。

```
block0 (genesis)        block1                  block2  ← tip
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│ index    0    │      │ index    1    │       │ index    2    │
│ prevHash 000… │◀─────│ prevHash H(b0)│◀──────│ prevHash H(b1)│
│ merkleRoot R0 │      │ merkleRoot R1 │       │ merkleRoot R2 │
│ hash     H(b0)│      │ hash     H(b1)│       │ hash     H(b2)│
└───────────────┘      └───────────────┘       └───────────────┘
```

- `hash = SHA-256(index ‖ prevHash ‖ merkleRoot ‖ leafCount ‖ note)`
- `merkleRoot` = 保護対象の `SHA-256(path\0fileHash)` を葉とする二分 Merkle 木の根
- いずれか1ファイルでも改竄されると tip の `merkleRoot` が変わり検証が落ちる
- 過去ブロックを書き換えると以降全ブロックの `hash` が連鎖崩壊して検出される

### コマンド

```bash
npm run chain:verify   # 連鎖の連続性＋現状の一致を検証（CI 用・失敗で exit 1）
npm run chain:append   # 保護対象が変化していれば新ブロックを「採掘」して追記
npm run chain:show     # 台帳の要約を表示
```

`chain:verify` は (1) 各ブロックの `hash` 再計算、(2) `prevHash` の連結（genesis から
途切れない）、(3) ディスク上の保護対象から再計算した Merkle ルートと tip の一致、
(4) 派生ノート `security/INTEGRITY_CHAIN.md` の同期、を検証する。保護対象を意図的に
変更したら `chain:append` で新ブロックを採掘してからコミットする（＝監査可能な変更）。

保護対象（安定したセキュリティ／ガバナンス資産。頻繁に変わる知識データは含めない）は
`PROTECTED` 配列で定義する。

## 2. 7本の柱（多層防御）と台帳の対応

| 柱 | 役割 | 連携点 |
| --- | --- | --- |
| **GitHub** | コミット＝Merkle DAG。台帳を追記コミット＝ブロックの「採掘」、履歴は改竄不能な分散台帳 | `chain:verify` を CI（`.github/workflows/ci.yml`）が全 push/PR で強制 |
| **Linux** | ファイル内容ハッシュ＋POSIX権限を起点に決定論的に再計算 | `scripts/setup-linux.sh`・`security-audit.sh` を保護対象に含む |
| **クラウドストレージ** | 台帳 JSON を外部（Drive/Dropbox 等）へ複製＝可用性・冗長・第三者証跡 | Google Drive / Dropbox 連携サービス経由でオフサイト複製 |
| **Obsidian** | `security/INTEGRITY_CHAIN.md` を人間可読の台帳ノートとして生成・相互リンク | 知識ヴォルトと同じく決定論生成、`chain:verify` が同期を強制 |
| **Docker** | 再現可能なコンテナで `chain:verify` を実行＝検証の再現性（誰が検証しても同じ） | `scripts/setup-obsidian-docker.sh` を保護対象に含む |
| **サンドボックス** | Electron `contextIsolation`/`sandbox`・ブラウザ Vault のメモリ隔離 | `lint:forbidden` が `nodeIntegration`/`contextIsolation:false` を禁止 |
| **生体認証** | WebAuthn/パスキー（プラットフォーム認証器）で Vault 解錠を門番 | `src/renderer/security/webauthn.ts`（`userVerification: 'required'`） |

## 3. 生体認証レイヤ（WebAuthn / パスキー）

`src/renderer/security/webauthn.ts` がプラットフォーム認証器（Touch ID / Windows
Hello / Android 生体）による所持証明を提供する。

- `isBiometricAvailable()` — 生体認証が使えるか（`isUserVerifyingPlatformAuthenticatorAvailable`）
- `registerBiometric(userId, userName)` — クレデンシャル登録、保存すべき `credentialId` を返す
- `verifyBiometric(credentialId)` — 登録済み資格情報で所持証明を検証（成功で `true`）
- 秘密鍵は認証器内（Secure Enclave / TPM）に留まり JS からは取り出せない。
  本モジュールは公開識別子のみ扱い、ネットワーク送信はしない。

Credential Vault（`vault.ts`：WebCrypto AES-GCM-256＋PBKDF2 600k）の解錠を、
マスターパスワードに加えて生体で門番できる。純粋ヘルパーは単体テスト済み
（`__tests__/webauthn.test.ts`）。

## 4. 同期と整合の保証（CI ゲート）

`npm run chain:verify` は `verify:all` と CI（ci.yml）に組み込まれ、保護対象の
改竄・台帳履歴の書き換え・派生ノートの drift を検出すると失敗する。生成物
（`security/integrity-chain.json`・`INTEGRITY_CHAIN.md`）はコミットし、Git 履歴
（= 改竄不能な分散台帳）に刻む。
