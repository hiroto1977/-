#!/usr/bin/env node
// MCP サーバーの設定状態と環境変数の過不足を確認するスクリプト
// 使用法: node scripts/mcp-check.cjs

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SETTINGS_PATH = path.join(__dirname, '../.claude/settings.json');

// 各サーバーに必要な環境変数の定義
const REQUIRED_ENVS = {
  'brave-search':  ['BRAVE_API_KEY'],
  'google-maps':   ['GOOGLE_MAPS_API_KEY'],
  'github':        ['GITHUB_TOKEN'],
  'atlassian':     ['ATLASSIAN_SITE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'],
  'notion':        ['NOTION_API_KEY'],
  'slack':         ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
  'gdrive':        [],  // OAuth ファイルが必要（別チェック）
  'linear':        ['LINEAR_API_KEY'],
  'sentry':        ['SENTRY_AUTH_TOKEN'],
  'stripe':        ['STRIPE_SECRET_KEY'],
  'cloudflare':    ['CLOUDFLARE_API_TOKEN'],
  'discord':       ['DISCORD_BOT_TOKEN'],
  'youtube':       ['YOUTUBE_API_KEY'],
};

// API不要サーバー（常に利用可能）
const NO_KEY_SERVERS = [
  'filesystem', 'git', 'sqlite', 'time', 'fetch',
  'memory', 'sequential-thinking', 'context7',
  'playwright', 'docker', 'obsidian', 'shopify',
];

function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     MCP サーバー設定チェック              ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // settings.json を読む
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (e) {
    console.error(`❌ .claude/settings.json の読み込みに失敗: ${e.message}`);
    process.exit(1);
  }

  const servers = settings.mcpServers || {};
  const serverNames = Object.keys(servers);

  console.log(`📋 設定済みMCPサーバー: ${serverNames.length}個\n`);

  // API不要サーバー
  console.log('🟢 API不要（即使用可能）');
  const ready = [];
  const needKey = [];
  const missing = [];

  for (const name of serverNames) {
    if (NO_KEY_SERVERS.includes(name)) {
      ready.push(name);
    } else if (REQUIRED_ENVS[name]) {
      const envs = REQUIRED_ENVS[name];
      const missingEnvs = envs.filter(e => !process.env[e]);
      if (missingEnvs.length === 0) {
        ready.push(`${name} ✅`);
      } else {
        needKey.push({ name, missing: missingEnvs });
      }
    }
  }

  for (const name of NO_KEY_SERVERS) {
    if (serverNames.includes(name)) {
      console.log(`  ✅ ${name}`);
    }
  }

  console.log('\n🔑 APIキー必要 — 設定済み');
  let hasConfigured = false;
  for (const name of serverNames) {
    if (!NO_KEY_SERVERS.includes(name) && REQUIRED_ENVS[name]) {
      const envs = REQUIRED_ENVS[name];
      const missingEnvs = envs.filter(e => !process.env[e]);
      if (missingEnvs.length === 0) {
        console.log(`  ✅ ${name}`);
        hasConfigured = true;
      }
    }
  }
  if (!hasConfigured) console.log('  （なし）');

  console.log('\n⚠️  APIキー未設定（利用不可）');
  let hasUnconfigured = false;
  for (const { name, missing: missingEnvs } of needKey) {
    console.log(`  ❌ ${name}`);
    for (const e of missingEnvs) {
      console.log(`       → ${e} が未設定`);
    }
    hasUnconfigured = true;
  }
  if (!hasUnconfigured) console.log('  （なし — 全サーバー設定済み）');

  // Google Drive OAuth ファイルチェック
  const gdriveFile = path.join(process.env.HOME || '~', '.config/mcp/gdrive-credentials.json');
  console.log('\n📁 Google Drive OAuth');
  if (fs.existsSync(gdriveFile)) {
    console.log(`  ✅ ${gdriveFile}`);
  } else {
    console.log(`  ❌ ${gdriveFile} が見つかりません`);
    console.log('     → docs/MCP_SETUP.md の "Google Drive 認証" セクションを参照');
  }

  // Obsidian vault チェック
  const vaultPath = path.join(__dirname, '../knowledge-vault');
  console.log('\n📚 Obsidian Vault');
  if (fs.existsSync(vaultPath)) {
    const noteCount = fs.readdirSync(vaultPath + '/notes/academic', { recursive: true })
      .filter(f => f.endsWith('.md')).length;
    console.log(`  ✅ knowledge-vault/ (${noteCount}+ ノート)`);
  } else {
    console.log('  ❌ knowledge-vault/ が見つかりません (npm run vault:build を実行)');
  }

  // ツールの存在チェック
  console.log('\n🔧 依存ツール');
  for (const [tool, cmd] of [['uvx', 'uvx --version'], ['npx', 'npx --version'], ['node', 'node --version']]) {
    try {
      const v = execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
      console.log(`  ✅ ${tool} ${v}`);
    } catch {
      console.log(`  ❌ ${tool} が見つかりません`);
    }
  }

  console.log('\n📖 設定方法: docs/MCP_SETUP.md を参照\n');

  const configured = serverNames.length - needKey.length;
  console.log(`合計: ${serverNames.length}サーバー中 ${configured}サーバー利用可能`);
}

main();
