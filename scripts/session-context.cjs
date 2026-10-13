#!/usr/bin/env node
/**
 * SessionStart hook — Service Hub 用の前回セッション引継ぎ。
 *
 * Claude Code が新しいセッションを開始した時 (`startup` / `resume` /
 * `clear`) に自動で呼び出される。前セッションの成果と現在の状態を
 * 標準出力に書き、後続のアシスタント応答にコンテキストとして注入する。
 *
 * 仕様:
 *   - 出力は短く保つ (1KB 程度)。長すぎるとコンテキストを圧迫する。
 *   - エラーは silent (process.exit(0))。git や fs 失敗時もセッション
 *     を阻害しない。
 *   - 詳細は `docs/SESSION_HANDOFF.md` を読む案内に留める。
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/**
 * 静的な `it(` の数。**数え方はここに書かない** —— `verify:arch` の
 * `countStaticIts` を呼ぶ。
 *
 * ★ **写しを持っていて、その写しが違う答えを出していた (2026-09-26 · パス 481)。**
 * 以前ここには汎用の `count(rel, re)` が在り、`count('src', /^\s*it\(/gm)` と
 * 呼んでいた。契約が **2 つの軸で**ゲートと違う —— 母集団が `.ts|.tsx`
 * (`.test.ts` ではない) で、針が `\s*` (`\s+` ではない)。実測すると差は
 * 母集団の軸の **1 件**だけ (`src/renderer/__audits__/…audit.ts` は
 * `vitest.audit.config.ts` だけが拾うので `npm test` も CI も走らせない) で、
 * greeting は **16065**・ゲートは **16064** と言っていた。greeting は新しい
 * セッションが最初に読む物で `CLAUDE.md` がそこを指しているので、それを信じて
 * `docs/ARCHITECTURE.md` の表を 16065 に直したセッションは `verify:arch` を壊す。
 *
 * 読めなければ **`?`** —— 推測した数を名乗らない (「読めなかった」と「N 件」は
 * 別の主張で、後者を偽ることが上の欠陥そのものだった)。hook は silent な契約を
 * 持つので、require が失敗してもセッションは止めない。
 */
function staticItCount() {
  try {
    const { countStaticIts } = require('./verify-architecture.cjs');
    if (typeof countStaticIts !== 'function') return '?';
    const n = countStaticIts();
    return Number.isInteger(n) && n >= 0 ? String(n) : '?';
  } catch {
    return '?';
  }
}

const branch = sh('git rev-parse --abbrev-ref HEAD') || '(detached)';
const head = sh('git log --oneline -1') || '(no commits)';
const status = sh('git status --short') || '(clean)';

let serviceCount = '?';
try {
  const sid = fs.readFileSync(path.join(ROOT, 'src/shared/serviceId.ts'), 'utf8');
  const m = sid.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (m) {
    serviceCount = (m[1].match(/'[a-z][a-z0-9-]*'/g) || []).length;
  }
} catch {
  /* ignore */
}

const testCount = staticItCount();

const lines = [
  '## Service Hub — セッション引継ぎ',
  '',
  `branch: ${branch}`,
  `HEAD:   ${head}`,
  `state:  ${status === '(clean)' ? 'clean' : status.split('\n').length + ' file(s) modified'}`,
  '',
  `services: ${serviceCount}  /  static it() tests: ${testCount}`,
  '',
];

if (exists('docs/SESSION_HANDOFF.md')) {
  lines.push('📋 詳細: docs/SESSION_HANDOFF.md を読んでください (進行中タスク / 確立されたパターン / 既知の罠 / 残作業)。');
} else {
  lines.push('ℹ docs/SESSION_HANDOFF.md がありません。前セッションのコンテキストは git log と CLAUDE.md を参照してください。');
}

lines.push('');
lines.push('クイック検証: `npm run typecheck && npm test && npm run verify:all` で全 green を確認してから作業開始を推奨。');

process.stdout.write(lines.join('\n') + '\n');
