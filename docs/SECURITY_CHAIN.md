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
(4) 派生ノート `security/INTEGRITY_CHAIN.md` の同期、(5) **保護の閉包**、を検証する。
保護対象を意図的に変更したら `chain:append` で新ブロックを採掘してからコミットする
（＝監査可能な変更）。

保護対象（安定したセキュリティ／ガバナンス資産。頻繁に変わる知識データは含めない）は
`PROTECTED` 配列で定義する。

### 閉包 — 守っているファイルが読んでいる先も守る

守っているファイルが**判断の材料をよそから読んでいる**なら、材料の方も守らないと
保護は素通しになる。`collectClosureProblems` が「保護対象が直接 import している
相対パスは、保護対象か `DEP_EXCLUSIONS`（理由付きの除外台帳）のどちらかに載っている
こと」を強制する。台帳は双方向で、依存が消えた古い除外も鳴る。

2026-08-22 に導入したとき、保護対象 23 件の直接依存 10 件のうち **6 件が浮いた**。
いちばん効いたのは `src/shared/cryptoParams.ts` ——
`vault.ts` と `dataCrypto.ts` は保護対象なのに、その 2 つが読む
`PBKDF2_ITERATIONS = 600_000` は保護対象ではなかった。ここを 1000 に落とすだけで、
保管庫の実装を 1 文字も触らずに強度が消える。同じ形で `bip39-wordlist.ts`
（復元フレーズの語彙＝エントロピーの空間）、`proxyEndpoint.ts`（全トークンが通る
プロキシ URL の検証）、`vaultToken.ts`（Authorization に載せる値の決定）、
`atomicWrite.ts`（暗号化された資格情報がディスクに載る経路）、`tokenInput.ts`
（IPC 境界の資格情報検査）が入った。

さらに `proxyEndpoint.ts` を足した**その実行で**、それが読む
`aiEndpoint.ts`（`isLoopbackHostname` ——「平文 http を許すのは loopback だけ」の
判定そのもの）と `controlChars.ts` が浮いた。閉包は 1 段ずつしか追わないが、
段を 1 つ足せば次の `verify` で必ず次の段が鳴る。

### 公開の入口 —— どの workflow を守るか

`ci.yml`（27 ゲートを回す）と `release.yml`（`contents: write`、インストーラを
配る）は守られていたが、2026-08-22 に**同じ順番の逆転がもう 1 つ**見つかった。

| workflow | 権限 | 守るか |
|---|---|---|
| `ci.yml` | contents: read | ✅ 品質ゲートを回す唯一の場所 |
| `release.yml` | **contents: write** | ✅ インストーラを配る |
| `pages.yml` | **pages: write / id-token: write** | ✅ 2026-08-22 追加 |
| `e2e.yml` | contents: read | ✕ 何も配らない |
| `mutation.yml` | contents: read | ✕ 同上 |
| `knowledge-auto.yml` | contents: read / issues: write | ✕ 書けるのは課題票だけ |

`pages.yml` は **利用者がブラウザで開いて資格情報を入力する公開版そのものを
配る**。ここが 1 行変われば訪問者全員へ書き換えたアプリを配れる。
`assets/sw.js` を「公開版のオリジンで全てのページ読み込みに介入する」として
守っているのに、**その sw.js を置きに行く側**が守られていなかった。

### 逆向き（保護対象を **import している側**）は機械では追わない

同じ日に逆向きも測った ——「保護対象を import しているのに保護されていない
ファイル」は **25 件**。ただしこちらは**機械の判定に向かない**:

- 大半は*消費者*（ページ・hook・コンポーネント）で、書き換えても守り手そのものは
  弱まらない。守り手の**入力**を書き換える forward とは性質が違う。
- 判定を機械化すると、`web-shim.ts` のような**ハブ**が問題になる。これは
  ブラウザ版の信頼境界そのもの（デスクトップ版の `main.ts` に相当）で守る価値は
  高いが、保護対象にすると forward の閉包が **12 件**浮く。その 12 件の多くは
  「security の判断の入力」ではなく「dispatch する先の機能」で、理由付きの除外を
  12 個書けば**台帳そのものが薄まる**。

そこで逆向きは *一つずつ判断して足す* 運用にする。この日足したのは
`src/renderer/data/recordCipher.ts` の 1 件 —— レコードを封緘するか素通しするかを
決める唯一の場所で、`dataCrypto.ts` を守っても**呼ぶ側が黙って
`IDENTITY_CIPHER` を返せば平文で保存される**（画面は「暗号化は有効」と言い続ける
ので外から見分けが付かない）。54 行・半年で 1 回しか変わらず、これ自身の依存も
全部保護済みなので、閉包の追加コストは **0 件**だった。

`web-shim.ts` は保留 —— 足すなら、その 12 件のうち security の判断を持つもの
（`fsa.ts` / `liveRead.ts` / `ollamaWeb.ts` / `saasWriteWeb.ts` / `chat.ts` /
`credentials.ts`）を一緒に保護対象へ入れて、残りを除外台帳へ回す形になる。

