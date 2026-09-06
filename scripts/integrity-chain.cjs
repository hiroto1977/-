#!/usr/bin/env node
'use strict';

/**
 * Integrity Chain — リポジトリ向けの「ブロックチェーン型」改竄検知台帳。
 *
 * セキュリティ上重要なファイル群（保護対象 = PROTECTED）の内容を SHA-256 で
 * ハッシュ化し、Merkle ルートに畳み込み、各ブロックが直前ブロックのハッシュを
 * 参照する**追記専用のハッシュ連鎖**として security/integrity-chain.json に残す。
 * Git（= それ自体が Merkle DAG）にコミットすることで、履歴は改竄不能な分散台帳と
 * なり、CI（chain:verify）が連鎖の連続性と現状の一致を「合意検証」する。
 *
 * 7本の柱を束ねる防御ライヤ（詳細は docs/SECURITY_CHAIN.md）:
 *   GitHub      … コミット＝Merkle DAG。台帳を追記コミットしてブロックを「採掘」
 *   Linux       … ファイル内容ハッシュ＋POSIX権限を起点に決定論的に再計算
 *   クラウド     … 台帳 JSON を外部ストレージへ複製（可用性・冗長）
 *   Obsidian    … security/INTEGRITY_CHAIN.md として人間可読の台帳ノートを生成
 *   Docker      … 再現可能なコンテナで chain:verify を実行＝検証の再現性
 *   サンドボックス … Electron contextIsolation/sandbox・ブラウザ Vault 隔離
 *   生体認証     … WebAuthn/パスキー（src/renderer/security/webauthn.ts）で解錠を門番
 *
 * 使い方:
 *   node scripts/integrity-chain.cjs verify   連鎖と現状の整合を検証 (CI 用, 失敗で exit 1)
 *   node scripts/integrity-chain.cjs append    保護対象が変化していれば新ブロックを追記
 *   node scripts/integrity-chain.cjs show      台帳の要約を表示
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const CHAIN_PATH = path.join(REPO_ROOT, 'security', 'integrity-chain.json');
const NOTE_PATH = path.join(REPO_ROOT, 'security', 'INTEGRITY_CHAIN.md');
const ZERO_HASH = '0'.repeat(64);
const ALGORITHM = 'sha256';

/**
 * 保護対象ファイル（セキュリティ機構＋ガバナンスの安定資産）。
 * 学術ループ等で頻繁に変わるデータは含めない — 変更は意図的な「採掘」を要する。
 */
