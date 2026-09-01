#!/usr/bin/env node
/* eslint-disable */
/**
 * Verify the integrity of docs/ARCHITECTURE.md against the live tree.
 *
 * Checks performed
 * -----------------
 * 1. **Path existence** — every `file[:line]` ref points to a real file.
 * 2. **Line-range bounds** — line numbers fit inside the file.
 * 3. **Symbol locality (STRICT)** — a backticked identifier that
 *    immediately precedes the ref must appear within ±SYMBOL_WINDOW
 *    lines of the cited range. This catches the "code moved, doc didn't"
 *    rot mode that plain bounds-checking misses.
 * 4. **Live metric checks** — claims like "14 services", "300 tests",
 *    "8 IPC handlers" are recomputed from source and compared to the
 *    doc's stated number.
 *
 * Run via:  node scripts/verify-architecture.cjs
 *           npm run verify:arch
 *
 * Exits 1 on any failure so it can gate CI.
 *
 * Flags:
 *   --lenient   widen the symbol window to "anywhere in file" (was the
 *               original behaviour; kept for emergency overrides).
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * git が追跡しているファイルの集合。CI の fresh checkout に存在するのは
 * これだけなので、参照先がここに無ければ「手元だけ通る」参照になる。
 * git が使えない環境では判定を諦める (null) — 検査できないことを理由に
 * 誤って落とすほうが害が大きい。
 */
const TRACKED = (() => {
  try {
    const out = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return new Set(out.split('\0').filter(Boolean));
  } catch {
    return null;
  }
})();

function isTracked(absPath) {
  if (TRACKED === null) return true; // 判定不能なら通す
  const rel = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
  return TRACKED.has(rel);
}
const ARCH_FILE = path.join(REPO_ROOT, 'docs/ARCHITECTURE.md');

// Lines of source context to allow around each cited line / range.
// Tight enough to catch real drift; loose enough to absorb harmless
// formatting changes (whitespace, comment additions, etc.).
const SYMBOL_WINDOW = 15;

const LENIENT = process.argv.includes('--lenient');

// Files referenced without a directory prefix are searched across the
// common code locations. The doc uses shorthand like `oauth.ts` for
// `src/main/oauth.ts`, `serviceId.ts` for `src/shared/serviceId.ts`,
// `gmail.test.ts` for `src/main/clients/__tests__/gmail.test.ts`, etc.
const SEARCH_DIRS = [
  '',                                   // REPO_ROOT
  'src/main',
  'src/main/clients',
  'src/main/__tests__',
  'src/main/clients/__tests__',
  'src/shared',
  'src/shared/__tests__',
  'src/preload',
  'src/renderer',
  'src/renderer/hooks',
  'src/renderer/components',
  'src/renderer/pages',
  'scripts',
];

function resolveRef(file) {
  // Absolute-style: src/foo, scripts/foo, docs/foo
  if (
    file.startsWith('src/') ||
    file.startsWith('scripts/') ||
    file.startsWith('docs/') ||
    file === 'CLAUDE.md' ||
    file === 'README.md' ||
    file.endsWith('.json')
  ) {
    return path.join(REPO_ROOT, file);
  }
  for (const dir of SEARCH_DIRS) {
    const candidate = path.join(REPO_ROOT, dir, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(REPO_ROOT, 'src/main', file);
}

/** Parse `<file>[:<lineSpec>]` where lineSpec is `N`, `N-M`, or `N,M,...`. */
function parseRef(raw) {
  const [file, lineSpec] = raw.split(':');
  if (!lineSpec) return { file, lines: [] };

  const lines = new Set();
  for (const part of lineSpec.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      for (let i = a; i <= b; i++) lines.add(i);
    } else {
      const n = Number(part);
      if (!Number.isFinite(n)) return null;
      lines.add(n);
    }
  }
  return { file, lines: [...lines].sort((a, b) => a - b) };
}

/** Extract symbol candidates from text. Backtick-wrapped identifiers
 *  (camelCase / snake_case / kebab-case) only. */
function extractSymbols(text) {
  const symbols = new Set();
  for (const m of text.matchAll(/`([A-Za-z_][A-Za-z0-9_-]{2,})\(?\)?`/g)) {
    const sym = m[1];
    // Skip generic words / TypeScript primitives.
    if (
      /^(file|line|true|false|null|void|string|number|boolean|main|src|clients|action|payload|test|tests|fetch|json|api|data|svc|env|raw|res|err|get|post|put|delete|patch|head|options)$/i.test(
        sym,
      )
    ) {
      continue;
    }
    symbols.add(sym);
  }
  return [...symbols];
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    return null;
  }
}

function countOccurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

// ---------------------------------------------------------------------------
// Phase 1 — file:line reference verification
// ---------------------------------------------------------------------------

function verifyReferences(archText) {
  const archLines = archText.split('\n');

  // Match backtick-wrapped paths with optional :lines.
  const REF_RE = /`([A-Za-z][A-Za-z0-9./_-]*?\.(ts|tsx|cjs|sh|json|html|md))(?::([0-9]+(?:[,-][0-9]+)*))?`/g;

  const failures = [];
  let successCount = 0;

  archLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    let prevEnd = 0;

    for (const m of line.matchAll(REF_RE)) {
      const file = m[1];
      const lineSpec = m[3];
      const fullRef = lineSpec ? `${file}:${lineSpec}` : file;
      const refPath = resolveRef(file);
      const matchStart = m.index;
      const namingContext = line.slice(prevEnd, matchStart);
      prevEnd = matchStart + m[0].length;

      if (!fs.existsSync(refPath)) {
        failures.push({
          archLine: lineNo,
          ref: fullRef,
          reason: `file not found: ${path.relative(REPO_ROOT, refPath)}`,
        });
        continue;
      }

      // 手元にあっても **git 管理外なら CI の fresh checkout には無い**。
      // つまり「ローカルは green・CI は file not found で落ちる」を作る。
      // 2026-08-11 に実際に踏んだ: dist/standalone.html を追跡から外した直後、
      // ARCHITECTURE.md にバッククォート付きで書いたため、作業ツリーには
      // 生成物が残っていてローカルだけ通った。存在確認では検出できないので
      // **追跡されているか**を見る。
      if (!isTracked(refPath)) {
        failures.push({
          archLine: lineNo,
          ref: fullRef,
          reason:
            `git 管理外のパスを参照しています (${path.relative(REPO_ROOT, refPath)})。` +
            ' 手元にはあっても CI の fresh checkout には存在せず、CI だけが落ちます。' +
            ' 生成物を指すならバッククォートを外して文章で書いてください。',
        });
        continue;
      }

      if (lineSpec) {
        const parsed = parseRef(fullRef);
        if (!parsed || parsed.lines.length === 0) {
          failures.push({ archLine: lineNo, ref: fullRef, reason: 'invalid line spec' });
          continue;
        }
        const srcText = readFileSafe(refPath);
        const srcArr = srcText.split('\n');
        const srcLineCount = srcArr.length;

        for (const n of parsed.lines) {
          if (n < 1 || n > srcLineCount) {
            failures.push({
              archLine: lineNo,
              ref: fullRef,
              reason: `line ${n} out of bounds (file has ${srcLineCount} lines)`,
            });
          }
        }

        const symbols = extractSymbols(namingContext);
        if (symbols.length > 0) {
          const lo = Math.max(1, Math.min(...parsed.lines) - SYMBOL_WINDOW);
          const hi = Math.min(srcLineCount, Math.max(...parsed.lines) + SYMBOL_WINDOW);
          const window = srcArr.slice(lo - 1, hi).join('\n');

          for (const sym of symbols) {
            const inWindow = window.includes(sym);
            const inFile = srcText.includes(sym);
            if (!inWindow) {
              if (!inFile) {
                failures.push({
                  archLine: lineNo,
                  ref: fullRef,
                  reason: `symbol "${sym}" not found in ${path.relative(REPO_ROOT, refPath)}`,
                });
              } else if (!LENIENT) {
                // Symbol exists but drifted out of the ±SYMBOL_WINDOW band:
                // surface where it actually lives so the doc can be patched.
                const actualLines = srcArr
                  .map((l, i) => (l.includes(sym) ? i + 1 : 0))
                  .filter(Boolean);
                failures.push({
                  archLine: lineNo,
                  ref: fullRef,
                  reason: `symbol "${sym}" drifted: cited near line ${parsed.lines[0]} but actually at line(s) ${actualLines.slice(0, 4).join(', ')} (${path.relative(REPO_ROOT, refPath)})`,
                });
              }
            }
          }
        }
      }

      successCount++;
    }
  });

  return { successCount, failures };
}

