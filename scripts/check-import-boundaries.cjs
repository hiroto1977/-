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

/**
 * **相対パスの実行時 `require()`。**
 *
 * この門は `import` 文だけを読んでいた。`require()` は視界の外で、
 * 2026-08-26 にそれが実害になった:
 *
 *   src/main/clients/index.ts がモジュール直下で
 *     const { SERVICE_IDS } = require('../../shared/serviceId') as …
 *   と書いており、**バンドラは require を書き換えない**ので、出来上がった
 *   `dist-electron/main.js` に相対パスのまま残った。`dist-electron/` から
 *   見て repo の外を指すので解決できず:
 *
 *     electron .  ->  App threw an error during load
 *                     Cannot find module '../../shared/serviceId'
 *
 *   **デスクトップ版が起動しなかった。** 落ちていたのは「フェッチャの
 *   足し忘れを起動時に大きく落とす」ための不変条件そのものである。
 *
 * CI は一度もここを通らない —— smoke は `scripts/screenshot.cjs` を主プロセス
 * にして自前で窓を作り、e2e はブラウザ版の HTML を読み、release.yml は
 * インストーラを作るが起動はしない。**誰も実物を起動していなかった。**
 *
 * npm パッケージや `node:` の require は対象外 (バンドラが解決する)。
 * 見るのは**相対パス**だけ。
 */
const RELATIVE_REQUIRE_RE = /\brequire\s*\(\s*['"](\.[^'"]*)['"]\s*\)/g;

function isCommentLineForRequire(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function relativeRequires(text) {
  const out = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (isCommentLineForRequire(lines[i])) continue;
    RELATIVE_REQUIRE_RE.lastIndex = 0;
    let m;
    while ((m = RELATIVE_REQUIRE_RE.exec(lines[i])) !== null) out.push({ line: i + 1, spec: m[1] });
  }
  return out;
}

/** self-test 用の標本と期待値。**実物で起きた形をそのまま置く。** */
const RELATIVE_REQUIRE_CASES = [
  ['実際に起きた形を捕まえる', "  const { SERVICE_IDS } = require('../../shared/serviceId') as typeof import('../../shared/serviceId');", 1],
  ['同じ階層の相対も捕まえる', "const x = require('./foo');", 1],
  ['npm パッケージは見ない (バンドラが解決する)', "const { app } = require('electron');", 0],
  ['node: 組み込みも見ない', "const fs = require('node:fs');", 0],
  ['行コメントは見ない (説明に綴りが出るため)', "  // const x = require('../y');", 0],
  ['ブロックコメントも見ない', "   * require('../y') と書くと残る", 0],
  ['import 文は対象外 (バンドラが書き換える)', "import { x } from '../../shared/serviceId';", 0],
];

/**
 * 陰性対照 — **この関門が本当に鳴るか**を毎回確かめる。
 *
 * 2026-08-22 に verify:all の 25 ゲートを 1 つずつ手で壊して回したところ、
 * 陰性対照を持たない 13 件のうち **2 件が本当に鳴らなかった**
 * (`lint:forbidden` は nodeIntegration の規則ごと欠落、
 *  `lint:network-targets` は素の fetch と `https://${host}` の 2 つが素通り)。
 * 手で確かめただけでは今日しか効かないので、ここへ固定する。
 *
 * この関門が守るのは「レンダラーは sandbox の中にいる」という前提そのもの。
 * electron や node 組み込みが renderer へ入った時点で、その前提は崩れる。
 */
