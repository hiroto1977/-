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

function count(rel, re) {
  try {
    return execSync(`grep -rE "${re}" ${rel} 2>/dev/null | wc -l`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .trim();
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

const testCount = count('src', '^\\s*it\\(');

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
