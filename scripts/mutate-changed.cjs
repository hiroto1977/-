#!/usr/bin/env node
'use strict';

/**
 * push で変わったファイルのうち、変異検査の対象になっているものだけを選ぶ。
 *
 * ## なぜ要るか
 *
 * `mutation.yml` の冒頭には長らく「Mutation testing takes ~2 minutes」と
 * 書いてあったが、**実測は 75〜104 分**だった (2026-08-20 に GitHub Actions の
 * 実行履歴で確認)。`mutate` の対象が 227 ファイルまで増えた結果である。
 *
 * その誤った前提の上に「毎 PR は過剰なので週次 + 一部パスの push」という
 * 方針が立っていたので、いま実際に起きていたのは:
 *
 * - `src/main/clients/**` は変更の多いディレクトリなので push で頻繁に発火し、
 *   2026-08-19 だけで **5 回 × 約 100 分 = 約 8 時間**を消費した (全部失敗)
 * - それでいて対象パスは 227 件中 2 件しか無く、**残り 225 件の退行は週次まで
 *   最大 7 日気付かない**
 *
 * つまり同時に「高すぎる」と「狭すぎる」が成り立っていた。全部を毎回測るのが
 * 高いなら、**変わったものだけ測ればよい**。週次は従来どおり全件を測る。
 *
 * ## 使い方
 *
 *   node scripts/mutate-changed.cjs <base-ref>
 *   node scripts/mutate-changed.cjs <base-ref> --chunks
 *
 * 対象があれば `--mutate` に渡せる形 (カンマ区切り) を stdout へ出す。
 * 無ければ何も出さない (呼び出し側は空なら検査を飛ばす)。
 * `--chunks` は同じ対象を **1 つの job に載せてよい量**の塊に分け、JSON の
 * 配列 (要素はカンマ区切りの対象) で出す —— `mutation.yml` はこれを matrix に
 * して塊ごとに別の job で測る (下の `chunkTargets` に理由)。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** `mutate` の一覧。glob は使っていない前提 (現状すべて実ファイルのパス)。 */
function mutateList() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/**
 * base から HEAD までに変わったファイル。
 *
 * 削除されたファイルは対象から外す (測りようがない)。base が解決できない
 * (浅い clone・初回 push など) 場合は**空ではなく null** を返し、呼び出し側が
 * 「全件測る」へ倒せるようにする — 分からないときに「変更なし」と答えると、
 * 黙って何も測らない状態になる。
 */
function changedFiles(baseRef) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${baseRef}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  } catch {
    return null;
  }
}

/**
 * 変わったファイルから、測るべき対象を決める。
 *
 * **テストだけが変わった場合も、その対象を測る。** テストを緩めた変更こそ
 * 変異検査が捕まえるべきものなので、`src/**\/__tests__/foo.test.ts` から
 * `foo.ts` を引き当てて対象に入れる。
 */
function targetsFor(changed, mutate) {
  const set = new Set(mutate);
  const out = new Set();
  for (const f of changed) {
    if (set.has(f)) {
      out.add(f);
      continue;
    }
    const m = /^(.*)\/__tests__\/(.+?)(?:\.[a-z]+)?\.test\.tsx?$/.exec(f);
    if (m === null) continue;
    for (const cand of [`${m[1]}/${m[2]}.ts`, `${m[1]}/${m[2]}.tsx`]) {
      if (set.has(cand)) out.add(cand);
    }
  }
  const targets = [...out].sort();
  assertPlainPaths(targets);
  return targets;
}

/** リポジトリのソースパスとして普通の形。`,` は区切りに使うので含めない。 */
const PLAIN_PATH = /^[A-Za-z0-9._/-]+$/;

/**
 * 出す前に形を確かめる。
 *
 * 出力は `mutate` 一覧 (= `stryker.config.json` の値) から来るので、変わった
 * ファイル名がそのまま出るわけではない。それでも**設定に 1 行足すだけで
 * 中身を決められる**ことに変わりはなく、この文字列は CI で
 * `$GITHUB_OUTPUT` へ書かれ、次の段のコマンド引数になる。
 *
 * - `$(…)` / バッククォート / `"` … シェルへ渡る形だと構文になる
 *   (`mutation.yml` は env: 経由にしたので今は渡らないが、**渡らない形を
 *   保証しているのは別ファイル**なので、ここでも塞ぐ)
 * - 改行 … `key=value` を 1 行で書く `$GITHUB_OUTPUT` の形式を壊し、
 *   後続行が別の出力として解釈されうる (`mode` を上書きできる)
 * - `,` … 呼び出し側が `--mutate` の区切りとして読む
 *
 * 黙って捨てると「対象が減った」ことに気付けないので、落とす。
 */
