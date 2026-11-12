#!/usr/bin/env node
// プロジェクト進捗状況レポート（日本語）
// 使用法: npm run progress
// 軽量: typecheck/test は実行せず、ファイルシステムと git から即座に集計

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function countPattern(dir, re) {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        const matches = text.match(re);
        if (matches) total += matches.length;
      }
    }
  };
  try { walk(path.join(ROOT, dir)); } catch { /* ignore */ }
  return total;
}

function countFiles(dir, ext) {
  let total = 0;
  const walk = (d) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (full.endsWith(ext)) total++;
      }
    } catch { /* ignore */ }
  };
  walk(path.join(ROOT, dir));
  return total;
}

// ─── Git 状態 ───
const branch = sh('git rev-parse --abbrev-ref HEAD') || '(不明)';
const headFull = sh('git log --oneline -1') || '(コミットなし)';
const headSha = headFull.split(' ')[0];
const headMsg = headFull.substring(headSha.length + 1);
const statusRaw = sh('git status --short');
const isDirty = statusRaw.length > 0;
const modifiedCount = isDirty ? statusRaw.split('\n').length : 0;
const aheadBehind = sh('git rev-list --left-right --count HEAD...origin/main 2>/dev/null');
const [ahead, behind] = aheadBehind ? aheadBehind.split('\t').map(Number) : [0, 0];

// ─── サービス数 ───
let serviceCount = '?';
try {
  const sid = fs.readFileSync(path.join(ROOT, 'src/shared/serviceId.ts'), 'utf8');
  const m = sid.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (m) serviceCount = (m[1].match(/'[a-z][a-z0-9-]*'/g) || []).length;
} catch { /* ignore */ }

