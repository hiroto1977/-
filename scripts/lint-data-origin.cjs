#!/usr/bin/env node
/**
 * 「画面の数字がどこから来るか」の宣言 (`src/shared/dataOrigin.ts`) と
 * **実装の実態**が一致していることを双方向で照合するゲート。
 *
 * ## なぜ要るのか
 *
 * 2026-08 監査で見つけた不具合は、宣言が無いことそのものだった。
 * `useServiceData` は fetch 成功を無条件に `setData` + `source='live'` で受け、
 * 公式 API 未配線のサービスは stub が返す**空の成功**をそれで受けたため、
 * 「更新」を押すと画面が空になり緑の「ライブ」が付いた。24 サービスが該当し、
 * 士業 8 画面では顧問料・未払請求・連絡先・相談履歴が 0 件になった。
 *
 * 宣言を入れて直したが、**宣言は実装より先に古くなる**。
 * Phase 6 で stub に実 API を配線したら `sample` → `remote` へ直さないと、
 * 今度は「本当は取れるのに取りに行かない」画面になる。逆に live 実装を
 * stub へ戻したら `sample` に直さないと元の嘘が戻る。だから両方向を見る。
 *
 * ## 判定規則 (判断を挟まない)
 *
 * - `sample` — fetcher の定義モジュールが stub
 *   (`createSnapshotStub` / `createShigyoFetcher` / `return STUB;`)。I/O 無し。
 * - `local`  — stub ではなく `LOCAL_SERVICES` に載っている (資格情報不要)。
 * - `remote` — stub ではなく `LOCAL_SERVICES` に無い (資格情報で外部 API)。
 *
 * 使い方:  node scripts/lint-data-origin.cjs
 *          node scripts/lint-data-origin.cjs --self-test   (規則ごとの対照実験)
 * Exits 1 on any finding.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLIENTS_DIR = path.join(REPO_ROOT, 'src/main/clients');
const INDEX_TS = path.join(CLIENTS_DIR, 'index.ts');
const ORIGIN_TS = path.join(REPO_ROOT, 'src/shared/dataOrigin.ts');

/** stub fetcher の目印。ここに挙がる形は一切のネットワーク/ファイル I/O を持たない。 */
const STUB_MARKERS = [/createSnapshotStub/, /createShigyoFetcher/, /return\s+(?:EMPTY_)?STUB;/];

/** `export const NAME = {…}` / `[…]` の中身を、括弧の対応を数えずに端で切り出す。 */
function blockOf(source, name, open, close) {
  const at = source.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`${name} が見つかりません`);
  const from = source.indexOf(open, at);
  const to = source.indexOf(close, from);
  if (from < 0 || to < 0) throw new Error(`${name} の範囲を特定できません`);
  return source.slice(from, to);
}

/** `LIVE_FETCHERS` の `id: fetcherName` 対応。 */
function fetcherEntries(indexSource) {
  const body = blockOf(indexSource, 'LIVE_FETCHERS', '{', '\n};');
  return [...body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*([A-Za-z0-9_]+),/gm)].map((m) => ({
    id: m[1],
    fetcher: m[2],
  }));
}

/** `LOCAL_SERVICES` に載っている id。 */
function localServiceIds(indexSource) {
  const body = blockOf(indexSource, 'LOCAL_SERVICES', '[', '\n]);');
  return new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

/** `SERVICE_DATA_ORIGIN` の宣言 (id → origin)。 */
function declaredOrigins(originSource) {
  const body = blockOf(originSource, 'SERVICE_DATA_ORIGIN', '{', '\n};');
  const out = new Map();
  for (const m of body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'(\w+)',/gm)) out.set(m[1], m[2]);
  return out;
}

