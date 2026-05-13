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

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
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
const METRICS = [
  {
    name: 'service count',
    docPattern: /サービス数 \| (\d+) /,
    compute: () => {
      const src = readFileSafe(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
      // Count entries between the SERVICE_IDS array open and close.
      const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
      if (!m) return null;
      const body = m[1];
      return countOccurrences(body, /^\s*'[a-z]+'\s*,/gm);
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
        .filter((l) => /^\s*[a-z]+:\s+\w/i.test(l))
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
      return countOccurrences(m[1], /^\s*[a-z]+:\s*\{/gm);
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
    if (claimed !== actual) {
      failures.push({
        archLine: null,
        ref: `metric: ${metric.name}`,
        reason: `doc says ${claimed}, source says ${actual}`,
      });
    } else {
      ok.push(`${metric.name} = ${actual}`);
    }
  }
  return { ok, failures };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
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