// ---------------------------------------------------------------------------
// Phase 2 — live metric verification
// ---------------------------------------------------------------------------

/** Each metric extracts a number from ARCHITECTURE.md and compares
 *  it to a freshly-computed value from the source tree. */
/*
 * 自己検査を**別名のスクリプトで**走らせているゲートの台帳。
 * `vault:check` は `build-knowledge-vault.cjs --check && safe-vault-write.cjs` で、
 * 後者は引数なしで走らせると封じ込めの自己検査そのものになる。
 * 台帳は双方向 —— 名前から `self-test` が消えたら、ここに載っていない限り数が減る。
 */
const SELF_TEST_ALIASES = new Set(['vault:check']);

/** `verify:all` が連ねているゲート名。 */
function verifyAllGates(scripts) {
  return (scripts['verify:all'] || '')
    .split('&&')
    .map((x) => x.trim().replace(/^npm run /, ''))
    .filter(Boolean);
}

/** 陰性対照 (self-test) を持つゲートかどうか。 */
function hasSelfTest(gate, scripts) {
  return /self-test/.test(scripts[gate] || '') || SELF_TEST_ALIASES.has(gate);
}

/**
 * 静的な `it(` の数。**2 か所から参照される** (ARCHITECTURE.md の表と
 * CLAUDE.md の `~N tests`)。数え方を写すと、片方だけ直したときに
 * 「どちらが正しいのか分からない 2 つの数」になる。
 *
 * コメントアウトされた検査 (`// it(`) は行頭の空白＋`it(` に一致しないので入らない。
 */
function countStaticIts() {
  let total = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.test\.ts$/.test(e.name)) {
        const text = readFileSafe(full);
        total += [...text.matchAll(/^\s+it\(/gm)].length;
      }
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
  return total;
}

