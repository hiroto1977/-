#!/usr/bin/env node
'use strict';
/*
 * **`verify:all` を止まらずに全ゲート回して、落ちた物を一度に挙げる** (定期点検の道具・CI では走らせない)。
 *
 * `verify:all` は `npm run a && npm run b && …` なので、**最初に落ちたゲートで止まる**。
 * 直して回し直すたびに次の落ちるゲートが見える —— パス 525 では verify:arch (行ずれ 6 件) →
 * lint:mutation-scope (Stryker の帯の延長) → lint:shared-judgement (census の再生成) →
 * chain:verify (保護対象の編集後に chain:append していない) と、**4 回に分けて 1 件ずつ**見つかった
 * (どれも数秒で判る設計どおりの鳴り方だった。遅かったのは見つけ方のほう)。
 *
 * 使い方:
 *   npm run audit:verify-keep-going                  # 39 ゲート全部 (実測 約 270 秒)
 *   npm run audit:verify-keep-going -- --fast        # 重い 5 本 (HEAVY) を飛ばす (実測 約 80 秒)
 *   npm run audit:verify-keep-going -- lint:docs,chain:verify   # 名指しの数本だけ
 * `--fast` は **push 前の最終確認ではない** (飛ばした 5 本は `npm run verify:all` で必ず通す)。
 * 編集のたびに回して、census / 台帳 / 行ずれ / 鎖の食い違いを先に潰すための物。
 * 母集団は `package.json` の `verify:all` から導く (手で並べない) ので、ゲートが増えても追随する。
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** `--fast` で飛ばすゲート (実測 2026-10-16: typecheck 53 s / lint 64 s / lint:regex 30 s / verify:graph 25 s / vault:check 17 s)。 */
const HEAVY = ['typecheck', 'lint', 'lint:regex', 'verify:graph', 'vault:check'];

/** `verify:all` の本文を、ゲート名の並びにする。`npm run X` の連結以外の形は断る (黙って読み飛ばさない)。 */
function parseSteps(script) {
  const out = [];
  for (const raw of String(script).split('&&')) {
    const m = /^npm run ([\w:.-]+)$/.exec(raw.trim());
    if (m === null) throw new Error(`verify:all に \`npm run X\` でない段が在る: ${JSON.stringify(raw.trim())}`);
    out.push(m[1]);
  }
  if (out.length === 0) throw new Error('verify:all が空');
  return out;
}

/** 実行する段を選ぶ。名指しは母集団に在る物だけ (知らない名前は落とす —— 黙って 0 本にしない)。 */
function selectSteps(steps, { fast, only }) {
  if (only !== null && only.length > 0) {
    const unknown = only.filter((g) => !steps.includes(g));
    if (unknown.length > 0) throw new Error(`verify:all に無いゲート: ${unknown.join(', ')}`);
    return steps.filter((g) => only.includes(g));
  }
  return fast ? steps.filter((g) => !HEAVY.includes(g)) : steps.slice();
}

/** 結果の行を作る。落ちたゲートが 1 つでもあれば `failed` が空でない。 */
function summarize(rows) {
  const failed = rows.filter((r) => r.code !== 0).map((r) => r.gate);
  return { failed, total: rows.length, seconds: rows.reduce((a, r) => a + r.sec, 0) };
}

function selfTest() {
  let bad = 0;
  const eq = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  };
  eq('連結を分ける', parseSteps('npm run a && npm run b:c'), ['a', 'b:c']);
  let threw = false;
  try {
    parseSteps('npm run a && node x.js');
  } catch {
    threw = true;
  }
  eq('npm run でない段は断る', threw, true);
  eq('--fast は HEAVY を飛ばす', selectSteps(['typecheck', 'x', 'lint'], { fast: true, only: null }), ['x']);
  eq('名指しは並びを保つ', selectSteps(['a', 'b', 'c'], { fast: false, only: ['c', 'a'] }), ['a', 'c']);
  threw = false;
  try {
    selectSteps(['a'], { fast: false, only: ['zzz'] });
  } catch {
    threw = true;
  }
  eq('知らないゲートの名指しは断る', threw, true);
  eq('落ちた物を挙げる', summarize([{ gate: 'a', code: 0, sec: 1 }, { gate: 'b', code: 1, sec: 2 }]).failed, ['b']);
  const real = parseSteps(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts['verify:all']);
  eq('実物の verify:all を読める (床 30 本)', real.length >= 30, true);
  eq('HEAVY はどれも実在する (古びない)', HEAVY.filter((g) => !real.includes(g)), []);
  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件が違います`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main(argv) {
  const fast = argv.includes('--fast');
  const names = argv.filter((a) => !a.startsWith('--'));
  const only = names.length > 0 ? names.join(',').split(',').filter(Boolean) : null;
  const steps = selectSteps(parseSteps(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts['verify:all']), { fast, only });
  const rows = [];
  const tails = [];
  for (const gate of steps) {
    const t = Date.now();
    const r = spawnSync('npm', ['run', gate], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    const sec = (Date.now() - t) / 1000;
    rows.push({ gate, code: r.status ?? 1, sec });
    console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${gate} ${sec.toFixed(1)}s`);
    if (r.status !== 0) {
      const lines = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter((l) => l.trim() !== '');
      // 最初の失敗の印から 12 行 (印だけを抜くと「何が」の行が落ちる)。印が無ければ末尾 12 行。
      const first = lines.findIndex((l) => /❌|✗|FAIL|Error/.test(l));
      tails.push({ gate, lines: first >= 0 ? lines.slice(first, first + 12) : lines.slice(-12) });
    }
  }
  const s = summarize(rows);
  for (const t of tails) {
    console.log(`\n--- ${t.gate} ---`);
    for (const l of t.lines) console.log(l.slice(0, 300));
  }
  console.log(`\n${s.failed.length === 0 ? '✅' : '❌'} 落ちたゲート ${s.failed.length}/${s.total}: ${s.failed.join(', ') || '-'}  (合計 ${s.seconds.toFixed(0)} 秒${fast ? ' · --fast: 重い 5 本は未実行 —— push 前は npm run verify:all' : ''})`);
  process.exit(s.failed.length === 0 ? 0 : 1);
}

module.exports = { HEAVY, parseSteps, selectSteps, summarize };

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else main(process.argv.slice(2));
}
