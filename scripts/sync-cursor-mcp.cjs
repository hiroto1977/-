#!/usr/bin/env node
/**
 * `.claude/settings.json` の MCP 台帳から Cursor IDE 用 `.cursor/mcp.json` を生成する。
 *
 * - 正本は追跡済みの `.claude/settings.json` (lint:mcp-servers が検査)
 * - 生成物 `.cursor/mcp.json` は gitignore (端末ごとに再生成 · T-036 と同型)
 * - 秘密は `${env:NAME}` に変換 (Cursor の config interpolation)
 *
 * 使用法:
 *   node scripts/sync-cursor-mcp.cjs
 *   npm run mcp:sync-cursor
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SETTINGS_PATH = path.join(ROOT, '.claude/settings.json');
const OUT_PATH = path.join(ROOT, '.cursor/mcp.json');

/** Claude Code 形式 `${VAR}` / `${HOME}` を Cursor 形式へ。 */
function cursorEnvValue(raw) {
  if (typeof raw !== 'string') return raw;
  let s = raw.replace(/\$\{HOME\}/g, '${userHome}');
  s = s.replace(/\$\{env:([A-Za-z0-9_]+)\}/g, '${env:$1}');
  s = s.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_m, name) => `\${env:${name}}`);
  return s;
}

function transformEnv(env) {
  if (!env || typeof env !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = cursorEnvValue(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function buildCursorMcp(settingsJson) {
  const servers = settingsJson?.mcpServers;
  if (!servers || typeof servers !== 'object') {
    throw new Error('settings.json に mcpServers がありません');
  }
  const mcpServers = {};
  for (const [name, spec] of Object.entries(servers)) {
    if (!spec || typeof spec !== 'object') continue;
    const entry = {
      type: 'stdio',
      command: spec.command,
      args: Array.isArray(spec.args) ? spec.args : [],
    };
    const env = transformEnv(spec.env);
    if (env) entry.env = env;
    mcpServers[name] = entry;
  }
  return { mcpServers };
}

function sync() {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const doc = buildCursorMcp(settings);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return { path: OUT_PATH, count: Object.keys(doc.mcpServers).length };
}

function selfTest() {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const doc = buildCursorMcp(settings);
  const names = Object.keys(doc.mcpServers);
  if (names.length < 20) {
    throw new Error(`サーバー数が少なすぎます: ${names.length}`);
  }
  for (const required of ['memory', 'github', 'git', 'obsidian']) {
    if (!doc.mcpServers[required]) {
      throw new Error(`必須サーバー ${required} がありません`);
    }
  }
  const gh = doc.mcpServers.github;
  if (gh.type !== 'stdio' || gh.command !== 'npx') {
    throw new Error('github サーバーの形が想定と違います');
  }
  const tok = gh.env?.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (tok !== '${env:GITHUB_TOKEN}') {
    throw new Error(`GITHUB トークンの interpolation が想定と違います: ${tok}`);
  }
  const mem = doc.mcpServers.memory;
  if (mem.args?.[1] !== '@modelcontextprotocol/server-memory') {
    throw new Error('memory サーバーのパッケージが想定と違います');
  }
  if (cursorEnvValue('${HOME}/.config/x') !== '${userHome}/.config/x') {
    throw new Error('HOME の変換が失敗しました');
  }
  if (cursorEnvValue('already ${env:FOO}') !== 'already ${env:FOO}') {
    throw new Error('二重 env 変換が壊れました');
  }
  process.stderr.write('sync-cursor-mcp.cjs self-test OK\n');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
    process.exit(0);
  }
  const r = sync();
  process.stdout.write(`✅ ${r.path} を生成 (${r.count} サーバー)\n`);
  process.stdout.write('   Cursor を再起動するか Customize → MCP で反映を確認してください。\n');
  process.stdout.write('   詳細: docs/LOCAL_GITHUB_SETUP.md\n');
}

module.exports = { buildCursorMcp, cursorEnvValue, sync };
