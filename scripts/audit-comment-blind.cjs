#!/usr/bin/env node
/*
 * **「注記が答えになっている検査」の定期点検** (`npm run audit:comment-blind`)。
 *
 * ## 何を測るか
 *
 * このリポジトリの検査の多くは**原文を読んで**母集団や台帳を導く
 * (2026-09-25 実測: `readFileSync` / `readOriginalSource` を読む検査 228 本のうち、
 * 注記を落とすのは 106 本)。原文には**注記も入る**ので、
 * 「宣言が在る」と主張しているつもりで**散文が在るだけ**の検査が生まれうる ——
 * 法則 `mention-vs-declaration` そのものである。
 *
 * 綴りで数えようとしても当たらない (「この検査は注記に騙されているか」は綴りに現れない)。
 * だから**振る舞いで測る**: `.ts` / `.cjs` / `.js` の**注記の本文だけ**を無意味にして
 * (長さと改行は保つ)、全件を走らせ、落ちた検査を理由つきの台帳と突き合わせる。
 *
 * **自己検査つき** —— 書き換えた後の `stripComments` が書き換える前と 1 字も違わない
 * ことを全件で確かめる。違えば「触ったのは注記だけ」が偽なので、そのファイルは飛ばす。
 *
 * ## 何が見えて、何が見えないか (正直に書く)
 *
 * 見えるのは**片側だけ**である。「注記のおかげで通っていた検査」は落ちるが、
 * 「不在を主張していて注記のせいで偽に近かった検査」は**逆に通ってしまう**ので映らない
 * (そちらの母集団は `absenceSampleCensus.test.ts` が別に持つ)。
 *
 * ## 直した後に実物で走らせた (2026-09-25 · 予測ではなく測った)
 *
 * 1,431 本 / 落ちるのは **14 本**。★ パス 465 で直した 2 本
 * (`lawCoverageLedger` / `limitCoverageCensus`) は **台帳から抜けなかった** ——
 * 直しの一部として「注記の中にしか無い言及」そのものを木から採って標本に留めたので、
 * **今度は意図して注記を読む** (`sample-in-comment`)。私は「抜ける」と予測して
 * commit の文面にそう書き、**走らせて偽と分かった**。この道具の値打ちはそこに在る。
 *
 * ## ゲートも測る —— `--gates` (2026-09-25 · パス 466)
 *
 * `npm test` を覆ったあと、**CI の執行層**へ同じ実験を当てた。
 * `verify:all` の 37 ゲートは**それまで 1 度も**注記を無意味にして走らせていない。
 * 1 本ずつ走らせる (`verify:all` は `&&` なので先頭が落ちると残りが走らない)。
 *
 * 実測: **落ちるのは 5 / 37** で、5 本とも理由つきの台帳に在る。
 * ★ ただし**そこで欠陥が 1 件出た** —— `lint:forbidden` の免除の枠は
 * `規則 :: ファイル :: 件数` で、その**件数に散文が混ざっていた**。
 * 注記の綴りを消して同じ数だけ本物の違反を足すと件数が変わらないので門が黙る。
 * 決定的な対照 (実測): `src/main/clients/ollama.ts` の注記 2 行を消し、
 * **書き込み側の 2 経路**への本物の fetch を 2 本入れると
 * (綴りはここで再現しない —— 再現すると**この道具が `lint:forbidden` に当たる**。
 *  実際に当たって鳴った · パス 464 / 465 と同じ罠の 4 度目)
 * `✅ no forbidden patterns found (例外 53 件はすべて台帳どおり)` ——
 * CVE-2024-37032 (Probllama) ほかが実装される当の書き込み口が CI を素通りした。
 * 枠の内訳 (`(code N)`) を名乗らせて閉じた。
 *
 * ## 測って何も無かった軸も記録する (ゲート側 · 2026-09-25)
 *
 * 終了コードは動かないが**出力の文面だけ**動くゲートが 4 本。どれも答えではない:
 * - `lint:regex` … 所要時間 (1253ms → 1250ms)
 * - `lint:citations` … Node の循環依存の警告に載る PID だけ
 * - `lint:repo-size` … byte 数 (日本語が 1 字 1 byte の `x` になるので縮む)
 * - `lint:storage` … `36 保存箇所` → `35` —— 注記の中の 1 件
 *   (`data/chatbotOllama.ts` の docblock がパス 449 で直す前の式を引用している)。
 *   床は 20 なので拘束していないし、**台帳は双方向のまま通る** (実測)。
 *   この走査が散文で満たされうる向きは「消えた保存先の台帳の行が残る」= 過剰申告で、
 *   「実在する保存先を見落とす」側ではない。
 *
 * ## `.tsx` を除く理由 (2026-09-25 · パス 464 の実測)
 *
 * 最初の実験は `.tsx` も含めて走らせ、**変換が壊れた** —— そして壊れた理由が
 * 欠陥そのものだった: 共有の走査器は **JS の字句解析器**で、JSX の素のテキストは
 * JS ではない (`<code>http://x</code>` の `//` を行注記として読んでいた)。
 * その 1 件は直したが、JSX はまだ解析していないので `.tsx` は母集団から外す。
 *
 * ## なぜ CI で走らせないか
 *
 * ① 判定のためにソースを書き換えるので、他の作業と同時に走らせられない。
 * ② 落ちること自体は欠陥ではない —— 注記を読むのが仕事の検査が 11 本在る
 *    (標本が注記の中に在る物・docblock の断定を留める物・注記そのものを数える census)。
 * `audit:tick-sensitivity` (パス 369) / `audit:survivors` (パス 356) と同じ家系である。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { stripComments, commentSpans } = require('./lib/strip-non-code.cjs');

const REPO = path.resolve(__dirname, '..');
const ROOTS = ['src', 'scripts'];
const EXTS = ['.ts', '.cjs', '.mjs', '.js'];

/**
 * 機械が読む指示 —— 触らない。行注記は本文がこれで始まるとき、
 * ブロック注記は**その行**がこれか `@` で始まるとき残す (JSDoc のタグ)。
 */