const METRICS = [
  {
    /*
     * ゲートに陰性対照が付いている数。
     *
     * 「CI が遅いから」で `&& … --self-test` を 1 つ外すのは一瞬で、外した
     * 瞬間から**そのゲートは鳴かなくなっても誰も気づけない**状態に戻る。
     * 数を doc に書いて突き合わせる。
     */
    name: 'gates with a negative control',
    docPattern: /陰性対照つきゲート \| (\d+) \/ \d+ /,
    compute: () => {
      const pkg = JSON.parse(readFileSafe(path.join(REPO_ROOT, 'package.json')) ?? '{}');
      const scripts = pkg.scripts ?? {};
      return verifyAllGates(scripts).filter((g) => hasSelfTest(g, scripts)).length;
    },
  },
  {
    name: 'verify:all gate count',
    docPattern: /陰性対照つきゲート \| \d+ \/ (\d+) /,
    compute: () => {
      const pkg = JSON.parse(readFileSafe(path.join(REPO_ROOT, 'package.json')) ?? '{}');
      return verifyAllGates(pkg.scripts ?? {}).length;
    },
  },
  {
    /*
     * 禁止パターンの数。
     *
     * ARCHITECTURE.md はここに **13 個を書き写していた** —— 実体が 26 個に
     * なっても、走査対象が 57 → 466 ファイルに増えても、どちらも誰も直さな
     * かった (2026-08-22 に判明)。写した一覧は消して出典へのポインタにし、
     * 数だけをここで留める。**規則を足したら doc も直さざるを得ない**形。
     */
    name: 'forbidden pattern count',
    docPattern: /\*\*(\d+) 個の禁止パターン\*\*/,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'scripts/lint-forbidden-patterns.cjs'));
      if (src === null) return null;
      const m = src.match(/const FORBIDDEN_PATTERNS = \[([\s\S]*?)\n\];/);
      if (!m) return null;
      // 各規則は `name:` をちょうど 1 つ持つ。self-test の表は配列の外なので入らない。
      return countOccurrences(m[1], /^\s{4}name:/gm);
    },
  },
  {
    /*
     * 走査対象のファイル数。正確な値は増え続けるので下限で留める
     * (`tracked line count (floor)` と同じ扱い)。狙いは「走査範囲が
     * 黙って縮んでいないこと」で、上限を当てることではない。
     */
    name: 'forbidden-pattern scan scope (floor)',
    docPattern: /ランタイムソース \*\*≥ (\d+) ファイル\*\*/,
    mode: 'gte',
    compute: () => {
      const { execSync } = require('node:child_process');
      const out = execSync('node scripts/lint-forbidden-patterns.cjs', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      const m = out.match(/Scanned (\d+) runtime source files/);
      return m ? Number(m[1]) : null;
    },
  },
  {
    name: 'service count',
    docPattern: /サービス数 \| (\d+) /,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
      // Count entries between the SERVICE_IDS array open and close.
      const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
      if (!m) return null;
      const body = m[1];
      return countOccurrences(body, /^\s*'[a-z][a-z0-9-]*'\s*,/gm);
    },
  },
  {
    name: 'IPC handler count',
    docPattern: /IPC ハンドラ数 \| (\d+) /,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'src/main/main.ts'));
      return countOccurrences(src, /^ipcMain\.handle\(/gm);
    },
  },
  {
    name: 'client module count',
    docPattern: /client モジュール \(fetcher \+ actions\) \| (\d+) /,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'src/main/clients/index.ts'));
      // Match the LIVE_FETCHERS object body up to the closing `};`.
      const m = src.match(/LIVE_FETCHERS[^{]*\{([\s\S]*?)\n\};/);
      if (!m) return null;
      return m[1]
        .split('\n')
        .filter((l) => /^\s*(?:'[a-z][a-z0-9-]*'|[a-z][a-z0-9]*):\s+\w/i.test(l))
        .filter((l) => !/SCAFFOLD/i.test(l)).length;
    },
  },
  {
    name: 'verify:arch ref count',
    docPattern: /`file:line` 参照数 \| (\d+) /,
    compute: () => {
      // Re-count refs from the doc itself.
      const arch = readFileSafe(ARCH_FILE);
      const REF_RE = /`[A-Za-z][A-Za-z0-9./_-]*?\.(ts|tsx|cjs|sh|json|html|md)(?::[0-9]+(?:[,-][0-9]+)*)?`/g;
      return countOccurrences(arch, REF_RE);
    },
  },
  {
    name: 'OAuth-supported service count',
    docPattern: /OAuth 対応サービス \| (\d+) /,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'src/main/oauth.ts'));
      const m = src.match(/OAUTH_CONFIGS[^=]*= \{([\s\S]*?)^\};/m);
      if (!m) return null;
      return countOccurrences(m[1], /^\s*'?[a-z][a-z0-9-]*'?:\s*\{/gm);
    },
  },
  {
    name: 'unit test count',
    docPattern: /ユニットテスト \| \*\*(\d+)\*\* /,
    compute: () => countStaticIts(),
  },
  {
    name: 'tracked line count (floor)',
    // 「≥ N」の下限メトリクス（mode: 'gte'）。100 万行基盤（柱 B）の成長を
    // フロアで自己検証する — 正確な行数は変動するため固定値比較にしない。
    docPattern: /追跡行数（リポジトリ全体・下限） \| \*\*≥ (\d+)\*\* /,
    mode: 'gte',
    compute: () => {
      const { execSync } = require('node:child_process');
      const names = execSync('git ls-files -z', { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
        .toString('utf8')
        .split('\u0000')
        .filter(Boolean);
      let total = 0;
      for (const n of names) {
        try {
          const b = fs.readFileSync(path.join(REPO_ROOT, n));
          for (let i = 0; i < b.length; i++) if (b[i] === 10) total++;
        } catch {
          /* 削除予定・シンボリックリンク等は読み飛ばす */
        }
      }
      return total;
    },
  },
  // ── CLAUDE.md (Claude Code セッションへの指示書) の数値 ──
  // ここが腐ると、読んだ側は「テストは 1460 件くらいの小さな束」「禁止は 27 種」
  // と思って作業する。ARCHITECTURE.md と同じ厳しさで突き合わせる。
  {
    /*
     * vault の規模。**下限**で見る (知識が増える方向にしか動かない)。
     * 厳密照合にすると知識を 1 件足すたびに doc を直すことになり、
     * その churn は「直さずに数だけ古くなる」を招く。
     */
    name: 'CLAUDE.md: knowledge vault size (floor)',
    docFile: 'CLAUDE.md',
    docPattern: /`knowledge-vault\/`, ([\d,]+)\+ notes/,
    compute: () => {
      let n = 0;
      const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(dir, e.name));
          else if (e.name.endsWith('.md')) n += 1;
        }
      };
      walk(path.join(REPO_ROOT, 'knowledge-vault'));
      return n;
    },
    mode: 'gte',
  },
  /*
   * **保存先の台帳の件数。**
   *
   * この数は台帳 (`lint-storage-ledger.cjs` の `STORES`) と
   * `docs/DATA_PROTECTION.md` と CLAUDE.md の 3 か所に書かれている。
   * 2026-08-28、talent の鍵を足したときに CLAUDE.md だけ 20 のまま残り、
   * `lint:docs` は数を照合しないので**何も鳴らなかった**。
   * CLAUDE.md はすぐ上の行で「数を 2 か所に書くと必ず食い違うので、
   * ここには書かない」と書いており、その直下で破れていた。
   *
   * 消すのではなく**機械に見せる**ことにした —— この行は
   * 「lint:storage は何を見ているのか」を読む人に伝える価値があり、
   * 腐らせない手立てのほうを足すのが筋である。
   */
  {
    name: 'CLAUDE.md: localStorage ledger entry count',
    docFile: 'CLAUDE.md',
    docPattern: /localStorage (\d+) \/ sessionStorage/,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'scripts/lint-storage-ledger.cjs')) ?? '';
      const m = src.match(/const STORES = \{([\s\S]*?)\n\};/);
      if (!m) return null;
      return (m[1].match(/medium: 'localstorage'/g) ?? []).length;
    },
  },
  {
    name: 'CLAUDE.md: forbidden pattern count',
    docFile: 'CLAUDE.md',
    docPattern: /innerHTML ほか (\d+) 種/,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'scripts/lint-forbidden-patterns.cjs')) ?? '';
      const m = src.match(/const FORBIDDEN_PATTERNS = \[([\s\S]*?)\n\];/);
      return m ? (m[1].match(/^  \{$/gm) ?? []).length : null;
    },
  },
  {
    name: 'CLAUDE.md: verify:all gate count',
    docFile: 'CLAUDE.md',
    docPattern: /eslint \((\d+) ゲート\)/,
    compute: () => {
      const pkg = JSON.parse(readFileSafe(path.join(REPO_ROOT, 'package.json')) ?? '{}');
      return verifyAllGates(pkg.scripts ?? {}).length;
    },
  },
  {
    name: 'CLAUDE.md: gate count named in the CI sentence',
    docFile: 'CLAUDE.md',
    docPattern: /all (\d+) `verify:all` gates/,
    compute: () => {
      const pkg = JSON.parse(readFileSafe(path.join(REPO_ROOT, 'package.json')) ?? '{}');
      return verifyAllGates(pkg.scripts ?? {}).length;
    },
  },
];

/*
 * 数値の主張は ARCHITECTURE.md だけに在るわけではない。**CLAUDE.md は
 * Claude Code セッションへの指示書**で、そこにも「~1460 tests」「ほか 21 種」
 * のような数が書いてある。実測すると (2026-08-24) テスト数は 7 倍ずれており、
 * 同じファイルの中で「30 ゲート」と「all 28 gates」が食い違ってもいた。
 *
 * ARCHITECTURE.md の数だけを機械で見ていたので、**同じ種類の主張が
 * 別のファイルに在るというだけで腐り放題**になっていた。metric に
 * `docFile` を持たせ、突き合わせ先を選べるようにする。
 */
