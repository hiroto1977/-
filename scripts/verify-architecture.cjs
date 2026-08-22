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
    compute: () => {
      // Count `it(` occurrences across all test files. Excludes
      // commented-out tests (lines starting with //).
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
    },
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
];

function verifyMetrics(archText) {
  const failures = [];
  const ok = [];

  for (const metric of METRICS) {
    const m = archText.match(metric.docPattern);
    if (!m) {
      failures.push({
        archLine: null,
        ref: `metric: ${metric.name}`,
        reason: `pattern not found in doc`,
      });
      continue;
    }
    const claimed = Number(m[1]);
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
    ['指標の記述を丸ごと消す', '', METRICS.length],
  ];
  for (const [label, doc, want] of metricCases) {
    const got = verifyMetrics(doc).failures.length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} 指標: ${label}: ${got} 件 (期待 ${want})`);
  }

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

function main() {
  if (process.argv.includes('--self-test')) return selfTest();

  const arch = readFileSafe(ARCH_FILE);
  if (arch === null) {
    console.error(`ERROR: cannot read ${ARCH_FILE}`);
    process.exit(2);
  }

  const refs = verifyReferences(arch);
  const metrics = verifyMetrics(arch);

  console.log(`Verified ${refs.successCount} file:line references in docs/ARCHITECTURE.md`);
  console.log(`Verified ${metrics.ok.length} live metric(s): ${metrics.ok.join(', ') || '(none)'}`);

  const allFailures = [...refs.failures, ...metrics.failures];
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