// ─── 学術概念数 ───
let conceptCount = '?';
let latestBatch = '';
try {
  const ak = fs.readFileSync(path.join(ROOT, 'src/renderer/data/academicKnowledge.ts'), 'utf8');
  const ids = ak.match(/id: '/g);
  if (ids) conceptCount = ids.length;
  const batchMatch = sh("git log --oneline --all --grep='Batch' -1");
  if (batchMatch) latestBatch = batchMatch;
} catch { /* ignore */ }

// ─── Knowledge Vault ───
let vaultFiles = 0;
const vaultDir = path.join(ROOT, 'knowledge-vault');
if (fs.existsSync(vaultDir)) {
  vaultFiles = countFiles('knowledge-vault', '.md');
}

// ─── テスト数 (静的カウント) ───
const testCount = countPattern('src', /^\s*it\(/gm);

// ─── MCP サーバー ───
let mcpTotal = 0;
let mcpNoKey = 0;
let mcpWithKey = 0;
try {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const servers = Object.keys(settings.mcpServers || {});
  mcpTotal = servers.length;
  const noKeyServers = [
    'filesystem', 'git', 'sqlite', 'time', 'fetch',
    'memory', 'sequential-thinking', 'context7',
    'playwright', 'docker', 'obsidian', 'shopify',
  ];
  for (const s of servers) {
    if (noKeyServers.includes(s)) mcpNoKey++;
    else mcpWithKey++;
  }
} catch { /* ignore */ }

// ─── 直近のコミット履歴 ───
const recentCommits = sh('git log --oneline -5 --format="%h %s"');

// ─── ソースファイル数 ───
const tsFiles = countFiles('src', '.ts') + countFiles('src', '.tsx');

// ─── 分野別概念数 ───
const disciplines = { economics: 0, management: 0, 'human-science': 0, 'business-law': 0, 'information-sociology': 0 };
const disciplineLabels = {
  economics: '経済学',
  management: '経営学',
  'human-science': '人間科学',
  'business-law': '商法',
  'information-sociology': '情報社会学',
};
try {
  const ak = fs.readFileSync(path.join(ROOT, 'src/renderer/data/academicKnowledge.ts'), 'utf8');
  for (const key of Object.keys(disciplines)) {
    const re = new RegExp(`discipline: '${key}'`, 'g');
    const matches = ak.match(re);
    if (matches) disciplines[key] = matches.length;
  }
} catch { /* ignore */ }

// ─── standalone.html サイズ ───
function getStandaloneSize() {
  try {
    const stat = fs.statSync(path.join(ROOT, 'dist/standalone.html'));
    return `${Math.round(stat.size / 1024).toLocaleString()} KB`;
  } catch {
    return '未ビルド';
  }
}
const standaloneSize = getStandaloneSize();

// ─── 出力 ───
const W = 50;
const sep = '─'.repeat(W);

console.log();
console.log(`╔${'═'.repeat(W)}╗`);
console.log(`║${'  📊 プロジェクト進捗レポート'.padEnd(W + 13)}║`);
console.log(`╚${'═'.repeat(W)}╝`);

console.log();
console.log(`┌${sep}┐`);
console.log(`│  🔀 Git 状態${' '.repeat(W - 14)}│`);
console.log(`├${sep}┤`);
console.log(`│  ブランチ:   ${branch.padEnd(W - 15)}│`);
console.log(`│  HEAD:       ${headSha.padEnd(W - 15)}│`);
console.log(`│  最新:       ${headMsg.substring(0, W - 16).padEnd(W - 15)}│`);
console.log(`│  作業ツリー: ${(isDirty ? `${modifiedCount} ファイル変更あり` : '✅ クリーン').padEnd(W - 15)}│`);
console.log(`│  main比較:   ${(`↑${ahead} 先行  ↓${behind} 遅延`).padEnd(W - 15)}│`);
console.log(`└${sep}┘`);

console.log();
console.log(`┌${sep}┐`);
console.log(`│  📚 学術知識パイプライン${' '.repeat(W - 24)}│`);
console.log(`├${sep}┤`);
console.log(`│  概念総数:     ${String(conceptCount).padEnd(W - 17)}│`);
console.log(`│  Vault:        ${(`${vaultFiles} ファイル`).padEnd(W - 17)}│`);
if (latestBatch) {
  console.log(`│  最新バッチ:   ${latestBatch.substring(0, W - 18).padEnd(W - 17)}│`);
}
console.log(`│${' '.repeat(W)}│`);
console.log(`│  【分野別内訳】${' '.repeat(W - 16)}│`);
for (const [key, count] of Object.entries(disciplines)) {
  const label = disciplineLabels[key];
  const bar = '█'.repeat(Math.round(count / (Number(conceptCount) || 1) * 30));
  console.log(`│  ${label.padEnd(8)} ${String(count).padStart(4)}件 ${bar.padEnd(W - 20)}│`);
}
console.log(`└${sep}┘`);

console.log();
console.log(`┌${sep}┐`);
console.log(`│  🏗️  プロジェクト規模${' '.repeat(W - 22)}│`);
console.log(`├${sep}┤`);
console.log(`│  サービス:      ${String(serviceCount).padEnd(W - 18)}│`);
console.log(`│  テスト(静的):  ${(`${testCount.toLocaleString()} it()`).padEnd(W - 18)}│`);
console.log(`│  ソースファイル: ${(`${tsFiles} .ts/.tsx`).padEnd(W - 19)}│`);
console.log(`│  standalone:    ${standaloneSize.padEnd(W - 18)}│`);
console.log(`└${sep}┘`);

console.log();
console.log(`┌${sep}┐`);
console.log(`│  🔌 MCP サーバー設定${' '.repeat(W - 21)}│`);
console.log(`├${sep}┤`);
console.log(`│  合計:          ${(`${mcpTotal} サーバー`).padEnd(W - 18)}│`);
console.log(`│  API不要:       ${(`${mcpNoKey} （即使用可能）`).padEnd(W - 18)}│`);
console.log(`│  APIキー必要:   ${(`${mcpWithKey} サーバー`).padEnd(W - 18)}│`);
console.log(`└${sep}┘`);

console.log();
console.log(`┌${sep}┐`);
console.log(`│  📝 直近のコミット${' '.repeat(W - 19)}│`);
console.log(`├${sep}┤`);
for (const line of recentCommits.split('\n').slice(0, 5)) {
  if (line.trim()) {
    console.log(`│  ${line.substring(0, W - 3).padEnd(W - 2)}│`);
  }
}
console.log(`└${sep}┘`);

console.log();
console.log(`💡 品質ゲート実行: npm run typecheck && npm test && npm run verify:all`);
console.log(`💡 MCP 設定確認:   npm run mcp:check`);
console.log();
