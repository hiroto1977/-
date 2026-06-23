#!/usr/bin/env node
/* eslint-disable */
/**
 * User-facing UI copy language checker.
 *
 * Service Hub is a Japanese-facing dashboard. This lint codifies the most
 * important entry point: every service shown in the sidebar/topbar must have
 * Japanese explanatory copy, and labels may be English-only only when they are
 * official product names.
 *
 * Run via:  node scripts/lint-ui-copy.cjs
 *           npm run lint:ui-copy
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const JAPANESE_RE = /[ぁ-んァ-ヶ一-龠々ー]/;

// English-only labels are allowed only for official product/brand names.
// Local features and generic capabilities must use Japanese labels.
const OFFICIAL_BRAND_LABELS = new Set([
  'github',
  'wordpress',
  'atlassian',
  'notion',
  'drive',
  'calendar',
  'gmail',
  'slack',
  'canva',
  'cloudflare',
  'ollama',
  'microsoft-365',
  'dropbox',
  'salesforce',
  'discord',
  'asana',
  'linear',
  'sentry',
  'shopify',
  'stripe',
  'line',
  'base',
  'netsea',
  'topseller',
  'a8net',
  'amazon',
  'youtube',
  'tiktok',
  'freee',
  'linux',
  'obsidian',
  'docker',
]);

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function serviceEntries(src) {
  const entries = [];
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*icon:\s*'[^']+'\s*,\s*description:\s*'([^']*)'\s*,/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    entries.push({
      id: match[1],
      label: match[2],
      description: match[3],
    });
  }
  return entries;
}

function categoryLabels(src) {
  const m = src.match(/CATEGORY_LABEL[\s\S]*?\{([\s\S]*?)\};/);
  if (!m) return [];
  return [...m[1].matchAll(/^\s*([a-z]+):\s*'([^']+)'/gm)].map((x) => ({
    key: x[1],
    label: x[2],
  }));
}

function main() {
  const failures = [];
  const servicesSrc = read('src/renderer/services.ts');
  const entries = serviceEntries(servicesSrc);

  if (entries.length === 0) {
    failures.push('src/renderer/services.ts: service entries could not be parsed');
  }

  for (const { key, label } of categoryLabels(servicesSrc)) {
    if (!JAPANESE_RE.test(label)) {
      failures.push(`CATEGORY_LABEL.${key} must be Japanese, got "${label}"`);
    }
  }

  for (const entry of entries) {
    const labelHasJapanese = JAPANESE_RE.test(entry.label);
    const isAllowedBrand = OFFICIAL_BRAND_LABELS.has(entry.id);
    if (!labelHasJapanese && !isAllowedBrand) {
      failures.push(
        `${entry.id}: sidebar label "${entry.label}" is English-only; use Japanese or add a documented official-brand exception`,
      );
    }
    if (!JAPANESE_RE.test(entry.description)) {
      failures.push(
        `${entry.id}: sidebar description must contain Japanese copy, got "${entry.description}"`,
      );
    }
  }

  const appSrc = read('src/renderer/App.tsx');
  const forbiddenLegacyCopy = [
    ['aria-label="locked"', 'aria-label for the lock icon must be Japanese'],
    ['build: ALL-ACCESS', 'sidebar footer build label must be Japanese'],
  ];
  for (const [needle, reason] of forbiddenLegacyCopy) {
    if (appSrc.includes(needle)) {
      failures.push(`src/renderer/App.tsx contains "${needle}" — ${reason}`);
    }
  }

  console.log(`Checked ${entries.length} sidebar service labels/descriptions for Japanese UI copy`);
  if (failures.length === 0) {
    console.log('✅ UI copy language rules passed');
    return 0;
  }

  console.error(`❌ ${failures.length} UI copy issue(s):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  return 1;
}

process.exit(main());
