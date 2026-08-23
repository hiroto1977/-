#!/usr/bin/env node
 
/**
 * Lint the runtime source tree for patterns that are forbidden by the
 * project's security invariants (see docs/ARCHITECTURE.md §8.1):
 *
 *   #9  dangerouslySetInnerHTML / eval / new Function are banned in
 *       runtime code paths
 *   #5  External URLs only via app:openExternal (no shell.openExternal
 *       direct calls in non-main files)
 *   #7-#8  Ollama allowlist enforced (no /api/pull|create|push|copy|
 *       delete|blobs|upload literals in clients/ollama.ts outside the
 *       allowlist + warning string)
 *
 * Where these checks live before this script:
 *   - human eyeballs during security review
 *   - the doc claims "0 occurrences" but nothing prevented regressions
 *
 * Where they live now: CI grep. Any future PR that introduces one of
 * these patterns will fail the verify-forbidden-patterns step.
 *
 * Run via:   node scripts/lint-forbidden-patterns.cjs
 *            npm run lint:forbidden
 *
 * Exits 1 on any finding.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// Files / dirs that are excluded from forbidden-pattern checks:
//   - tests (they intentionally construct forbidden inputs)
//   - the script itself (it lists the patterns as strings)
//   - the architecture doc (it documents the patterns)
//   - docs in general (they describe the patterns)
//   - the renderer index.html (mentions security headers)
const EXCLUDE_PATTERNS = [
  /__tests__/,
  /scripts\/lint-forbidden-patterns\.cjs$/,
  /scripts\/verify-architecture\.cjs$/,
  /scripts\/cross-doc-consistency\.cjs$/,
  /docs\//,
  /node_modules/,
  /dist[\\/]/,
  /dist-electron/,
  /dist-chunks/,
  /coverage\//,
  /\.stryker-tmp/,
  /reports\//,
];

const FORBIDDEN_PATTERNS = [
  // --- Electron の隔離を解く設定 -------------------------------------------
  // 2026-08-22 の点検で見つけた抜け: **CLAUDE.md は「lint:forbidden が
  // nodeIntegration: true / contextIsolation: false を弾く」と 2 か所で
  // 宣言しているのに、その規則がここに無かった。** 実装より説明が先を
  // 行っていた形で、CLAUDE.md は Claude Code セッションへの指示書でもあるため、
  // 「ゲートが守ってくれる」と信じたまま書き換えられる余地があった。
  //
  // どれも 1 語で隔離を解く。解けば、レンダラーの任意コードが Node API に
  // 届く = XSS が即座に RCE になる。`main.ts` の webPreferences は
  // `mainWindow.test.ts` が実物を見て固定しているが、**別の場所で新しい
  // BrowserWindow を作られたら**そちらは見ていない。ここで字面ごと止める。
  {
    name: 'nodeIntegration: true (レンダラーへ Node API を通す)',
    pattern: /\bnodeIntegration(?:InWorker|InSubFrames)?\s*:\s*true\b/,
    codeOnly: true,
    rationale:
      'レンダラーは sandbox 前提。Node が要るものは preload の bridge を広げること ' +
      '(src/preload/preload.ts)。CLAUDE.md の「Conventions」も同じことを言っている',
  },
  {
    name: 'contextIsolation: false (preload とページの世界を混ぜる)',
    pattern: /\bcontextIsolation\s*:\s*false\b/,
    codeOnly: true,
    rationale:
      'これを外すと、ページ側の JS が preload のオブジェクトを直に書き換えられる ' +
      '(bridge の関数を差し替えて資格情報を横取りできる)',
  },
  {
    name: 'sandbox: false (レンダラープロセスの OS サンドボックスを外す)',
    pattern: /\bsandbox\s*:\s*false\b/,
    codeOnly: true,
    // 実機を起こす開発ツールの台帳。どれも `xvfb-run … --no-sandbox` で
    // 起動する = OS サンドボックスは**起動フラグの時点で既に切れて**おり、
    // webPreferences 側の `sandbox: false` はそれに揃えているだけ。
    // いずれも出荷物には含まれない (package.json の exp:* / smoke)。
    //
    // **一覧で持つことに意味がある** — 新しく増やすときは、ここへ 1 行足す
    // という明示的な操作が要る。正規表現を緩めて「scripts/ は全部許す」に
    // すると、出荷する窓を作るスクリプトが混ざっても気付けない。
    allowFile: (rel) =>
      [
        'scripts/overflow-check.cjs',
        'scripts/runtime-security-exp.cjs',
        'scripts/screenshot-dashboard.cjs',
        'scripts/screenshot.cjs',
        'scripts/soak-test.cjs',
      ].includes(rel),
    rationale: '出荷する窓では常に true。開発ツールだけが例外で、上の台帳へ明記すること',
  },
  {
    name: 'webSecurity: false (同一オリジンポリシーを切る)',
    pattern: /\bwebSecurity\s*:\s*false\b/,
    codeOnly: true,
    rationale: '切ると CSP も同一オリジンも効かず、ローカルファイル読み出しまで通る',
  },
  {
    name: 'allowRunningInsecureContent: true (https のページに http を混ぜる)',
    pattern: /\ballowRunningInsecureContent\s*:\s*true\b/,
    codeOnly: true,
    rationale: '混在コンテンツを許すと、経路上で差し替えられたスクリプトが走る',
  },
  /*
   * 2026-08-22 追加。上の 5 つで Electron の危ない webPreferences を止めて
   * いるつもりだったが、**5 つでは足りていなかった**。実際の設定を読むと
   * `webviewTag` は既定 false に依存しているだけで、明示的に禁じてはいない。
   *
   * とくに `webviewTag` が効く: `<webview>` は**レンダラー側から作れる**ので、
   * main.ts が `win.webContents` に張った番人 (setWindowOpenHandler /
   * will-navigate / will-redirect) の外側に、新しい webContents が生える。
   * 窓に対して守りを固めても、窓の中から別の窓を生やされたら意味が無い。
   *
   * `nodeIntegrationInWorker` / `nodeIntegrationInSubFrames` は**既に上の
   * `nodeIntegration` 規則が拾っている** (正規表現に含まれている) ——
   * 別建てにしようとして自己検査が「2 件鳴る」と教えてくれた。二重に持つと
   * 1 件の違反が 2 件に見えるので足さない。
   *
   * 現行の木では 3 つとも 0 件。0 件のうちに固定しておく (後から足す側は
   * 「なぜ既定を変えるのか」をここで説明させられる)。
   */
  {
    name: 'webviewTag: true (<webview> をレンダラーから作れるようにする)',
    pattern: /\bwebviewTag\s*:\s*true\b/,
    codeOnly: true,
    rationale: 'main.ts の番人は win.webContents にしか張っていない — 別の webContents はその外',
  },
  {
    name: 'experimentalFeatures: true (未成熟な Web 機能を有効化)',
    pattern: /\bexperimentalFeatures\s*:\s*true\b/,
    codeOnly: true,
    rationale: '検証の浅い機能を増やす — 攻撃面を広げるだけで、この用途に要る機能は無い',
  },
  {
    name: 'enableRemoteModule: true (remote モジュール)',
    pattern: /\benableRemoteModule\s*:\s*true\b/,
    codeOnly: true,
    rationale: 'Electron 14 で削除済み。残っていれば古い危険な前提が持ち込まれた印',
  },
  // --- 本物に見える資格情報の直書き -----------------------------------------
  // 2026-08-22 追加。出荷物 (dist/standalone.html) と src を実際に走査して
  // **1 件も無い**ことを確かめたうえで、その状態を固定する。
  //
  // ブラウザ版は 1 枚の HTML に全部を焼き込むので、`snapshot.ts` などの
  // 見本データに本物らしいトークンが 1 つ混ざると、**利用者全員へ配られる**。
  // GitHub の secret scanning は push 後に気付く仕組みで、しかも対応する
  // 発行元に限られる。ここで push 前に落とす。
  //
  // 接頭辞のあとに 20 文字以上を要求する — `ghp_...` のような入力欄の
  // プレースホルダや、`redact.ts` の伏字パターン自体を巻き込まないため。
  // `__tests__` は EXCLUDE_PATTERNS で除外済み (伏字の検査は本物らしい
  // 文字列を**わざと**書く必要がある)。
  {
    name: '本物に見える資格情報の直書き (接頭辞 + 20 文字以上)',
    pattern:
      /\b(ghp_|ghs_|ghu_|gho_|ghr_|xoxb-|xoxp-|xoxa-|sk-ant-|AIza|ya29\.|ATATT|secret_)[A-Za-z0-9_.-]{20,}/,
    rationale:
      '見本データに 1 つ混ざるとブラウザ版の HTML に焼き込まれて全利用者へ配られる。' +
      '本物なら失効させ、説明用なら接頭辞だけ (`ghp_...`) にすること',
  },
  {
    name: '秘密鍵の直書き',
    pattern: /-----BEGIN\s+[A-Z ]*PRIVATE KEY-----/,
    rationale: '鍵はリポジトリに置かない。署名鍵は CI の secrets 経由で渡す',
  },
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /\bdangerouslySetInnerHTML\b/,
    rationale: 'React XSS sink — invariant #9 bans it in runtime code',
  },
  {
    name: 'eval(',
    pattern: /\beval\s*\(/,
    rationale: 'arbitrary code execution — invariant #9',
  },
  {
    /*
     * モデル ID を写経しない。
     *
     * 2026-08-22 の点検で、既定モデル `claude-sonnet-4-6` が **5 か所**に
     * 写経されていた —— `AI_PROVIDERS.anthropic.defaultModel` という正典が在り、
     * `clients/assistant.ts` だけが正しく参照していた。`web-shim.ts` に至っては
     * **同じファイルの 108 行目で AI_PROVIDERS を import しながら**
     * 375/466 行でリテラルを書いていた。高速モデルのほうも 2 か所に散っていた。
     *
     * モデルが引退したとき、直し忘れた側は**実行時の API エラーでしか
     * 分からない** (型検査もテストも通る)。正典を 1 つにして機械で留める。
     *
     * 対象は `claude-<系統>-` の形だけ。第三者サービスが自分の呼び方で報告して
     * くる文字列 (Cursor の使用統計に出る `claude-4.5-sonnet` など) は
     * こちらが送るモデル ID ではないので当たらない。
     */
    name: 'hardcoded Claude model id',
    pattern: /['"`]claude-(sonnet|opus|haiku|fable)-/,
    rationale:
      'モデル ID の写経 — src/shared/ai/providers.ts の AI_PROVIDERS.<provider>.defaultModel'
      + ' か ANTHROPIC_FAST_MODEL を参照してください。写すと、引退時に直し忘れた側が'
      + ' 実行時の API エラーになるまで分かりません',
    allowFile: (rel) => rel === 'src/shared/ai/providers.ts',
  },
  {
    /*
     * RFC 2822 のヘッダ行を補間で手組みしない。
     *
     * 2026-08-22 に `clients/shopify.ts` で見つけた形: gmail の下書き作成を
     * **同じ手順で写しておきながら `To:` の CR/LF 検査だけを落として**いた。
     * `assertOrder` は `id` と `name` しか見ないので `order.email` は型も改行も
     * 無検査で、payload は `action:invoke` 経由で renderer から届く。つまり
     * `"a@b.example\r\nBcc: attacker@evil.example"` で下書きに Bcc が載った。
     *
     * 正典は 2 つだけ (プロセス境界で renderer が main を import できないため):
     *   src/main/clients/gmail.ts        buildRfc2822
     *   src/renderer/data/saasWriteWeb.ts buildRfc2822
     * どちらも `isSafeHeaderValue` を先に通す。3 つ目を作らせない。
     */
    name: 'hand-rolled RFC 2822 header line',
    pattern: /`(?:To|Cc|Bcc|From|Reply-To|Return-Path|Subject):\s*\$\{/,
    rationale:
      'メールヘッダの手組み — buildRfc2822 (main: clients/gmail.ts / renderer:'
      + ' data/saasWriteWeb.ts) を使ってください。写すと CR/LF 検査が落ちます'
      + ' (不変条件 #11)',
    allowFile: (rel) =>
      rel === 'src/main/clients/gmail.ts' || rel === 'src/renderer/data/saasWriteWeb.ts',
  },
  {
    name: 'new Function',
    pattern: /\bnew\s+Function\s*\(/,
    rationale: 'arbitrary code execution — invariant #9',
    /*
     * 唯一の例外。`orchestration/knowledge-context.cjs` は確証済みデータの
     * `.ts` を型除去して評価する (出典配列がモジュール内 const を参照するため、
     * 正規表現では読めない)。ビルド時にしか走らず出荷物には入らないので、
     * 実質 `require()` と同じ強さ —— ただしそれは**評価対象が
     * `src/renderer/data/` 配下に限られている限り**の話。
     * その前提は同ファイルの `loadModuleExports` が関門として強制している
     * (外を指したら throw。相対パス・前方一致する兄弟・.ts 以外も拒否)。
     * ここを 1 行広げることは「任意コード実行を許す」と同義なので、
     * 例外はファイル名で 1 つだけに縛る。
     */
    allowFile: (rel) => rel === 'orchestration/knowledge-context.cjs',
  },
  {
    /*
     * `new` の無い形。`Function('return 1')()` は `new Function(...)` と
     * まったく同じに動くのに、上の規則は `new` を必須にしていて 2026-08-22 まで
     * **裸の `Function(` を素通ししていた** (実在は 0 件の潜在的な穴)。
     *
     * ただし `\bFunction\s*\(` だけに広げると**散文に当たる** —— 実際
     * `academicKnowledge.ts` の出典ラベル
     * "Cobb-Douglas Production Function (overview)" で誤検出した。
     * `codeOnly` はコメント行しか外さないので効かない (文字列リテラル内の一致)。
     *
     * コードを組み立てる `Function` 呼び出しは**第 1 引数が文字列**である、を
     * 見分けに使う。散文は括弧の次が語なので当たらない。
     */
    name: 'Function() without new',
    pattern: /(?<!\bnew\s)\bFunction\s*\(\s*['"`]/,
    rationale: 'arbitrary code execution — invariant #9 (new の有無は無関係)',
    allowFile: (rel) => rel === 'orchestration/knowledge-context.cjs',
  },
  {
    // setTimeout('code', ms) / setInterval('code', ms) の文字列形は eval と同じ。
    // 引数が文字列リテラルで始まる呼び出しだけを見る (関数を渡す通常形は素通り)。
    name: "setTimeout('…') / setInterval('…') の文字列形",
    pattern: /\b(?:setTimeout|setInterval)\s*\(\s*['"`]/,
    codeOnly: true,
    rationale: '文字列を渡す形は eval 相当 — invariant #9。関数を渡すこと',
  },
  {
    // window.postMessage の受け口。origin を確かめない listener は
    // 任意のページからアプリ内部へ命令を送れる入口になる。2026-08 の監査時点で
    // 0 件なので allowFile は無い — 足すときは event.origin の確認と一緒に、
    // なぜ安全かをここに書くこと。
    name: "addEventListener('message', …)",
    pattern: /addEventListener\s*\(\s*['"`]message['"`]/,
    codeOnly: true,
    rationale:
      'postMessage の受け口は origin を確認しないと任意のページからの命令を受ける。' +
      '追加するときは event.origin を検証したうえで、この台帳に例外として登録すること',
  },
  {
    /*
     * `.innerHTML` だけでは足りない。`.outerHTML =` と
     * `.insertAdjacentHTML(…)` は同じ HTML パーサに文字列を流し込む
     * 別名で、どちらも 2026-08-22 まで素通りだった (実在は 0 件)。
     */
    name: '.innerHTML / .outerHTML / insertAdjacentHTML',
    pattern: /\.(?:inner|outer)HTML\s*=|\.insertAdjacentHTML\s*\(/,
    rationale: 'DOM XSS sink — banned in renderer; React rendering only',
  },
  {
    // `writeln` も同じ sink。`write` だけを見ていると別名で抜けられる。
    name: 'document.write / writeln',
    pattern: /\bdocument\.write(?:ln)?\s*\(/,
    rationale: 'DOM XSS sink — invariant #9',
  },
  {
    name: 'shell.openExternal direct call outside main process',
    pattern: /shell\.openExternal/,
    // main.ts holds the IPC handler with URL validation; oauth.ts uses
    // it to launch the consent browser (URL is buildAuthorizeUrl, fully
    // constructed by us, not user-supplied).
    allowFile: (rel) => rel === 'src/main/main.ts' || rel === 'src/main/oauth.ts',
    rationale: 'invariant #5 — external URLs flow through app:openExternal',
  },
  {
    // `serviceHub.invoke()` の戻り値を捨てている呼び出し。
    //
    // `action:invoke` は失敗しても reject せず `{ ok: false, code, message }` を
    // 返す (未知のサービス・未登録アクション・トークン未設定・アクション内の
    // throw をすべて戻り値で表す)。したがって戻り値を捨てると **失敗が成功と
    // 区別できなくなる**。2026-08 の監査時点で `VoiceCommandBar.performIntent`
    // が実際にそうなっており、トークン未設定でも「実行した」ことになって
    // 対象ページへ遷移していた (「GitHub に issue を作って」が黙って何も
    // 作らない)。
    //
    // 見るのは「文の先頭が await/void 付きの invoke で、代入も return も
    // されていない」形だけ。`const r = await …` / `return await …` /
    // `(await …).ok` は素通りする。網羅ではなく、この書き方の再発を止めるもの。
    name: 'serviceHub.invoke の戻り値を捨てている',
    pattern: /^\s*(?:await|void)\s+window\.serviceHub\??\.invoke\b/,
    codeOnly: true,
    rationale:
      'invoke は失敗を例外ではなく戻り値で返すため、捨てると失敗が成功に見える。' +
      'classifyActionResult (renderer/data/actionOutcome.ts) を通して、' +
      'failed なら理由を出し、成功を装う遷移をしないこと',
  },
  {
    name: 'window.open',
    pattern: /\bwindow\.open\s*\(/,
    // 唯一の例外がブラウザ版の openExternal 実装そのもの。そこは
    // `^https?://` を確かめてから開いており、この規約の実体がそれ。
    allowFile: (rel) => rel === 'src/renderer/web-shim.ts',
    // 散文で経緯を書けるように、コメント行は数えない。コメントの中の
    // 呼び出しは実行されないので、見逃しにはならない。
    codeOnly: true,
    rationale:
      '外部 URL は serviceHub.openExternal 経由に統一する (CLAUDE.md の規約)。' +
      'blob:/data: を window.open すると生成元と同一オリジンの文書になり、' +
      'そこで走るスクリプトが IndexedDB と localStorage に届く',
  },
  {
    name: 'unredacted response body in an error message',
    // 「redactSecrets を通していない行で body.slice( を使っている」を捕まえる。
    // 否定先読みで同一行の redactSecrets を除外している。
    pattern: /^(?!.*redactSecrets).*\bbody\.slice\(/,
    // 走査は行単位なので、`const body = await res.text()` → `body.slice(...)`
    // という**このリポジトリで実際に使われている書き方**しか見ない。
    // `(await res.text()).slice(...)` のように書けばすり抜ける。網羅ではなく、
    // 既にある書き方の再発を止めるためのもの。
    codeOnly: true,
    rationale:
      '連携先が応答に資格情報を反射しうる。このエラー文字列は画面にそのまま出て' +
      '不具合報告にも貼られるので、shared/redact.ts の redactSecrets を通す。' +
      'jsonFetch / http.ts / oauth.ts / proxy.ts は最初から通していたが、' +
      '同じ書き方の 8 箇所が素通しだった',
  },
  {
    name: 'markup / Markdown escaping / color / control-char check reimplemented outside its shared module',
    // マークアップ用エスケープの自前実装（実体参照 '&amp;' を自分で書いている行、
    // または 5 文字クラスをまとめて置換している行）、色の判定の自前実装
    // （`#RRGGBB` の正規表現）、制御文字の判定の自前実装（`=== 0x7f`）を捕まえる。
    // いずれも「利用者の入力が、書き出したファイルや通信の宛先になる」経路を
    // 守る判断で、写経すると必ずどれかが緩む。
    //
    // 制御文字を `=== 0x7f` の形に限っているのは、
    // `components/serviceActionUtils.ts` の `isStrippableControlChar` が
    // **別の判断**だから。あちらはメモの保存前サニタイズで、タブ・改行は残し
    // C1 (0x80–0x9f) まで落とす。URL を弾く判定とは保つものが違うので、
    // 1 つに畳むと片方の意図が壊れる。範囲比較 (`>= 0x7f && <= 0x9f`) は
    // 通し、等値比較だけを見る。網羅ではなく、既にある書き方の再発を止めるもの。
    // Markdown の区切り `|` を自前で落としている行 (`.replace(/\|/g, …)`) も
    // 見る。**この検出はもともと HTML/XML の形しか見ていなかった**ので、
    // `main/clients/stocks.ts` が関数内に持っていた
    // `escMd = s => s.replace(/\|/g, '\\|')` は網に掛からなかった。
    // 形が違うだけで守っているものは同じ (書き出したファイルに利用者や
    // AI の応答が埋まる経路) なので、同じ 1 つへ寄せる。
    // 2026-08-23: **危ない方が素通りしていた。** 上の 3 つは「`&` を `&amp;` に
    // する」「`[&<>…]` の文字クラス」を見るので、*正しく書けている*写経しか
    // 掛からない。実測すると
    //
    //     s.replace(/&/g, '&amp;').replace(/</g, '&lt;')   → 鳴る
    //     s.replace(/</g, '&lt;').replace(/>/g, '&gt;')    → 鳴らない  ← 危ない方
    //
    // で、後者は `"` と `'` を落としていない —— 属性に埋めると値から抜け出せる。
    // `gen-econ-asset-chart.cjs` で実際に起きた形そのもの (下の rationale)。
    // 実体参照を**作り出している** `.replace(…, '&lt;')` を最後の枝で見る。
    // 復号側 (`.replace(/&lt;/g, '<')`) は置換先が実体参照でないので掛からない。
    pattern: /\.replace\(\s*\/(?:&\/g\s*,\s*'&amp;'|\[&<>|\\\|\/g)|\[0-9a-fA-F\]\{6\}|===\s*0x7f\b|\.replace\([^)]*,\s*'&(?:lt|gt|quot|amp|#39|#x27);'/i,
    // 出荷コード (src/**) だけを見る。scripts/ の図生成は素の CJS で
    // TS の共有実装を読めないため対象外にしている — ただし落とす文字は
    // **揃っていなかった** —— 2026-08 に `gen-econ-asset-chart.cjs` を直したとき、
    // `build-landing.cjs` と `gen-econ-history-chart.cjs` は `'` を落として
    // おらず、この注記だけが「揃えてある」と言っていた (2026-08-23 実測で
    // 判明・両方に足した)。今は 3 つとも 5 文字で、
    // `src/shared/__tests__/buildScriptEscapes.test.ts` が字面で留める。
    allowFile: (rel) =>
      !rel.startsWith('src/') ||
      rel === 'src/shared/escape.ts' ||
      rel === 'src/shared/controlChars.ts' ||
      // 出口のエスケープではない (台帳の注記を参照)。件数つきで留めてあるので、
      // このファイルに 2 つめが増えれば鳴る。
      rel === 'src/shared/securityRange.ts',
    codeOnly: true,
    rationale:
      'escape.ts の冒頭に「アプリ全体で 1 つだけ持つ」と書いてあるのに、' +
      '2026-08 時点で main の business.ts / stocks.ts と renderer の ' +
      'stocksAnalysisWeb.ts に写経が 3 つ残っていた。' +
      'この種の関数は片方だけ文字を足し忘れても見た目に出ず、' +
      '「その書き出しだけエスケープが漏れる」状態が静かに残る。' +
      '実際にビルドスクリプト側では 1 つだけ " と \' を落としていなかった。' +
      '説明で 1 つだと言うのではなく、増やせないようにする。' +
      '色の判定 (`#RRGGBB`) も同じ理由で 1 つにした — main の templates.ts と ' +
      'renderer の TemplatesPage.tsx に同じ正規表現が 1 つずつあり、' +
      'さらに shared には受け入れ範囲の違う safeColor があって判断が 3 通りに割れていた。' +
      '制御文字の判定 (0x7f) も同じで、shared/atlassianSite.ts が持っていたものを ' +
      'shared/aiEndpoint.ts が書き直しかけたので shared/controlChars.ts へ寄せた — ' +
      '「0x1f まで」か「0x20 未満」か、0x7f を入れるかは一見して差が出ない。' +
      'Markdown のエスケープ (`|`) も 2026-08-20 に同じ形で見つかった — ' +
      '書き出しが 3 箇所あって stocks.ts だけが `|` を落とし、' +
      'stocksAnalysisWeb.ts と business.ts は素通しだった。' +
      'この検出が HTML/XML の形しか見ていなかったので気付けなかった',
  },
  {
    // 切ってから伏せる書き方。`redactSecrets(body.slice(0, 200))` は
    // **模様の終わりを切り落として規則ごと外す**ので、見えている秘密が
    // そのまま残る。2026-08-21 の実測では、閉じ引用符が切り口の外側に
    // 落ちる位置で 60 文字のトークンが**全部**残った (断片ではない)。
    // 正しい順序は shared/redact.ts の `redactForMessage` が 1 つだけ持つ。
    name: 'redactSecrets(x.slice(…)) — 切ってから伏せている',
    pattern: /redactSecrets\s*\(\s*[^)]*\.slice\s*\(/,
    allowFile: (rel) => !rel.startsWith('src/') || rel === 'src/shared/redact.ts',
    codeOnly: true,
    rationale:
      '`redactSecrets` は模様で秘密を見つけるので、模様の終わり ' +
      '(JSON の閉じ引用符 / Bearer の 16 文字 / 接頭辞の 8 文字) が ' +
      '切り落とされると規則そのものが当たらず、見えている秘密が残る。' +
      '2026-08-21 の監査時点で呼び出し 17 箇所すべてがこの順序で書かれており、' +
      '実測で 60 文字のトークンが全部残る位置があった。' +
      'この文字列は画面に出て不具合報告に貼られる — それが redactSecrets の存在理由。' +
      '`redactForMessage(body, 200)` を使うこと',
  },
  {
    // 食事補助の非課税限度額を地の文で書いた箇所。2026-04-01 施行の改正で
    // 3,500 円 → 7,500 円になったが、この数字は**出典もゲートも無いまま
    // 4 箇所に地の文で**書かれていたので、4 か月以上どこも古いままだった。
    // しかも画面の会社負担の既定値は 7,500 円で、免責文が掲げる 3,500 円の
    // 上限を自分で超えていた。値は `MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN` が
    // 1 つだけ持ち、出典と施行日をとなりに置いてある。
    name: '食事補助の非課税限度額を地の文に書いている (3,500 円は改正前の値)',
    pattern: /3,500\s*円|月\s*3500\b/,
    allowFile: (rel) =>
      !/welfare/i.test(rel) || rel === 'src/shared/welfareScheme.ts',
    codeOnly: false,
    rationale:
      '2026-04-01 施行の改正 (令和8年3月31日付 法令解釈通達・所得税基本通達 36-38の2) で ' +
      '食事の現物支給の非課税限度額は月 3,500 円から 7,500 円になった。' +
      '42 年ぶりの引き上げで、深夜勤務者の夜食代の金銭支給も 300 円から 650 円になっている。' +
      '古い上限を掲げると、規程を読んだ人が非課税枠を実際より小さく見積もる。' +
      '`MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN` を使うこと',
  },
  {
    name: 'child_process exec/spawn',
    /*
     * **呼び方を数え上げず、モジュールへの到達を塞ぐ。**
     *
     * 元の式は `child_process` と呼び名が**同じ行に、その順で**並ぶことを
     * 求めていた。ところが自然な書き方は逆順になる。実測 (2026-08-23) ——
     * 8 通りのうち **7 通りが素通り**した:
     *
     * ```
     *   ★素通り  import { execSync } from 'node:child_process';
     *   ★素通り  const { execSync } = require('child_process');
     *   ★素通り  import cp from 'node:child_process';   +  cp.execSync(cmd)
     *   捕まる    require('child_process').execSync(cmd);
     * ```
     *
     * 実際に `src/main` へ `import { execSync }` と呼び出しを足すと、
     * `lint:forbidden` / `lint:imports` / `typecheck` の **3 つとも緑**だった。
     * 不変条件 #9 (実行時コードからサブプロセスを起動しない) は
     * **書いてあるだけで、守らせている物が無かった**。
     *
     * 呼び方は無数にあるが、**モジュールを読み込まずには呼べない**。
     * だから読み込みの側を見る —— 悪い形を数え上げるのではなく、
     * 入口で判定する (`exportPaths.ts` と同じ考え方)。
     */
    pattern: /(^|[^\w.])(node:)?child_process\b/,
    // Build/dev scripts are allowed; runtime src is not.
    // この門自身も除く —— 上の注記が**標本として**禁止の字面を抱えるため
    // (ReDoS の門が自分の標本を指摘したのと同じ形)。
    allowFile: (rel) => rel.startsWith('scripts/'),
    rationale: 'invariant: no subprocess execution from runtime code paths',
  },
  {
    name: 'Ollama write-side endpoints in network code',
    // Only flag if the string appears as part of an actual URL/path
    // construction: preceded by `/`, in a template literal or quoted
    // string used in a fetch context. JSX display text wrapped in
    // <code>…</code> tags is rendered statically and doesn't reach
    // the network (the renderer's CSP `connect-src 'self'` blocks it).
    pattern: /\/api\/(pull|create|push|copy|delete|blobs|upload)\b/,
    // Skip renderer pages (display only; can't make network calls per CSP)
    // and the two modules that *define* the deny-list: the Ollama client
    // (ALLOWED_ENDPOINTS) and src/shared/ollama.ts (OLLAMA_READ_PATHS —
    // the allowlist both processes share). Both enumerate these paths in
    // order to refuse them, and UNPATCHED_OOB_NOTICE must name them for the
    // user-facing warning to mean anything. Listed as exact paths, not a
    // prefix, so a new file under src/shared/ is still checked.
    allowFile: (rel) =>
      rel === 'src/main/clients/ollama.ts' ||
      rel === 'src/shared/ollama.ts' ||
      // CLI も「呼ばない API」を明記して利用者に伝える必要がある (--help に出る)。
      rel === 'scripts/ollama-cli.cjs' ||
      rel.startsWith('src/renderer/'),
    rationale: 'invariants #7-#8 — these endpoints are CVE prone',
  },
  {
    /*
     * 表への所属判定に `in` を使う形。**`in` はプロトタイプ鎖まで辿る**ので、
     * 表に無い 'constructor' / 'toString' / '__proto__' / 'valueOf' /
     * 'hasOwnProperty' / 'isPrototypeOf' / 'propertyIsEnumerable' /
     * 'toLocaleString' の 8 個が**すべて通る**。
     *
     * 2026-08-22 の走査で 2 件見つかった:
     *   - `business.ts` の `isBusinessCategoryId` —— IPC 境界で
     *     `askBusinessAdvisor` の `categories` を絞る唯一の番人。8 個とも
     *     通っていて、外部 API へ送るプロンプトに載っていた
     *   - `screenshot.cjs` の smoke スタブ突き合わせ —— **不足を数える**検査
     *     なので、見落とす側に倒れる
     * 判断自体は `templates.ts` の `isTemplateId` に先に書いてあった
     * (「`in` ではなく `Object.hasOwn` を使う」)。**1 か所に書いても隣は直らない**。
     *
     * 散文の "in" を避けるため、右辺が大文字定数 (この repo の表の命名) で、
     * その直後が式の切れ目 `) ; , ?` か行末のときだけ当てる。
     * `for (const k in TABLE)` は左辺の直前が `const`/`let`/`var` なので外す
     * (`for...in` は列挙可能な自前の性質しか回さないため、この穴は無い)。
     */
    name: '表への所属判定に in を使っている',
    pattern:
      /(?:^|[^\w.$])(?<!\b(?:const|let|var)\s)(?:[A-Za-z_$][\w$.]*|'[^']*'|"[^"]*")\s+in\s+[A-Z][A-Z0-9_]{2,}\s*(?=[)\];,?]|$)/,
    codeOnly: true,
    rationale: 'プロトタイプ鎖まで拾う — Object.hasOwn か Set(...).has を使うこと',
  },
];

/**
 * 行コメントか (行頭が `//` / `*` / `/*`)。
 *
 * 完全な構文解析ではない。狙いは「なぜこの書き方を禁じたか」を
 * ソースの散文で説明できるようにすることだけで、コメントの中の呼び出しは
 * 実行されないので、緩めても見逃しにはならない。
 */
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * **例外が実際に効いている場所の台帳** (`規則名 :: パス`)。
 *
 * `allowFile` は規則に開けた穴である。他の台帳 (`lint:charset` の ALLOWLIST /
 * `lint:network-targets` の REVIEWED / `lint:mutation-scope` の KNOWN_BROAD) は
 * どれも双方向なのに、ここだけ片方向だった —— **規則が当たらなくなった後も
 * 例外は残り続け、そのファイルだけ永久に規則の外に居られる**。
 *
 * 双方向にする:
 *   - 台帳に無い場所で例外が効いた → 新しい穴。理由を書いて登録すること
 *   - 台帳にあるのに効かなかった   → もう要らない穴。削除すること
 *
 * (2026-08-22 の実測で、当時の 23 件はすべて生きていた = 死んだ例外は無かった。
 *  それを固定するための台帳であって、既知の負債の一覧ではない。)
 *
 * ## 件数まで留める (2026-08-23)
 *
 * 双方向にしても**粒度がファイル単位**だったので、例外の効いているファイルは
 * **その規則から丸ごと外れて**いた。実測: `web-shim.ts` へ `noopener` 無しの
 * `window.open(u, '_blank')` を足しても**緑のまま**通った
 * (`window.open :: src/renderer/web-shim.ts` の例外が新しい違反まで覆う)。
 *
 * 鍵を `規則名 :: パス :: 件数` にした。例外のあるファイルに違反が増えれば
 * 件数が変わって鳴る。
 *
 * **残る隙間 (正直に書く)**: 正当な 1 件を消して同時に危ない 1 件を足すと
 * 件数が変わらない。一致行の中身まで台帳に載せれば閉じるが、
 * 変数名を変えただけで鳴る台帳になり、読む人が中身を追えなくなる。
 * 「新しい違反が増える」ほうが実際に起きる形なので、そちらを取った。
 */
const KNOWN_SUPPRESSIONS = [
  // child_process: ビルド/開発の道具だけが使う。**実行時コード (src/) は 0 件**で、
  // そこが規則の目的 (不変条件 #9)。規則を「モジュールへの到達」で見るよう
  // 直した結果、これまで素通りしていた import 形が全部当たるようになり、
  // scripts/ 側で例外が効く場所が可視化された (2026-08-23)。
  'child_process exec/spawn :: scripts/check-import-boundaries.cjs :: 2',
  'child_process exec/spawn :: scripts/knowledge-autopilot.cjs :: 1',
  'child_process exec/spawn :: scripts/lint-repo-size.cjs :: 1',
  'child_process exec/spawn :: scripts/lint-shell.cjs :: 1',
  'child_process exec/spawn :: scripts/mcp-check.cjs :: 1',
  'child_process exec/spawn :: scripts/mutate-changed.cjs :: 1',
  'child_process exec/spawn :: scripts/progress.cjs :: 1',
  'child_process exec/spawn :: scripts/quality-report.cjs :: 1',
  'child_process exec/spawn :: scripts/session-context.cjs :: 1',
  'Ollama write-side endpoints in network code :: scripts/ollama-cli.cjs :: 1',
  'Ollama write-side endpoints in network code :: src/main/clients/ollama.ts :: 3',
  'Ollama write-side endpoints in network code :: src/renderer/pages/OllamaPage.tsx :: 2',
  'Ollama write-side endpoints in network code :: src/shared/ollama.ts :: 3',
  'hand-rolled RFC 2822 header line :: src/main/clients/gmail.ts :: 2',
  'hand-rolled RFC 2822 header line :: src/renderer/data/saasWriteWeb.ts :: 2',
  'hardcoded Claude model id :: src/shared/ai/providers.ts :: 2',
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: scripts/build-landing.cjs :: 5',
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: scripts/gen-econ-asset-chart.cjs :: 5',
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: scripts/gen-econ-history-chart.cjs :: 5',
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: src/shared/controlChars.ts :: 1',
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: src/shared/escape.ts :: 10',
  // `securityRange.ts` は**出口のエスケープではない**。`applyEvasion` は
  // レッドチーム用に「実体参照で符号化した攻撃文字列」を*作る*側で、
  // 検出器がそれを見破れるかを試すためのもの。同じファイルの
  // `normalizeForDetection` は逆に実体参照を*復号*する (置換先が
  // 実体参照でないので、この規則には最初から掛からない)。
  'markup / Markdown escaping / color / control-char check reimplemented outside its shared module :: src/shared/securityRange.ts :: 1',
  'new Function :: orchestration/knowledge-context.cjs :: 1',
  'redactSecrets(x.slice(…)) — 切ってから伏せている :: src/shared/redact.ts :: 1',
  'sandbox: false (レンダラープロセスの OS サンドボックスを外す) :: scripts/overflow-check.cjs :: 1',
  'sandbox: false (レンダラープロセスの OS サンドボックスを外す) :: scripts/runtime-security-exp.cjs :: 1',
  'sandbox: false (レンダラープロセスの OS サンドボックスを外す) :: scripts/screenshot-dashboard.cjs :: 1',
  'sandbox: false (レンダラープロセスの OS サンドボックスを外す) :: scripts/screenshot.cjs :: 1',
  'sandbox: false (レンダラープロセスの OS サンドボックスを外す) :: scripts/soak-test.cjs :: 1',
  'shell.openExternal direct call outside main process :: src/main/main.ts :: 2',
  'shell.openExternal direct call outside main process :: src/main/oauth.ts :: 1',
  'window.open :: src/renderer/web-shim.ts :: 1',
  '食事補助の非課税限度額を地の文に書いている (3,500 円は改正前の値) :: src/shared/welfareScheme.ts :: 2',
];

function walk(dir, hit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(REPO_ROOT, full);
    if (EXCLUDE_PATTERNS.some((re) => re.test(rel))) continue;
    if (entry.isDirectory()) {
      walk(full, hit);
    } else if (entry.isFile()) {
      if (/\.(ts|tsx|cjs|js|jsx|html)$/.test(entry.name)) {
        hit(full, rel);
      }
    }
  }
}

/**
 * 陰性対照 — **このゲートが本当に鳴るか**を毎回確かめる。
 *
 * 2026-08-22 時点で verify:all の 25 ゲートのうち self-test を持つのは 6 つ
 * だけだった。鳴らないゲートは「常に緑を返す関門」と同じで、無いより悪い
 * (守られていると信じさせるぶん)。まずは隔離を解く設定の 5 つから。
 */
/**
 * 実際に効いた例外と台帳を突き合わせる。**双方向** ——
 * 台帳に無い穴 (`added`) と、台帳にあるのに効かない穴 (`gone`) の両方を返す。
 *
 * 鍵は `規則名 :: パス :: 件数`。件数を含めるので、**例外のあるファイルへ
 * 新しい違反が増えると `added` と `gone` が同時に立つ** (件数違いの別項目に
 * 見えるため)。出力に旧件数と新件数が並ぶので、何が増えたか読み取れる。
 */
function diffSuppressions(actual, known) {
  const knownSet = new Set(known);
  return {
    added: [...actual].filter((x) => !knownSet.has(x)).sort(),
    gone: [...knownSet].filter((x) => !actual.has(x)).sort(),
  };
}

function selfTest() {
  const cases = [
    ['nodeIntegration: true を弾く', 'webPreferences: { nodeIntegration: true },', 1],
    ['nodeIntegrationInWorker も弾く', 'nodeIntegrationInWorker: true,', 1],
    ['contextIsolation: false を弾く', 'contextIsolation: false,', 1],
    ['sandbox: false を弾く', 'sandbox: false,', 1],
    ['webSecurity: false を弾く', 'webSecurity: false,', 1],
    ['allowRunningInsecureContent: true を弾く', 'allowRunningInsecureContent: true,', 1],
    // 別名による回避 (2026-08-22 の点検で全部塞いだ。当時の実在は 0 件)。
    ['new なしの Function() を弾く', "const f = Function('return 1');", 1],
    ['Function( に変数を渡す散文は当てない', 'Cobb-Douglas Production Function (overview)', 0],
    ['型注釈の Function は当てない', 'function f(cb: Function) { return cb; }', 0],
    ['AsyncFunction は当てない (単語境界)', "const f = AsyncFunction('x');", 0],
    ['.outerHTML = も弾く', 'el.outerHTML = html;', 1],
    ['insertAdjacentHTML も弾く', "el.insertAdjacentHTML('beforeend', html);", 1],
    ['document.writeln も弾く', "document.writeln('<b>');", 1],
    ['textContent は弾かない (安全な代替)', 'el.textContent = s;', 0],
    ['innerText も弾かない', 'el.innerText = s;', 0],
    ['メールヘッダの手組みを弾く (To)', "const m = [`To: ${addr}`].join('\\r\\n');", 1],
    ['メールヘッダの手組みを弾く (Bcc)', "const m = `Bcc: ${addr}`;", 1],
    ['メールヘッダの手組みを弾く (Subject)', "const m = `Subject: ${s}`;", 1],
    ['定数のヘッダ行は弾かない', "const m = 'Content-Type: text/plain';", 0],
    ['本文中の To: は弾かない (補間が無い)', "const m = `To: taro@example.com`;", 0],
    ['モデル ID の写経を弾く (sonnet)', "model: 'claude-sonnet-4-6',", 1],
    ['モデル ID の写経を弾く (haiku)', "model: 'claude-haiku-4-5-20251001',", 1],
    ['モデル ID の写経を弾く (opus)', "const m = 'claude-opus-5';", 1],
    ['三項の既定値でも弾く', "model: x ? x : 'claude-sonnet-4-6',", 1],
    ['正典を参照していれば鳴らない', 'model: AI_PROVIDERS.anthropic.defaultModel,', 0],
    ['高速モデルの定数参照も鳴らない', 'model: ANTHROPIC_FAST_MODEL,', 0],
    // 第三者サービスが自分の呼び方で報告してくる文字列 (Cursor の使用統計)。
    // こちらが送るモデル ID ではないので当ててはいけない。
    ['第三者の呼び方 (claude-4.5-sonnet) は当てない', "model: 'claude-4.5-sonnet',", 0],
    ['文中の言及 (引用符なし) は当てない', '// 既定は claude-sonnet-4-6 です', 0],
    ['本物に見える GitHub トークンを弾く', "const t = 'ghp_" + 'a'.repeat(36) + "';", 1],
    ['本物に見える Anthropic キーを弾く', "const t = 'sk-ant-" + 'b'.repeat(32) + "';", 1],
    ['入力欄のプレースホルダは鳴らない', "placeholder: 'ghp_...',", 0],
    ['伏字パターンそのものは鳴らない', "/\\b(sk-ant-|ghp_)[A-Za-z0-9_-]{8,}/g", 0],
    ['秘密鍵の直書きを弾く', '-----BEGIN RSA PRIVATE KEY-----', 1],
    ['正しい設定は鳴らない', 'contextIsolation: true, nodeIntegration: false, sandbox: true,', 0],
    ['コメント内の言及は鳴らない', '// nodeIntegration: true は使わないこと', 0],
    ['webviewTag: true を弾く', 'webPreferences: { webviewTag: true },', 1],
    ['experimentalFeatures: true を弾く', 'experimentalFeatures: true,', 1],
    ['enableRemoteModule: true を弾く', 'enableRemoteModule: true,', 1],
    ['webviewTag: false は鳴らない', 'webPreferences: { webviewTag: false },', 0],
    ['表への in を弾く (型ガード)', "return typeof v === 'string' && v in CATEGORY_BY_ID;", 1],
    ['表への in を弾く (否定)', 'const missing = list.filter((c) => !(c in STUBS));', 1],
    ['表への in を弾く (三項)', 'const n = k in FIELD_LIMITS ? 1 : 2;', 1],
    ['Object.hasOwn なら鳴らない', "return typeof v === 'string' && Object.hasOwn(CATEGORY_BY_ID, v);", 0],
    ['for...in は鳴らない (自前の性質しか回らない)', 'for (const k in CATEGORY_BY_ID) out.push(k);', 0],
    ['散文の in は鳴らない (文字列の末尾)', "throw new Error('not listed in AI_PROVIDER_IDS');", 0],
    ['散文の in は鳴らない (後ろに語が続く)', "it('one entry per kind in FUNDING_KINDS order', () => {", 0],
    ['散文の in は鳴らない (後ろが括弧)', "it('shipped in SUPPORT_RESOURCES (label)', () => {", 0],
  ];

  /*
   * **台帳の突き合わせ自体の検査。** 上の表は「1 行がパターンに当たるか」しか
   * 見ておらず、例外の台帳が効いているかは別の話である。
   * ここが無かったので、**例外のあるファイルへ新しい違反を足しても鳴らない**
   * ことに気付けなかった (2026-08-23 に実測で発覚)。
   */
  const K = 'window.open :: src/renderer/web-shim.ts';
  const ledgerCases = [
    ['台帳どおりなら何も出ない', [`${K} :: 1`], [`${K} :: 1`], 0, 0],
    ['例外が増えた (新しい穴)', [`${K} :: 1`, 'x :: y :: 1'], [`${K} :: 1`], 1, 0],
    ['例外が消えた (要らない穴)', [], [`${K} :: 1`], 0, 1],
    // **これが本題** —— 同じファイル・同じ規則で違反が 1 → 2 に増えた形。
    ['同じファイルに違反が増えると鳴る', [`${K} :: 2`], [`${K} :: 1`], 1, 1],
    ['減っても鳴る (直したなら台帳も直す)', [`${K} :: 1`], [`${K} :: 2`], 1, 1],
    ['件数を無視する鍵なら見逃していた (対照)', [`${K}`], [`${K}`], 0, 0],
  ];
  let bad = 0;
  for (const [label, actual, known, wantAdded, wantGone] of ledgerCases) {
    const r = diffSuppressions(new Set(actual), known);
    const ok = r.added.length === wantAdded && r.gone.length === wantGone;
    if (!ok) bad += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} 台帳: ${label}: 新 ${r.added.length} / 旧 ${r.gone.length} ` +
        `(期待 ${wantAdded} / ${wantGone})`,
    );
  }

  for (const [label, line, expected] of cases) {
    let n = 0;
    for (const fp of FORBIDDEN_PATTERNS) {
      if (fp.codeOnly && isCommentLine(line)) continue;
      if (fp.pattern.test(line)) n++;
    }
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — ゲートが鳴らない / 鳴りすぎている`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const violations = [];
  /** 例外が実際に「鳴るはずの一致を握り潰した」場所。台帳と突き合わせる。 */
  const suppressions = new Set();
  let filesScanned = 0;

  walk(path.join(REPO_ROOT, 'src'), scan);
  walk(path.join(REPO_ROOT, 'scripts'), scan);
  walk(path.join(REPO_ROOT, 'build'), scan);
  // 2026-08-22 に足した。`src` / `scripts` / `build` だけを見ていたので、
  // **出荷される Service Worker (assets/sw.js) と orchestration/*.cjs が
  // 丸ごと見えていなかった**。実際 orchestration に不変条件 #9 違反
  // (new Function) が 1 件あり、誰にも見られないまま残っていた。
  walk(path.join(REPO_ROOT, 'orchestration'), scan);
  walk(path.join(REPO_ROOT, 'assets'), scan);

  function scan(full, rel) {
    filesScanned++;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      return;
    }
    const lines = text.split('\n');
    for (const fp of FORBIDDEN_PATTERNS) {
      if (fp.allowFile && fp.allowFile(rel)) {
        // **握り潰した事実を記録する。** 例外は穴なので、要らなくなったら
        // 閉じなければならない。記録しないと「もう鳴らない規則に対する
        // 例外」が永久に残り、そのファイルだけ規則の外に居続ける。
        const hits = lines.filter((l) =>
          fp.codeOnly && isCommentLine(l) ? false : fp.pattern.test(l),
        ).length;
        if (hits > 0) {
          // **件数まで記録する。** ファイル名だけで台帳を突き合わせると、
          // 例外の効いているファイルに**新しい違反を足しても鳴らない** ——
          // 規則がそのファイルで丸ごと無効になる (実測で確認: web-shim.ts へ
          // `noopener` 無しの `window.open` を足しても緑のままだった)。
          suppressions.add(`${fp.name} :: ${rel} :: ${hits}`);
        }
        continue;
      }
      for (let i = 0; i < lines.length; i++) {
        if (fp.codeOnly && isCommentLine(lines[i])) continue;
        if (fp.pattern.test(lines[i])) {
          violations.push({
            file: rel,
            line: i + 1,
            name: fp.name,
            rationale: fp.rationale,
            content: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }

  console.log(
    `Scanned ${filesScanned} runtime source files against ${FORBIDDEN_PATTERNS.length} forbidden patterns`,
  );
  const { added, gone } = diffSuppressions(suppressions, KNOWN_SUPPRESSIONS);
  if (added.length > 0) {
    console.error(`\n❌ 台帳に無い例外が ${added.length} 件効いています (新しい穴):\n`);
    for (const x of added) console.error(`  ${x}`);
    console.error('\n  なぜ安全かを添えて KNOWN_SUPPRESSIONS に登録してください。');
  }
  if (gone.length > 0) {
    console.error(`\n❌ 台帳にあるのに効いていない例外が ${gone.length} 件あります (要らない穴):\n`);
    for (const x of gone) console.error(`  ${x}`);
    console.error('\n  規則が当たらなくなっています。KNOWN_SUPPRESSIONS から削除してください。');
  }
  if (violations.length === 0 && added.length === 0 && gone.length === 0) {
    console.log(`✅ no forbidden patterns found (例外 ${suppressions.size} 件はすべて台帳どおり)`);
    return 0;
  }
  if (violations.length === 0) return 1;
  console.error(`❌ ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.name}]`);
    console.error(`    ${v.content}`);
    console.error(`    rationale: ${v.rationale}`);
  }
  return 1;
}

process.exit(main());