function assertPlainPaths(targets) {
  const bad = targets.filter((t) => !PLAIN_PATH.test(t));
  if (bad.length > 0) {
    throw new Error(
      `変異検査の対象に、パスとして普通でない名前が ${bad.length} 件あります ` +
        `(stryker.config.json の mutate を確認してください): ` +
        bad.map((t) => JSON.stringify(t)).join(' , '),
    );
  }
}

/**
 * 1 つの job に載せてよい重さ (行数)。
 *
 * ## なぜ塊に分けるか (2026-09-30 · パス 501)
 *
 * GitHub Actions の job は **6 時間**で cancel される。変異検査の所要は対象の
 * 変異体の数にほぼ比例し、実測は:
 *
 * - 8 本 / 5,535 行 → 測った変異体 3,032 (計装 3,529・Ignored 497) → **96 分**
 *   (この session の container・concurrency 4・生存 3 の測り直し。初回は生存 89 で
 *   148 分 —— 生存は覆う検査を全部走らせるので遅い)。行数 1,000 あたり約 550 変異体・
 *   約 17〜27 分
 * - 週次の全掃引 (cache が当たらなかった 2026-09-13 の #170) は 29,397 変異体を
 *   2 時間 43 分で測った (GitHub の runner はこの container より速い)。
 *   **2026-09-27 の #172 (#788 のマージ後・cache 落ち) はちょうど 6 時間で
 *   cancel された** —— 対象の増加と検査の重さ (jsdom の画面検査) で
 *   1 job には収まらなくなっている
 * - `main` へのマージで 69 本 (29,125 行 ≒ 16,000 変異体) が対象になる
 *   PR (#790) は、上の 2 つのどちらの速さでも 1 job に収まる保証が無い
 *   (この container の速さなら約 8〜13 時間・#170 の速さでも約 1 時間 29 分)
 *
 * だから push 側は塊に分け、塊ごとに別の job で測る。1 塊の上限を 4,000 行に
 * 置くと、この container の速さでも 1 塊 2 時間で 6 時間の上限まで 3 倍の余裕が
 * 在る。塊の数は対象の重さから導く (69 本なら 8 塊)。**塊の合計の runner
 * 時間は変わらない** —— 分けるのは壁時計の上限に収めるためであって、費用を
 * 減らすためではない。
 *
 * ★ `thresholds.break` (99.8) は **1 回の実行の合計**に掛かるので、塊ごとに
 * 掛かることになる。塊が小さいほど厳しい (2,500 変異体の塊なら生存 6 件で
 * 落ちる —— 5 件はちょうど 99.80% で通る)。目標は 100% なので許容の側は狭くて構わない。
 *
 * 重さは行数で測る (変異体の数は Stryker を走らせないと分からない)。
 * 割り付けは重い順にいちばん軽い塊へ (LPT)。同じ入力からは必ず同じ塊が出る。
 */
const MAX_LINES_PER_CHUNK = 4000;

/** ファイルの重さ = 行数。 */
function weightOf(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').split('\n').length;
}

/**
 * 対象を塊に分ける。返すのはカンマ区切りの対象の配列 (`--mutate` の形)。
 *
 * - 塊の数は ceil(重さの合計 / maxLines) (最低 1) から始め、複数本の塊が上限を超えるなら
 *   1 つ増やして割り付け直す (LPT は塊の数を先に決める算法なので、ceil だけでは上限を
 *   保証しない —— 3,000 / 3,000 / 1,100 / 900 を上限 4,000 で 2 塊に分けると 4,100 が出る。
 *   パス 501 の記録の監査が指摘した)
 * - 1 本で上限を超えるファイルはそのまま 1 塊になる (分けようが無い)
 * - 空の対象からは空の配列
 *
 * @param weight self-test の差し込み口 (実物は行数)
 */