const PROTECTED = [
  'scripts/integrity-chain.cjs',
  'src/renderer/security/vault.ts',
  'src/renderer/security/dataCrypto.ts',
  'src/renderer/security/autoLock.ts',
  'src/renderer/security/mnemonic.ts',
  'src/renderer/security/webauthn.ts',
  'src/renderer/security/LockScreen.tsx',
  'src/main/secrets.ts',
  'src/main/oauth.ts',
  'src/preload/preload.ts',
  // 2026-08-22 に足した。**関門だけ守って、関門を呼ぶ側が守られていなかった。**
  // `shellOpenGate.ts` と `exportPaths.ts` は保護対象なのに、それらを呼び、
  // かつ `contextIsolation` / `nodeIntegration` / `sandbox` を決め、
  // `setWindowOpenHandler` で popup を全部拒否し、`will-navigate` の許可判定を
  // 持ち、13 本の IPC ハンドラを登録している main.ts が入っていなかった。
  // ここが 1 行変わるだけで、下流の関門は全部迂回できる。
  'src/main/main.ts',
  // 秘密を伏せる唯一の合流点 (17 箇所がここへ寄せてある)。ここが素通しに
  // 変われば、失敗応答に混ざったトークンがそのまま画面と不具合報告に出る。
  'src/shared/redact.ts',
  // BYO プロキシの SSRF 関門。ブラウザ版では**全サービスのトークン**が
  // ここを通って利用者指定の Worker へ出るので、絞りが緩むと宛先を選ばれる。
  'src/renderer/network/proxy.ts',
  // レンダラーが渡してくる書き出し先を検査する唯一の関門。business /
  // stocks / templates / teamradar の書き出しは全部ここを通る。ここが
  // ゆるむと、乗っ取られたレンダラーがホーム配下へ任意のファイルを
  // 置けるようになる (2026-07 監査で 4 つの複製をここへ集約した)。
  // 保護対象に漏れていたのに気付いたのは 2026-08-18 — 同じファイルが
  // 変異検査の対象一覧からも漏れていた。
  'src/main/clients/exportPaths.ts',
  // AI 中継層。**課金される外部 API へ送る量の上限** (1 発話の長さ・件数・
  // system の長さ) と、**どのプロバイダの資格情報を使うか**の解決がここ。
  // ゆるむと、乗っ取られたレンダラーが利用者の鍵で好きなだけ送れる。
  // 2026-09-01 まで 14 種の無効化を 205 行に掛けたまま変異検査の対象外で、
  // 実測 70.73% (生存 38 / 未到達 10) だった。
  'src/main/clients/assistant.ts',
  // 2026-09-01: assistant.ts を保護対象へ入れたら閉包検査が 4 件出した。
  // うち 3 件は**それ自体が壁**なので除外ではなく保護対象へ入れる ——
  // 「どの資格情報を使うか」「どこへ送るか」「どんなヘッダで載せるか」を
  // 決めているのはこの 3 つで、assistant.ts だけ守っても、下を書き換えれば
  // 送り先も鍵の載せ方も変えられる。
  'src/shared/ai/credentials.ts',
  'src/shared/ai/providers.ts',
  'src/shared/ai/chat.ts',
  // 書き出し側 (exportPaths.ts) の対になる、**開く側**の唯一の関門。
  // `shell.openPath` は OS の「開く」動詞をそのまま使うので、Windows では
  // 拡張子の関連付け次第でそのまま実行される。ここがゆるむと、乗っ取られた
  // レンダラーがホーム配下の任意のファイルを起動できる。
  // 2026-08-22 まで main.ts の中の非公開関数で、テストも変異検査も無かった。
  'src/main/shellOpenGate.ts',
  // 2026-08-22 に足した。`shellOpenGate.ts` の**双子**——あちらが「OS に
  // ファイルを開かせてよいか」なら、こちらは「OS に URL を開かせてよいか」。
  // `javascript:` / `file:` / OS 独自スキームを止める唯一の関門で、
  // `setWindowOpenHandler` と `app:openExternal` の**両方の扉**が通る。
  // 分離するまで同じ判断が main.ts に 2 つ手書きされており、片方だけしか
  // 固定されていなかった (許可表を締めても窓側の扉は古い規則のまま開いた)。
  'src/shared/externalUrlGate.ts',
  // 2026-08-22 に足した。外部からの応答に置く**打ち切りと上限**の判定本体。
  // 保護対象の `network/proxy.ts` がここへ委譲しており (それまで proxy 側に
  // しか無かった)、`clients/types.ts` の `jsonFetch` —— SaaS 74 本が通る口 ——
  // もここを通る。上限を 10MiB から 10GiB へ書き換えるだけで、実装を 1 行も
  // 触らずに応答サイズの守りが消える。
  'src/shared/httpLimits.ts',
  // 2026-08-23 に**除外から昇格**した。それまで「型と ActionContext の形だけ。
  // 実行時の判断を持たない」として除外していたが、**その説明は前日から嘘に
  // なっていた** —— 打ち切り・`Content-Length` の先手の門・上限つき本文読みは
  // すべてこのファイルの `limitedFetch` / `jsonFetch` が持つ。
  // `httpLimits.ts` (定数) だけを守って**それを適用する側**を守らないのは、
  // 金庫の鍵だけ固定して扉を固定しないのと同じ。`limitedFetch` から
  // `declaredLengthExceeds` の 1 行を消すだけで上限が消える。
  'src/main/clients/types.ts',
  'scripts/setup-linux.sh',
  'scripts/setup-obsidian-docker.sh',
  'scripts/security-audit.sh',
  /*
   * --- 2026-08-26: 利用者の機械で強い権限で走る 3 本 ---
   *
   * 上の 3 本は「7 本の柱」の検証装置として保護されている (`SECURITY_CHAIN.md`
   * の表)。以下の 3 本はそれとは別の理由 —— **`httpLimits.ts` を昇格させたときと
   * 同じ試験**に掛かる。「1 行書き換えるだけで、実装を触らずに守りが消えるか」。
   *
   *   make-live-usb.sh    ブロックデバイスへ dd で焼く。システムディスク判定を
   *                       `false` にするだけで、稼働中のディスクへ書ける
   *   make-autoinstall.sh ログインパスワードを受け取り、**インストール時に root で
   *                       走る** autoinstall 設定を生成する。ホスト名の検証を
   *                       緩めるだけで early-commands を差し込める
   *   migrate.sh          暗号化パスフレーズを受け取り、信用できない書庫を
   *                       $HOME へ展開する。`-pass env:` を `pass:` へ戻すだけで
   *                       平文が /proc/<pid>/cmdline (444) に載る
   *
   * **なぜ自己テストでは足りないか。** `src/` のファイルは検査が別ファイル
   * (`__tests__/`) に在り、両方が変異検査に載っているので、守りだけを消せば
   * 必ず鳴る。この 3 本の検査は**スクリプト自身の中**に在る ——
   * 実測 (2026-08-26): ガードを `false` にし、自己テスト節を
   * `ok "self-test 全件一致"; exit 0` へ差し替えたら、**self-test・lint:shell・
   * chain:verify・lint:forbidden がすべて緑**になった。
   * **証人が、証人の対象と同じ紙に書かれている。** 外側の錨は鎖しかない。
   */
  'scripts/make-live-usb.sh',
  'scripts/make-autoinstall.sh',
  'scripts/migrate.sh',
  // 7,543 ファイルの書き込みが保管庫の外へ出ないことを決めている唯一の関門。
  // 逃げ道 (symlink) を 2026-08-27 に塞いだ。書き出し先の封じ込めという意味で
  // `src/main/clients/exportPaths.ts` と同じ役どころで、`vault:check` として
  // CI でも走る。守る基準が同じなら、扱いも同じにする。
  'scripts/safe-vault-write.cjs',
  '.github/workflows/ci.yml',
  // ci.yml (contents: read) は守られていたのに、**唯一 contents: write を持ち、
  // 利用者がダウンロードするインストーラを公開する** release.yml が入って
  // いなかった。守る順番が逆になっていた。
  '.github/workflows/release.yml',
  // 2026-08-22 に足した。**同じ順番の逆転がもう 1 つ残っていた。**
  // `pages: write` + `id-token: write` を持ち、**利用者がブラウザで開いて
  // 資格情報を入力する公開版そのものを配る** workflow。ここが 1 行変われば、
  // 訪問者全員へ書き換えたアプリを配れる。`assets/sw.js` を「公開版のオリジンで
  // 全てのページ読み込みに介入する」として守っているのに、**その sw.js を
  // 置きに行く側**が守られていなかった。
  //
  // 残る 3 つは足していない: `e2e.yml` / `mutation.yml` は contents: read だけで
  // 何も配らない。`knowledge-auto.yml` は issues: write を持つが、書けるのは
  // 課題票で、配布物にも実行環境にも触れない。
  '.github/workflows/pages.yml',
  // 2026-08-26 に足した 3 つ。**同じ順番の逆転が、もう一段内側に残っていた。**
  //
  // `pages.yml` を足した理由はこう書いてある ——「sw.js を『公開版のオリジンで
  // 全てのページ読み込みに介入する』として守っているのに、**その sw.js を
  // 置きに行く側**が守られていなかった」。その基準をそのまま当てると、
  // **公開する HTML そのものを作る側／書き換える側**が外に残っている。
  //
  //   inline-html.cjs  CSS/JS を畳んで dist/standalone.html を作る。
  //                    全訪問者が読む単一ファイルの中身を決めるのはここ。
  //                    ハッシュ固定した <script> 以外を弾く assertPinnedScripts も
  //                    ここに在り、1 行外せば任意のスクリプトが載る
  //   inject-pwa.cjs   公開直前 (pages.yml の upload 直前) に manifest /
  //                    apple-touch-icon / SW 登録を注入する。書き換える側
  //   manifest.webmanifest  公開オリジンへそのまま置かれる。start_url /
  //                    scope を書き換えると、ホーム画面から開く先が変わる
  //
  // 出荷物への検査 (lint:sample-data --artifact / lint:artifact-csp) は
  // **結果**を見る。鎖が見るのは「気付かぬ変更」で、役割が違う。
  'scripts/inline-html.cjs',
  'scripts/inject-pwa.cjs',
  'assets/manifest.webmanifest',
  //
  // `vite.config.ts` は足していない。バンドルの作り方を決めるので配布経路では
  // あるが、**通常の開発で動く**ファイルで、鎖に入れると日常の変更すべてに
  // chain:append が要る。上の 3 つは「出す物を直接書く/置く」side で、
  // かつ滅多に動かない —— そこが線引き。動かした結果は出荷物の検査が見る。
  //
  // 2026-08-28 に足した 5 本。**同じ順番の逆転が、もう一段外側に残っていた。**
  //
  // 保護対象の workflow が「公開してよいか」を決めるために `run:` で直接
  // 起こす本が、1 つも守られていなかった。実測: 鎖を tip まで採掘したうえで
  // `lint-sample-data.cjs` の `main()` 冒頭に `return 0;` を差しても
  // **`chain:verify` は緑のまま**だった —— 出荷物に本人の個人データが
  // 載るのを止める門を骨抜きにして、鎖が何も言わない状態である。
  // (閉包が追うのが import / require の辺だけで、`run:` を数えていなかった。
  //  #73 で広げたのは*言語*で、*辺の種類*ではなかった。)
  //
  //   lint-sample-data.cjs        出荷物に実データが載るのを止める門。
  //                               この PR で最も重い発見 (§1) の恒久対策で、
  //                               ci / release / pages の 3 本すべてが呼ぶ。
  //   lint-artifact-csp.cjs       公開 HTML の CSP を**注入後の実物**に当てる。
  //                               雛形側は shippedCsp.test.ts が留めるが、
  //                               公開されるファイルを見るのはこちらだけ。
  //   verify-release-artifacts.cjs 宣言した数のインストーラが出たか。
  //                               `fail_on_unmatched_files: false` と
  //                               `fail-fast: false` の組み合わせで
  //                               「1 プラットフォーム欠けたリリース」が
  //                               全ジョブ緑のまま出るのを、これだけが防ぐ。
  //   checksum-release.cjs        公開する物の SHA-256 を同じランで書く。
  //                               ここが黙れば「チェックサムはあります」が嘘になる。
  //   smoke-app.cjs               梱包後に解決できない require を捕まえる
  //                               (`--check-bundle`)。デスクトップ版が 2 週間
  //                               起動しなかった事故の再発を止める唯一の検査。
  'scripts/lint-sample-data.cjs',
  'scripts/lint-artifact-csp.cjs',
  'scripts/verify-release-artifacts.cjs',
  'scripts/checksum-release.cjs',
  'scripts/smoke-app.cjs',
  // electronFuses (runAsNode / NODE_OPTIONS / inspect / cookie 暗号化) の置き場。
  // `runAsNode: true` に戻すだけで、署名済みの自分自身を Node として起動して
  // アプリとして `safeStorage.decryptString` を呼べる状態に戻る。
  'electron-builder.json',
  'docs/SECURITY_CHAIN.md',
  // Service Worker は公開版のオリジンで**全てのページ読み込みに介入**する。
  // 一度登録されると、書き換えられた sw.js は以後そのオリジンで任意の
  // 応答を返せる。保護対象として最も効く部類なのに漏れていた。
  'assets/sw.js',
  // --- 2026-08-22: 保護対象が import している側 (下の checkProtectedClosure) ---
  //
  // 保護しているファイルが**判断の材料をよそから読んでいる**なら、材料の方も
  // 守らないと意味が無い。main.ts を足したときと同じ形 (関門だけ守って、
  // 関門を呼ぶ側が守られていなかった) が、今度は逆向きに残っていた。
  //
  // 保管庫の強度そのもの。`PBKDF2_ITERATIONS` を 600k から 1000 に落とすだけで
  // vault.ts / dataCrypto.ts は**そのまま**弱くなる (どちらも保護対象なのに、
  // 読んでいる数字が保護対象でなかった)。IV 長・ハッシュも同じ。
  'src/shared/cryptoParams.ts',
  // 復元フレーズの語彙。mnemonic.ts は保護対象だが、語彙を差し替えられれば
  // エントロピーの空間ごと縮む (2048 語を 16 語にすれば総当たりで開く)。
  'src/renderer/security/bip39-wordlist.ts',
  // BYO プロキシ URL の検証。proxy.ts を「全サービスのトークンが通る口」
  // として守っているのに、その URL を「https か loopback だけ」に絞る判断が
  // ここに在って守られていなかった。緩めれば平文 http で任意のホストへ出せる。
  'src/shared/proxyEndpoint.ts',
  // 保存済み資格情報から Authorization に載せる値を決める唯一の場所。
  // 壊れた TokenSet を raw に落とすと **refresh token が相手に出る**
  // (2026-08-20 に実際に踏んだ形)。secrets.ts が読む先。
  'src/shared/vaultToken.ts',
  // 暗号化された資格情報ファイルがディスクに載る経路 (secrets.ts の書き込み)。
  // 一時ファイルの置き場と `.prev` の扱いを決めるので、ここが変われば
  // 平文や旧世代が予期しない場所に残りうる。
  'src/main/atomicWrite.ts',
  // IPC 境界で資格情報の文字列を検査する唯一の場所 (main.ts が読む)。
  // 制御文字・長さ・空を落としているので、緩めば折り返しごと保存される。
  'src/shared/tokenInput.ts',
  // ↓ この 2 つは閉包の検査が**最初の実行で見つけた**もの。
  //   proxyEndpoint.ts を保護対象にした途端、それが読んでいる側が浮いた。
  //
  // 「平文 http を許すのは loopback だけ」の判定そのもの (isLoopbackHostname)。
  // proxyEndpoint.ts / aiEndpoint.ts の両方がこれを唯一の出典にしているので、
  // ここが全部 true を返すようになれば **資格情報が平文で任意のホストへ出る**。
  // AI 提供元の endpoint 検証 (API キーの送り先) 本体でもある。
  'src/shared/aiEndpoint.ts',
  // 制御文字の判定。URL / ヘッダの分断を止める共通の一段目で、
  // proxy / AI endpoint / Atlassian site / 資格情報入力が全部ここを通る。
  'src/shared/controlChars.ts',
  // レコードを封緘するか素通しするかを決める唯一の場所。`dataCrypto.ts` を
  // 守っても、**呼ぶ側が黙って `IDENTITY_CIPHER` を返せば平文で保存される** ——
  // 画面は「暗号化は有効」と言い続けるので、外からは見分けが付かない。
  // 逆向きの閉包 (保護対象を import している側) を測って見つけた。
  // 54 行・半年で 1 回しか変わっておらず、これ自身の依存も全部保護済み。
  'src/renderer/data/recordCipher.ts',
  // 2026-08-25 追加。**2 つの台帳が食い違っていた。**
  // `lint:mutation-scope` の `MUST_MEASURE` (必ず変異検査に載せる壁) と
  // この `PROTECTED` は、どちらも「これは壁だ」と言う名簿なのに 15 件ずれていた。
  // 変更頻度を測ると (60 日): web-shim だけが 23 回・1518 行で、残りは
  // 1〜6 回・51〜528 行の安定資産だった。**採掘の手間は「頻繁に変わるもの」を
  // 避けるためのもので、安定した壁を外す理由にはならない。**
  'src/renderer/security/frameGuard.ts',    // 枠の中では描画しない (CSP で代替できない)
  'src/renderer/security/lockWorkspace.ts', // 施錠で鍵をメモリから落とす本体
  'src/shared/imageUrlGate.ts',             // 第三者画像 URL のスキーム関門
  'src/shared/safeFilename.ts',             // ファイル名の唯一の関門
  'src/shared/atlassianSite.ts',            // テナント名の検証 (送り先が変わる)
  'src/shared/scanTarget.ts',               // 走査先の検証
  'src/shared/escape.ts',                   // 出口のエスケープ
  'src/renderer/oauth/pkce.ts',             // ブラウザ版 PKCE
  'src/renderer/oauth/pkceSession.ts',      // PKCE の一時秘密の置き場と消し方
  // 2026-09-06 に足した。**保護の閉包が教えてくれた。** `pkceSession.ts` が
  // 保存の失敗の種別を文面へ写すため `localWrite.ts` を読むようにしたところ、
  // `chain:verify` が「保護対象が保護されていない物を読んでいる」と鳴らした。
  // ここは localStorage 書き込みの**唯一の入口**で、容量超過 / 保存禁止 /
  // その他の切り分けと利用者へ出す文面を持つ —— 黙って書き換えられると、
  // 端末が保存を断っていることが**画面から消える** (2026-09-06 のパスで直した
  // 「押しても何も出ない」がそのまま戻る)。import は 0 件なので閉包は閉じる。
  'src/renderer/data/localWrite.ts',        // localStorage 書き込みの唯一の入口と失敗の文面
  'src/renderer/fs/fsa.ts',                 // File System Access の書き出し口
  'src/renderer/network/liveRead.ts',       // ライブ取得の経路選択
  'src/renderer/data/assistantMarkdown.ts', // モデル応答を解析して画面へ出す唯一の場所
  'src/shared/ollama.ts',                   // Ollama の接続先判定
];