const PRAGMAS = [
  'eslint', '@ts-', 'Stryker', 'prettier-ignore', 'istanbul ', 'c8 ', 'v8 ',
  '/ <reference', '@vitest-environment', 'type-coverage', 'biome-ignore',
  'deno-', 'webpackChunkName', 'oxlint', 'dprint-ignore', '@preserve', '@license',
];

function isPragmaLine(body) {
  const t = body.trimStart();
  return PRAGMAS.some((p) => t.startsWith(p));
}

function keepBlockLine(line) {
  const t = line.replace(/^\s*\*+\s?/, '').trimStart();
  return t.startsWith('@') || PRAGMAS.some((p) => t.startsWith(p));
}

/** 空白でない 1 文字を無意味な 1 文字へ (長さと改行は保つ)。 */
function blur(s) {
  return s.replace(/\S/g, 'x');
}

/**
 * 注記の本文だけを無意味にする。**走査器は共有の 1 つ** (`commentSpans`)。
 * 変わらなければ `null`。
 */
function blurComments(src) {
  const spans = commentSpans(src);
  if (spans.length === 0) return null;
  let out = '';
  let prev = 0;
  for (const [a, b, kind] of spans) {
    out += src.slice(prev, a);
    const whole = src.slice(a, b);
    if (kind === 'line') {
      const body = whole.slice(2);
      out += isPragmaLine(body) ? whole : `//${blur(body)}`;
    } else {
      const inner = whole.slice(2, whole.length - 2);
      out += `/*${inner.split('\n').map((ln) => (keepBlockLine(ln) ? ln : blur(ln))).join('\n')}*/`;
    }
    prev = b;
  }
  out += src.slice(prev);
  return out === src ? null : out;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'dist-electron') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.some((x) => e.name.endsWith(x)) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function collect() {
  const files = [];
  for (const r of ROOTS) walk(path.join(REPO, r), files);
  return files.map((f) => path.relative(REPO, f).split(path.sep).join('/')).sort();
}