function verifyMetrics(archText) {
  const failures = [];
  const ok = [];
  const textOf = (metric) =>
    metric.docFile === undefined
      ? archText
      : (readFileSafe(path.join(REPO_ROOT, metric.docFile)) ?? '');

  for (const metric of METRICS) {
    const m = textOf(metric).match(metric.docPattern);
    if (!m) {
      failures.push({
        archLine: null,
        ref: `metric: ${metric.name}`,
        reason: `pattern not found in ${metric.docFile ?? 'docs/ARCHITECTURE.md'}`,
      });
      continue;
    }
    const claimed = Number(String(m[1]).replace(/,/g, ''));
    const actual = metric.compute();
    if (actual == null) {
      failures.push({
        archLine: null,
        ref: `metric: ${metric.name}`,
        reason: 'computed value is null (regex / extraction bug)',
      });
      continue;
    }
    const pass = metric.mode === 'gte' ? actual >= claimed : claimed === actual;
    if (!pass) {
      failures.push({
        archLine: null,
        ref: `metric: ${metric.name}`,
        reason:
          metric.mode === 'gte'
            ? `doc floor is ${claimed}, source says ${actual}`
            : `doc says ${claimed}, source says ${actual}`,
      });
    } else {
      ok.push(metric.mode === 'gte' ? `${metric.name} = ${actual} (>= ${claimed})` : `${metric.name} = ${actual}`);
    }
  }
  return { ok, failures };
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

/*
 * このゲートは 329 件の参照と 7 件の指標を見ているが、**通っている限り
 * 沈黙する**。規則が 1 つ死んでも出力は「✅ all references + metrics resolve」の
 * ままなので、気づく機会が無い。
 *
 * `verifyReferences` / `verifyMetrics` はどちらも doc の本文を引数に取るので、
 * 壊した本文を食わせるだけで規則ごとに鳴らせる。参照先には**実在のファイル**を
 * 使い、行番号や記号の位置はその場で数える —— 固定値を書くと、ファイルが
 * 育った日に自己検査のほうが先に腐る。
 */
function selfTest() {
  const REF = 'src/shared/serviceId.ts';
  const srcText = readFileSafe(path.join(REPO_ROOT, REF));
  if (srcText === null) {
    console.error(`❌ self-test: 土台にしている ${REF} が読めません`);
    return 1;
  }
  const srcLines = srcText.split('\n');
  const total = srcLines.length;
  const symLine = srcLines.findIndex((l) => l.includes('SERVICE_IDS')) + 1;

  /*
   * ドリフト検出には**そのファイルに 1 度しか現れない識別子**が要る。
   * 最初 `SERVICE_IDS` を使ったが、この名前は 9 / 87 / 89 行目の 3 か所に在り、
   * 末尾を引用すると窓 (±15 行) に 89 行目が入って鳴らなかった。
   * 名前も位置も固定で書かず、その場で 1 度きりのものを選ぶ。
   */
  const once = [...new Set([...srcText.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{4,})\b/g)].map((m) => m[1]))]
    .map((sym) => ({ sym, at: srcLines.map((l, i) => (l.includes(sym) ? i + 1 : 0)).filter(Boolean) }))
    .find((x) => x.at.length === 1);
  if (!once) {
    console.error(`❌ self-test: ${REF} に 1 度しか現れない識別子が無く、ドリフトを試せません`);
    return 1;
  }
  // その識別子から SYMBOL_WINDOW より確実に離れた行。
  const far = once.at[0] > total / 2 ? 1 : total;
  if (Math.abs(far - once.at[0]) <= SYMBOL_WINDOW) {
    console.error(`❌ self-test: ${REF} が短すぎて窓の外を作れません (${total} 行)`);
    return 1;
  }

  /*
   * 窓の幅そのものを台帳に置く。
   *
   * `far` は SYMBOL_WINDOW を基準に決めているので、**窓を広げても自己検査は
   * 追従して緑のまま**になる。対照実験でそれを踏んだ: 15 → 60 に変えても
   * 1 件も鳴らなかった。だが 60 にした時点で実物の doc に対するドリフト検出は
   * 事実上死んでいる (このリポジトリのモジュールは大半が 100 行前後)。
   *
   * 窓はこのゲートの**厳しさのつまみ**なので、動かすなら意図的であるべきで、
   * 黙って広がってよいものではない。値をここに宣言し、変えたら必ずこの行も
   * 直す (= 緩めたことを自覚する) 形にする。
   */
  const DECLARED_WINDOW = 15;

  /*
   * 4 列目は**理由の照合**。件数だけを見ると、別の規則が肩代わりしても
   * 気づけない —— 実際、存在確認を外す対照実験で「実在しないファイル」は
   * git 管理外の判定に拾われ、1 件のまま通ってしまった。どの規則が鳴ったかを
   * 縛る。
   */
  const cases = [
    ['実在ファイルへの参照 (行指定なし)', `\`${REF}\` を見よ`, 0, 1, null],
    ['実在しないファイル', '`src/shared/doesNotExistXyz.ts` を見よ', 1, 0, /file not found/],
    ['行番号が範囲内', `\`${REF}:${symLine}\` を見よ`, 0, 1, null],
    ['行番号が範囲外', `\`${REF}:${total + 50}\` を見よ`, 1, 1, /out of bounds/],
    // total-1 と total は範囲内、total+1 以降の 50 行だけが範囲外。
    ['範囲指定の片方だけ範囲外', `\`${REF}:${total - 1}-${total + 50}\` を見よ`, 50, 1, /out of bounds/],
    ['記号が引用範囲の近くに在る', `\`SERVICE_IDS\` は \`${REF}:${symLine}\``, 0, 1, null],
    ['記号はファイルに在るが窓の外 (ドリフト)', `\`${once.sym}\` は \`${REF}:${far}\``, 1, 1, /drifted/],
    ['記号がファイルに無い', `\`fetchZzzNope\` は \`${REF}:1\``, 1, 1, /not found in/],
    ['一般語は記号として扱わない', `\`file\` は \`${REF}:1\``, 0, 1, null],
    ['バッククォートが無ければ参照ではない', `${REF}:1 を見よ`, 0, 0, null],
    ['行指定が無ければ範囲も記号も見ない', `\`fetchZzzNope\` は \`${REF}\``, 0, 1, null],
  ];

  let failed = 0;
  console.log('self-test:');
  for (const [label, doc, wantFail, wantOk, wantReason] of cases) {
    const r = verifyReferences(doc);
    const reasonOk = wantReason === null || r.failures.every((f) => wantReason.test(f.reason));
    const ok = r.failures.length === wantFail && r.successCount === wantOk && reasonOk;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${label}: 違反 ${r.failures.length} 件 / 参照 ${r.successCount} 件`
        + `${reasonOk ? '' : ` / 理由が違う (${r.failures[0].reason.slice(0, 40)}…)`}`
        + ` (期待 ${wantFail} / ${wantOk}${wantReason ? ` / ${wantReason.source}` : ''})`,
    );
  }

  {
    const ok = SYMBOL_WINDOW === DECLARED_WINDOW;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} 窓の幅が台帳どおり: ${SYMBOL_WINDOW} 行 (台帳 ${DECLARED_WINDOW} 行)`
        + (ok ? '' : ' — 広げると実物の doc のドリフト検出が効かなくなります。意図的なら台帳も直してください'),
    );
  }

  /*
   * 窓の境界。ちょうど SYMBOL_WINDOW 行離れていれば窓の中、1 行でも超えれば外。
   * 幅の値とは独立に ± の意味を縛る (両端の 1 行ずれは実際に起こしやすい)。
   */
  const edge = once.at[0] + SYMBOL_WINDOW;
  if (edge + 1 <= total) {
    for (const [label, cite, want] of [
      ['ちょうど窓の縁は中', edge, 0],
      ['縁の 1 行外は外 (ドリフト)', edge + 1, 1],
    ]) {
      const r = verifyReferences(`\`${once.sym}\` は \`${REF}:${cite}\``);
      const ok = r.failures.length === want;
      if (!ok) failed += 1;
      console.log(
        `  ${ok ? '✓' : '✗'} 窓の境界 (記号 ${once.at[0]} 行目 / 引用 ${cite} 行目): ${label}: `
          + `${r.failures.length} 件 (期待 ${want})`,
      );
    }
  } else {
    failed += 1;
    console.log(`  ✗ 窓の境界: ${REF} が短すぎて縁を試せません (${total} 行)`);
  }

  // git 管理外のパス。手元にあっても CI の fresh checkout には無いので、
  // 「ローカルは green・CI だけ落ちる」を作る (2026-08-11 に実際に踏んだ)。
  const ghost = path.join(REPO_ROOT, 'src/shared/__selftest_untracked__.ts');
  try {
    fs.writeFileSync(ghost, '// self-test 用の一時ファイル\n');
    const r = verifyReferences('`src/shared/__selftest_untracked__.ts` を見よ');
    const rings = r.failures.length === 1 && /管理外/.test(r.failures[0].reason);
    if (!rings) failed += 1;
    console.log(
      `  ${rings ? '✓' : '✗'} 手元にあっても git 管理外なら鳴る: `
        + `${r.failures.length} 件${r.failures[0] ? ` (${r.failures[0].reason.slice(0, 20)}…)` : ''} (期待 1 件)`,
    );
  } finally {
    fs.rmSync(ghost, { force: true });
  }

  // 指標。実物の doc を土台に 1 か所だけ壊す —— 固定の文面を書くと doc の
  // 書式が変わった日に自己検査だけが腐る。
  const arch = readFileSafe(ARCH_FILE);
  const metricCases = [
    ['実物の doc は 0 件', arch, 0],
    ['サービス数を 1 ずらす', arch.replace(/サービス数 \| (\d+) /, (_, n) => `サービス数 | ${Number(n) + 1} `), 1],
    // ARCHITECTURE.md を空にしても、**別ファイルを見る指標は落ちない** ——
    // 落ちる数は「arch を出所とする指標の数」であって METRICS.length ではない。
    // (2026-08-24 に CLAUDE.md 由来の指標を足したとき、この自己検査が
    //  ずれを捕まえた。期待値を METRICS.length のままにすると、
    //  arch の指標を 1 つ消しても CLAUDE.md 側が埋め合わせて気づけなくなる。)
    [
      '指標の記述を丸ごと消す (arch 由来の指標だけが落ちる)',
      '',
      METRICS.filter((m) => m.docFile === undefined).length,
    ],
    // 逆方向 —— CLAUDE.md 由来の指標が 1 つも無くなっていないか。
    // 0 になったら「別ファイルの数値は誰も見ていない」状態に戻っている。
    ['CLAUDE.md 由来の指標が在る', arch, 0, METRICS.some((m) => m.docFile === 'CLAUDE.md')],
  ];
  for (const [label, doc, want, precondition] of metricCases) {
    const got = verifyMetrics(doc).failures.length;
    const ok = got === want && (precondition === undefined || precondition === true);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} 指標: ${label}: ${got} 件 (期待 ${want})`);
  }

  /*
   * payload 欄の照合。**実在する `emotions.log-mood` を土台にする** ——
   * 架空の interface を作ると、規則ではなく作り物を検査してしまう。
   */
  const payloadCases = [
    ['実物の表は一致している', readFileSafe(ARCH_FILE) ?? '', 0],
    [
      '文書にだけ在るフィールド',
      '| emotions | `log-mood` | `{ date, score, note, nonexistent }` | x | `emotions.ts:1` |',
      1,
    ],
    [
      '実装にだけ在るフィールド (文書が欠けている)',
      '| emotions | `log-mood` | `{ score }` | x | `emotions.ts:1` |',
      1,
    ],
    [
      '一致していれば鳴らない',
      '| emotions | `log-mood` | `{ date, score, note }` | x | `emotions.ts:1` |',
      0,
    ],
    [
      '`?` 付きでも同じフィールドとして扱う',
      '| emotions | `log-mood` | `{ date?, score, note? }` | x | `emotions.ts:1` |',
      0,
    ],
    /*
     * **interface が見つからない行は「対象外」ではなく「失敗」。**
     * 黙って飛ばすと、文書がいちばん間違っているとき (action 名が違う) に
     * こそ検査が効かなくなる。別名なら台帳へ理由つきで足す。
     */
    [
      '実在する action でも interface が無ければ鳴る',
      '| emotions | `clear-history` | `{ whatever }` | x | `emotions.ts:1` |',
      1,
    ],
    [
      '知らないサービスは対象外',
      '| nosuchsvc | `do-thing` | `{ a, b }` | x | `x.ts:1` |',
      0,
    ],
    /*
     * **action 名そのものの実在検査** (2026-08-23 追加)。
     * `wordpress.create-post` は実物が `create-post-draft` なのに、
     * interface が古い名前に揃っていたので payload の比較は成功し、
     * **名前が違うまま通っていた**。
     */
    [
      '実在しない action 名は鳴る',
      '| wordpress | `create-post` | `{ siteId, title, content, status }` | x | `wordpress.ts:1` |',
      1,
    ],
    [
      '実在する action 名なら鳴らない',
      '| wordpress | `create-post-draft` | `{ siteId, title, content, status }` | x | `wordpress.ts:1` |',
      0,
    ],
    /*
     * **短縮記法 (`chat,`) の action も「実在する」と読む。**
     * ここを落とすと `ollama.chat` が実在しない扱いになる (一度誤読した)。
     */
    [
      '短縮記法で登録された action も実在と判定する',
      '| ollama | `chat` | `{ model, prompt, system }` | x | `ollama.ts:1` |',
      0,
    ],
    /*
     * **台帳で別名を指定した行は通る。** 台帳を空にすると鳴るので、
     * 「理由つきでしか許さない」が効いていることも同時に見ている。
     */
    [
      '台帳に別名がある行 (atlassian) は通る',
      '| atlassian | `create-issue` | `{ projectKey, summary, description, issueType }` | x | `atlassian.ts:1` |',
      0,
    ],
  ];
  for (const [label, doc, want] of payloadCases) {
    const got = verifyActionPayloads(doc).failures.length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} payload: ${label}: ${got} 件 (期待 ${want})`);
  }

  /*
   * **網羅の検査そのものに標本を通す。**
   *
   * 「行が無い action を見つける」は不在を主張する検査なので、実物に対して
   * 緑でも空虚でありうる。空の文書を渡せば**登録されている全部**が鳴り、
   * 実物の文書を渡せば 0 件になる —— どちらへ動いても差が出ることを見る。
   */
  const coverageCases = [
    ['空の文書なら登録済み action の数だけ鳴る', '', (n) => n > 40],
    [
      '実物の文書なら鳴らない',
      readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '',
      (n) => n === 0,
    ],
    [
      '1 行だけ消すと、その 1 件が鳴る',
      (readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '').replace(
        /^\| shopify \| `sync-to-salesforce` \|.*$/m,
        '',
      ),
      (n) => n === 1,
    ],
  ];
  for (const [label, doc, want] of coverageCases) {
    const got = verifyActionCoverage(doc).failures.length;
    const ok = want(got);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} coverage: ${label}: ${got} 件`);
  }

  /*
   * **IPC チャンネルの網羅にも標本を通す。**
   */
  const channelCases = [
    ['表が空なら登録済みチャンネルが全部鳴る', '', (n) => n === 13],
    [
      '実物の文書なら鳴らない',
      readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '',
      (n) => n === 0,
    ],
    [
      '1 行だけ消すと、その 1 件が鳴る',
      (readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '').replace(
        /^\| `app:openPath` \|.*$/m,
        '',
      ),
      (n) => n === 1,
    ],
  ];
  for (const [label, doc, want] of channelCases) {
    const got = verifyIpcChannels(doc).failures.length;
    const ok = want(got);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ipc: ${label}: ${got} 件`);
  }

  /*
   * **egress の網羅にも標本を通す。**
   *
   * 「表に無い宛先を見つける」も不在の主張なので、実物に対して緑でも
   * 空虚でありうる。表を空にすれば**字面で書かれた全部**が鳴り、実物なら
   * 0 件になる。1 行消せばその 1 件だけが鳴る。
   */
  const egressCases = [
    ['表が空なら字面の宛先が全部鳴る', '### 3.3 ネットワーク egress\n', (n) => n > 15],
    [
      '実物の文書なら鳴らない',
      readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '',
      (n) => n === 0,
    ],
    [
      '1 行だけ消すと、その 1 件が鳴る',
      (readFileSafe(path.join(REPO_ROOT, 'docs/ARCHITECTURE.md')) ?? '').replace(
        /^\| microsoft-365 \| `graph\.microsoft\.com`.*$/m,
        '',
      ),
      (n) => n === 1,
    ],
  ];
  for (const [label, doc, want] of egressCases) {
    const got = verifyEgressHosts(doc).failures.length;
    const ok = want(got);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} egress: ${label}: ${got} 件`);
  }

  /*
   * **`readonly` の欄を読めること。** 2026-09-01 まで読めておらず、
   * `readonly` で書かれた payload interface は欄が空集合になっていた。
   */
  const readonlyCase = verifyActionPayloads(
    '| real-estate | `record-entry` | `{ note, amount }` | x | `real-estate.ts:1` |',
  ).failures.length;
  const readonlyOk = readonlyCase === 0;
  if (!readonlyOk) failed += 1;
  console.log(
    `  ${readonlyOk ? '✓' : '✗'} payload: readonly の欄を読む: ${readonlyCase} 件 (期待 0)`,
  );

  /*
   * **式で組み立てた ACTIONS も読めること。** `shopify.ts` の 7 件は
   * 2026-09-01 まで「静的に読めない」として数から落ちており、どの台帳にも
   * 載っていなかった (連携先の資格情報を payload で受け取る action である)。
   */
  const shopifySrc = readFileSafe(path.join(REPO_ROOT, 'src/main/clients/shopify.ts')) ?? '';
  const shopifyNames = readActionNames(shopifySrc);
  const shopifyOk = shopifyNames !== null && shopifyNames.has('sync-to-salesforce');
  if (!shopifyOk) failed += 1;
  console.log(
    `  ${shopifyOk ? '✓' : '✗'} coverage: 導出された ACTIONS も読む: ${shopifyNames === null ? 'null' : shopifyNames.size + ' 件'}`,
  );

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * IPC action 表の payload 欄が、実装の `*Payload` interface と一致するか。
 *
 * ## なぜ要るか (2026-08-23)
 *
 * この表は「**レンダラーから main へ何が渡るか**」を示す唯一の一覧である。
 * 実装と食い違うと、読んだ人は攻撃面を誤解する。実際に 6 行ずれていた:
 *
 *   - `skills.run-skill` に `model` / `maxTokens` が残っていた
 *     (payload から外したのに表が古いまま)
 *   - `cloudflare.purge-cache` に **`purgeEverything`** が載っていなかった
 *     —— ゾーン全体のキャッシュを落とす破壊的なフラグ
 *   - `wordpress.create-post` に `status` (publish 指定) が載っていなかった
 *   - `github` の `labels` / `calendar` の `location`,`timeZone` /
 *     `cloudflare` の `proxied` も欠けていた
 *
 * 行番号のずれ (`verify:arch` の既存機能) は捕まえられても、**中身のずれ**は
 * 誰も見ていなかった。
 *
 * ## 判定
 *
 * 表の `` `{ a, b?, c }` `` を実装の `interface XxxPayload` と集合で比べる。
 * action 名から interface 名を導く (`create-issue` → `CreateIssuePayload`)。
 * 対応する interface が無い action は対象外 (静的スタブなど)。
 * コメント行は落としてからフィールド名を取る —— 型注釈の中の `//` に
 * 引っかかると存在しない欄を報告する。
 */