/**
 * **保護対象が import しているのに保護しない**と決めたものの台帳。
 *
 * 空欄にできない形にしてある — 除外するなら理由を書く。理由の書けない
 * 除外は、単に見落としと区別がつかない。
 *
 * 台帳は**双方向**: ここに載っているのに実際は依存されていない (または既に
 * 保護対象になった) 項目も鳴らす。片方向だと、依存が消えた後も除外だけが
 * 残り続ける。
 */
const DEP_EXCLUSIONS = {
  'src/shared/serviceId.ts':
    'サービスを 1 つ足すたびに変わる (現在 74)。かつ、この一覧自体は関門ではない — '
    + '未知の id を弾いているのは SERVICE_ID_SET を使う isServiceId で、'
    + 'id を足しただけでは LIVE_FETCHERS の起動時不変条件が throw する。',
  'src/main/clients/index.ts':
    'サービス追加のたびに変わる登録簿 (74 エントリ)。中身は各 client への振り分けで、'
    + '判断は各 client と main.ts 側の検証が持つ。',
  // **本当に型だけ**のファイル。`export` は `interface` が 1 つで、
  // 実行時には何も残らない (TypeScript が消す)。ここを書き換えても
  // 生成される JS は 1 バイトも変わらないので、鎖で守る意味が無い。
  //
  // `clients/types.ts` の除外を 2026-08-23 に外したのと同じ基準で判断した ——
  // あちらは「型だけ」と書いてあったが**実行時の判断を持っていた**。
  // 除外の理由は「型だけに見えるか」ではなく「実行時に残るか」で決める。
// 2026-09-01: assistant.ts の閉包で出てきた。**定数 5 つだけ**で判断を持たない。
  // 上限を実際に当てているのは assistant.ts / web-shim (どちらも測っている) の側で、
  // ここを書き換えたときの最悪は「上限の値が変わる」——それは値の変更であって、
  // 関門の迂回ではない。変異検査からも意図的に外してある (定数で書いた検査では
  // その定数の変異を殺せないため。docs/SESSION_HANDOFF.md に経緯)。
  'src/shared/assistantLimits.ts':
    'AI へ送る量の上限の定数のみ (判断は呼び出し側が持ち、両方とも保護対象)。',
  'src/shared/advisorTypes.ts':
    '実行時に残らない型定義のみ (interface 1 つ)。書き換えても生成 JS が変わらない。',
  // 2026-08-25: 保護対象へ入れようとして、**ここに既に在ることに気付いた**
  // (閉包検査が「二重管理」で鳴った)。過去の判断を尊重して除外のままにするが、
  // 理由の書きぶりは実態に寄せる —— このファイルは版の比較だけでなく、
  // **案内先 URL のホスト検証**も持つ (`parseLatestRelease`)。
  // それでも除外でよいのは、OS に URL を開かせる可否を決めるのは
  // `externalUrlGate.ts` (保護対象) であって、ここはその手前の一段だから。
  'src/shared/updateCheck.ts':
    '版の比較と案内先 URL のホスト検証。書き換えの最悪は「更新があるのに気付かせない」で、'
    + '実際に開いてよいかは externalUrlGate (保護対象) が決め、配布経路は release.yml (保護対象) が持つ。',
  // 2026-08-25: `liveRead.ts` を保護対象へ入れたら閉包で出てきた。
  // サービス API のアダプタ (エンドポイントと応答の正規化) で、`clients/index.ts`
  // を除外したのと同じ class である。送り先が変数で決まる通信は
  // `lint:network-targets` の台帳が見ており、上限と打ち切りは `httpLimits`
  // (保護対象) が持つ。
  'src/shared/api/cursor.ts':
    'サービス API のアダプタ。送り先は定数で lint:network-targets の台帳が見ており、'
    + '上限・打ち切りは httpLimits (保護対象) が持つ。',
};