`assets/sw.js`（Service Worker）は 2026-08 に追加した。公開版のオリジンで
**全てのページ読み込みに介入**し、一度登録されると以後そのオリジンで任意の応答を
返せる。保護対象として最も効く部類でありながら、ビルドにも型検査にも乗らない
素の JS だったため漏れていた。同時に単体テスト（`src/shared/__tests__/serviceWorker.test.ts`）
も用意し、`node:vm` にハンドラを読み込んで直接叩くようにした。

`src/main/clients/exportPaths.ts` は 2026-08-18 に追加した。レンダラーが渡して
くる書き出し先を検査する唯一の関門で、`business` / `stocks` / `templates` /
`teamradar` の書き出しは全部ここを通る。ここがゆるむと、乗っ取られたレンダラー
がホーム配下へ任意のファイルを置ける（2026-07 監査で 4 つに散っていた複製を
ここへ集約した経緯がある）。**同じファイルが変異検査の対象一覧からも漏れており**、
中に `Stryker disable` が掛かっているのに変異体が 1 つも作られていなかった。
守る仕組みが 2 つあっても、どちらの一覧にも載っていなければ守られない。
併せて `lint:mutation-scope` に `MUST_MEASURE`（必ず測る壁の一覧）を足した。

## 2. 7本の柱（多層防御）と台帳の対応

| 柱 | 役割 | 連携点 |
| --- | --- | --- |
| **GitHub** | コミット＝Merkle DAG。台帳を追記コミット＝ブロックの「採掘」、履歴は改竄不能な分散台帳 | `chain:verify` を CI（`.github/workflows/ci.yml`）が全 push/PR で強制 |
| **Linux** | ファイル内容ハッシュ＋POSIX権限を起点に決定論的に再計算 | `scripts/setup-linux.sh`・`security-audit.sh` を保護対象に含む |
| **クラウドストレージ** | 台帳 JSON を外部（Drive/Dropbox 等）へ複製＝可用性・冗長・第三者証跡 | Google Drive / Dropbox 連携サービス経由でオフサイト複製 |
| **Obsidian** | `security/INTEGRITY_CHAIN.md` を人間可読の台帳ノートとして生成・相互リンク | 知識ヴォルトと同じく決定論生成、`chain:verify` が同期を強制 |
| **Docker** | 再現可能なコンテナで `chain:verify` を実行＝検証の再現性（誰が検証しても同じ） | `scripts/setup-obsidian-docker.sh` を保護対象に含む |
| **サンドボックス** | Electron `contextIsolation`/`sandbox`・ブラウザ Vault のメモリ隔離 | `lint:forbidden` が `nodeIntegration`/`contextIsolation:false` を禁止 |
| **生体認証** | WebAuthn/パスキーの**能力検出・登録のみ**実装（検証は未実装・fail-closed） | `src/renderer/security/webauthn.ts`（`verifyBiometric` は常に throw） |

## 3. 生体認証レイヤ（WebAuthn / パスキー）

> **⚠️ 現状: 能力検出と登録までの実装で、検証は未実装（fail-closed）。**
> Vault の解錠フローには接続されていない（2026-07 監査 R2 の指摘を受けた是正）。

`src/renderer/security/webauthn.ts` はプラットフォーム認証器（Touch ID / Windows
Hello / Android 生体）を扱う土台のみを持つ。

- `isBiometricAvailable()` — 生体認証が使えるか（`isUserVerifyingPlatformAuthenticatorAvailable`）
- `registerBiometric(userId, userName)` — クレデンシャル登録、保存すべき `credentialId` を返す。
  登録できても**それ自体は何の権限も与えない**（検証が未実装のため）
- `verifyBiometric(credentialId)` — **常に例外を投げる**。以前は認証器が
  `rawId.byteLength > 0` のアサーションを返しさえすれば `true` を返していたが、
  署名をサーバ側公開鍵で検証しておらず、チャレンジもクライアント生成・使い捨てだったため
  「所持しているように見える」だけの無意味な判定だった。誤って解錠ゲートに配線されるのを
  防ぐため、認証器を呼ぶ前に fail-closed で落とす
- 秘密鍵は認証器内（Secure Enclave / TPM）に留まり JS からは取り出せない。
  本モジュールは公開識別子のみ扱い、ネットワーク送信はしない。

**将来実装する際の不変条件**: WebAuthn は鍵素材を返せないため、生体解錠を実現しようと
マスターパスワードや PBKDF2 派生鍵を保存してはならない（それをやると Vault の
「鍵はメモリのみ・非抽出」という前提が崩れ、生体認証を足したことで全体が弱くなる）。
生体は**解錠済みセッションの再認証（step-up）**にのみ使い、KDF の代替にはしないこと。
純粋ヘルパーは単体テスト済み（`__tests__/webauthn.test.ts`）。

## 4. 同期と整合の保証（CI ゲート）

`npm run chain:verify` は `verify:all` と CI（ci.yml）に組み込まれ、保護対象の
改竄・台帳履歴の書き換え・派生ノートの drift を検出すると失敗する。生成物
（`security/integrity-chain.json`・`INTEGRITY_CHAIN.md`）はコミットし、Git 履歴
（= 改竄不能な分散台帳）に刻む。
