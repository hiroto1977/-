#!/usr/bin/env node
'use strict';
// Rust → Wasm の検算役 (tools/mamori-verify) を組み、出どころの台帳 tools/mamori-verify/BUILD.json を書く。
// 既定 = cargo で組んで dist/ へ置き、4 ファイルの sha256 を BUILD.json へ。`--check` = 組まずに台帳と実物を突き合わせる。
// 成果物 (wasm) は追跡に入れるが、**ソースと台帳の sha256 で出どころを縛る** (rustMirror の検査が毎回 npm test で見る)。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'tools/mamori-verify');
const FILES = [
  'tools/mamori-verify/Cargo.lock',
  'tools/mamori-verify/Cargo.toml',
  'tools/mamori-verify/dist/mamori_verify.wasm',
  'tools/mamori-verify/src/lib.rs',
];
const sha = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

if (process.argv.includes('--check')) {
  const want = JSON.parse(fs.readFileSync(path.join(DIR, 'BUILD.json'), 'utf8')).files;
  let bad = 0;
  for (const rel of FILES) {
    if (want[rel] !== sha(rel)) {
      console.error(`✗ ${rel}: 台帳と食い違います (組み直して BUILD.json を更新してください)`);
      bad++;
    }
  }
  if (bad > 0) process.exit(1);
  console.log(`✅ mamori-verify: ${FILES.length} ファイルが BUILD.json どおりです`);
  process.exit(0);
}

execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown', '--locked', '--manifest-path', path.join(DIR, 'Cargo.toml')], { stdio: 'inherit' });
fs.mkdirSync(path.join(DIR, 'dist'), { recursive: true });
fs.copyFileSync(path.join(DIR, 'target/wasm32-unknown-unknown/release/mamori_verify.wasm'), path.join(DIR, 'dist/mamori_verify.wasm'));
const files = {};
for (const rel of FILES) files[rel] = sha(rel);
fs.writeFileSync(
  path.join(DIR, 'BUILD.json'),
  JSON.stringify({ tool: 'mamori-verify', rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(), target: 'wasm32-unknown-unknown', files }, null, 2) + '\n',
);
console.log('✅ BUILD.json を書きました');