/**
 * 実在する action 名を `export const ACTIONS = { ... }` から読む。
 * `'k': fn` / `k: fn` / 短縮記法 `fn,` の 3 通りを拾う ——
 * **短縮記法を落とすと `ollama.chat` が「実在しない」に見える**
 * (実際に一度そう誤読した)。静的に読めない形 (`Object.fromEntries` で
 * 組み立てる shopify) は `null` を返し、名前の検査を見送る。
 */
function readActionNames(src) {
  // 空の 1 行形 (`= {};`) は「action 0 件」であって「読めない」ではない。
  // 分けないと `cursor.ts` が静的に読めない側へ数えられる (2026-09-01)。
  if (/export const ACTIONS[^=]*=\s*\{\s*\};/.test(src)) return new Set();

  const m = /export const ACTIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (m === null) {
    /*
     * **式で組み立てる形も読む。** `shopify.ts` は
     * `Object.fromEntries(CONNECTORS.map((c) => [c.action, c.run]))` で
     * ACTIONS を導出するので、上の正規表現では読めない ——
     * その結果 7 件 (`sync-to-slack` … `sync-to-stripe`) が
     * **どの台帳にも載らないまま**になっていた (2026-09-01 に発見)。
     * どれも連携先の資格情報 (`token` / `webhookUrl` ほか) を payload で
     * 受け取る、いちばん見える所に置くべき action である。
     *
     * 導出元の登録表に在る `action: '…'` を action 名として読む。
     */
    if (!/export const ACTIONS[^=]*=\s*Object\.fromEntries/.test(src)) return null;
    const derived = new Set([...src.matchAll(/\baction:\s*'([^']+)'/g)].map((x) => x[1]));
    return derived.size > 0 ? derived : null;
  }
  const body = m[1];
  const names = new Set();
  for (const x of body.matchAll(/^\s*'([^']+)'\s*:/gm)) names.add(x[1]);
  for (const x of body.matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)) names.add(x[1]);
  for (const x of body.matchAll(/^\s*([A-Za-z_]\w*)\s*,\s*$/gm)) names.add(x[1]);
  return names;
}

