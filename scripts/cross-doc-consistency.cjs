#!/usr/bin/env node
/* eslint-disable */
/**
 * Cross-document fact consistency check.
 *
 * Multiple docs in /docs make the same factual claims (number of
 * services, list of services, mutation score, etc.). If one drifts
 * while another stays current the project's documentation becomes
 * subtly self-contradicting — a precision regression nobody notices
 * until a user spots it.
 *
 * This script:
 *   1. Computes the canonical value of each fact from source.
 *   2. Extracts the claim from each doc that mentions it.
 *   3. Fails if any doc disagrees with source or with another doc.
 *
 * Run via:  node scripts/cross-doc-consistency.cjs
 *           npm run lint:docs
 *
 * Exits 1 on any inconsistency.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(REPO_ROOT, 'docs');

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Canonical facts (computed from source)
// ---------------------------------------------------------------------------

function canonicalServiceCount() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/^\s*'[a-z][a-z0-9-]*'\s*,/gm)].length : null;
}

function canonicalServiceList() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (!m) return null;
  const ids = [...m[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((x) => x[1]);
  return ids;
}

function canonicalIpcHandlerCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/main.ts'));
  return [...src.matchAll(/^ipcMain\.handle\(/gm)].length;
}

function canonicalOAuthCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/oauth.ts'));
  const m = src.match(/OAUTH_CONFIGS[^{]*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  return [...m[1].matchAll(/^\s*[a-z][a-z0-9-]*:\s*\{/gm)].length;
}

const FACTS = [
  {
    name: 'service count',
    canonical: canonicalServiceCount(),
    // List of (file, pattern, parser) tuples. Each parser returns a Number.
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /サービス数 \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'IPC handler count',
    canonical: canonicalIpcHandlerCount(),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /IPC ハンドラ数 \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'OAuth service count',
    canonical: canonicalOAuthCount(),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /OAuth 対応サービス \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'service list (set equality)',
    canonical: canonicalServiceList().sort().join(','),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        // Extract IDs from the §3.1 service registry table — first
        // column is `<id>` in backticks within table rows.
        pattern: /## 3\. サービスレジストリ[\s\S]*?### 3\.2/,
        parse: (m) => {
          // Pull every `<id>` from `| `<id>` |` cells until "actions" header
          const section = m[0];
          const ids = [...section.matchAll(/^\| `([a-z][a-z0-9-]*)` \|/gm)].map((x) => x[1]);
          return ids.sort().join(',');
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
  const failures = [];
  let factCount = 0;

  for (const fact of FACTS) {
    factCount++;
    const canonical = fact.canonical;
    if (canonical == null) {
      failures.push({
        fact: fact.name,
        reason: 'canonical value could not be computed from source (regex bug)',
      });
      continue;
    }
    for (const claim of fact.claims) {
      const text = read(path.join(REPO_ROOT, claim.file));
      if (text == null) {
        failures.push({
          fact: fact.name,
          reason: `claim doc not found: ${claim.file}`,
        });
        continue;
      }
      const m = text.match(claim.pattern);
      if (!m) {
        failures.push({
          fact: fact.name,
          reason: `pattern not found in ${claim.file}`,
        });
        continue;
      }
      const claimed = claim.parse(m);
      if (String(claimed) !== String(canonical)) {
        failures.push({
          fact: fact.name,
          reason: `${claim.file} says ${claimed}, source says ${canonical}`,
        });
      }
    }
  }

  console.log(`Checked ${factCount} cross-doc facts against canonical source`);
  if (failures.length === 0) {
    console.log('✅ all docs agree with source');
    return 0;
  }
  console.error(`❌ ${failures.length} cross-doc inconsistency(ies):`);
  for (const f of failures) {
    console.error(`  fact "${f.fact}" — ${f.reason}`);
  }
  return 1;
}

process.exit(main());
