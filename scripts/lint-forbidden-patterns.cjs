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
    name: 'markup escaping / color / control-char check reimplemented outside its shared module',
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
    pattern: /\.replace\(\s*\/(?:&\/g\s*,\s*'&amp;'|\[&<>)|\[0-9a-fA-F\]\{6\}|===\s*0x7f\b/i,
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
      '「0x1f まで」か「0x20 未満」か、0x7f を入れるかは一見して差が出ない',
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

function main() {
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