/**
 * action 名から payload の interface 名を導けない所の台帳。
 * **理由つきでしか許さない** —— 空にすると「interface が見つからない」行が
 * 黙って検査対象から外れる。
 */
const PAYLOAD_INTERFACE_OVERRIDES = {
  // Jira の課題であることを型名で示している。action 名は Atlassian 製品
  // 横断の総称なので、両方をそのまま残すのが正しい。
  'atlassian.create-issue': 'CreateJiraIssuePayload',

  // --- 2026-09-01 追加 (表を全 action へ広げたときに要った分) ---

  // 1 つの payload を複数の action が共用している所。**別名ではなく共用**
  // なので、型を action ごとに割るほうがむしろ嘘になる。
  'assistant.chatAll': 'ChatPayload',
  'stocks.unregister-ticker': 'RegisterTickerPayload',
  'business.export-dashboard': 'ExportPayload',
  'business.export-dashboard-md': 'ExportPayload',
  'stocks.export-dashboard': 'ExportPayload',
  'stocks.export-dashboard-md': 'ExportPayload',

  // 型名が「何をするか」ではなく「誰が使うか」で付いている所。
  'business.advise': 'BusinessAdvisorPayload',
  'stocks.advise': 'AdvisorPayload',

  // `templates.ts` の中では書き出しが 1 種類しかないので `ExportPayload`。
  'templates.export-template': 'ExportPayload',
};

