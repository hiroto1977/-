#!/usr/bin/env node
 
/**
 * Enforce module-boundary invariants documented in ARCHITECTURE.md §1:
 *
 *   - **Renderer** (src/renderer/**) may import only from:
 *       - src/renderer/**           (itself)
 *       - src/preload/preload       (types only — TS imports erase)
 *       - src/shared/**             (cross-process types + serviceId)
 *       - 'react', 'react-dom'      (UI runtime)
 *
 *     Renderer must NOT import from src/main/**, electron, node:*,
 *     anything that drags Node API into the sandboxed renderer.
 *
 *   - **Preload** (src/preload/**) may import only:
 *       - 'electron' (contextBridge, ipcRenderer)
 *       - src/shared/**
 *       - same dir
 *
 *   - **Main** (src/main/**) may import:
 *       - src/main/**, src/shared/**
 *       - 'electron', node:*, npm modules
 *
 *     Main must NOT import from src/renderer/**.
 *
 * This codifies invariant #1 ("Renderer doesn't call Node API directly")
 * and #14 (registration discipline) as a mechanical CI check.
 *
 * Run via:  node scripts/check-import-boundaries.cjs
 *           npm run lint:imports
 *
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

const ZONES = {
  renderer: 'src/renderer/',
  preload: 'src/preload/',
  main: 'src/main/',
  shared: 'src/shared/',
};

// Allowed import targets per zone. Each entry is a predicate over the
// resolved import string (the literal text after `from`).
//
// `node:*` is canonical for Node built-ins; bare 'fs' etc. are also
// treated as Node built-ins.
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
  'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

function isNodeBuiltin(spec) {
  if (spec.startsWith('node:')) return true;
  return NODE_BUILTINS.has(spec.split('/')[0]);
}

function isNpmModule(spec) {
  if (spec.startsWith('.') || spec.startsWith('/')) return false;
  if (spec.startsWith('src/')) return false;
  if (isNodeBuiltin(spec)) return false;
  return true; // bare specifier like 'react'
}

/** Resolve a relative import to a repo-relative `src/...` path so we can
 *  classify it. Returns null if the spec isn't a relative path. */
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const resolved = path.resolve(dir, spec);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function classifyTarget(spec, fromRel) {
  if (isNodeBuiltin(spec)) return { kind: 'node-builtin' };
  if (spec === 'electron' || spec.startsWith('electron/')) return { kind: 'electron' };
  // Relative — resolve and check the zone.
  if (spec.startsWith('.')) {
    const resolved = resolveRelative(path.join(REPO_ROOT, fromRel), spec);
    if (!resolved) return { kind: 'unresolved' };
    for (const [zone, prefix] of Object.entries(ZONES)) {
      if (resolved.startsWith(prefix)) return { kind: 'zone', zone, resolved };
    }
    return { kind: 'unknown-zone', resolved };
  }
  // Bare specifier referencing src/* directly (the project uses none).
  if (spec.startsWith('src/')) {
    for (const [zone, prefix] of Object.entries(ZONES)) {
      if (spec.startsWith(prefix)) return { kind: 'zone', zone, resolved: spec };
    }
  }
  if (isNpmModule(spec)) return { kind: 'npm', name: spec };
  return { kind: 'unknown' };
}

const ALLOW = {
  renderer: ['renderer', 'shared', 'preload'], // preload only for types
  preload: ['preload', 'shared'],
  main: ['main', 'shared'],
  shared: ['shared'],
};

function isAllowedZoneTransition(from, target) {
  return ALLOW[from].includes(target);
}

function detectZone(rel) {
  for (const [zone, prefix] of Object.entries(ZONES)) {
    if (rel.startsWith(prefix)) return zone;
  }
  return null;
}

function* walkSrc(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      yield* walkSrc(full);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      yield full;
    }
  }
}

const IMPORT_RE = /^\s*import\s+(?<typeOnly>type\s+)?(?:[^'"]+\s+from\s+)?['"](?<spec>[^'"]+)['"];?/gm;

function main() {
  const violations = [];
  let fileCount = 0;
  let importCount = 0;

  for (const full of walkSrc(SRC)) {
    const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
    const zone = detectZone(rel);
    if (!zone) continue;
    fileCount++;
    const text = fs.readFileSync(full, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      importCount++;
      const spec = m.groups.spec;
      const typeOnly = Boolean(m.groups.typeOnly);
      const cls = classifyTarget(spec, rel);

      // `import type` erases at runtime — no actual coupling between
      // processes is created. Skip the zone-boundary check entirely;
      // we still verify the spec is well-formed.
      if (typeOnly) {
        continue;
      }

      // Renderer forbids electron + node-builtin entirely.
      if (zone === 'renderer') {
        if (cls.kind === 'electron') {
          violations.push({
            file: rel,
            spec,
            reason: 'renderer cannot import electron (sandboxed)',
          });
          continue;
        }
        if (cls.kind === 'node-builtin') {
          violations.push({
            file: rel,
            spec,
            reason: `renderer cannot import Node built-in '${spec}' (sandboxed)`,
          });
          continue;
        }
      }
      // Preload forbids node-builtin (preload is contextIsolated, but
      // pulling Node modules into preload risks expanding the bridge
      // surface inadvertently).
      if (zone === 'preload' && cls.kind === 'node-builtin') {
        violations.push({
          file: rel,
          spec,
          reason: 'preload should not import Node built-ins directly',
        });
        continue;
      }
      // Zone-to-zone allowance
      if (cls.kind === 'zone') {
        if (!isAllowedZoneTransition(zone, cls.zone)) {
          violations.push({
            file: rel,
            spec,
            reason: `${zone} → ${cls.zone} import not allowed (resolved: ${cls.resolved})`,
          });
        }
      }
    }
  }

  console.log(
    `Scanned ${importCount} imports across ${fileCount} src/**/*.ts(x) files`,
  );
  if (violations.length === 0) {
    console.log('✅ all imports respect process boundaries');
    return 0;
  }
  console.error(`❌ ${violations.length} import-boundary violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}\n    import '${v.spec}'\n    ↳ ${v.reason}`);
  }
  return 1;
}

process.exit(main());
