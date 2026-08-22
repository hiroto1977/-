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
    name: 'new Function',
    pattern: /\bnew\s+Function\s*\(/,
    rationale: 'arbitrary code execution — invariant #9',
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
    name: '.innerHTML =',
    pattern: /\.innerHTML\s*=/,
    rationale: 'DOM XSS sink — banned in renderer; React rendering only',
  },
  {
    name: 'document.write',
    pattern: /\bdocument\.write\s*\(/,
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
    pattern: /\.replace\(\s*\/(?:&\/g\s*,\s*'&amp;'|\[&<>|\\\|\/g)|\[0-9a-fA-F\]\{6\}|===\s*0x7f\b/i,
    // 出荷コード (src/**) だけを見る。scripts/ の図生成は素の CJS で
    // TS の共有実装を読めないため対象外にしている — ただし落とす文字は
    // 揃えてある (2026-08 に gen-econ-asset-chart.cjs だけ " と ' を
    // 残していたのを合わせた)。
    allowFile: (rel) =>
      !rel.startsWith('src/') || rel === 'src/shared/escape.ts' || rel === 'src/shared/controlChars.ts',
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
    pattern: /(child_process|node:child_process).*?\b(exec|execSync|spawn|spawnSync)\b/,
    // Build/dev scripts are allowed; runtime src is not.
    allowFile: (rel) => rel.startsWith('scripts/') && rel !== 'scripts/lint-forbidden-patterns.cjs',
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
function selfTest() {
  const cases = [
    ['nodeIntegration: true を弾く', 'webPreferences: { nodeIntegration: true },', 1],
    ['nodeIntegrationInWorker も弾く', 'nodeIntegrationInWorker: true,', 1],
    ['contextIsolation: false を弾く', 'contextIsolation: false,', 1],
    ['sandbox: false を弾く', 'sandbox: false,', 1],
    ['webSecurity: false を弾く', 'webSecurity: false,', 1],
    ['allowRunningInsecureContent: true を弾く', 'allowRunningInsecureContent: true,', 1],
    ['本物に見える GitHub トークンを弾く', "const t = 'ghp_" + 'a'.repeat(36) + "';", 1],
    ['本物に見える Anthropic キーを弾く', "const t = 'sk-ant-" + 'b'.repeat(32) + "';", 1],
    ['入力欄のプレースホルダは鳴らない', "placeholder: 'ghp_...',", 0],
    ['伏字パターンそのものは鳴らない', "/\\b(sk-ant-|ghp_)[A-Za-z0-9_-]{8,}/g", 0],
    ['秘密鍵の直書きを弾く', '-----BEGIN RSA PRIVATE KEY-----', 1],
    ['正しい設定は鳴らない', 'contextIsolation: true, nodeIntegration: false, sandbox: true,', 0],
    ['コメント内の言及は鳴らない', '// nodeIntegration: true は使わないこと', 0],
  ];
  let bad = 0;
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
  let filesScanned = 0;

  walk(path.join(REPO_ROOT, 'src'), scan);
  walk(path.join(REPO_ROOT, 'scripts'), scan);
  walk(path.join(REPO_ROOT, 'build'), scan);

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
      if (fp.allowFile && fp.allowFile(rel)) continue;
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
  if (violations.length === 0) {
    console.log('✅ no forbidden patterns found');
    return 0;
  }
  console.error(`❌ ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.name}]`);
    console.error(`    ${v.content}`);
    console.error(`    rationale: ${v.rationale}`);
  }
  return 1;
}

process.exit(main());