/** 相対 import を実ファイルへ解決する (拡張子省略に対応)。解決できなければ null。 */
function resolveRelativeImport(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.join(path.dirname(fromRel), spec);
  // 末尾の `''` は「綴りが既に拡張子を持っている」場合 (`require('./x.cjs')`)。
  // ディレクトリに当たらないよう、ファイルであることまで確かめる —— これが
  // 無かったため `inject-pwa.cjs` の require は解決できず、黙って飛ばされていた。
  for (const ext of ['.ts', '.tsx', '/index.ts', '.js', '.cjs', '']) {
    const abs = path.join(REPO_ROOT, base + ext);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return (base + ext).split(path.sep).join('/');
  }
  return null;
}

/**
 * 保護対象の **閉包** を確かめる。
 *
 * 守っているファイルが判断の材料をよそから読んでいるなら、材料の方も守らないと
 * 保護は素通しになる。2026-08-22 の走査で 10 件見つかり、うち 6 件は
 * **保管庫の反復回数 (600k)・BIP-39 の語彙・プロキシ URL の検証**のように
 * 「そこが変わればこちらの保護が意味を失う」ものだった。
 *
 * 一覧が手書きである以上、増えたときに気付ける形が要る。判定は
 * 「保護対象が直接 import している相対パスは、保護対象か除外台帳のどちらかに
 * 載っていること」。除外台帳は双方向 (使われていない除外も鳴らす)。
 *
 * 直接の import だけを見る (推移閉包は追わない) —— 深追いすると
 * 「型だけの import」まで巻き込んで台帳が実用にならないため。
 * 段を 1 つ増やしたければ、増えた先が次の verify で鳴る。
 *
 * @returns 問題の説明の配列 (空なら健全)
 */