/**
 * **`ipcMain.handle` の全チャンネルが IPC 契約表 (§1.4) に載っているか。**
 *
 * ## なぜ要るか (2026-09-01)
 *
 * §1.4 は renderer と main の境界そのものの一覧である。実測したら
 * **13 本のうち表に在ったのは 9 本**で、見出しは「(9 チャンネル)」と
 * 書いてあった (TL;DR の指標は 13 と書いてあり、同じ文書の中で食い違っていた)。
 *
 * 抜けていた 4 本には **`app:openPath` / `app:revealInFolder`** が含まれる ——
 * renderer が渡したパスを OS の「開く」動詞に渡す口で、その関門
 * (`shellOpenGate.ts`) は変異検査の `MUST_MEASURE` にも改竄検知の保護対象にも
 * 入っている。**守りは最重要扱いなのに、守られている口が表に無かった。**
 */
function verifyIpcChannels(archText) {
  const failures = [];
  const src = readFileSafe(path.join(REPO_ROOT, 'src/main/main.ts')) ?? '';
  // `ipcMain.handle('x'` と、名前が次の行に来る形の両方を読む。
  const registered = new Set(
    [...src.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]),
  );
  /*
   * **§1.4 の中だけを見る。** 最初は文書全体から拾っていたが、
   * `app:openPath` は §8 の「直した欠陥」表にも行があるので、
   * §1.4 から消しても「載っている」ままだった —— **自己検査が捕まえた**
   * (「1 行消すとその 1 件が鳴る」が 0 件だった)。
   * 節を跨いで数えると、契約表の網羅を確かめたことにならない。
   */
  const lines = archText.split('\n');
  const start = lines.findIndex((l) => l.startsWith('### 1.4 IPC 契約'));
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('### ')) end += 1;
  const section = start < 0 ? '' : lines.slice(start, end).join('\n');
  const documented = new Set(
    [...section.matchAll(/^\| `([a-z]+:[A-Za-z]+)` \|/gm)].map((m) => m[1]),
  );
  for (const ch of [...registered].sort()) {
    if (!documented.has(ch)) {
      failures.push({
        ref: ch,
        reason: 'IPC 契約表 (§1.4) に行がありません — 引数・戻り値・検証を書くこと',
      });
    }
  }
  return { failures, registered: registered.size };
}

/**
 * **`src/main/**` に字面で書かれた宛先が、egress マトリクス (§3.3) に載っているか。**
 *
 * ## なぜ要るか (2026-09-01)
 *
 * §3.3 は「**下記以外のホストへの接続は存在しない**」という**絶対の否定**を
 * 主張している。資格情報がどこへ出ていきうるかの唯一の一覧なので、これが
 * 嘘だと読んだ人は攻撃面を狭く見積もる。
 *
 * 実測したら **11 ホストが載っていなかった** —— `graph.microsoft.com`
 * (Bearer で送受信)、shopify コネクタの `api.line.me` / `api.stripe.com` /
 * `discord.com` (どれも payload で受け取った資格情報を載せる)、`freee` /
 * `base` の API、OAuth のトークン端点 3 つ。表は「15 ホスト」と数えていた。
 *
 * `lint:network-targets` は「**送り先が変数で決まる**通信」を見張る。
 * こちらはその裏 —— **字面で書いてある宛先が台帳に在るか**。両方要る。
 *
 * ## 判定
 *
 * `src/main/**` の実行コード (コメントを落とす) から `https?://<host>` を集め、
 * §3.3 の Host 欄か、下の除外台帳に在ることを求める。
 */
const EGRESS_NOT_FETCHED = {
  'www.youtube.com': '画面に出す視聴 URL を組み立てるだけ (youtube.ts)。main は fetch しない',
  'www.w3.org': 'SVG / XML の名前空間 URI。通信しない',
  localhost: 'OAuth の loopback 受け口の説明とローカル開発用。外向きではない',
  'x.atlassian.net': '検査・注記で使う例示のサイト名 (実際の宛先は `*.atlassian.net` として表に在る)',
  'attacker.example': '検査の標本 (送り先を絞っていることを確かめるための偽ホスト)',
};

function verifyEgressHosts(archText) {
  const failures = [];
  const lines = archText.split('\n');
  const start = lines.findIndex((l) => l.startsWith('### 3.3 ネットワーク egress'));
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('### ')) end += 1;
  const documented = new Set();
  for (const row of lines.slice(start, end)) {
    if (!row.startsWith('| ') || row.startsWith('|---')) continue;
    const host = row.split(' | ')[1] ?? '';
    // `:port` 付きの表記も host として読む (`` `127.0.0.1:11434` `` が在る)。
    for (const m of host.matchAll(/`\*?\.?([A-Za-z0-9.-]+)(?::\d+)?`/g)) documented.add(m[1]);
    for (const m of host.matchAll(/\*\.([A-Za-z0-9.-]+)/g)) documented.add(m[1]);
  }

  const found = new Map();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (name !== '__tests__') walk(p);
      } else if (name.endsWith('.ts')) {
        const src = readFileSafe(p) ?? '';
        // コメントを落としてから見る (注記の中の URL で鳴らさない)。
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join('\n');
        for (const m of code.matchAll(/https?:\/\/([A-Za-z0-9._-]+)/g)) {
          if (!found.has(m[1])) found.set(m[1], new Set());
          found.get(m[1]).add(path.relative(REPO_ROOT, p));
        }
      }
    }
  };
  walk(path.join(REPO_ROOT, 'src/main'));

  for (const [host, files] of [...found].sort()) {
    if (documented.has(host)) continue;
    if (Object.prototype.hasOwnProperty.call(EGRESS_NOT_FETCHED, host)) continue;
    // `*.salesforce.com` のような接尾辞での登録を許す。
    if ([...documented].some((d) => host === d || host.endsWith(`.${d}`))) continue;
    failures.push({
      ref: host,
      reason: `egress マトリクス (§3.3) に無い宛先です (${[...files].join(', ')}) — 表に足すか、通信しない理由を EGRESS_NOT_FETCHED へ`,
    });
  }
  return { failures, scanned: found.size, documented: documented.size };
}

