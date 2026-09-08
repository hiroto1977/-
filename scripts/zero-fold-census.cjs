#!/usr/bin/env node
/**
 * 「割れない・測っていない値を 0 に倒す」箇所の **母集団を数える**。
 *
 * この本が作るのは**分母**であって、欠陥の一覧ではない。0 倒しには正しい物
 * (0 除算の防御・明示的な費用 0・作図の座標) と本物の欠陥
 * (パス 52〜60 で 10 件以上直した) の両方が在り、**どちらかは読まないと決まらない**。
 * だから本は「何件在るか」だけを決定的に出し、「正しいか」は
 * `docs/REMAINING_WORK.md` の散文が受け持つ。**数は機械が、判断は人が。**
 *
 * ## なぜ生成物にしたか (2026-09-08 · パス 85)
 *
 * この表は手で数えて手で書かれており、**誰も検算していなかった**。実測すると
 * 24 行のうち 12 行が食い違い、1 行はパスすら実在せず、何より
 * **母集団そのものが違った** —— 表は 26 ファイル、決定的な走査では **106 ファイル / 302 件**。
 * 載っていない最大の 2 つ (`shared/taxDeductions.ts` / `shared/employerBenefits.ts`)
 * は税と給付の計算で、保留メモが「この帯は残っていない」と書いた
 * **「相手に渡る面」そのもの**だった。
 *
 * しかもこの表は `lint:zero-fold` を**保留する判断の根拠**であり、
 * 「26 ファイル中 8 ファイルしか読んでいない」という分数を 2 度引いて保留した。
 * 分母が 4 倍違えば、その判断は根拠を失う。だから表を生成物にする ——
 * `docs/ACADEMIC_KNOWLEDGE.md` の概念表を `npm run knowledge:md` の生成物にして
 * `vault:check` が「再生成 == committed」を見るのと同じ形。
 *
 * ## 数の意味が変わったことを明記する
 *
 * 旧い数は「**番人が見た式が、真枝でその式の除算に使われ、偽枝が 0**」という
 * 意味論的な規則を人が当てたもので、**再現できない**。新しい数は
 * 下の `FOLD` が定義する**構文上の**量である。意図的に過剰に拾う ——
 * 分母は多い側に外すのが安全で、少ない側に外すと「もう無い」と誤読させる。
 * よって新旧の数を「訂正」として引き算しない。**別の量に置き換えた。**
 *
 * ## 走査の規則
 *
 * コメントと文字列を落としたうえで `? … : 0` / `?? 0` / `|| 0` を数える
 * (`__tests__` は除く —— 見本の 0 は製品の主張ではない)。
 *
 *   node scripts/zero-fold-census.cjs              表を再生成して書き戻す
 *   node scripts/zero-fold-census.cjs --check      再生成が committed と一致するか (差分なら exit 1)
 *   node scripts/zero-fold-census.cjs --self-test  検査そのものの対照 (陽性・陰性)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOC = path.join(REPO_ROOT, 'docs', 'REMAINING_WORK.md');
const SRC = path.join(REPO_ROOT, 'src');

const BEGIN = '<!-- zero-fold-census:begin — scripts/zero-fold-census.cjs が生成する。手で編集しない (npm run lint:zero-fold で再生成) -->';
const END = '<!-- zero-fold-census:end -->';
const HEADER = '| ファイル | 構文上の 0 倒し |';
const RULE = '| --- | ---: |';

/**
 * 走査の生死の床。**0 件を「問題なし」と読まない** ——
 * 走査が壊れた (regex の綴り違い・src の場所替え) ときに静かに通らせない。
 * 実測 (2026-09-08) は 106 ファイル / 302 件なので、その 8 割弱を床にする。
 */
const MIN_FILES = 80;
const MIN_SITES = 240;

/** 構文上の 0 倒し。**過剰に拾う** (分母は多い側に外す)。 */
const FOLD = /\?[^?;{}]{0,300}?:\s*0(?![\d.])|\?\?\s*0(?![\d.])|\|\|\s*0(?![\d.])/gs;

/**
 * コメントと文字列リテラルを落とす。**改行は保つ** ——
 * 保たないと行番号がずれ、この関数で「どの行か」を出せなくなる
 * (実際に 1 度ずれた出力を読んで別の行を調べかけた)。件数は改行を保っても変わらない。
 *
 * 落とす理由: `|| 0` が散文や見本の中に在っても数に入れないため ——
 * このファイル自身の doc コメントがまさにそれで、落とさないと本が自分を数える。
 */
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue; // 改行そのものは次の周で out に入る
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `src/` 配下の .ts / .tsx (`__tests__` を除く) を追跡順で。 */
function sourceFiles(root = SRC) {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        found.push(p);
      }
    }
  };
  walk(root);
  return found;
}

