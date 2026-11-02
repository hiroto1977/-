#!/usr/bin/env node
/**
 * ローカル開発環境の MCP / 記憶ファイルを整える。
 *
 * - `data/mcp-memory.jsonl` … MCP memory サーバの永続グラフ (端末ローカル)
 * - `.claude/settings.local.json` … MEMORY_FILE_PATH を絶対パスで指定 (追跡しない)
 * - 任意: GitHub 上の memory.jsonl を `gh` で取り込む
 *
 * 使用法:
 *   node scripts/setup-local-dev.cjs
 *   node scripts/setup-local-dev.cjs --pull-memory   # GitHub から memory を取得
 *   node scripts/setup-local-dev.cjs --dry-run
 *
 * 環境変数 (任意):
 *   SERVICEHUB_MCP_MEMORY_GH  … owner/repo:path/to/memory.jsonl
 *                               例: hiroto1977/-:data/mcp-memory.jsonl
 *   GITHUB_TOKEN              … GitHub MCP 用 (未設定なら `gh auth token` を試す)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'mcp-memory.jsonl');
const LOCAL_SETTINGS = path.join(ROOT, '.claude/settings.local.json');
const ENV_SNIPPET = path.join(ROOT, '.env.mcp.local');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const PULL = args.has('--pull-memory');

function info(msg) {
  process.stdout.write(`[setup-local] ${msg}\n`);
}

function warn(msg) {
  process.stderr.write(`[setup-local] ⚠ ${msg}\n`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    if (!DRY) fs.mkdirSync(dir, { recursive: true });
    info(`作成: ${path.relative(ROOT, dir)}/`);
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function ghToken() {
  if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** SERVICEHUB_MCP_MEMORY_GH = owner/repo:path/in/repo.jsonl */
function parseGhSpec() {
  const raw = process.env.SERVICEHUB_MCP_MEMORY_GH?.trim();
  if (!raw) return null;
  const colon = raw.indexOf(':');
  if (colon <= 0) {
    warn('SERVICEHUB_MCP_MEMORY_GH の形式は owner/repo:path/to/file.jsonl です');
    return null;
  }
  const repo = raw.slice(0, colon);
  const filePath = raw.slice(colon + 1).replace(/^\/+/, '');
  const slash = repo.indexOf('/');
  if (slash <= 0) return null;
  return { owner: repo.slice(0, slash), repo: repo.slice(slash + 1), filePath };
}

function pullMemoryFromGitHub() {
  const spec = parseGhSpec();
  if (!spec) {
    info('--pull-memory: SERVICEHUB_MCP_MEMORY_GH が未設定のためスキップ');
    return false;
  }
  const token = ghToken();
  if (!token) {
    warn('--pull-memory: GITHUB_TOKEN も gh ログインも無いためスキップ');
    return false;
  }
  const apiPath = `/repos/${spec.owner}/${spec.repo}/contents/${spec.filePath}`;
  info(`GitHub から memory を取得: ${spec.owner}/${spec.repo} (${spec.filePath})`);
  if (DRY) return true;
  let body;
  try {
    body = execFileSync(
      'gh',
      ['api', apiPath, '-H', 'Accept: application/vnd.github.raw'],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GH_TOKEN: token } },
    );
  } catch (e) {
    warn(`GitHub からの取得に失敗: ${e.message ?? e}`);
    return false;
  }
  ensureDir(DATA_DIR);
  fs.writeFileSync(MEMORY_FILE, body);
  info(`保存: ${path.relative(ROOT, MEMORY_FILE)} (${body.length} B)`);
  return true;
}

function touchMemoryFile() {
  ensureDir(DATA_DIR);
  if (fs.existsSync(MEMORY_FILE)) {
    info(`memory ファイルは既にあります: ${path.relative(ROOT, MEMORY_FILE)}`);
    return;
  }
  if (DRY) {
    info(`(dry-run) 空の memory ファイルを作成: ${path.relative(ROOT, MEMORY_FILE)}`);
    return;
  }
  fs.writeFileSync(MEMORY_FILE, '', { flag: 'wx' });
  info(`空の memory ファイルを作成: ${path.relative(ROOT, MEMORY_FILE)}`);
}

function writeLocalSettings() {
  const absMemory = MEMORY_FILE;
  const existing = readJsonSafe(LOCAL_SETTINGS) ?? {};
  const servers = existing.mcpServers && typeof existing.mcpServers === 'object'
    ? { ...existing.mcpServers }
    : {};
  servers.memory = {
    ...(servers.memory && typeof servers.memory === 'object' ? servers.memory : {}),
    env: {
      ...(servers.memory?.env ?? {}),
      MEMORY_FILE_PATH: absMemory,
    },
  };
  const next = { ...existing, mcpServers: servers };
  if (DRY) {
    info(`(dry-run) ${path.relative(ROOT, LOCAL_SETTINGS)} に MEMORY_FILE_PATH を書き込み`);
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_SETTINGS), { recursive: true });
  fs.writeFileSync(LOCAL_SETTINGS, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  info(`更新: ${path.relative(ROOT, LOCAL_SETTINGS)} (MEMORY_FILE_PATH)`);
}

function writeEnvSnippet(token) {
  if (!token || fs.existsSync(ENV_SNIPPET)) return;
  if (DRY) {
    info(`(dry-run) ${path.relative(ROOT, ENV_SNIPPET)} に GITHUB_TOKEN の export 例を書く`);
    return;
  }
  const lines = [
    '# このファイルは git 管理外。シェルで source するか、~/.zshrc に追記してください。',
    '# 生成: node scripts/setup-local-dev.cjs',
    `export GITHUB_TOKEN="${token}"`,
    '',
  ];
  fs.writeFileSync(ENV_SNIPPET, lines.join('\n'), { mode: 0o600 });
  info(`作成: ${path.relative(ROOT, ENV_SNIPPET)} (GITHUB_TOKEN · chmod 600)`);
}

function npmDeps() {
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
    info('npm 依存は導入済み');
    return;
  }
  info('npm ci を実行中…');
  if (DRY) return;
  const r = spawnSync('npm', ['ci'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    warn('npm ci に失敗しました。手元で npm ci を実行してください');
  }
}

function main() {
  info('Service Hub — ローカル MCP / 記憶のセットアップ');
  if (PULL) pullMemoryFromGitHub();
  touchMemoryFile();
  writeLocalSettings();
  const token = ghToken();
  if (token) writeEnvSnippet(token);
  else warn('GITHUB_TOKEN 未設定 — GitHub MCP は docs/MCP_SETUP.md の手順で PAT を設定してください');
  npmDeps();
  if (!DRY) {
    info('検証: npm run mcp:check');
    spawnSync('npm', ['run', 'mcp:check'], { cwd: ROOT, stdio: 'inherit', env: process.env });
  }
  info('完了 — Claude Code / Cursor を再起動すると MCP memory が data/mcp-memory.jsonl を使います');
  info('GitHub 上の memory を取り込む: SERVICEHUB_MCP_MEMORY_GH=owner/repo:path/to/memory.jsonl node scripts/setup-local-dev.cjs --pull-memory');
}

main();
