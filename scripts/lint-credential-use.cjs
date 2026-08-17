#!/usr/bin/env node
/**
 * 「その資格情報は本当に読まれるのか」の宣言 (`src/shared/credentialUse.ts`) を
 * 実装と双方向で照合し、**読み手のいないサービスが入力欄を出していないか**まで見る。
 *
 * ## なぜ要るのか
 *
 * 2026-08 監査の状態: `asana` / `discord` / `dropbox` / `line` / `linear` /
 * `salesforce` / `sentry` / `stripe` の 8 画面は、fetcher が stub で通信せず、
 * `LIVE_ACTIONS` にも登録が無く、`src/shared/api/` にもクライアントが無いのに、
 * `StatusBar` の `tokenSetup` でトークン入力欄を出し、入力すれば暗号化保存して
 * いた。**読み手のいない資格情報を預かること自体が漏えい面の追加**である
 * (Stripe の秘密鍵・LINE のチャネルトークンを、使う予定が来るまで持つ理由は無い)。
 *
 * 宣言だけ入れても、宣言は実装より先に古くなる。Phase 6 で実 API を配線したら
 * `none` → `fetch` に直さないと「入れても繋がらない」画面が残り、逆に配線を
 * 外して直し忘れれば元の形が戻る。だから両方向を見る。
 *
 * ## 判定規則 (判断を挟まない)
 *
 * - `fetch`  — `dataOrigin` が 'remote' で client モジュールが `token` を参照する
 * - `action` — remote ではないが `LIVE_ACTIONS` にあり client が `token` を参照する
 * - `none`   — どちらでもない
 *
 * 見ているのは「client モジュールが `token` という名前に触るか」で、データフロー
 * 解析ではない。「触るが実は使っていない」形は通る。**触りもしないのに預かる**形は落ちる。
 *
 * 使い方:  node scripts/lint-credential-use.cjs
 *          node scripts/lint-credential-use.cjs --self-test
 * Exits 1 on any finding.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fetcherEntries, localServiceIds, declaredOrigins } = require('./lint-data-origin.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLIENTS_DIR = path.join(REPO_ROOT, 'src/main/clients');
const INDEX_TS = path.join(CLIENTS_DIR, 'index.ts');
const ORIGIN_TS = path.join(REPO_ROOT, 'src/shared/dataOrigin.ts');
const USE_TS = path.join(REPO_ROOT, 'src/shared/credentialUse.ts');
const PAGES_DIR = path.join(REPO_ROOT, 'src/renderer/pages');

function blockOf(source, name, open, close) {
  const at = source.indexOf(`export const ${name}`);
  if (at < 0) throw new Error(`${name} が見つかりません`);
  const from = source.indexOf(open, at);
  const to = source.indexOf(close, from);
  if (from < 0 || to < 0) throw new Error(`${name} の範囲を特定できません`);
  return source.slice(from, to);
}

/** `LIVE_ACTIONS` に登録がある id。 */
function actionServiceIds(indexSource) {
  const body = blockOf(indexSource, 'LIVE_ACTIONS', '{', '\n};');
  return new Set([...body.matchAll(/^\s*'?([a-z0-9-]+)'?:/gm)].map((m) => m[1]));
}

/** `SERVICE_CREDENTIAL_USE` の宣言。 */
function declaredUses(useSource) {
  const body = blockOf(useSource, 'SERVICE_CREDENTIAL_USE', '{', '\n};');
  const out = new Map();
  for (const m of body.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'(\w+)',/gm)) out.set(m[1], m[2]);
  return out;
}

/** fetcher 名 → 定義モジュール (`lint-data-origin` と同じ規則)。 */
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

/**
 * ページが `tokenSetup` を出しているサービス id。
 *
 * `tokenSetup=` の直前で最も近い `serviceId=` を対応させる。StatusBar は 1 要素に
 * 両方を書くため、この距離で十分に決まる。
 */
function tokenSetupServiceIds(dir, readFile, listDir) {
  const out = new Map();
  for (const file of listDir(dir)) {
    if (!file.endsWith('.tsx')) continue;
    const text = readFile(path.join(dir, file));
    for (const m of text.matchAll(/tokenSetup=/g)) {
      const before = text.slice(Math.max(0, m.index - 1200), m.index);
      const ids = [...before.matchAll(/serviceId=(?:"([a-z0-9-]+)"|\{'([a-z0-9-]+)'\})/g)];
      const last = ids[ids.length - 1];
      if (last === undefined) continue;
      out.set(last[1] ?? last[2], file);
    }
  }
  return out;
}

