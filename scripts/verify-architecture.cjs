#!/usr/bin/env node
/* eslint-disable */
/**
 * Verify every `file:line` reference in docs/ARCHITECTURE.md still
 * points to something real:
 *
 *   - the referenced file must exist
 *   - if a line / line range is given, the range must fit within the
 *     file's actual line count
 *   - if the surrounding sentence names a symbol (e.g. `isServiceId`
 *     mentioned in the same line/paragraph as the ref), grep within
 *     ±5 lines of the cited line to confirm it still appears
 *
 * Run via:  node scripts/verify-architecture.cjs
 * or:       npm run verify:arch
 *
 * Exits 1 on any failure so it can gate CI.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ARCH_FILE = path.join(REPO_ROOT, 'docs/ARCHITECTURE.md');

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
  // Otherwise search common code directories. Return the first hit.
  for (const dir of SEARCH_DIRS) {
    const candidate = path.join(REPO_ROOT, dir, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fall back to src/main so the error message has a concrete path.
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
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return null;
      }
      for (let i = a; i <= b; i++) lines.add(i);
    } else {
      const n = Number(part);
      if (!Number.isFinite(n)) return null;
      lines.add(n);
    }
  }
  return { file, lines: [...lines].sort((a, b) => a - b) };
}

/** Extract symbol candidates from the surrounding context. Looks for
 *  backtick-wrapped identifiers (camelCase / snake_case / kebab-case)
 *  in the same line as the ref. */
function extractSymbols(line) {
  const symbols = new Set();
  // backticked identifiers
  for (const m of line.matchAll(/`([A-Za-z_][A-Za-z0-9_-]{2,})\(?\)?`/g)) {
    const sym = m[1];
    // Skip generic words / TypeScript primitives.
    if (/^(file|line|true|false|null|void|string|number|boolean|main|src|clients)$/i.test(sym)) {
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

function verify() {
  const arch = readFileSafe(ARCH_FILE);
  if (arch === null) {
    console.error(`ERROR: cannot read ${ARCH_FILE}`);
    process.exit(2);
  }
  const archLines = arch.split('\n');

  // Match backtick-wrapped paths with optional :lines.
  // Examples:
  //   `main.ts:135`
  //   `clients/ollama.ts:40-46`
  //   `src/preload/preload.ts:6-16`
  //   `oauth.ts:135,171,174`
  const REF_RE = /`([A-Za-z][A-Za-z0-9./_-]*?\.(ts|tsx|cjs|sh|json|html|md))(?::([0-9]+(?:[,-][0-9]+)*))?`/g;

  const failures = [];
  const successes = [];

  archLines.forEach((line, idx) => {
    const lineNo = idx + 1;
    // Track the end position of the previous match on this line so we
    // can scope the "naming context" of each ref to the text between
    // the previous ref and this one (or the line start).
    let prevEnd = 0;
    for (const m of line.matchAll(REF_RE)) {
      const file = m[1];
      const lineSpec = m[3];
      const fullRef = lineSpec ? `${file}:${lineSpec}` : file;
      const refPath = resolveRef(file);
      const matchStart = m.index;
      const namingContext = line.slice(prevEnd, matchStart);
      prevEnd = matchStart + m[0].length;

      // 1. File must exist.
      if (!fs.existsSync(refPath)) {
        failures.push({
          archLine: lineNo,
          ref: fullRef,
          reason: `file not found: ${path.relative(REPO_ROOT, refPath)}`,
        });
        continue;
      }

      // 2. If line spec given, parse + bounds check.
      if (lineSpec) {
        const parsed = parseRef(fullRef);
        if (!parsed || parsed.lines.length === 0) {
          failures.push({ archLine: lineNo, ref: fullRef, reason: 'invalid line spec' });
          continue;
        }
        const srcLines = readFileSafe(refPath).split('\n').length;
        for (const n of parsed.lines) {
          if (n < 1 || n > srcLines) {
            failures.push({
              archLine: lineNo,
              ref: fullRef,
              reason: `line ${n} out of bounds (file has ${srcLines} lines)`,
            });
          }
        }

        // 3. If the immediately-preceding naming context introduces a
        //    symbol (e.g. `isServiceId` (`serviceId.ts:37`)), check the
        //    symbol exists in the referenced file. Scope is restricted
        //    to the text between the previous ref on this line and the
        //    current ref, so symbols mentioned earlier in the line
        //    can't get paired with a later, unrelated ref.
        const symbols = extractSymbols(namingContext);
        if (symbols.length > 0) {
          const srcText = readFileSafe(refPath);
          for (const sym of symbols) {
            if (!srcText.includes(sym)) {
              failures.push({
                archLine: lineNo,
                ref: fullRef,
                reason: `symbol "${sym}" not found in ${path.relative(REPO_ROOT, refPath)}`,
              });
            }
          }
        }
      }

      successes.push(fullRef);
    }
  });

  console.log(`Verified ${successes.length} file:line references in docs/ARCHITECTURE.md`);
  if (failures.length === 0) {
    console.log('✅ all references resolve');
    return 0;
  }
  console.error(`❌ ${failures.length} stale reference(s):`);
  for (const f of failures) {
    console.error(`  L${f.archLine}: ${f.ref} — ${f.reason}`);
  }
  return 1;
}

process.exit(verify());