/**
 * 1 ファイルが読んでいる相対パスの列。**言語ごとに綴りが違う**。
 *
 * 2026-08-27 まで、閉包検査は `.ts|.tsx` 以外を丸ごと飛ばしていた。保護対象
 * 55 件のうち 16 件 —— `.cjs` 3 件・`.sh` 6 件・ワークフロー 3 件・`sw.js`
 * ほか —— が「中身は守るが、何を読んでいるかは見ない」状態だった。上の注記が
 * 約束していること (材料の方も守らないと保護は素通し) が、29% に効いていない。
 *
 * 実害は今のところ無い —— 走査したところ、飛ばされていた 16 件が読んでいる
 * リポジトリ内のファイルは `inject-pwa.cjs → inline-html.cjs` の 1 本だけで、
 * それは既に保護対象だった。**偶然そうだっただけ**なので、次に誰かが助けを
 * 別ファイルへ切り出したときに鳴る形にしておく。
 */
function dependencySpecs(text, kind) {
  const out = [];
  if (kind === 'esm') {
    for (const m of text.matchAll(/^\s*(?:import|export)[\s\S]*?from\s+'([^']+)'/gm)) out.push(m[1]);
    return out;
  }
  if (kind === 'workflow') {
    /*
     * **workflow が `run:` で直接起こす本**を辺として数える。
     *
     * 2026-08-28 に測って分かったこと: `release.yml` は保護対象なのに、
     * それが「公開してよいか」を決めるために呼ぶ本は 1 つも守られておらず、
     * `lint-sample-data.cjs` (個人データが出荷物に載るのを止める門) の
     * `main()` 冒頭に `return 0;` を差しても **`chain:verify` は緑のまま**
     * だった。閉包が追っていたのは import / require の辺だけで、
     * **辺の種類**が足りていなかった (#73 で広げたのは*言語*のほうだった)。
     *
     * `npm run X` は辿らない。package.json 越しの間接なので追えなくはないが、
     * `verify:all` から 34 本が芋づるで入り、鎖が「編集のたびに採掘し直す」
     * だけの装置になる。そして**直接呼びを `npm run` へ書き換える**には
     * 保護対象の workflow 自身を触ることになり、そちらが鳴る ——
     * つまり逃げ道にはならない。追わない理由はそこに在る。
     */
    for (const m of text.matchAll(
      /(?:^|[\s;&|(])(?:node|bash|sh|python3?)\s+((?:scripts|orchestration)\/[A-Za-z0-9_./-]+)/g,
    )) {
      out.push(m[1]);
    }
    return out;
  }
  for (const m of text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bimportScripts\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

function collectClosureProblems(protectedList, exclusions) {
  const problems = [];
  const set = new Set(protectedList);
  const used = new Set();

  for (const rel of protectedList) {
    const kind = /\.(ts|tsx)$/.test(rel)
      ? 'esm'
      : /\.(cjs|js)$/.test(rel)
        ? 'cjs'
        : /^\.github\/workflows\/.*\.ya?ml$/.test(rel)
          ? 'workflow'
          : null;
    if (kind === null) continue;
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const spec of dependencySpecs(text, kind)) {
      // workflow の `run:` はリポジトリ直下からの相対で書く (`node scripts/x.cjs`)。
      // ファイル位置からの相対解決を通すと `.github/workflows/scripts/...` を
      // 探しに行って必ず null になる ——**辺を足したのに何も増えない**形。
      const target =
        kind === 'workflow'
          ? (fs.existsSync(path.join(REPO_ROOT, spec)) ? spec : null)
          : resolveRelativeImport(rel, spec);
      if (target === null || set.has(target)) continue;
      if (Object.hasOwn(exclusions, target)) {
        used.add(target);
        continue;
      }
      problems.push(`保護対象 ${rel} が ${target} を読んでいますが、${target} は保護対象でも除外台帳でもありません`);
    }
  }

  for (const rel of Object.keys(exclusions)) {
    if (set.has(rel)) {
      problems.push(`除外台帳の ${rel} は既に保護対象です (二重管理)`);
    } else if (!used.has(rel)) {
      problems.push(`除外台帳の ${rel} は、もうどの保護対象からも読まれていません (古い除外)`);
    }
  }
  return problems;
}

const sha256 = (buf) => crypto.createHash(ALGORITHM).update(buf).digest('hex');

/** 保護対象を読み、{ path: sha256 } のマニフェストを決定論的（path 昇順）に返す。 */
function buildManifest() {
  const manifest = {};
  const missing = [];
  for (const rel of [...PROTECTED].sort()) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    manifest[rel] = sha256(fs.readFileSync(abs));
  }
  if (missing.length) {
    throw new Error(`保護対象ファイルが見つかりません:\n  - ${missing.join('\n  - ')}`);
  }
  return manifest;
}

/** マニフェストから二分 Merkle ルートを計算（葉=sha256(path\0filehash)、奇数は末尾を複製）。 */
function merkleRoot(manifest) {
  let level = Object.keys(manifest)
    .sort()
    .map((p) => sha256(`${p}\0${manifest[p]}`));
  if (level.length === 0) return sha256('');
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256(left + right));
    }
    level = next;
  }
  return level[0];
}