/** 実装から導いた用途と宣言・画面を突き合わせる純関数。 */
function evaluateCredentialUse({ entries, origins, actionIds, sources, declared, tokenPages }) {
  const problems = [];
  for (const { id, fetcher } of entries) {
    const mod = sources.get(fetcher);
    if (mod === undefined) {
      problems.push(`${id}: fetcher \`${fetcher}\` を export するモジュールが見つかりません`);
      continue;
    }
    const touchesToken = /\btoken\b/.test(mod.text);
    const derived =
      origins.get(id) === 'remote' && touchesToken ? 'fetch'
      : actionIds.has(id) && touchesToken ? 'action'
      : 'none';
    const actual = declared.get(id);
    if (actual === undefined) {
      problems.push(`${id}: SERVICE_CREDENTIAL_USE に宣言がありません (実装は ${derived})`);
    } else if (actual !== derived) {
      problems.push(
        `${id}: 実装から導かれる用途は '${derived}' (${mod.file}) なのに '${actual}' と宣言しています` +
          (derived === 'none'
            ? ' — 読み手がいないのに預かる形に戻っています'
            : ' — 使うようになったのに宣言が古いままです'),
      );
    }
    const page = tokenPages.get(id);
    if (derived === 'none' && page !== undefined) {
      problems.push(
        `${id}: どの経路でも資格情報を読まないのに ${page} が入力欄 (tokenSetup) を出しています`,
      );
    }
  }
  for (const id of declared.keys()) {
    if (!entries.some((e) => e.id === id)) {
      problems.push(`${id}: SERVICE_CREDENTIAL_USE にあるが LIVE_FETCHERS に無い削除済みサービスです`);
    }
  }
  return problems;
}

function selfTest() {
  const base = {
    entries: [{ id: 'alpha', fetcher: 'fetchAlpha' }],
    origins: new Map([['alpha', 'remote']]),
    actionIds: new Set(),
    sources: new Map([['fetchAlpha', { file: 'alpha.ts', text: 'const t = ctx.token;' }]]),
    declared: new Map([['alpha', 'fetch']]),
    tokenPages: new Map([['alpha', 'AlphaPage.tsx']]),
  };
  const noToken = new Map([['fetchAlpha', { file: 'alpha.ts', text: 'return STUB;' }]]);
  const cases = [
    ['違反なし (remote + token 参照 + 入力欄)', base, 0],
    [
      'token を触らないのに入力欄を出す (宣言も古い) — 2 件鳴るのが正しい',
      { ...base, sources: noToken },
      2,
    ],
    [
      'token を触らず入力欄も無い → 宣言のずれだけ',
      { ...base, sources: noToken, tokenPages: new Map() },
      1,
    ],
    [
      'token を触らず none と宣言済みでも、入力欄が残っていれば鳴る',
      { ...base, sources: noToken, declared: new Map([['alpha', 'none']]) },
      1,
    ],
    [
      'アクション経由で使う (remote ではない)',
      {
        ...base,
        origins: new Map([['alpha', 'local']]),
        actionIds: new Set(['alpha']),
        declared: new Map([['alpha', 'action']]),
      },
      0,
    ],
    [
      'アクションがあっても token を触らなければ none',
      {
        ...base,
        origins: new Map([['alpha', 'local']]),
        actionIds: new Set(['alpha']),
        sources: noToken,
        declared: new Map([['alpha', 'none']]),
        tokenPages: new Map(),
      },
      0,
    ],
    ['宣言漏れ', { ...base, declared: new Map() }, 1],
    [
      '削除済みサービスの宣言が残っている',
      { ...base, declared: new Map([['alpha', 'fetch'], ['ghost', 'none']]) },
      1,
    ],
    ['fetcher の定義モジュールが無い', { ...base, sources: new Map() }, 1],
  ];
  let failed = 0;
  for (const [label, input, want] of cases) {
    const got = evaluateCredentialUse(input).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  if (failed > 0) {
    console.error(`❌ 対照実験 ${failed} 件が期待と違います — ゲート自体が壊れています`);
    return 1;
  }
  console.log('✅ 対照実験: 規則ごとに期待どおりの件数だけ鳴ります');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const indexSource = fs.readFileSync(INDEX_TS, 'utf8');
  const readFile = (p) => fs.readFileSync(p, 'utf8');
  const listDir = (d) => fs.readdirSync(d).filter((f) => fs.statSync(path.join(d, f)).isFile());

  const entries = fetcherEntries(indexSource);
  const origins = declaredOrigins(fs.readFileSync(ORIGIN_TS, 'utf8'));
  const actionIds = actionServiceIds(indexSource);
  const sources = fetcherSources(CLIENTS_DIR, readFile, listDir);
  const declared = declaredUses(fs.readFileSync(USE_TS, 'utf8'));
  const tokenPages = tokenSetupServiceIds(PAGES_DIR, readFile, listDir);

  // localServiceIds は origin 宣言の裏取りに使う（origin 側のゲートと同じ材料で
  // 読んでいることを明示するため）。
  void localServiceIds(indexSource);

  const problems = evaluateCredentialUse({ entries, origins, actionIds, sources, declared, tokenPages });
  const counts = { fetch: 0, action: 0, none: 0 };
  for (const v of declared.values()) if (v in counts) counts[v] += 1;
  console.log(
    `サービス ${entries.length} 件 / 宣言 ${declared.size} 件 ` +
      `(fetch ${counts.fetch}・action ${counts.action}・none ${counts.none}) / ` +
      `入力欄を出す画面 ${tokenPages.size} 件`,
  );

  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('✅ 資格情報の用途の宣言・実装・画面が一致しています');
  return 0;
}

module.exports = { evaluateCredentialUse, actionServiceIds, declaredUses, tokenSetupServiceIds };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
