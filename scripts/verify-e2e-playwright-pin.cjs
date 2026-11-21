#!/usr/bin/env node
'use strict';
/*
 * e2e.yml が lockfile の外で入れる playwright の **integrity を固定する**
 * (2026-10-19 · パス 536 · threat: T-125)。
 *
 * `npm install --no-save playwright@1.56.1` は**版**を固定するが、取得した tarball が
 * 想定した物かは誰も見ない —— lockfile に行が無いので npm は registry が答えた integrity を
 * そのまま信じて `node_modules/.package-lock.json` に書くだけである。registry 側の差し替え
 * (版の上書きは npm では禁じられているが、取得元の入れ替わり・中間者は別の話) を
 * この 1 本が見る。install した直後に、実際に入った 2 つ (playwright / playwright-core) の
 * `resolved` と `integrity` を台帳と突き合わせる。
 *
 * 台帳の値は 2026-10-19 に registry から**実測**した (`npm install --no-save --ignore-scripts`
 * の `.package-lock.json`)。つまり初回は registry を信じた値で、守れるのは**その後の差し替え**
 * である (trust on first use)。版を上げるときは台帳の値も実測して書き換える。
 *
 * 判定は純関数 `check` で、入口は `node scripts/verify-e2e-playwright-pin.cjs`
 * (`--self-test` で自己検査)。外へは何も送らず、子プロセスも使わない。
 */
const fs = require('node:fs');
const path = require('node:path');

const VERSION = '1.56.1';
const PINS = {
  'node_modules/playwright': {
    resolved: `https://registry.npmjs.org/playwright/-/playwright-${VERSION}.tgz`,
    integrity: 'sha512-aFi5B0WovBHTEvpM3DzXTUaeN6eN0qWnTkKx4NQaH4Wvcmc153PdaY2UBdSYKaGYw+UyWXSVyxDUg5DoPEttjw==',
  },
  'node_modules/playwright-core': {
    resolved: `https://registry.npmjs.org/playwright-core/-/playwright-core-${VERSION}.tgz`,
    integrity: 'sha512-hutraynyn31F+Bifme+Ps9Vq59hKuUCz7H1kDOcBs+2oGguKkWTU50bBWrtz34OUWmIwpBTWDxaRPXrIXkgvmQ==',
  },
};

/**
 * 実際に入った物の写し (`node_modules/.package-lock.json` の JSON) を台帳と照らし、問題の文を返す。
 * `repoLock` はリポジトリの `package-lock.json` (`npm ci` が入れた物の基準)。この workflow は
 * `npm ci` の**後**に入れるので、隠し lockfile はプロジェクト全体を含む —— 「台帳に無い物」を
 * 基準にすると毎回落ちる (2026-10-19 に実物の木で測って気付いた)。見るのは
 * 「リポジトリの lockfile にも台帳にも無い物」= playwright の導入で**新しく増えた**物だけ。
 */
function check(lock, repoLock) {
  const problems = [];
  const pkgs = lock && typeof lock === 'object' && lock.packages && typeof lock.packages === 'object' ? lock.packages : null;
  if (pkgs === null) return ['`.package-lock.json` の packages が読めません (台帳と照合できない)'];
  for (const [key, want] of Object.entries(PINS)) {
    const got = Object.hasOwn(pkgs, key) ? pkgs[key] : undefined;
    if (got === undefined || got === null || typeof got !== 'object') {
      problems.push(`${key} が入っていません`);
      continue;
    }
    if (got.version !== VERSION) problems.push(`${key} の版が ${String(got.version)} (台帳は ${VERSION})`);
    if (got.resolved !== want.resolved) problems.push(`${key} の取得元が台帳と違います: ${String(got.resolved)}`);
    if (got.integrity !== want.integrity) problems.push(`${key} の integrity が台帳と違います: ${String(got.integrity)}`);
  }
  // 導入で依存が増えたら (playwright が別の package を引き始めたら) 気付く —— 無言で受けない。
  const base = repoLock && typeof repoLock === 'object' && repoLock.packages && typeof repoLock.packages === 'object' ? repoLock.packages : null;
  if (base === null) {
    problems.push('リポジトリの package-lock.json の packages が読めません (増えた依存を判定できない)');
    return problems;
  }
  for (const key of Object.keys(pkgs)) {
    if (key !== '' && !Object.hasOwn(PINS, key) && !Object.hasOwn(base, key)) {
      problems.push(`lockfile にも台帳にも無いパッケージが入っています: ${key}`);
    }
  }
  return problems;
}

