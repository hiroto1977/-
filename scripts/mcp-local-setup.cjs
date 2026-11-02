#!/usr/bin/env node
/**
 * ローカル環境向け MCP セットアップ。
 *
 * - `.claude/settings.json` の mcpServers から `.mcp.json` を生成 (gitignore 済み)
 * - MCP Memory の保存先 `data/mcp-memory.jsonl` を用意
 * - `.env.mcp` テンプレートをコピー (gitignore 済み・API キーはここだけ)
 * - `gh auth token` が使えるとき GITHUB_TOKEN を .env.mcp に追記 (値は標準出力に出さない)
 *
 * 使い方: node scripts/mcp-local-setup.cjs
 *         npm run mcp:setup
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const SETTINGS = path.join(REPO, '.claude/settings.json');
const MCP_JSON = path.join(REPO, '.mcp.json');
const ENV_EXAMPLE = path.join(REPO, '.env.mcp.example');
const ENV_LOCAL = path.join(REPO, '.env.mcp');
const DATA_DIR = path.join(REPO, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'mcp-memory.jsonl');
const MEMORY_REL = './data/mcp-memory.jsonl';

function info(msg) {
  process.stdout.write(`[mcp:setup] ${msg}\n`);
}

function tryGhToken() {
  try {
    const out = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function tryGhLogin() {
  try {
    const out = execFileSync('gh', ['api', 'user', '-q', '.login'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function readSettings() {
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  const json = JSON.parse(raw);
  if (!json.mcpServers || typeof json.mcpServers !== 'object') {
    throw new Error('.claude/settings.json に mcpServers がありません');
  }
  return json.mcpServers;
}

/** memory サーバへ MEMORY_FILE_PATH を載せた写しを作る (他はそのまま)。 */
function serversForLocal(servers) {
  const copy = structuredClone(servers);
  if (copy.memory?.env) {
    copy.memory.env.MEMORY_FILE_PATH = MEMORY_REL;
  } else if (copy.memory) {
    copy.memory.env = { MEMORY_FILE_PATH: MEMORY_REL };
  }
  return copy;
}

function ensureEnvMcp() {
  if (fs.existsSync(ENV_LOCAL)) {
    info(`.env.mcp は既にあります (${ENV_LOCAL})`);
    return;
  }
  if (!fs.existsSync(ENV_EXAMPLE)) {
    throw new Error('.env.mcp.example が見つかりません');
  }
  fs.copyFileSync(ENV_EXAMPLE, ENV_LOCAL);
  info(`.env.mcp を作成しました — API キーを編集してください`);
}

function mergeGithubTokenIntoEnv() {
  const token = tryGhToken();
  if (!token) {
    info('gh auth login 未設定 — GITHUB_TOKEN は .env.mcp に手動で設定してください');
    return;
  }
  const login = tryGhLogin();
  if (login) {
    info(`GitHub CLI: ${login} として認証済み`);
  }
  let body = fs.readFileSync(ENV_LOCAL, 'utf8');
  if (/^export GITHUB_TOKEN=/m.test(body) && !body.includes('<REPLACE_WITH_GITHUB_TOKEN>')) {
    info('GITHUB_TOKEN は .env.mcp に既に設定されています (上書きしません)');
    return;
  }
  body = body.replace(/^export GITHUB_TOKEN=.*$/m, `export GITHUB_TOKEN="${token.replace(/"/g, '\\"')}"`);
  if (!/^export GITHUB_TOKEN=/m.test(body)) {
    body += `\nexport GITHUB_TOKEN="${token.replace(/"/g, '\\"')}"\n`;
  }
  fs.writeFileSync(ENV_LOCAL, body, { mode: 0o600 });
  info('GITHUB_TOKEN を gh auth token から .env.mcp へ反映しました (ファイル権限 600)');
}

function writeMcpJson(servers) {
  const payload = { mcpServers: serversForLocal(servers) };
  fs.writeFileSync(MCP_JSON, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  info(`.mcp.json を生成しました (${Object.keys(payload.mcpServers).length} サーバー)`);
}

function ensureDataLayout() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, '', { mode: 0o600 });
    info(`MCP Memory の空ファイルを作成: ${MEMORY_REL}`);
  } else {
    info(`MCP Memory: ${MEMORY_REL} は既にあります`);
  }
  const db = path.join(DATA_DIR, 'local.db');
  if (!fs.existsSync(db)) {
    info('SQLite (data/local.db) は初回 MCP 利用時に作成されます');
  }
}

function main() {
  info('ローカル MCP セットアップを開始します');
  const servers = readSettings();
  ensureDataLayout();
  ensureEnvMcp();
  mergeGithubTokenIntoEnv();
  writeMcpJson(servers);
  info('');
  info('次のステップ:');
  info('  1. シェルで export:  set -a && source .env.mcp && set +a');
  info('  2. GitHub に保存した記憶を取り込む:  npm run mcp:memory:pull');
  info('  3. 状態確認:  npm run mcp:check');
  info('  4. Claude Code / Cursor を再起動して MCP を読み込む');
}

main();