/**
 * **注記を読むのが仕事の検査** —— 落ちて正しい。
 *
 * `kind`:
 * - `sample-in-comment` … 「注記の中の言及は数えない」を示す標本が注記の中に在る
 * - `reads-docblock`    … docblock の断定そのものを留める (古い主張を残さないため)
 * - `counts-comments`   … 母集団が注記そのもの
 * - `prose-in-population` … 母集団を原文から採る設計で、散文だけの行が台帳に在る
 * - `content-hash`      … 注記とは無関係。ファイルの byte が動くので落ちる
 *
 * **分類は「見た形」ではなく「測った原因」を書く** (`audit:tick-sensitivity` の
 * 台帳で 4 度、`why` が実測と食い違った)。新しい行は、先に走らせてから書く。
 */
const LEDGER = [
  { file: 'src/renderer/__tests__/mockPayloadPolicy.test.ts', kind: 'sample-in-comment',
    why: '「走査は isMock: true を実際に見ている」の標本が注記の中に在る (注記を落とした原文には出ない、を示すための標本)' },
  { file: 'src/renderer/__tests__/tickSensitivityLedger.test.ts', kind: 'reads-docblock',
    why: 'パス 368 の census の docblock が「自分の針の限界」を述べていることを留める —— 限界の自認が消えたら鳴らせたい' },
  { file: 'src/renderer/__tests__/webShimAnalyzeCeiling.test.ts', kind: 'sample-in-comment',
    why: '「言及だけの行は母集団に入らない」の標本が注記と定義の 2 形で置いてある' },
  { file: 'src/renderer/data/__tests__/invoiceTransitionConsistency.test.ts', kind: 'prose-in-population',
    why: 'インボイスの経過措置の率を語るファイルを原文から採る設計で、散文が語る所も対象にする。実測で invoiceTransition.ts / taxConsumption.ts の 2 本は注記だけが語っている (綴りはここで再現しない —— 再現するとこの道具が向こうの母集団に入る · パス 465 で実際に落ちた)' },
  { file: 'src/shared/__tests__/e2eWaitMargin.test.ts', kind: 'sample-in-comment',
    why: 'パス 397 が直した「成り立ち得ない条件を待って飲む」形の綴りを、直しの docblock が引用している (その綴りが注記の中には在ることも標本で留めている)' },
  { file: 'src/shared/__tests__/fxCurrency.test.ts', kind: 'reads-docblock',
    why: 'モジュールの docblock の「概算試算であり投資助言ではありません」を留める。利用者が読む側は MutualFundsPage が値として描く (パス 366 の render census が別に持つ)' },
  { file: 'src/shared/__tests__/hostChromeColorCensus.test.ts', kind: 'prose-in-population',
    why: '母集団は原文の綴りで採る設計で、台帳に names-only の行が在る (integrity-chain.cjs / lint-forbidden-patterns.cjs は説明文が綴りを持つだけ、と why 自身が述べている)' },
  { file: 'src/shared/__tests__/integrityChainWitness.test.ts', kind: 'content-hash',
    why: '注記とは無関係 —— 保護対象の byte が動くので Merkle ルートが変わる。この道具を走らせる限り必ず落ちる' },
  { file: 'src/shared/__tests__/ontologyLaws.test.ts', kind: 'counts-comments',
    why: 'fold-must-pair は「必ず … と併用する」と述べる注記の母集団を数える —— 注記そのものが対象' },
  { file: 'src/shared/__tests__/pluginPlanConsumers.test.ts', kind: 'reads-docblock',
    why: 'pluginRuntime の docblock が「実行直前はまだ存在しない」と述べていることを留める (古い断定を残さない) + 標本が注記の中に在る' },
  { file: 'src/shared/__tests__/commentBlindLedger.test.ts', kind: 'reads-docblock',
    why: 'この道具の docblock が 5 つの kind を説明していることを留める (説明の無い語を台帳に置かせない)。道具の説明文そのものが対象なので、無意味にすれば必ず落ちる' },
  { file: 'src/shared/__tests__/lawCoverageLedger.test.ts', kind: 'sample-in-comment',
    why: 'パス 465 の直しの一部として「実物: exportSymlinkContainment の印は注記の中にしか無い」を標本に留めた。その前提の側 (原文には綴りが在る) が注記を読むので落ちる —— 騙されているのではなく、騙されうる実物を標本にしている' },
  { file: 'src/shared/__tests__/limitCoverageCensus.test.ts', kind: 'sample-in-comment',
    why: 'パス 465 の直しの一部として「実物: ceilingLiteralCensus の docblock の言及は参照に数えない」を標本に留めた。その前提の側 (原文には綴りが在る) が注記を読むので落ちる —— 上の双子と同じ形' },
  { file: 'src/shared/__tests__/regexPolynomialLedger.test.ts', kind: 'reads-docblock',
    why: 'lint:regex の門の説明文が「実物の最大の上限」を引いていることを留める —— 上限が増えたら説明文を読み直させる' },
];