/** fetcher 名 → それを export しているモジュールの本文。 */
function fetcherSources(dir, readFile, listDir) {
  const byName = new Map();
  for (const file of listDir(dir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue;
    const text = readFile(path.join(dir, file));
    for (const m of text.matchAll(/export (?:const|(?:async )?function) (\w+)/g)) {
      if (!byName.has(m[1])) byName.set(m[1], { file, text });
    }
  }
  return byName;
}

function isStub(text) {
  return STUB_MARKERS.some((re) => re.test(text));
}

/**
 * 実装から導かれる origin と宣言を突き合わせる純関数。
 * `--self-test` が合成入力でここだけを検査する。
 */
function evaluateOrigins({ entries, localIds, declared, sources }) {
  const problems = [];
  for (const { id, fetcher } of entries) {
    const mod = sources.get(fetcher);
    if (mod === undefined) {
      problems.push(`${id}: fetcher \`${fetcher}\` を export するモジュールが見つかりません`);
      continue;
    }
    const derived = isStub(mod.text) ? 'sample' : localIds.has(id) ? 'local' : 'remote';
    const actual = declared.get(id);
    if (actual === undefined) {
      problems.push(`${id}: SERVICE_DATA_ORIGIN に宣言がありません (実装は ${derived})`);
      continue;
    }
    if (actual === derived) continue;
    if (actual === 'sample') {
      problems.push(
        `${id}: 実装は ${derived} (${mod.file} が I/O を行う) のに 'sample' と宣言しています。` +
          `取りに行けるのに取りに行かない画面になります`,
      );
    } else if (derived === 'sample') {
      problems.push(
        `${id}: 実装は stub (${mod.file}) なのに '${actual}' と宣言しています。` +
          `更新で空データに置き換わり「ライブ」と表示されます`,
      );
    } else {
      problems.push(
        `${id}: 実装は ${derived} なのに '${actual}' と宣言しています ` +
          `(LOCAL_SERVICES の登録と食い違っています)`,
      );
    }
  }
  for (const id of declared.keys()) {
    if (!entries.some((e) => e.id === id)) {
      problems.push(`${id}: SERVICE_DATA_ORIGIN にあるが LIVE_FETCHERS に無い削除済みサービスです`);
    }
  }
  return problems;
}

/** 規則ごとに 1 つだけ違反する合成入力を通し、その規則だけが鳴ることを確かめる。 */
function selfTest() {
  const base = {
    entries: [{ id: 'alpha', fetcher: 'fetchAlpha' }],
    localIds: new Set(),
    declared: new Map([['alpha', 'remote']]),
    sources: new Map([['fetchAlpha', { file: 'alpha.ts', text: 'export const fetchAlpha = real();' }]]),
  };
  const cases = [
    ['違反なし (remote)', base, 0],
    [
      'stub なのに remote と宣言',
      { ...base, sources: new Map([['fetchAlpha', { file: 'alpha.ts', text: 'createSnapshotStub(STUB)' }]]) },
      1,
    ],
    [
      '士業 stub なのに local と宣言',
      {
        ...base,
        localIds: new Set(['alpha']),
        declared: new Map([['alpha', 'local']]),
        sources: new Map([['fetchAlpha', { file: 'alpha.ts', text: 'createShigyoFetcher()' }]]),
      },
      1,
    ],
    [
      'return STUB; なのに remote と宣言',
      { ...base, sources: new Map([['fetchAlpha', { file: 'alpha.ts', text: '  return STUB;\n' }]]) },
      1,
    ],
    [
      '実装は live になったのに sample のまま',
      { ...base, declared: new Map([['alpha', 'sample']]) },
      1,
    ],
    [
      'LOCAL_SERVICES 登録なのに remote と宣言',
      { ...base, localIds: new Set(['alpha']) },
      1,
    ],
    ['宣言漏れ', { ...base, declared: new Map() }, 1],
    [
      '削除済みサービスの宣言が残っている',
      { ...base, declared: new Map([['alpha', 'remote'], ['ghost', 'sample']]) },
      1,
    ],
    ['fetcher の定義モジュールが無い', { ...base, sources: new Map() }, 1],
  ];
  let failed = 0;
  for (const [label, input, want] of cases) {
    const got = evaluateOrigins(input).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  if (failed > 0) {
    console.error(`❌ 対照実験 ${failed} 件が期待と違います — ゲート自体が壊れています`);
    return 1;
  }
  console.log('✅ 対照実験: 規則ごとに 1 件だけ鳴ります');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const indexSource = fs.readFileSync(INDEX_TS, 'utf8');
  const entries = fetcherEntries(indexSource);
  const localIds = localServiceIds(indexSource);
  const declared = declaredOrigins(fs.readFileSync(ORIGIN_TS, 'utf8'));
  const sources = fetcherSources(
    CLIENTS_DIR,
    (p) => fs.readFileSync(p, 'utf8'),
    (d) => fs.readdirSync(d).filter((f) => fs.statSync(path.join(d, f)).isFile()),
  );

  const problems = evaluateOrigins({ entries, localIds, declared, sources });
  const counts = { sample: 0, local: 0, remote: 0 };
  for (const o of declared.values()) if (o in counts) counts[o] += 1;
  console.log(
    `サービス ${entries.length} 件 / 宣言 ${declared.size} 件 ` +
      `(remote ${counts.remote}・local ${counts.local}・sample ${counts.sample})`,
  );

  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('✅ 取得元の宣言と実装が一致しています');
  return 0;
}

module.exports = { evaluateOrigins, fetcherEntries, localServiceIds, declaredOrigins, isStub, STUB_MARKERS };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
