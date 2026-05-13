#!/usr/bin/env node
/* eslint-disable */
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
    // and the Ollama client itself (where ALLOWED_ENDPOINTS and the
    // UNPATCHED_OOB_NOTICE warning enumerate them as denied).
    allowFile: (rel) =>
      rel === 'src/main/clients/ollama.ts' ||
      rel.startsWith('src/renderer/'),
    rationale: 'invariants #7-#8 — these endpoints are CVE prone',
  },
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