const KINDS = ['sample-in-comment', 'reads-docblock', 'counts-comments', 'prose-in-population', 'content-hash'];

function patchAll(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-blind-'));
  const saved = [];
  const selfFail = [];
  files.forEach((f, i) => {
    const abs = path.join(REPO, f);
    const src = fs.readFileSync(abs, 'utf8');
    const out = blurComments(src);
    if (out === null) return;
    // 自己検査: 触ったのは注記だけ (注記を落とした姿が 1 字も変わらない)。
    if (stripComments(out) !== stripComments(src)) { selfFail.push(f); return; }
    const bak = path.join(dir, `${i}.bak`);
    fs.writeFileSync(bak, src);
    saved.push({ file: f, abs, bak, src });
    fs.writeFileSync(abs, out);
  });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(saved.map((s) => [s.bak, s.file]), null, 2));
  return { dir, saved, selfFail };
}

/** 必ず戻す。**戻したことを内容で確かめる** —— 戻し損ねたまま緑を返さない。 */
function restoreAll(saved) {
  const bad = [];
  for (const s of saved) {
    try {
      fs.writeFileSync(s.abs, s.src);
      if (fs.readFileSync(s.abs, 'utf8') !== s.src) bad.push(s.file);
    } catch {
      bad.push(s.file);
    }
  }
  return bad;
}

function failingFiles(stdout) {
  const out = new Set();
  for (const m of stdout.matchAll(/(?:FAIL|❯)\s+(src\/[^\s:]+\.test\.tsx?)/g)) out.add(m[1]);
  return [...out].sort();
}