/** ブロックのハッシュ（index・prevHash・merkleRoot・leafCount・note を連結）。 */
function blockHash(b) {
  return sha256(`${b.index}\n${b.prevHash}\n${b.merkleRoot}\n${b.leafCount}\n${b.note}`);
}

function loadChain() {
  if (!fs.existsSync(CHAIN_PATH)) return null;
  return JSON.parse(fs.readFileSync(CHAIN_PATH, 'utf8'));
}

/** 人間可読の Obsidian ノート本文を台帳から決定論的に生成。 */
function renderNote(chain) {
  const tip = chain.blocks[chain.blocks.length - 1];
  const lines = [
    '# 完全性チェーン（Integrity Chain）',
    '',
    '> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。',
    '> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。',
    '',
    `- アルゴリズム: \`${chain.algorithm}\``,
    `- ブロック数: ${chain.blocks.length}`,
    `- 先頭(genesis)ハッシュ: \`${chain.genesisHash}\``,
    `- 末尾(tip)ハッシュ: \`${tip.hash}\``,
    `- 保護対象: ${chain.protected.length} ファイル`,
    '',
    '## ブロック',
    '',
    '| # | merkleRoot (先頭16) | prevHash (先頭16) | hash (先頭16) | note |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const b of chain.blocks) {
    lines.push(
      `| ${b.index} | \`${b.merkleRoot.slice(0, 16)}\` | \`${b.prevHash.slice(0, 16)}\` | \`${b.hash.slice(0, 16)}\` | ${b.note} |`,
    );
  }
  lines.push('', '## 保護対象ファイル', '');
  for (const p of [...chain.protected].sort()) lines.push(`- \`${p}\``);
  lines.push('');
  return lines.join('\n');
}

function cmdAppend() {
  const manifest = buildManifest();
  const root = merkleRoot(manifest);
  let chain = loadChain();

  if (!chain) {
    const genesis = { index: 0, prevHash: ZERO_HASH, merkleRoot: root, leafCount: Object.keys(manifest).length, note: 'genesis' };
    genesis.hash = blockHash(genesis);
    chain = { algorithm: ALGORITHM, genesisHash: genesis.hash, protected: [...PROTECTED].sort(), blocks: [genesis], tipManifest: manifest };
    writeChain(chain);
    console.log(`✅ genesis ブロックを作成しました（${genesis.leafCount} ファイル, hash ${genesis.hash.slice(0, 16)}…）。`);
    return;
  }

  const tip = chain.blocks[chain.blocks.length - 1];
  if (tip.merkleRoot === root) {
    console.log('ℹ️  保護対象に変化はありません（追記不要）。');
    // ノート/manifest だけ再生成して同期（古い形式の取り込み）
    chain.protected = [...PROTECTED].sort();
    chain.tipManifest = manifest;
    writeChain(chain);
    return;
  }
  const block = { index: tip.index + 1, prevHash: tip.hash, merkleRoot: root, leafCount: Object.keys(manifest).length, note: `update ${block_note_changed(chain.tipManifest, manifest)}` };
  block.hash = blockHash(block);
  chain.blocks.push(block);
  chain.protected = [...PROTECTED].sort();
  chain.tipManifest = manifest;
  writeChain(chain);
  console.log(`✅ ブロック #${block.index} を採掘しました（prev ${block.prevHash.slice(0, 16)}… → hash ${block.hash.slice(0, 16)}…）。`);
}