/** 1 ファイルの件数。 */
function countFolds(source) {
  return (stripCommentsAndStrings(source).match(FOLD) ?? []).length;
}

/** 全ファイルを数えて `{ rows, files, sites }` に。件数の多い順、同数はパス順。 */
function census(root = SRC) {
  const rows = [];
  let sites = 0;
  for (const abs of sourceFiles(root)) {
    const n = countFolds(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      rows.push({ file: path.relative(REPO_ROOT, abs).split(path.sep).join('/'), count: n });
      sites += n;
    }
  }
  rows.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  return { rows, files: rows.length, sites };
}

function renderTable(result) {
  const body = result.rows.map((r) => `| \`${r.file}\` | ${r.count} |`);
  return [
    BEGIN,
    `合計 **${result.files} ファイル / ${result.sites} 件**（構文上の数。正しい 0 と本物の欠陥の両方を含む）`,
    '',
    HEADER,
    RULE,
    ...body,
    END,
  ].join('\n');
}

/** 開始マーカーの見出し部分。**綴りを縮めた別形も検出する**ため、短い前置きで数える。 */
const BEGIN_TAG = '<!-- zero-fold-census:begin';

function findTable(doc) {
  // **マーカーは 1 組だけ。** 2026-09-08 まで、この本には
  // 空の `<!-- zero-fold-census:begin -->` / `end` の組が**もう 1 つ**在り、
  // しかも**散文が表を導入している場所がそちら**だった (パス 85 で私が書いた)。
  // `BEGIN` は説明文まで含む長い綴りなので `indexOf` は本物だけを見つけ、
  // 表は `applyTable` の「マーカーが無ければ末尾へ足す」経路で
  // **2,880 行離れた場所**へ付いていた —— 読者は空のブロックに行き着く。
  //
  // 今は無害でも、**`BEGIN` の綴りを少し縮めるだけで**`indexOf` が空の組を
  // 先に拾い、生成物がそちらへ書かれて**本物が黙って腐る** (ゲートは緑のまま)。
  // だから字面ではなく**組の数**を見て、複数あれば鳴らす (2026-09-08 · パス 95)。
  let n = 0;
  for (let i = doc.indexOf(BEGIN_TAG); i >= 0; i = doc.indexOf(BEGIN_TAG, i + 1)) n += 1;
  if (n > 1) {
    throw new Error(
      `開始マーカー "${BEGIN_TAG}…" が ${n} 組あります。生成物の行き先が定まらないので 1 組にしてください`,
    );
  }
  const begin = doc.indexOf(BEGIN);
  if (begin < 0) {
    // 短い別形だけが在る = 綴りが合っていない。末尾へ足すと二重になるので鳴らす。
    if (n === 1) {
      throw new Error(`開始マーカーの綴りが違います。次の 1 行にしてください:\n${BEGIN}`);
    }
    return null;
  }
  const end = doc.indexOf(END, begin);
  if (end < 0) throw new Error(`終端マーカー "${END}" がありません`);
  return { begin, end: end + END.length };
}

function applyTable(doc, table) {
  const found = findTable(doc);
  if (found) return doc.slice(0, found.begin) + table + doc.slice(found.end);
  return `${doc.replace(/\n+$/, '')}\n\n${table}\n`;
}

/** committed と再生成が食い違う理由 (一致なら null)。 */
function staleReason(doc, table) {
  const found = findTable(doc);
  if (!found) return 'census の生成ブロックが docs/REMAINING_WORK.md にありません';
  const committed = doc.slice(found.begin, found.end);
  if (committed === table) return null;
  const a = committed.split('\n');
  const b = table.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return `${i + 1} 行目が違います:\n  committed: ${a[i] ?? '(無し)'}\n  再生成:    ${b[i] ?? '(無し)'}`;
  }
  return '内容が違います';
}

