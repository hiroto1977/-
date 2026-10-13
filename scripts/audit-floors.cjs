#!/usr/bin/env node
'use strict';

/*
 * **セキュリティの床を、勧告データベースに当てて測り直す** (`npm run audit:floors`)。
 *
 * ## なぜ別の道具なのか
 *
 * `lint:deps` の規則 7 は**ネットワークに出ない**。出ないので確かめられるのは
 * 「床が下がっていないか」までで、「**床がまだ十分に高いか**」は分からない。
 *
 * この差が実害になったのを 2026-09-10 に測った。`qs` の床は 2026-08-17 に
 * `^6.15.2` で据えられたが、その後に出た 2 件 (GHSA-x5fp-wj9c-mxmx / <=6.15.3 と
 * GHSA-4mjr-xmp4-gh2g / <6.16.0) が 6.15.2 と 6.15.3 を覆っていた。
 * **床が許す版が脆弱**という状態が 24 日で成立していたのに、lockfile が
 * たまたま 6.16.0 に解決されていたので `npm audit` は緑のままだった。
 * 「押さえてある」と書いてあるだけで、押さえていなかった。
 *
 * ## 何をするか
 *
 * 床ごとに、**その床ちょうどの版だけを持つ使い捨ての依存関係**を作って
 * `npm audit` に掛ける。床が十分なら 0 件、低すぎればそこに出る。
 * 台帳が記録している勧告 ID との差も並べる (増えた = 床の据え直し、
 * 消えた = 台帳の古い行)。
 *
 * `verify:all` にも CI にも入れない —— 勧告は日々変わるので、無関係な PR が
 * 赤くなると「赤を無視する習慣」がつく (`ci.yml` の注記と同じ判断)。
 * これは**人が定期に回す道具**で、`docs/SECURITY_AUDIT.md` の定期点検に載せる。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { SECURITY_FLOORS } = require('./lint-dependencies.cjs');

/** `npm audit --json` の中身 → その版に当たっている勧告 ID の一覧。 */
function advisoryIds(report) {
  const vulns = report?.vulnerabilities;
  if (vulns === null || typeof vulns !== 'object') return null; // 読めない = 測れていない
  const ids = new Set();
  for (const v of Object.values(vulns)) {
    for (const via of v?.via ?? []) {
      if (typeof via === 'string') continue;
      const url = String(via?.url ?? '');
      const id = url.slice(url.lastIndexOf('/') + 1);
      if (id.startsWith('GHSA-')) ids.add(id);
    }
  }
  return [...ids].sort();
}

/** 床ちょうどの版だけを持つ使い捨ての依存関係を作り、audit に掛ける。 */
function measure(floor, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'floor-probe', version: '1.0.0', dependencies: { [floor.package]: floor.atLeast } }),
  );
  // `--legacy-peer-deps` は peer 依存を解決しない。ここでは**通常の依存**だけ見れば足りる
  // (勧告は依存側にある —— 例: vitest → @vitest/mocker の GHSA-82fw-gwwq-j7x9)。
  // 付けているのは npm の解決器の不具合を避けるためで、vitest は
  // `peerOptional @vitest/coverage-v8@"<自分と同じ版>"` を持つため、それを解こうとすると
  // `Cannot read properties of null (reading 'edgesOut')` で落ちる (2026-09-10 実測)。
  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--silent', '--no-audit', '--no-fund', '--legacy-peer-deps'],
    { cwd: dir, stdio: 'ignore' },
  );
  // `npm audit` は勧告が在れば exit 1 を返すので、出力を取ってから読む。
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json'], { cwd: dir, encoding: 'utf8' });
  } catch (err) {
    out = String(err?.stdout ?? '');
  }
  return advisoryIds(JSON.parse(out));
}

/**
 * 床を全件測る。**印字せずに結果を返す** —— 週次の報告 (`dependency-audit.yml`)
 * が同じ測定を使うため。実装を 2 つ持つと片方が腐る。
 *
 * 戻り値の `status`:
 *   `ok`         床は今日の勧告を通さない
 *   `too-low`    床ちょうどの版に勧告が当たる (床を上げる)
 *   `unmeasured` 勧告データベースへ出られなかった / 出力を読めなかった
 */
function probeFloors(floors = SECURITY_FLOORS) {
  if (floors.length === 0) return null; // 走査の死。呼び手が落とす
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'floor-probe-'));
  try {
    return floors.map((floor) => {
      const recorded = [...(floor.advisories ?? [])].sort();
      let hits;
      try {
        hits = measure(floor, path.join(root, floor.package.replace(/[^\w.-]/g, '_')));
      } catch (err) {
        return {
          package: floor.package,
          atLeast: floor.atLeast,
          checkedOn: floor.checkedOn,
          recorded,
          hits: [],
          status: 'unmeasured',
          detail: String(err?.message ?? err),
        };
      }
      if (hits === null) {
        return {
          package: floor.package,
          atLeast: floor.atLeast,
          checkedOn: floor.checkedOn,
          recorded,
          hits: [],
          status: 'unmeasured',
          detail: 'npm audit の出力を読めませんでした',
        };
      }
      return {
        package: floor.package,
        atLeast: floor.atLeast,
        checkedOn: floor.checkedOn,
        recorded,
        hits,
        status: hits.length > 0 ? 'too-low' : 'ok',
        detail: '',
      };
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const results = probeFloors();
  if (results === null) {
    console.error('❌ 床の台帳が空です (走査の不具合を疑ってください)');
    return 1;
  }
  let low = 0;
  let unmeasured = 0;
  for (const r of results) {
    if (r.status === 'unmeasured') {
      unmeasured += 1;
      console.error(
        `❌ ${r.package}@${r.atLeast} を測れませんでした (${r.detail})。\n` +
          '   勧告データベースへ出られない環境では測れません — この道具は緑になりません',
      );
      continue;
    }
    if (r.status === 'too-low') {
      low += 1;
      console.error(
        `❌ ${r.package} の床 ${r.atLeast} は低すぎます — その版に ${r.hits.length} 件の勧告が当たります:\n` +
          r.hits.map((h) => `     https://github.com/advisories/${h}`).join('\n') +
          '\n   床を上げ (package.json と SECURITY_FLOORS の atLeast)、checkedOn を今日にしてください',
      );
      continue;
    }
    console.log(
      `✅ ${r.package}@${r.atLeast}: 勧告 0 件 (台帳 ${r.recorded.length} 件: ${r.recorded.join(' / ')})`,
    );
    console.log(`   (checkedOn ${String(r.checkedOn)} —— 台帳の勧告はこの床で解消済み)`);
  }
  if (unmeasured > 0) return 2;
  if (low > 0) {
    console.error(`\n❌ 低すぎる床 ${low} 件`);
    return 1;
  }
  console.log(`\n✅ セキュリティの床 ${results.length} 件はいずれも今日の勧告を通しません`);
  console.log('   測り直したら SECURITY_FLOORS の checkedOn を今日に更新してください');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { advisoryIds, probeFloors };