/** 直前 tip からの差分ファイルを短い note 文字列にする。 */
function block_note_changed(prevManifest, manifest) {
  const prev = prevManifest || {};
  const changed = [];
  for (const p of Object.keys(manifest)) if (prev[p] !== manifest[p]) changed.push(path.basename(p));
  for (const p of Object.keys(prev)) if (!(p in manifest)) changed.push(`-${path.basename(p)}`);
  return changed.length ? changed.slice(0, 6).join(',') : 'no-op';
}

function writeChain(chain) {
  fs.mkdirSync(path.dirname(CHAIN_PATH), { recursive: true });
  fs.writeFileSync(CHAIN_PATH, JSON.stringify(chain, null, 2) + '\n');
  fs.writeFileSync(NOTE_PATH, renderNote(chain));
}

function cmdVerify() {
  const chain = loadChain();
  const fail = (msg) => {
    console.error(`❌ integrity-chain 検証失敗: ${msg}`);
    process.exit(1);
  };
  if (!chain) fail(`台帳がありません（${path.relative(REPO_ROOT, CHAIN_PATH)}）。'npm run chain:append' で作成してください。`);
  if (!Array.isArray(chain.blocks) || chain.blocks.length === 0) fail('ブロックが空です。');

  // 1. 連鎖の内部整合: 各ブロックのハッシュ再計算＋直前ハッシュの連結
  for (let i = 0; i < chain.blocks.length; i += 1) {
    const b = chain.blocks[i];
    if (blockHash(b) !== b.hash) fail(`ブロック #${b.index} のハッシュが一致しません（改竄の疑い）。`);
    const expectedPrev = i === 0 ? ZERO_HASH : chain.blocks[i - 1].hash;
    if (b.prevHash !== expectedPrev) fail(`ブロック #${b.index} の prevHash が連鎖していません（履歴の改竄）。`);
  }
  if (chain.genesisHash !== chain.blocks[0].hash) fail('genesisHash が先頭ブロックと一致しません。');

  // 2. 現状の一致: ディスク上の保護対象から Merkle ルートを再計算 → tip と突合
  const manifest = buildManifest();
  const root = merkleRoot(manifest);
  const tip = chain.blocks[chain.blocks.length - 1];
  if (root !== tip.merkleRoot) {
    const changed = block_note_changed(chain.tipManifest, manifest);
    fail(`保護対象が tip ブロックと一致しません（変更: ${changed}）。意図的変更なら 'npm run chain:append' で新ブロックを採掘してください。`);
  }

  // 3. 派生ノート（Obsidian）の同期
  if (!fs.existsSync(NOTE_PATH) || fs.readFileSync(NOTE_PATH, 'utf8') !== renderNote(chain)) {
    fail(`${path.relative(REPO_ROOT, NOTE_PATH)} が台帳と同期していません。'npm run chain:append' で再生成してください。`);
  }

  // 4. 閉包: 保護対象が読んでいる先も保護対象か、理由付きで除外されているか
  const closure = collectClosureProblems(PROTECTED, DEP_EXCLUSIONS);
  if (closure.length > 0) fail(`保護の閉包が破れています:\n  - ${closure.join('\n  - ')}`);

  console.log(
    `✅ integrity-chain OK — ブロック ${chain.blocks.length} 連結・保護対象 ${chain.protected.length} ファイルが tip と一致`
    + `（閉包 OK: 除外 ${Object.keys(DEP_EXCLUSIONS).length} 件は台帳どおり / tip ${tip.hash.slice(0, 16)}…）。`,
  );
}

function cmdShow() {
  const chain = loadChain();
  if (!chain) {
    console.log('台帳は未作成です。');
    return;
  }
  const tip = chain.blocks[chain.blocks.length - 1];
  console.log(`integrity-chain: ${chain.blocks.length} ブロック / ${chain.protected.length} 保護対象 / tip #${tip.index} ${tip.hash.slice(0, 16)}…`);
  for (const b of chain.blocks) console.log(`  #${b.index}  ${b.hash.slice(0, 12)}…  prev ${b.prevHash.slice(0, 12)}…  ${b.note}`);
}

/**
 * 陰性対照 — **この台帳が本当に改竄を見つけるか**を毎回確かめる。
 *
 * 2026-08-22 に verify:all の全ゲートを手で壊して回したところ、陰性対照を
 * 持たない 13 件のうち 2 件は本当に鳴らなかった。ここは鳴ることを手で
 * 確かめた (保護対象の書き換え / ブロックのハッシュ偽造の両方で落ちた) が、
 * **手で確かめただけでは今日しか効かない**ので固定する。
 *
 * 実ファイルには触らず、純粋関数 (merkleRoot / blockHash) の性質だけを見る。
 */