function selfTest() {
  let bad = 0;
  const ok = (name, cond) => {
    if (!cond) {
      bad++;
      console.error(`✗ ${name}`);
    }
  };
  const good = () => ({ packages: Object.fromEntries(Object.entries(PINS).map(([k, v]) => [k, { version: VERSION, ...v }])) });
  const repo = { packages: { '': {}, 'node_modules/react': { version: '18.3.1' } } };
  ok('実物どおりなら問題なし', check(good(), repo).length === 0);
  const withProject = good();
  withProject.packages['node_modules/react'] = { version: '18.3.1' };
  ok('npm ci の後の木 (プロジェクトの依存を含む) でも落とさない', check(withProject, repo).length === 0);
  const tamper = good();
  tamper.packages['node_modules/playwright-core'].integrity = 'sha512-AAAA';
  ok('integrity が違えば落とす', check(tamper, repo).some((p) => p.includes('playwright-core') && p.includes('integrity')));
  const moved = good();
  moved.packages['node_modules/playwright'].resolved = 'https://evil.example/playwright-1.56.1.tgz';
  ok('取得元が違えば落とす', check(moved, repo).some((p) => p.includes('取得元')));
  const ver = good();
  ver.packages['node_modules/playwright'].version = '1.57.0';
  ok('版が違えば落とす', check(ver, repo).some((p) => p.includes('版')));
  const missing = good();
  delete missing.packages['node_modules/playwright-core'];
  ok('入っていなければ落とす', check(missing, repo).some((p) => p.includes('入っていません')));
  const extra = good();
  extra.packages['node_modules/left-pad'] = { version: '1.3.0' };
  ok('増えた依存を無言で受けない', check(extra, repo).some((p) => p.includes('left-pad')));
  ok('基準の lockfile が読めなければ落とす (緑にしない)', check(good(), null).length > 0 && check(good(), {}).length > 0);
  ok('packages が無ければ落とす (緑にしない)', check({}, repo).length > 0 && check(null, repo).length > 0 && check({ packages: 3 }, repo).length > 0);
  const proto = { packages: JSON.parse('{"__proto__":{"x":1}}') };
  ok('prototype の鍵で台帳を満たさない', check(proto, repo).length > 0);
  if (bad > 0) {
    console.error(`${bad} 件の自己検査が失敗`);
    process.exit(1);
  }
  console.log('✅ verify-e2e-playwright-pin self-test 全件一致');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const file = path.resolve('node_modules/.package-lock.json');
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ ${file} が読めません: ${e instanceof Error ? e.message : 'unknown'}`);
    process.exit(2);
  }
  let repoLock;
  try {
    repoLock = JSON.parse(fs.readFileSync(path.resolve('package-lock.json'), 'utf8'));
  } catch (e) {
    console.error(`❌ package-lock.json が読めません: ${e instanceof Error ? e.message : 'unknown'}`);
    process.exit(2);
  }
  const problems = check(lock, repoLock);
  if (problems.length > 0) {
    for (const p of problems) console.error(`❌ ${p}`);
    process.exit(1);
  }
  console.log(`✅ playwright ${VERSION} の integrity が台帳どおりです (${Object.keys(PINS).length} パッケージ)`);
}

if (require.main === module) main();
module.exports = { check, PINS, VERSION };
