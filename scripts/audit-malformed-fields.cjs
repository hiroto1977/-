#!/usr/bin/env node
'use strict';
/**
 * **正しい行 + 1 欄だけ壊す走査**を走らせる (2026-09-24 · パス 441)。
 *
 * 定期点検の道具の 6 本目 (`audit:tick-sensitivity` / `audit:survivors` /
 * `audit:e2e-wait-margin` / `audit:floors` / `audit:regex-poly` と同じ家系)。
 * **CI では走らせない** —— 実測で 175 組 × 74 画面 = 12,950 回の描画で数分かかる。
 *
 * 走査そのものは `src/renderer/__audits__/malformedFieldSweep.audit.ts` に在り、
 * `vitest.audit.config.ts` だけが拾う (既定の `include` の外なので `npm test` は動かない)。
 * ここがするのは「走らせて、読める形で答えを出す」ことだけである。
 */
const { spawnSync } = require('node:child_process');

const AUDIT_CONFIG = 'vitest.audit.config.ts';

/**
 * vitest の出力から結論を読む。
 *
 * **非 0 終了を全部「失敗」と読まない** —— `audit:survivors` がパス 430 で
 * 踏んだ当のことで、時間切れも読み込み失敗も同じ答えになると
 * 道具が壊れていることが結論の形をとって消える。
 */
function verdict(status, out) {
  if (/Tests\s+\d+\s+passed/.test(out) && !/Tests\s+\d+\s+failed/.test(out)) return 'pass';
  if (/Tests\s+\d+\s+failed/.test(out)) return 'fail';
  if (status === 0) return 'pass';
  return 'error';
}

function selfTest() {
  const cases = [
    ['pass', 0, ' Test Files  1 passed (1)\n      Tests  1 passed (1)'],
    ['fail', 1, ' Test Files  1 failed (1)\n      Tests  1 failed (1)'],
    // 読み込みに失敗すると「Tests」の行が出ない —— 0 件は緑ではない (パス 412)。
    ['error', 1, 'Error: Transform failed with 1 error'],
    ['error', 1, ' Test Files  no tests\n'],
  ];
  let bad = 0;
  for (const [want, status, out] of cases) {
    const got = verdict(status, out);
    if (got !== want) {
      bad += 1;
      console.error(`✗ verdict: want ${want}, got ${got} — ${JSON.stringify(out.slice(0, 40))}`);
    }
  }
  if (bad === 0) console.log('✅ self-test 全件一致');
  return bad === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const r = spawnSync('npx', ['vitest', 'run', '--config', AUDIT_CONFIG, '--reporter=verbose'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const v = verdict(r.status, out);
  const line = out.split('\n').find((l) => l.includes('[audit]'));
  if (line) console.log(line.trim());
  if (v === 'pass') {
    console.log('✅ 正しい行 + 1 欄だけ壊す走査: 投げた画面 0');
    return 0;
  }
  console.error(out.slice(-6000));
  console.error(v === 'fail' ? '❌ 投げた画面が在る (上の一覧)' : '❌ 走査そのものが走っていない (道具の側の誤り)');
  return 1;
}

process.exit(main());