/**
 * **登録済みの action が 1 つ残らず payload 表に載っているか。**
 *
 * ## なぜ要るか (2026-09-01)
 *
 * 下の `verifyActionPayloads` は**表に在る行**しか見ない。裏を返すと、
 * **表に書かなければ何も言われない。** 実測すると、`ACTIONS` に登録された
 * 47 件のうち表に在ったのは **19 件**で、節の見出しは「(19 actions)」と
 * 書いてあった —— つまり読む人には*それが全部*に見えた。
 *
 * 載っていなかった 28 件には、有料 LLM API を叩くもの (`*.advise` 6 件 +
 * `assistant.chat` / `chatAll`) と、renderer が渡したパスへ**ファイルを書く**
 * もの (`export-*` 5 件・`save-state` 2 件) が含まれる。
 * この表は「レンダラーから main へ何が渡るか」を示す唯一の一覧なので、
 * 攻撃面の半分が見えていなかったことになる。
 *
 * `scripts/lint-mutation-scope.cjs` の `MUST_MEASURE` と同じ形の直し ——
 * **台帳をすり抜ける道 (載せない) を塞ぐ。**
 */
function verifyActionCoverage(archText) {
  const failures = [];
  const documented = new Set(
    [...archText.matchAll(/^\| ([\w-]+) \| `([\w-]+)` \|/gm)].map((m) => `${m[1]}.${m[2]}`),
  );
  const dir = path.join(REPO_ROOT, 'src/main/clients');
  let registered = 0;
  const unreadable = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.ts')) continue;
    const svc = file.replace(/\.ts$/, '');
    const src = readFileSafe(path.join(dir, file));
    if (src === null || !src.includes('ACTIONS')) continue;
    const names = readActionNames(src);
    if (names === null) {
      // 静的に読めない形 (`Object.fromEntries` で組み立てる等)。
      // **黙って飛ばさず数える** —— 増えたら見える。
      if (/export const ACTIONS/.test(src)) unreadable.push(svc);
      continue;
    }
    for (const action of names) {
      registered += 1;
      if (!documented.has(`${svc}.${action}`)) {
        failures.push({
          ref: `${svc}.${action}`,
          reason: 'payload 表 (§3.2) に行がありません — 何が renderer から渡るかを書くこと',
        });
      }
    }
  }
  return { failures, registered, unreadable };
}

function verifyActionPayloads(archText) {
  const failures = [];
  let checked = 0;
  const rowRe = /^\| ([\w-]+) \| `([\w-]+)` \| `\{([^}]*)\}` \|/gm;
  let m;
  while ((m = rowRe.exec(archText)) !== null) {
    const [, svc, action, fields] = m;
    const archLine = archText.slice(0, m.index).split('\n').length;
    const src = readFileSafe(path.join(REPO_ROOT, 'src/main/clients', `${svc}.ts`));
    if (src === null) continue;

    /*
     * **まず action 名が実在するか。** これが無いと、名前が古いまま
     * payload だけ一致していれば通ってしまう。実際に `wordpress.create-post`
     * が (実物は `create-post-draft`) そのまま通っていた ——
     * interface 名が古いほうに揃っていたので、payload の比較は成功していた。
     */
    const realActions = readActionNames(src);
    if (realActions !== null && !realActions.has(action)) {
      failures.push({
        archLine,
        ref: `${svc}.${action}`,
        reason: `そんな action は登録されていません (実在: ${[...realActions].sort().join(', ')})`,
      });
      continue;
    }

    const override = PAYLOAD_INTERFACE_OVERRIDES[`${svc}.${action}`];
    const camel =
      override ??
      action.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('') + 'Payload';
    const im = new RegExp(`interface ${camel}\\s*\\{([^}]*)\\}`).exec(src);
    if (im === null) {
      // **黙って飛ばさない。** 飛ばすと、文書がいちばん間違っているとき
      // (名前が違う) にこそ検査が効かなくなる。
      failures.push({
        archLine,
        ref: `${svc}.${action}`,
        reason: `payload の interface ${camel} が見つかりません (別名なら PAYLOAD_INTERFACE_OVERRIDES に理由つきで足す)`,
      });
      continue;
    }
    checked += 1;
    const body = im[1]
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    /*
     * **`readonly` を飛ばしてから欄名を取る。**
     *
     * 2026-09-01 まで `/^\s*(\w+)\??:/` だったので、`readonly note: string;`
     * からは**何も取れなかった** (`readonly` の直後が空白で `:` が来ない)。
     * つまり `readonly` で書かれた payload interface は欄が空集合になり、
     * 文書が何を書いていても「文書にだけ在る」と報告されるか、文書も空なら
     * **何も比べずに通る**。このリポジトリの他の interface は `readonly` を
     * 使うのが普通なので、次に payload をそう書いた日に黙る。
     */
    const real = new Set(
      [...body.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((x) => x[1]),
    );
    const documented = new Set(
      fields
        .split(',')
        .map((f) => f.trim().replace(/\?.*$/, '').trim())
        .filter((f) => f !== ''),
    );
    const extra = [...documented].filter((f) => !real.has(f)).sort();
    const missing = [...real].filter((f) => !documented.has(f)).sort();
    if (extra.length > 0 || missing.length > 0) {
      const parts = [];
      if (extra.length > 0) parts.push(`文書にだけ在る: ${extra.join(', ')}`);
      if (missing.length > 0) parts.push(`実装にだけ在る: ${missing.join(', ')}`);
      failures.push({
        archLine,
        ref: `${svc}.${action}`,
        reason: `payload 欄が実装の ${camel} と違います (${parts.join(' / ')})`,
      });
    }
  }
  return { checked, failures };
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const arch = readFileSafe(ARCH_FILE);
  if (arch === null) {
    console.error(`ERROR: cannot read ${ARCH_FILE}`);
    process.exit(2);
  }

  const refs = verifyReferences(arch);
  const metrics = verifyMetrics(arch);
  const payloads = verifyActionPayloads(arch);
  const coverage = verifyActionCoverage(arch);
  const egress = verifyEgressHosts(arch);
  const channels = verifyIpcChannels(arch);

  console.log(`Verified ${refs.successCount} file:line references in docs/ARCHITECTURE.md`);
  console.log(`Verified ${metrics.ok.length} live metric(s): ${metrics.ok.join(', ') || '(none)'}`);
  console.log(`Verified ${payloads.checked} IPC action payload row(s) against their interfaces`);
  console.log(
    `Verified ${coverage.registered} registered action(s) all have a payload row`
      + (coverage.unreadable.length > 0
        ? ` (静的に読めない ACTIONS: ${coverage.unreadable.join(', ')})`
        : ''),
  );
  console.log(
    `Verified ${egress.scanned} literal host(s) in src/main against the §3.3 egress matrix (${egress.documented} documented)`,
  );
  console.log(`Verified ${channels.registered} IPC channel(s) all have a §1.4 contract row`);

  const allFailures = [
    ...refs.failures,
    ...metrics.failures,
    ...payloads.failures,
    ...coverage.failures,
    ...egress.failures,
    ...channels.failures,
  ];
  if (allFailures.length === 0) {
    console.log('✅ all references + metrics resolve');
    return 0;
  }
  console.error(`❌ ${allFailures.length} failure(s):`);
  for (const f of allFailures) {
    const loc = f.archLine ? `L${f.archLine}` : 'metric';
    console.error(`  ${loc}: ${f.ref} — ${f.reason}`);
  }
  return 1;
}

process.exit(main());