function cmdSelfTest() {
  const base = { 'a.ts': sha256('A'), 'b.ts': sha256('B'), 'c.ts': sha256('C') };
  let bad = 0;
  const check = (label, cond) => {
    if (!cond) bad++;
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  };

  // --- merkleRoot: 中身が 1 ビットでも変われば根が変わる ---
  const root = merkleRoot(base);
  check('同じ manifest なら同じ根 (決定論)', merkleRoot({ ...base }) === root);
  check(
    '並び順を変えても同じ根 (キーで整列している)',
    merkleRoot({ 'c.ts': base['c.ts'], 'a.ts': base['a.ts'], 'b.ts': base['b.ts'] }) === root,
  );
  check(
    '1 ファイルの中身が変われば根が変わる',
    merkleRoot({ ...base, 'b.ts': sha256('B-tampered') }) !== root,
  );
  check('ファイルが増えれば根が変わる', merkleRoot({ ...base, 'd.ts': sha256('D') }) !== root);
  const without = { 'a.ts': base['a.ts'], 'b.ts': base['b.ts'] };
  check('ファイルが減れば根が変わる', merkleRoot(without) !== root);
  // **並び順が変わらない改名**でなければ、パスを綴じ込んでいるかを試せない。
  // 最初は a.ts と b.ts の中身を入れ替える案を書いたが、それだと葉の**順序**が
  // 変わるので、パスを綴じ込んでいなくても根が変わってしまい、何も試せて
  // いなかった (対照実験で発覚)。`a.ts` → `a2.ts` は整列位置が動かないので、
  // パスを外すと根が完全に一致する = 改名を見逃す。
  const renamed = { 'a2.ts': base['a.ts'], 'b.ts': base['b.ts'], 'c.ts': base['c.ts'] };
  check('整列位置の変わらない改名でも根が変わる (パスも綴じ込んでいる)', merkleRoot(renamed) !== root);

  // --- blockHash: 連結のどの要素を変えても hash が変わる ---
  const b = { index: 3, prevHash: sha256('prev'), merkleRoot: root, leafCount: 3, note: 'x' };
  const h = blockHash(b);
  check('同じブロックなら同じハッシュ', blockHash({ ...b }) === h);
  for (const [field, value] of [
    ['index', 4],
    ['prevHash', sha256('other')],
    ['merkleRoot', sha256('other-root')],
    ['leafCount', 4],
    ['note', 'y'],
  ]) {
    check(`${field} を変えるとハッシュが変わる`, blockHash({ ...b, [field]: value }) !== h);
  }

  // --- 保護対象の一覧そのもの ---
  check('保護対象が空になっていない', PROTECTED.length > 0);
  check(
    '保護対象は実在するファイルだけ',
    PROTECTED.every((rel) => fs.existsSync(path.join(REPO_ROOT, rel))),
  );

  // --- 閉包の検査そのものが鳴るか (陰性対照) ---
  //
  // 「0 件だから通る」検査は、**壊れていても 0 件を返す**ので区別がつかない。
  // 実物の一覧から 1 つ外して鳴ることを毎回確かめる。
  check('実物の一覧では閉包の問題が 0 件', collectClosureProblems(PROTECTED, DEP_EXCLUSIONS).length === 0);
  {
    // cryptoParams.ts (保管庫の反復回数) を保護から外すと、それを読む
    // vault.ts / dataCrypto.ts の 2 件が鳴るはず。
    const weakened = PROTECTED.filter((rel) => rel !== 'src/shared/cryptoParams.ts');
    const found = collectClosureProblems(weakened, DEP_EXCLUSIONS);
    check(
      '保護を 1 つ外すと、それを読んでいる側から鳴る',
      found.length > 0 && found.every((m) => m.includes('cryptoParams.ts')),
    );
  }
  {
    /*
     * **workflow の `run:` を辺として数えているか。**
     *
     * ここが無かったせいで、`release.yml` は保護対象なのに、それが
     * 「公開してよいか」を決めるために呼ぶ本が 1 つも守られていなかった。
     * 骨抜きにしても `chain:verify` は緑のまま —— 2026-08-28 に実測。
     */
    const weakened = PROTECTED.filter((rel) => rel !== 'scripts/lint-sample-data.cjs');
    const found = collectClosureProblems(weakened, DEP_EXCLUSIONS);
    check(
      '★ workflow が run: で呼ぶ本を外すと鳴る (辺の種類が足りているか)',
      found.length > 0 && found.every((m) => m.includes('lint-sample-data.cjs')),
    );
  }
  {
    // 辺そのものが取れていること。**「0 件だから通る」を避ける標本。**
    const wfPath = path.join(REPO_ROOT, '.github/workflows/release.yml');
    const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, 'utf8') : '';
    const edges = dependencySpecs(wf, 'workflow');
    check(
      '★ release.yml から run: の辺が実際に取れる',
      edges.includes('scripts/verify-release-artifacts.cjs') && edges.includes('scripts/lint-sample-data.cjs'),
    );
    // 種別の判定が効いていること (cjs として読めば require しか見ないので 0 件)
    check('workflow を cjs として読めば辺は取れない (種別が効いている)', dependencySpecs(wf, 'cjs').length === 0);
    // `npm run` は辿らない —— 追わない判断を、字面ではなく**挙動**で留める。
    check(
      'npm run は辺にしない (verify:all から 34 本が芋づるにならない)',
      !dependencySpecs('        run: npm run verify:all\n', 'workflow').some((e) => e.includes('scripts/')),
    );
  }
  check(
    '除外台帳に実在しない項目があれば鳴る (古い除外)',
    collectClosureProblems(PROTECTED, { ...DEP_EXCLUSIONS, 'src/nowhere.ts': '理由' })
      .some((m) => m.includes('src/nowhere.ts')),
  );
  check(
    '除外台帳に保護済みのものが載っていれば鳴る (二重管理)',
    collectClosureProblems(PROTECTED, { ...DEP_EXCLUSIONS, 'src/main/main.ts': '理由' })
      .some((m) => m.includes('二重管理')),
  );
  check('除外の理由が空でない', Object.values(DEP_EXCLUSIONS).every((r) => r.trim().length > 0));

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — 改竄検知が働いていない`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

/*
 * **台帳を機械で突き合わせられるようにする** (2026-08-25)。
 *
 * `lint:mutation-scope` の `MUST_MEASURE` (必ず変異検査に載せる壁) と
 * この `PROTECTED` は、どちらも「これは壁だ」と言う名簿なのに **15 件
 * ずれていた**。片方だけ見ていても気付けないので、突き合わせられるよう
 * 名簿を export する。
 *
 * 併せて CLI の起動を `require.main` で守る —— export しても、require した
 * 瞬間にコマンドが走っては読めない。
 */
module.exports = { PROTECTED, DEP_EXCLUSIONS, collectClosureProblems, dependencySpecs, resolveRelativeImport };

if (require.main === module) {
  const cmd = process.argv[2] || 'verify';
  if (cmd === 'verify') cmdVerify();
  else if (cmd === 'append') cmdAppend();
  else if (cmd === 'show') cmdShow();
  else if (cmd === 'self-test') cmdSelfTest();
  else {
    console.error(`不明なコマンド: ${cmd}（verify | append | show | self-test）`);
    process.exit(2);
  }
}