function run(outPath) {
  const files = collect();
  console.log(`走査する本 (.tsx を除く): ${files.length}`);
  const { dir, saved, selfFail } = patchAll(files);
  console.log(`  注記を無意味にした本: ${saved.length} / 自己検査で飛ばした本: ${selfFail.length}`);
  for (const f of selfFail) console.log(`    [自己検査 ✗] ${f}`);
  console.log(`  控え: ${dir} (落ちたらここから戻す)`);
  let stdout;
  let bad;
  try {
    const r = cp.spawnSync('npm', ['test'], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    stdout = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    if (outPath) fs.writeFileSync(outPath, stdout);
  } finally {
    // 戻すのは finally で、答えを返すのはその外 (finally から return すると例外を握り潰す)。
    bad = restoreAll(saved);
  }
  if (bad.length > 0) {
    console.error(`\n❌ 戻せなかったファイルが ${bad.length} 本 —— ${dir} から手で戻すこと`);
    for (const b of bad) console.error(`   ${b}`);
    return 2;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 全件を元へ戻した (内容で照合)');
  const failing = failingFiles(stdout);
  console.log(`\n注記を無意味にすると落ちる検査: ${failing.length} 本`);
  for (const f of failing) {
    const row = LEDGER.find((r) => r.file === f);
    console.log(`  ${row ? `[${row.kind}]` : '[台帳に無い = 注記が答えになっている疑い]'} ${f}`);
  }
  const unlisted = failing.filter((f) => !LEDGER.some((r) => r.file === f));
  const gone = LEDGER.filter((r) => !failing.includes(r.file));
  if (unlisted.length > 0) {
    console.error(`\n❌ 台帳に無い検査が ${unlisted.length} 本 —— 注記ではなく宣言を見る形へ直すか、読む理由を台帳へ`);
  }
  if (gone.length > 0) {
    console.error(`\n❌ 台帳に在るのに落ちなかった検査が ${gone.length} 本 —— 直ったなら台帳からも消す`);
    for (const g of gone) console.error(`   ${g.file}`);
  }
  if (unlisted.length === 0 && gone.length === 0) {
    console.log('\n✅ 落ちた検査は台帳どおり (双方向)');
    return 0;
  }
  return 1;
}

/**
 * **ゲートの側の台帳** (2026-09-25 · パス 466)。
 *
 * `npm test` を覆ったので、次は **CI の執行層**を測った —— `verify:all` の 37 ゲートは
 * それまで 1 度も「注記を無意味にして」走らせていない。ゲートは検査より重い
 * (落ちれば push できない) ので、答えが散文に依っているならそちらが先である。
 *
 * **答え = 終了コード**で比べる。出力の差は答えではない —— 実測で 4 ゲートが
 * 文面だけ動くが、どれも exit 0 のまま (下の「測って何も無かった軸」)。
 * PID や所要時間を差分に数えると台帳が雑音で埋まる。
 *
 * `kind`:
 * - `prose-funds-the-budget`  … 規則が散文でも鳴る設計 (`codeOnly` でない 38 中 14) で、
 *                               免除の枠をその散文が食っている。**枠の内訳を名乗らせた**ので、
 *                               散文を消して同じ数だけ本物の違反を足すと鳴る (パス 466 の直し)
 * - `spawns-another-gate`     … 別のゲートを子プロセスで走らせているので、そちらの結果を継ぐ
 * - `reads-comment-directive` … 注記そのものが機械への指示 (理由つきの pragma)
 * - `self-test-sample`        … 自分の self-test の標本が注記の中に在る
 * - `content-hash`            … 注記とは無関係。ファイルの byte が動くので落ちる
 */
const GATE_LEDGER = [
  { gate: 'verify:arch', kind: 'spawns-another-gate',
    why: 'live metric「forbidden pattern count」が lint:forbidden を execSync で走らせるので、そちらが落ちれば落ちる。verify:arch 自身の記号の窓は stripComments を通る (パス 292 / 463)' },
  { gate: 'lint:forbidden', kind: 'prose-funds-the-budget',
    why: '38 規則のうち 14 は codeOnly でない —— 注記の中でも鳴るのは測って決めた方針 (パス 370)。免除の枠が 1 つの数なので散文が食う: 実測 53 行のうち 5 行 (3 規則) が一部/全部を散文で埋めており 3 行は全額。パス 466 で枠の内訳 (code N) を名乗らせた' },
  { gate: 'lint:mutation-scope', kind: 'reads-comment-directive',
    why: '理由の書かれていない Stryker の pragma を落とす門 —— 理由は注記なので、無意味にすれば「理由が無い」になる。門の目的そのもの' },
  { gate: 'lint:shared-judgement', kind: 'self-test-sample',
    why: 'self-test の標本「コードの否定は見え、散文の否定は落ちる」が注記の中の否定を数える (実測 原文 6 件 → 2 件 が 2 件 → 2 件 になる)。標本が注記を必要としている' },
  { gate: 'chain:verify', kind: 'content-hash',
    why: '注記とは無関係 —— 保護対象の byte が動くので Merkle ルートが変わる。この道具を走らせる限り必ず落ちる (npm test 側の integrityChainWitness と同じ理由)' },
];

const GATE_KINDS = ['prose-funds-the-budget', 'spawns-another-gate', 'reads-comment-directive', 'self-test-sample', 'content-hash'];

/**
 * `verify:all` が並べるゲート。**母集団は package.json から導く** ——
 * 手で並べると 38 個目を足した日にこの道具だけが古びる
 * (`verify:arch` の live metric と同じ 1 つの導き方)。
 */
function gates() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  return String((pkg.scripts ?? {})['verify:all'] ?? '')
    .split('&&')
    .map((x) => x.trim().replace(/^npm run /, ''))
    .filter(Boolean);
}

function runGates(outPath) {
  const list = gates();
  const files = collect();
  console.log(`走査する本 (.tsx を除く): ${files.length} / ゲート: ${list.length}`);
  const { dir, saved, selfFail } = patchAll(files);
  console.log(`  注記を無意味にした本: ${saved.length} / 自己検査で飛ばした本: ${selfFail.length}`);
  for (const f of selfFail) console.log(`    [自己検査 ✗] ${f}`);
  console.log(`  控え: ${dir} (落ちたらここから戻す)`);
  /** @type {Array<{gate: string, status: number}>} */
  const results = [];
  let log = '';
  let bad;
  try {
    for (const g of list) {
      // **1 本ずつ走らせる** —— `verify:all` は `&&` で繋がっているので、
      // 先頭が落ちると 3 番目から先が 1 度も走らない (答えが取れない)。
      const r = cp.spawnSync('npm', ['run', g], { cwd: REPO, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      const status = r.status === null ? 1 : r.status;
      results.push({ gate: g, status });
      log += `===== ${g} (exit ${status}) =====\n${r.stdout ?? ''}\n${r.stderr ?? ''}\n`;
      console.log(`  ${status === 0 ? '✓' : '✗'} ${g} (exit ${status})`);
    }
    if (outPath) fs.writeFileSync(outPath, log);
  } finally {
    bad = restoreAll(saved);
  }
  if (bad.length > 0) {
    console.error(`\n❌ 戻せなかったファイルが ${bad.length} 本 —— ${dir} から手で戻すこと`);
    for (const b of bad) console.error(`   ${b}`);
    return 2;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 全件を元へ戻した (内容で照合)');
  const failing = results.filter((r) => r.status !== 0).map((r) => r.gate);
  console.log(`\n注記を無意味にすると落ちるゲート: ${failing.length} / ${list.length}`);
  for (const g of failing) {
    const row = GATE_LEDGER.find((r) => r.gate === g);
    console.log(`  ${row ? `[${row.kind}]` : '[台帳に無い = ゲートの答えが散文に依っている疑い]'} ${g}`);
  }
  const unlisted = failing.filter((g) => !GATE_LEDGER.some((r) => r.gate === g));
  const gone = GATE_LEDGER.filter((r) => !failing.includes(r.gate));
  if (unlisted.length > 0) {
    console.error(`\n❌ 台帳に無いゲートが ${unlisted.length} 本 —— 散文ではなくコードを見る形へ直すか、読む理由を台帳へ`);
  }
  if (gone.length > 0) {
    console.error(`\n❌ 台帳に在るのに落ちなかったゲートが ${gone.length} 本 —— 直ったなら台帳からも消す`);
    for (const g of gone) console.error(`   ${g.gate}`);
  }
  if (unlisted.length === 0 && gone.length === 0) {
    console.log('\n✅ 落ちたゲートは台帳どおり (双方向)');
    return 0;
  }
  return 1;
}

function selfTest() {
  const fails = [];
  const ok = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) fails.push(label);
  };
  const line = 'const a = 1; // 秘密の説明\nconst b = 2;\n';
  const block = '/**\n * 説明の文。\n * @param {string} x\n */\nconst c = 3;\n';
  const pragma = '// eslint-disable-next-line no-console\nconsole.log(1);\n';
  const url = "const u = 'http://example.com/a'; // 本物の注記\n";
  // 「秘密の説明」は 5 字 —— 空白でない 1 文字を 1 文字へ替えるので長さは保たれる。
  ok('★ 行注記の本文を無意味にする (標本)', (blurComments(line) ?? '').includes('// xxxxx\n'));
  ok('★ code は 1 字も動かない (標本)', (blurComments(line) ?? '').startsWith('const a = 1;'));
  ok('★ JSDoc のタグは残す (標本)', (blurComments(block) ?? '').includes('@param {string} x'));
  ok('★ pragma は残す (標本)', blurComments(pragma) === null);
  ok('★ URL の後ろの注記は落とし、URL は残す (パス 464)',
    (blurComments(url) ?? '').includes("'http://example.com/a'") && !(blurComments(url) ?? '').includes('本物'));
  ok('★ 注記が無い本は null (冪等)', blurComments('const x = 1;\n') === null);
  ok('★ 自己検査が通る (注記を落とした姿が不変・標本)',
    stripComments(blurComments(block) ?? '') === stripComments(block));
  ok('★ 行数は変わらない (標本)',
    (blurComments(block) ?? '').split('\n').length === block.split('\n').length);
  ok('走査が実物に届いている (1000 本以上)', collect().length >= 1000);
  ok('走査に .tsx が入っていない', !collect().some((f) => f.endsWith('.tsx')));
  ok('落ちたファイルの読み取りが FAIL 行に当たる (標本)',
    failingFiles(' FAIL  src/shared/__tests__/x.test.ts > a > b\n').length === 1);
  ok('台帳の行はすべて理由を持つ', LEDGER.every((r) => typeof r.why === 'string' && r.why.trim().length > 20));
  ok('台帳の kind は既知の 5 種', LEDGER.every((r) => KINDS.includes(r.kind)));
  ok('台帳の行はすべて実在するファイルを指す',
    LEDGER.every((r) => fs.existsSync(path.join(REPO, r.file))));
  ok('台帳に重複が無い', new Set(LEDGER.map((r) => r.file)).size === LEDGER.length);
  ok('ゲートの母集団を package.json から導けている (30 本以上)', gates().length >= 30);
  ok('ゲートの母集団に npm run の接頭辞が残っていない', gates().every((g) => !g.startsWith('npm ')));
  ok('ゲートの台帳の行はすべて実在するゲートを指す',
    GATE_LEDGER.every((r) => gates().includes(r.gate)));
  ok('ゲートの台帳の kind は既知の 5 種', GATE_LEDGER.every((r) => GATE_KINDS.includes(r.kind)));
  ok('ゲートの台帳の行はすべて理由を持つ',
    GATE_LEDGER.every((r) => typeof r.why === 'string' && r.why.trim().length > 20));
  ok('ゲートの台帳に重複が無い', new Set(GATE_LEDGER.map((r) => r.gate)).size === GATE_LEDGER.length);
  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件失敗`);
    return 1;
  }
  console.log('\n✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const out = argv.find((a) => a.startsWith('--out='));
  const outPath = out ? out.slice('--out='.length) : null;
  return argv.includes('--gates') ? runGates(outPath) : run(outPath);
}

module.exports = { LEDGER, KINDS, GATE_LEDGER, GATE_KINDS, gates, collect, blurComments, failingFiles };

if (require.main === module) process.exit(main(process.argv.slice(2)));