function selfTest() {
  const fails = [];
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) fails.push(name);
  };

  // --- 走査の標本 (陽性): 3 つの綴りをそれぞれ拾う ---
  check('★ `? … : 0` を拾う', countFolds('const r = n > 0 ? a / n : 0;') === 1);
  check('★ `?? 0` を拾う', countFolds('const r = map.get(k) ?? 0;') === 1);
  check('★ `|| 0` を拾う', countFolds('const r = value || 0;') === 1);
  check('3 つ在れば 3 件', countFolds('a > 0 ? x / a : 0; b ?? 0; c || 0;') === 3);

  // --- 陰性 (数えない物) ---
  check('0 以外へ倒すのは数えない', countFolds('const r = n > 0 ? a / n : null;') === 0);
  check('小数は 0 ではない', countFolds('const r = x ?? 0.5;') === 0);
  check('行コメントの中は数えない', countFolds('// value || 0 と書いていた\nconst r = 1;') === 0);
  check('ブロックコメントの中は数えない', countFolds('/** `?? 0` を当てると */\nconst r = 1;') === 0);
  check('文字列の中は数えない', countFolds("const s = 'a ?? 0';") === 0);
  check('テンプレート文字列の中は数えない', countFolds('const s = `x || 0`;') === 0);
  check('数字が続く 0 は数えない (10 など)', countFolds('const r = x ?? 10;') === 0);

  // --- この本自身の doc が数に入らないこと (落とし忘れの対照) ---
  check(
    '★ この本の doc コメントを数えない (自分を数えていたら綴りが漏れている)',
    countFolds(fs.readFileSync(__filename, 'utf8')) === 0,
  );

  // --- 表の生成と突き合わせ ---
  const sample = { rows: [{ file: 'src/a.ts', count: 2 }, { file: 'src/b.ts', count: 1 }], files: 2, sites: 3 };
  const table = renderTable(sample);
  check('件数の多い順に並ぶ', table.indexOf('src/a.ts') < table.indexOf('src/b.ts'));
  check('合計を載せる', table.includes('**2 ファイル / 3 件**'));

  const doc = applyTable('# 見出し\n\n本文\n', table);
  check('マーカーが無ければ末尾へ足す', findTable(doc) !== null);
  check('一致していれば鳴らない', staleReason(doc, table) === null);
  check('★ 件数が 1 つ違えば鳴る', typeof staleReason(doc, renderTable({ ...sample, rows: [{ file: 'src/a.ts', count: 3 }, { file: 'src/b.ts', count: 1 }] })) === 'string');
  check('★ 行が 1 つ減っても鳴る', typeof staleReason(doc, renderTable({ rows: [sample.rows[0]], files: 1, sites: 2 })) === 'string');
  check('★ ブロックが無ければ鳴る', typeof staleReason('# 見出しだけ\n', table) === 'string');
  check('2 度当てても増えない', applyTable(doc, table) === doc);

  // --- マーカーの組が 1 つであること (パス 95) ---
  const strayPair = `${doc}\n<!-- zero-fold-census:begin -->\n${END}\n`;
  let threwOnDup = false;
  try {
    findTable(strayPair);
  } catch {
    threwOnDup = true;
  }
  check('★ 開始マーカーが 2 組あれば鳴る (生成物の行き先が定まらない)', threwOnDup);
  let threwOnTypo = false;
  try {
    findTable('# 見出し\n\n<!-- zero-fold-census:begin -->\n<!-- zero-fold-census:end -->\n');
  } catch {
    threwOnTypo = true;
  }
  check('★ 綴りの違う開始マーカーだけなら鳴る (末尾へ足して二重にしない)', threwOnTypo);
  check('対照: 正しい 1 組なら鳴らない', findTable(doc) !== null);
  check('対照: マーカーが 1 つも無ければ null (初回の足し込みは通す)', findTable('# 見出しだけ\n') === null);

  // --- 床そのものの対照 (床が実測より上なら落ちる) ---
  const real = census();
  check(`実測がファイルの床を超えている (${real.files} >= ${MIN_FILES})`, real.files >= MIN_FILES);
  check(`実測が件数の床を超えている (${real.sites} >= ${MIN_SITES})`, real.sites >= MIN_SITES);
  check('★ 空の木を走査したら床に掛かる (走査の死が「問題なし」にならない)', census(path.join(REPO_ROOT, 'scripts')).files < MIN_FILES);

  if (fails.length > 0) {
    console.error(`\n❌ self-test ${fails.length} 件不一致`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }

  const result = census();
  if (result.files < MIN_FILES || result.sites < MIN_SITES) {
    console.error(
      `❌ 走査が死んでいます: ${result.files} ファイル / ${result.sites} 件 ` +
        `(床は ${MIN_FILES} / ${MIN_SITES})。0 件を「問題なし」と読まないための床です。`,
    );
    process.exit(1);
  }

  const table = renderTable(result);
  const doc = fs.readFileSync(DOC, 'utf8');

  if (args.includes('--check')) {
    const reason = staleReason(doc, table);
    if (reason !== null) {
      console.error(`❌ census が古くなっています。\`npm run lint:zero-fold\` で再生成してください。\n${reason}`);
      process.exit(1);
    }
    console.log(`✅ census は最新 (${result.files} ファイル / ${result.sites} 件)`);
    return;
  }

  fs.writeFileSync(DOC, applyTable(doc, table));
  console.log(`✅ census を再生成しました (${result.files} ファイル / ${result.sites} 件)`);
}

if (require.main === module) main();

module.exports = { FOLD, stripCommentsAndStrings, countFolds, census, renderTable, findTable, applyTable, staleReason, MIN_FILES, MIN_SITES };