function selfTest() {
  /**
   * **本物の判定関数を通す。** 最初に書いた版は electron / node の行だけ
   * `false` を直接返しており、`false === false` を確かめる**落ちようのない
   * 検査**になっていた (書いている当人が、探していた当のものを作りかけた)。
   * `classifyTarget` の種別と、main と同じ規則で判断する。
   */
  const violates = (fromZone, spec) => {
    const cls = classifyTarget(spec, `${ZONES[fromZone]}x.ts`);
    if (fromZone === 'renderer' && (cls.kind === 'electron' || cls.kind === 'node-builtin')) return true;
    if (fromZone === 'preload' && cls.kind === 'node-builtin') return true;
    if (cls.kind === 'zone') return !isAllowedZoneTransition(fromZone, cls.zone);
    return false;
  };

  const cases = [
    // [説明, 出どころ zone, import 指定子, 落とすべきか]
    ['renderer は electron を読めない', 'renderer', 'electron', true],
    ['renderer は electron/remote も読めない', 'renderer', 'electron/renderer', true],
    ['renderer は node:fs を読めない', 'renderer', 'node:fs', true],
    ['renderer は fs (接頭辞なし) も読めない', 'renderer', 'fs', true],
    ['renderer は child_process を読めない', 'renderer', 'node:child_process', true],
    ['renderer は npm パッケージを読める', 'renderer', 'react', false],
    ['preload は node:fs を読めない', 'preload', 'node:fs', true],
    ['preload は electron を読める (bridge を張る側)', 'preload', 'electron', false],
    ['main は node:fs を読める', 'main', 'node:fs', false],
    ['main は electron を読める', 'main', 'electron', false],
  ];
  let bad = 0;
  for (const [label, from, spec, expected] of cases) {
    const got = violates(from, spec);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got ? '拒否' : '許可'} (期待 ${expected ? '拒否' : '許可'})`);
  }

  // zone どうしの行き来は表そのものを見る。
  const zonePairs = [
    ['renderer', 'shared', true],
    ['renderer', 'preload', true],
    ['renderer', 'main', false],
    ['preload', 'shared', true],
    ['preload', 'main', false],
    ['main', 'shared', true],
    ['main', 'renderer', false],
    ['shared', 'main', false],
    ['shared', 'renderer', false],
    ['shared', 'shared', true],
    /*
     * ここから 6 組は 2026-08-25 に足した。16 通りのうち **10 通りしか
     * 書かれておらず**、抜けていた 3 つの禁止遷移 (`preload → renderer` /
     * `main → preload` / `shared → preload`) は **`ALLOW` に足しても
     * self-test が通った** —— 境界を黙って開けられる状態だった
     * (実測: 禁止 8 通りを 1 つずつ許して回した)。
     *
     * `→ preload` だけが抜けていたのは偶然ではない。preload は
     * 「renderer から読める唯一の特権側」なので**表の中で例外的**であり、
     * 手で並べると意識から落ちる。だから下で**総当たりを強制**する。
     */
    ['renderer', 'renderer', true],
    ['preload', 'preload', true],
    ['main', 'main', true],
    ['preload', 'renderer', false],
    ['main', 'preload', false],
    ['shared', 'preload', false],
  ];
  for (const [from, to, expected] of zonePairs) {
    const got = isAllowedZoneTransition(from, to);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${from} → ${to}: ${got ? '許可' : '拒否'} (期待 ${expected ? '許可' : '拒否'})`);
  }

  /*
   * **16 通りを 1 つも落とさない。**
   *
   * 期待値は `ALLOW` とは独立に手で書く (`ALLOW` から導くと
   * `ALLOW.includes(x) === ALLOW.includes(x)` という**落ちようのない検査**に
   * なる —— このファイルの冒頭が戒めているのと同じ罠)。
   * 独立に書く以上、**書き落とし**が起こる。そこを機械で塞ぐ。
   */
  const zoneNames = Object.keys(ALLOW);
  const covered = new Set(zonePairs.map(([f, t]) => `${f}>${t}`));
  const missingPairs = [];
  for (const f of zoneNames) {
    for (const t of zoneNames) if (!covered.has(`${f}>${t}`)) missingPairs.push(`${f} → ${t}`);
  }
  if (missingPairs.length > 0) {
    bad += missingPairs.length;
    console.log(`  ✗ 期待値の書かれていない遷移が ${missingPairs.length} 件: ${missingPairs.join(', ')}`);
  } else {
    console.log(`  ✓ ${zoneNames.length}×${zoneNames.length} = ${zoneNames.length ** 2} 通りすべてに期待値がある`);
  }

  for (const [label, line, expected] of RELATIVE_REQUIRE_CASES) {
    const n = relativeRequires(line).length;
    const ok = n === expected;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 相対 require: ${label}: ${n} 件 (期待 ${expected})`);
  }

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — 関門が鳴らない / 鳴りすぎている`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const violations = [];
  let fileCount = 0;
  let importCount = 0;

  for (const full of walkSrc(SRC)) {
    const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/');
    const zone = detectZone(rel);
    if (!zone) continue;
    fileCount++;
    const text = fs.readFileSync(full, 'utf8');
    for (const { line, spec } of relativeRequires(text)) {
      violations.push({
        file: rel,
        spec,
        reason:
          `相対パスの実行時 require (${line} 行目) —— バンドラは書き換えないので ` +
          `dist-electron/ に残り、そこから見た相対パスは解決できません。static import にしてください`,
      });
    }
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