function chunkTargets(targets, weight = weightOf, maxLines = MAX_LINES_PER_CHUNK) {
  if (targets.length === 0) return [];
  const rows = targets.map((t) => ({ t, w: weight(t) }));
  const total = rows.reduce((acc, r) => acc + r.w, 0);
  rows.sort((a, b) => b.w - a.w || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  for (let n = Math.max(1, Math.ceil(total / maxLines)); ; n += 1) {
    const bins = Array.from({ length: n }, () => ({ w: 0, items: [] }));
    for (const r of rows) {
      let lightest = bins[0];
      for (const b of bins) if (b.w < lightest.w) lightest = b;
      lightest.items.push(r.t);
      lightest.w += r.w;
    }
    // 1 本で上限を超える塊は分けようが無い。塊の数がファイルの数に達したら止める。
    const fits = bins.every((b) => b.w <= maxLines || b.items.length <= 1);
    if (fits || n >= rows.length) return bins.filter((b) => b.items.length > 0).map((b) => b.items.sort().join(','));
  }
}

/**
 * 対照実験 — 「変更なし」と「対象なし」を取り違えていないか。
 *
 * ここが黙って空を返すと、CI は何も測らずに緑になる (常に緑を返すゲート)。
 * 対応付けの規則ごとに 1 件ずつ確かめる。
 */
function selfTest() {
  const mutate = ['src/a/foo.ts', 'src/b/bar.ts', 'src/c/baz.tsx'];
  const cases = [
    ['対象そのものが変わったら選ぶ', ['src/a/foo.ts'], ['src/a/foo.ts']],
    ['対象外のファイルは選ばない', ['src/z/other.ts', 'docs/X.md'], []],
    ['テストが変わったら対象を選ぶ', ['src/a/__tests__/foo.test.ts'], ['src/a/foo.ts']],
    ['tsx の対象もテストから引ける', ['src/c/__tests__/baz.test.tsx'], ['src/c/baz.tsx']],
    ['枝番付きのテスト名も引ける', ['src/a/__tests__/foo.adversarial.test.ts'], ['src/a/foo.ts']],
    ['一覧に無い対象のテストは選ばない', ['src/z/__tests__/other.test.ts'], []],
    ['重複しても 1 度だけ', ['src/a/foo.ts', 'src/a/__tests__/foo.test.ts'], ['src/a/foo.ts']],
    ['何も変わっていなければ空', [], []],
    ['複数は並べ替えて返す', ['src/b/bar.ts', 'src/a/foo.ts'], ['src/a/foo.ts', 'src/b/bar.ts']],
    // 形の検査 (want が文字列 = 例外を期待。mutate 一覧は changed をそのまま使う)。
    ['コマンド置換を含む名前は出さない', ['src/$(id).ts'], 'パスとして普通でない'],
    ['バッククォートを含む名前は出さない', ['src/' + String.fromCharCode(96) + 'id' + String.fromCharCode(96) + '.ts'], 'パスとして普通でない'],
    ['二重引用符を含む名前は出さない', ['src/a".ts'], 'パスとして普通でない'],
    ['改行を含む名前は出さない ($GITHUB_OUTPUT の形式を壊す)', ['src/a\nmode=all.ts'], 'パスとして普通でない'],
    ['カンマを含む名前は出さない (--mutate の区切り)', ['src/a,b.ts'], 'パスとして普通でない'],
    ['空白を含む名前は出さない', ['src/a b.ts'], 'パスとして普通でない'],
  ];
  let failed = 0;
  console.log('self-test:');
  for (const [label, changed, want] of cases) {
    // `want` が文字列のときは「その語を含む例外で落ちること」を期待する。
    let got;
    try {
      got = JSON.stringify(targetsFor(changed, typeof want === 'string' ? changed : mutate));
    } catch (e) {
      got = `例外: ${e.message}`;
    }
    const ok = typeof want === 'string' ? got.startsWith('例外:') && got.includes(want) : got === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${JSON.stringify(want)})`);
  }
  // 塊の分け方 (重さは差し込み・上限 10)。
  const w = (file) => ({ a: 5, b: 4, c: 3, d: 3, big: 25, e: 8, f: 8, g: 3, h: 1 })[file];
  const chunkCases = [
    ['空の対象は空の配列', [], []],
    ['上限に収まれば 1 塊 (中は名前順)', ['b', 'a'], ['a,b']],
    ['上限を超えたら塊の数は重さから導く (5+4+3 = 12 → 2 塊)', ['a', 'b', 'c'], ['a', 'b,c']],
    // 5 → 塊 1・4 → 塊 2 (軽い方)・3 → 塊 2 (4 < 5)・3 → 塊 1 (5 < 7)。
    ['重い順にいちばん軽い塊へ (5,4,3,3 → [5,3] [4,3])', ['a', 'b', 'c', 'd'], ['a,d', 'b,c']],
    ['1 本で上限を超えるファイルはそのまま 1 塊', ['big', 'a'], ['big', 'a']],
    ['入力の順序に依らない', ['d', 'c', 'b', 'a'], ['a,d', 'b,c']],
    // ceil(20 / 10) = 2 塊だと [8,3] = 11 で上限を超える → 3 塊 ([8] [8] [3,1])。
    ['ceil で決めた塊の数で上限を超えるなら塊を増やす (8,8,3,1 → 3 塊)', ['e', 'f', 'g', 'h'], ['e', 'f', 'g,h']],
  ];
  for (const [label, targets, want] of chunkCases) {
    const got = JSON.stringify(chunkTargets(targets, w, 10));
    const ok = got === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} 塊: ${label}: ${got} (期待 ${JSON.stringify(want)})`);
  }
  // 規則が広すぎない対照 — 実在する `mutate` 一覧を 1 件も弾かないこと。
  // 合成ケースだけだと「全部落とす」規則でも緑になる。
  const real = mutateList();
  try {
    assertPlainPaths(real);
    console.log(`  ✓ 実在する mutate ${real.length} 件はすべて通る (規則が広すぎない対照)`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ 実在する mutate を弾いた: ${e.message}`);
  }
  if (real.length === 0) {
    failed += 1;
    console.log('  ✗ mutate 一覧が空 — 上の対照は何も測っていない');
  }
  // 実在する `mutate` 一覧を実物の重さで塊に分けても、1 本も落とさず・1 本も
  // 2 度数えず・(1 本の塊を除き) どの塊も上限に収まること。
  if (real.length > 0) {
    try {
      const chunks = chunkTargets(real);
      const seen = chunks.flatMap((c) => c.split(','));
      const dup = seen.filter((f, i) => seen.indexOf(f) !== i);
      const missing = real.filter((f) => !seen.includes(f));
      const over = chunks.filter((c) => c.includes(',') && c.split(',').reduce((acc, f) => acc + weightOf(f), 0) > MAX_LINES_PER_CHUNK);
      const ok = dup.length === 0 && missing.length === 0 && over.length === 0 && seen.length === real.length;
      if (!ok) failed += 1;
      console.log(
        `  ${ok ? '✓' : '✗'} 実在する mutate ${real.length} 件は ${chunks.length} 塊に過不足なく分かれる` +
          (ok ? '' : ` (重複 ${dup.length} / 欠落 ${missing.length} / 上限超え ${over.length})`),
      );
    } catch (e) {
      failed += 1;
      console.log(`  ✗ 実在する mutate を塊に分けられない: ${e.message}`);
    }
  }
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 対応付けが壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const chunks = argv.includes('--chunks');
  const baseRef = argv.find((a) => !a.startsWith('--'));
  if (baseRef === undefined || baseRef === '') {
    process.stderr.write('usage: mutate-changed.cjs <base-ref> [--chunks]\n');
    return 2;
  }
  const changed = changedFiles(baseRef);
  if (changed === null) {
    // 差分が取れない = 何が変わったか分からない。黙って飛ばさず全件を測らせる。
    process.stderr.write(`base ref "${baseRef}" から差分を取れませんでした。全件を測ります。\n`);
    process.stdout.write('ALL\n');
    return 0;
  }
  let targets;
  try {
    targets = targetsFor(changed, mutateList());
  } catch (e) {
    // 形がおかしいものを黙って落として「対象なし」にすると、CI は何も測らずに
    // 緑になる。読める形で落とす。
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
  process.stderr.write(`変更 ${changed.length} ファイル → 変異検査の対象 ${targets.length} ファイル\n`);
  for (const t of targets) process.stderr.write(`  ${t}\n`);
  if (targets.length === 0) return 0;
  if (chunks) {
    const parts = chunkTargets(targets);
    process.stderr.write(`→ ${parts.length} 塊 (1 塊 ${MAX_LINES_PER_CHUNK} 行まで)\n`);
    process.stdout.write(`${JSON.stringify(parts)}\n`);
  } else {
    process.stdout.write(`${targets.join(',')}\n`);
  }
  return 0;
}

module.exports = { targetsFor, changedFiles, mutateList, chunkTargets, MAX_LINES_PER_CHUNK, selfTest };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
