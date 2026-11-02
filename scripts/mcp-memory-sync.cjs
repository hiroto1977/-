#!/usr/bin/env node
/**
 * MCP Memory (memory.jsonl) を GitHub 上の控えと同期する。
 *
 * 環境変数 (.env.mcp を source したあと):
 *   MCP_MEMORY_GIST_ID     — 秘密 Gist の ID (推奨・memory.jsonl 1 ファイル)
 *   MCP_MEMORY_GIST_FILE   — Gist 内のファイル名 (既定 memory.jsonl)
 *   MCP_MEMORY_GITHUB      — "owner/repo:path/to/memory.jsonl" (リポジトリ上のファイル)
 *
 * 使い方:
 *   npm run mcp:memory:pull
 *   npm run mcp:memory:push
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const MEMORY_FILE = path.join(REPO, 'data/mcp-memory.jsonl');

function die(msg) {
  process.stderr.write(`[mcp:memory] ${msg}\n`);
  process.exit(1);
}

function info(msg) {
  process.stdout.write(`[mcp:memory] ${msg}\n`);
}

function loadDotEnvMcp() {
  const envPath = path.join(REPO, '.env.mcp');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(t);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function parseGithubRef(ref) {
  const m = /^([^/]+\/[^/:]+):(.+)$/.exec(ref.trim());
  if (!m) {
    die('MCP_MEMORY_GITHUB の形式は owner/repo:path/to/file です');
  }
  return { repo: m[1], filePath: m[2] };
}

function pullFromGist(gistId, filename) {
  info(`Gist ${gistId} から ${filename} を取得中…`);
  const content = execFileSync('gh', ['gist', 'view', gistId, '--filename', filename], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, content, { mode: 0o600 });
  info(`保存しました: data/mcp-memory.jsonl (${content.length} 文字)`);
}

function pushToGist(gistId, filename) {
  if (!fs.existsSync(MEMORY_FILE)) {
    die('data/mcp-memory.jsonl がありません — 先に npm run mcp:setup を実行してください');
  }
  info(`Gist ${gistId} へ ${filename} をアップロード中…`);
  execFileSync('gh', ['gist', 'edit', gistId, '-f', `${filename}=${MEMORY_FILE}`], {
    stdio: 'inherit',
  });
  info('Gist を更新しました');
}

function pullFromRepo(repo, filePath) {
  info(`リポジトリ ${repo} の ${filePath} を取得中…`);
  const b64 = execFileSync(
    'gh',
    ['api', `repos/${repo}/contents/${filePath}`, '-q', '.content'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim();
  const content = Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
  fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
  fs.writeFileSync(MEMORY_FILE, content, { mode: 0o600 });
  info(`保存しました: data/mcp-memory.jsonl (${content.length} 文字)`);
}

function pushToRepo(repo, filePath) {
  if (!fs.existsSync(MEMORY_FILE)) {
    die('data/mcp-memory.jsonl がありません');
  }
  const content = fs.readFileSync(MEMORY_FILE);
  const b64 = content.toString('base64');
  let sha;
  try {
    sha = execFileSync('gh', ['api', `repos/${repo}/contents/${filePath}`, '-q', '.sha'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    sha = undefined;
  }
  const body = {
    message: 'chore(mcp): sync MCP memory.jsonl from local',
    content: b64,
    ...(sha ? { sha } : {}),
  };
  const inputPath = path.join(REPO, 'data', '.mcp-memory-upload.json');
  fs.mkdirSync(path.dirname(inputPath), { recursive: true });
  fs.writeFileSync(inputPath, JSON.stringify(body));
  try {
    execFileSync('gh', ['api', '-X', 'PUT', `repos/${repo}/contents/${filePath}`, '--input', inputPath], {
      stdio: 'inherit',
    });
  } finally {
    fs.unlinkSync(inputPath);
  }
  info('リポジトリ上のファイルを更新しました');
}

function main() {
  const mode = process.argv[2];
  if (mode !== 'pull' && mode !== 'push') {
    die('使い方: node scripts/mcp-memory-sync.cjs pull|push');
  }
  loadDotEnvMcp();

  const gistId = process.env.MCP_MEMORY_GIST_ID?.trim();
  const gistFile = process.env.MCP_MEMORY_GIST_FILE?.trim() || 'memory.jsonl';
  const githubRef = process.env.MCP_MEMORY_GITHUB?.trim();

  if (!gistId && !githubRef) {
    die(
      'MCP_MEMORY_GIST_ID または MCP_MEMORY_GITHUB を .env.mcp に設定してください (.env.mcp.example を参照)',
    );
  }

  if (gistId) {
    if (mode === 'pull') pullFromGist(gistId, gistFile);
    else pushToGist(gistId, gistFile);
    return;
  }

  const { repo, filePath } = parseGithubRef(githubRef);
  if (mode === 'pull') pullFromRepo(repo, filePath);
  else pushToRepo(repo, filePath);
}

main();
