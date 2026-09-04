#!/usr/bin/env node
/**
 * lint:charset — 日本語テキストへの他文字種・簡体字の混入を検出する。
 *
 * ## なぜ要るのか
 *
 * このリポジトリのテキストは LLM が生成する。生成時に稀に別言語の文字が
 * 紛れ込む。実測された混入:
 *
 *   キリル文字 「суп」「тан」「ри」 / ハングル 「엄밀」「섭식」「케」
 *   簡体字     债→債、个→個、经→経、调→調、显→顕、权→権
 *
 * 前者は Unicode のブロックが分かれているので範囲走査で拾える。
 * **問題は後者**で、簡体字・日本語新字体・繁体字は同じ CJK 統合漢字ブロックに
 * 同居しているため、**範囲走査では原理的に検出できない**。実際そのせいで
 * 「範囲スキャン clean」と報告した直後に手作業で 5 文字見つかっている。
 * だから簡体字は **字を列挙するしかない**。
 *
 * ## 列挙するときの罠（実際に踏んだ）
 *
 * 「简体字っぽい字」を並べると誤検出する。**日本語の新字体と同形の字**が
 * あるからだ。以下は簡体字であると同時に**正しい日本語**なので、
 * 絶対にリストへ入れてはいけない:
 *
 *   号 国 学 尽 写 点 医 会 体 来 万 声 麦 虫 礼 台 与 対※
 *
 * 最初の実装で 号・国・学 を入れてしまい、正常な日本語ドキュメントを
 * 3 件誤検出した。リストに字を足すときは必ず
 * 「これは日本語として正しくないか？」を先に問うこと。
 *
 * ※ 対 は日本語。簡体字の 对 とは別字（下の表では 对 のほうを載せている）。
 *
 * ## ギリシャ文字を対象にしない理由
 *
 * α β μ σ Δ Ω は数式・統計・物理の記述で正当に使われる。混入と区別が
 * つかないので、そもそも検査しない。
 *
 * ## 台帳（ALLOWLIST）
 *
 * 「混入を修正した記録」そのものが混入文字を引用することがある。実例:
 * orchestration/knowledge-merge-plan.json は
 * 「『섭식障害』→『摂食障害』に修正した」と書いてあり、これは正当。
 * こうした正当な出現は台帳へ理由つきで退避する。
 * 台帳は **双方向** で、載っているのに検出されなくなったら落ちる
 * （＝直したら台帳から消すことが強制される）。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

/**
 * 日本語テキストに現れてはいけない文字体系。
 * ギリシャ文字は数式で正当に使うため**含めない**。
 * ラテン文字・記号・カナ・漢字・全角英数は当然対象外。
 */
const SCRIPT_RANGES = [
  { name: 'キリル文字', re: /[Ѐ-ӿԀ-ԯ]/g },
  { name: 'ハングル', re: /[가-힯ᄀ-ᇿ㄰-㆏]/g },
  { name: 'アラビア文字', re: /[؀-ۿݐ-ݿ]/g },
  { name: 'タイ文字', re: /[฀-๿]/g },
  { name: 'デーヴァナーガリー', re: /[ऀ-ॿ]/g },
  { name: 'ヘブライ文字', re: /[֐-׿]/g },
];

/**
 * 簡体字 → 対応する日本語表記。
 *
 * **収録基準**: 簡体字であり、かつ**日本語として通用しない**字だけ。
 * 日本語新字体と同形の字（号・国・学・写・点・医…）は上のコメントの
 * とおり収録しない。網羅は目指していない（CJK 全体の対照表は巨大で、
 * 誤検出を招く境界例が多い）。**実測で混入した字と、それに近い高頻度字**を
 * 押さえる方針。混入を新たに見つけたらここへ足す。
 */
const SIMPLIFIED = {
  债: '債', 个: '個', 经: '経', 调: '調', 显: '顕', 权: '権', 实: '実',
  转: '転', 发: '発', 际: '際', 间: '間', 问: '問', 题: '題', 应: '応',
  关: '関', 说: '説', 话: '話', 时: '時', 对: '対', 产: '産', 义: '義',
  务: '務', 员: '員', 见: '見', 们: '們', 长: '長', 门: '門', 马: '馬',
  鸟: '鳥', 鱼: '魚', 车: '車', 东: '東', 书: '書', 买: '買', 卖: '売',
  头: '頭', 汉: '漢', 观: '観', 欢: '歓', 难: '難', 鸡: '鶏', 岁: '歳',
  归: '帰', 张: '張', 单: '単', 战: '戦', 业: '業', 乐: '楽', 习: '習',
  认: '認', 识: '識', 语: '語', 读: '読', 课: '課', 谁: '誰', 请: '請',
  谢: '謝', 讲: '講', 论: '論', 议: '議', 计: '計', 记: '記', 设: '設',
  访: '訪', 证: '証', 评: '評', 试: '試', 风: '風', 飞: '飛', 龙: '竜',
  齐: '斉', 劳: '労', 动: '動', 农: '農', 处: '処', 备: '備', 兴: '興',
  举: '挙', 银: '銀', 铁: '鉄', 钱: '銭', 环: '環', 资: '資', 济: '済',
  贸: '貿', 储: '儲', 贷: '貸', 贫: '貧', 费: '費', 质: '質', 价: '価',
  团: '団', 图: '図', 园: '園', 广: '広', 术: '術', 严: '厳', 单独: null,
};
delete SIMPLIFIED['单独']; // 表の見た目を揃えるためのダミーを落とす

/**
 * **簡体字であると同時に正しい日本語**の字。SIMPLIFIED に入れてはいけない。
 *
 * 上のコメントに「最初の実装で 号・国・学 を入れて正常な文書を 3 件誤検出した」と
 * 書いてあるが、書いてあるだけでは同じ罠をもう一度踏む。表の不変条件として
 * 毎回機械で確かめる (checkTable)。字を足したくなったら、まず
 * 「これは日本語として正しくないか？」を問うこと。
 */
const NEVER_FLAG = new Set([...'号国学尽写点医会体来万声麦虫礼台与対']);

/**
 * SIMPLIFIED 表そのものの健全性。データの検査ではなく**規則の検査**なので、
 * 走査対象が 0 件でも走る。
 */
function checkTable(table = SIMPLIFIED, never = NEVER_FLAG) {
  const problems = [];
  const keys = Object.keys(table);
  const keySet = new Set(keys);
  for (const [simp, jp] of Object.entries(table)) {
    if (never.has(simp)) {
      problems.push(`「${simp}」は日本語として正しい字です — 載せると正常な文書を誤検出します`);
    }
    if (simp === jp) {
      // 自分自身への置換は、下の「置換先がキーにも在る」も自動的に満たす。
      // 根っこだけを言う (両方出すと数がぶれて、対照実験が読みにくくなる)。
      problems.push(`「${simp}」は置換先が自分自身です — 直しようがありません`);
    } else if (keySet.has(jp)) {
      problems.push(`「${simp}」→「${jp}」の置換先が表のキーにも在ります — 直した途端に次が鳴ります`);
    }
  }
  return problems;
}

/**
 * 正当な出現の台帳。`ファイル::文字` をキーに理由を書く。
 * 双方向検証されるので、直したらここから消さないと落ちる。
 */
const ALLOWLIST = new Map([
  [
    'orchestration/knowledge-merge-plan.json::엄',
    { n: 1, why: '混入を修正した記録そのもの（『엄밀にはPLTではない』→『厳密に』と書いてある）' },
  ],
  [
    'orchestration/knowledge-merge-plan.json::밀',
    { n: 1, why: '同上（修正記録の引用）' },
  ],
  [
    'orchestration/knowledge-merge-plan.json::섭',
    { n: 1, why: '同上（『섭식障害』→『摂食障害』の修正記録）' },
  ],
  [
    'orchestration/knowledge-merge-plan.json::식',
    { n: 1, why: '同上（修正記録の引用）' },
  ],
]);

/** 走査対象。生成物 (dist / vault / graph) は元データを直せば直るので見ない。 */
/*
 * 走査対象 (2026-08-22 に広げた)。
 *
 * 以前は src / docs / orchestration / scripts の 4 つだけで、**リポジトリ直下の
 * `CLAUDE.md` と `README.md` が入っていなかった**。CLAUDE.md は次のセッションへの
 * 指示そのもので、ここに簡体字が混ざるのはこのゲートが防ぎたい事故の中心にある。
 * `security/` (改竄検知の台帳) と `.github/` (ワークフロー) も同様に外だった。
 */
const SCAN_DIRS = ['src', 'docs', 'orchestration', 'scripts', 'security', 'assets', '.github'];
/** 直下のファイルは再帰では拾えない (`.` を足すと全部を二重に数えてしまう)。 */
const SCAN_ROOT_FILES = true;
const SCAN_EXTS = new Set(['.ts', '.tsx', '.md', '.json', '.cjs']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'dist-chunks',
  'knowledge-vault', 'knowledge-graph', 'coverage', 'tmp-screenshots',
]);

/** このスクリプト自身は簡体字の対照表を持つので当然ヒットする。除外する。 */
const SELF = path.relative(REPO_ROOT, __filename);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (SCAN_EXTS.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * 1 ファイル分を走査する。ディスクから切り離してあるのは自己検査のため。
 *
 * @returns `{ findings, seenKeys }` — seenKeys は台帳の双方向検証に使う
 *   (載っているのに一度も現れなければ、その項目はもう古い)。
 */
/**
 * **台帳は「何件まで許すか」まで持つ。**
 *
 * 2026-08-23 まで鍵は `パス::字` だけで、件数を見ていなかった。つまり
 * **免除済みの字は、そのファイルの中なら何度でも増やせた** ——
 * 実測で確認済み (別の場所へ `엄` をもう 1 件足しても緑のまま通った)。
 * `lint:forbidden` の例外台帳と同じ穴で、直し方も同じ。
 *
 * 免除は「この記録に 1 回出てくる」ことへの免除であって、
 * 「この字はこのファイルで自由」ではない。
 */
function scanText(rel, text, allow = ALLOWLIST) {
  const findings = [];
  const seenKeys = new Set();
  /** 鍵ごとに何件目かを数える。許された件数を超えた分だけ findings に載る。 */
  const seenCount = new Map();

  const allowed = (key) => {
    const entry = allow.get(key);
    const nth = (seenCount.get(key) ?? 0) + 1;
    seenCount.set(key, nth);
    return entry !== undefined && nth <= entry.n;
  };

  for (const { name, re } of SCRIPT_RANGES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const key = `${rel}::${m[0]}`;
      seenKeys.add(key);
      if (allowed(key)) continue;
      findings.push({
        rel, line: lineOf(text, m.index), char: m[0], kind: name,
        hint: null, context: context(text, m.index),
      });
    }
  }

  for (const [simp, jp] of Object.entries(SIMPLIFIED)) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(simp, from);
      if (i === -1) break;
      from = i + 1;
      const key = `${rel}::${simp}`;
      seenKeys.add(key);
      if (allowed(key)) continue;
      findings.push({
        rel, line: lineOf(text, i), char: simp, kind: '簡体字',
        hint: jp, context: context(text, i),
      });
    }
  }

  return { findings, seenKeys };
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

/*
 * このゲートは**緑であることが正常**なので、鳴らなくなっても誰も気づけない。
 * 実測で踏んだ 2 つの罠を、規則そのものへの入力として毎回確かめる:
 *
 *   1. 日本語新字体と同形の字 (号 国 学 …) を混入と読まないこと。
 *      読んだら正常な文書が落ち、次の人は「うるさいから」と規則を緩める。
 *   2. 台帳が双方向であること。片方向にすると、直した後も台帳が残り、
 *      その字は永久に見逃される。
 */
function selfTest() {
  const cases = [
    ['普通の日本語は鳴らない', '税理士に確認してください。', 0],
    ['ギリシャ文字は対象外 (数式で正当に使う)', 'α β μ σ Δ Ω の分散', 0],
    ['日本語新字体と同形の字は鳴らない (実測で踏んだ罠)', '号国学尽写点医会体来万声麦虫礼台与対', 0],
    ['キリル文字は 1 文字 1 件', 'суп', 3],
    ['ハングル', '엄密には', 1],
    ['簡体字 1 文字', '债務の話', 1],
    ['同じ字が 2 回出れば 2 件', '债と债', 2],
    ['文字体系と簡体字が混ざれば両方', 'суп と 债', 4],
    /*
     * ここから 4 件は 2026-08-25 に足した。**キリル文字と簡体字以外は
     * 「鳴る標本」を持っていなかった** —— 正規表現を潰しても self-test が
     * 通る (実測: 6 種を 1 つずつ潰したところ 4 種が完全に無音)。
     *
     * 標本は**コードポイントから組む**。字を直接書くとこのファイル自身が
     * 混入検査に引っかかり、**自分の標本を自分の台帳に載せる**ことになる
     * (門が禁じている物を門自身が抱える形。このリポジトリで 4 度出ている)。
     */
    ['アラビア文字 (U+0645)', String.fromCodePoint(0x0645), 1],
    ['タイ文字 (U+0E01)', String.fromCodePoint(0x0e01), 1],
    ['デーヴァナーガリー (U+0915)', String.fromCodePoint(0x0915), 1],
    ['ヘブライ文字 (U+05D0)', String.fromCodePoint(0x05d0), 1],
  ];

  let failed = 0;
  console.log('self-test:');
  for (const [label, text, want] of cases) {
    const got = scanText('t.md', text, new Map()).findings.length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }

  /*
   * **どの文字体系にも「鳴る標本」があること。**
   *
   * 上の表は「この文字列が何件出すか」しか見ておらず、範囲を 1 つ潰しても
   * その範囲に当たる標本が無ければ**件数は変わらず self-test は通る**。
   * 混入は「たまたま今どこかに在る」ものなので、台帳が肩代わりする保証も
   * 無い —— 実際 2026-08-25 の実測では、**6 種のうち 4 種が完全に無音**
   * だった (台帳が拾ったのはハングルだけ)。
   */
  const positiveTexts = cases.filter(([, , want]) => want > 0).map(([, text]) => text);
  const uncoveredRanges = SCRIPT_RANGES.filter(
    (r) => !positiveTexts.some((t) => t.match(r.re) !== null),
  );
  if (uncoveredRanges.length > 0) {
    failed += uncoveredRanges.length;
    console.log(`  ✗ 鳴る標本を持たない文字体系が ${uncoveredRanges.length} 件:`);
    for (const r of uncoveredRanges) console.log(`      - ${r.name}`);
  } else {
    console.log(`  ✓ 全 ${SCRIPT_RANGES.length} 種の文字体系に鳴る標本がある`);
  }

  // 台帳は双方向 — 載っていれば黙り、載っているのに現れなければ古い。
  const allow = new Map([['t.md::债', { n: 1, why: '理由' }]]);
  const muted = scanText('t.md', '债務の話', allow);
  const mutedOk = muted.findings.length === 0 && muted.seenKeys.has('t.md::债');
  if (!mutedOk) failed += 1;
  console.log(`  ${mutedOk ? '✓' : '✗'} 台帳に載っていれば黙る (かつ「見た」と記録する): ${muted.findings.length} 件 / seen=${muted.seenKeys.has('t.md::债')} (期待 0 件 / seen=true)`);

  /*
   * **免除は件数まで。** 2026-08-23 まで鍵は `パス::字` だけで、
   * 免除済みの字はそのファイルの中なら何度でも増やせた。
   * 1 件だけ許した台帳で 2 件出れば、超えた 1 件が鳴る。
   */
  const twice = scanText('t.md', '债務と债権の話', allow);
  const twiceOk = twice.findings.length === 1;
  if (!twiceOk) failed += 1;
  console.log(`  ${twiceOk ? '✓' : '✗'} 免除 1 件の字が 2 回出れば超えた分が鳴る: ${twice.findings.length} 件 (期待 1)`);

  const allowTwo = new Map([['t.md::债', { n: 2, why: '理由' }]]);
  const twoOk = scanText('t.md', '债務と债権の話', allowTwo).findings.length === 0;
  if (!twoOk) failed += 1;
  console.log(`  ${twoOk ? '✓' : '✗'} 2 件まで許していれば 2 件は黙る (境界): ${twoOk ? 0 : 'x'} 件 (期待 0)`);

  const three = scanText('t.md', '债務と债権と债券', allowTwo).findings.length;
  const threeOk = three === 1;
  if (!threeOk) failed += 1;
  console.log(`  ${threeOk ? '✓' : '✗'} 2 件まで許して 3 件出れば 1 件鳴る (境界+1): ${three} 件 (期待 1)`);

  const absent = scanText('t.md', '債務の話', allow);
  const staleOk = [...allow.keys()].filter((k) => !absent.seenKeys.has(k)).length === 1;
  if (!staleOk) failed += 1;
  console.log(`  ${staleOk ? '✓' : '✗'} 直したのに台帳が残っていれば stale と分かる: ${staleOk ? '分かる' : '分からない'} (期待 分かる)`);

  // 表そのものの不変条件。壊した表を食わせて 1 件ずつ鳴らす。
  const tableCases = [
    ['正しい表は問題なし', { 债: '債' }, 0],
    ['日本語として正しい字を載せた', { 国: '國' }, 1],
    ['置換先が自分自身', { 债: '债' }, 1],
    ['置換先が表のキーにも在る', { 债: '个', 个: '個' }, 1],
    ['本物の表 (97 項目) に問題なし', SIMPLIFIED, 0],
  ];
  for (const [label, table, want] of tableCases) {
    const got = checkTable(table, NEVER_FLAG).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} 表の不変条件: ${label}: ${got} 件 (期待 ${want})`);
  }

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(REPO_ROOT, d), files);
  if (SCAN_ROOT_FILES) {
    for (const e of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (SCAN_EXTS.has(path.extname(e.name))) files.push(path.join(REPO_ROOT, e.name));
    }
  }

  const findings = [];
  const seenKeys = new Set();

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    if (rel === SELF) continue;
    const r = scanText(rel, fs.readFileSync(abs, 'utf8'));
    findings.push(...r.findings);
    for (const k of r.seenKeys) seenKeys.add(k);
  }

  const stale = [...ALLOWLIST.keys()].filter((k) => !seenKeys.has(k));
  const tableProblems = checkTable();

  console.log(
    `Checked ${files.length} file(s) for ${SCRIPT_RANGES.length} 文字体系 + ` +
      `${Object.keys(SIMPLIFIED).length} 簡体字（既知 ${ALLOWLIST.size} 件は台帳で除外）` +
      `／表の不変条件 ${Object.keys(SIMPLIFIED).length} 項目`,
  );

  let failed = false;

  if (findings.length > 0) {
    failed = true;
    console.error(`\n❌ ${findings.length} 件の混入を検出しました\n`);
    for (const f of findings) {
      const fix = f.hint === null ? '日本語に置き換えてください' : `→ ${f.hint}`;
      console.error(`  ${f.rel}:${f.line}  [${f.kind}] 「${f.char}」 ${fix}`);
      console.error(`    …${f.context}…`);
    }
    console.error(
      '\n直し方: 該当箇所を正しい日本語表記へ置き換えてください。',
    );
    console.error(
      '        正当な出現（混入を修正した記録の引用など）なら、',
    );
    console.error(
      '        scripts/lint-charset.cjs の ALLOWLIST へ理由つきで退避。',
    );
  }

  if (stale.length > 0) {
    failed = true;
    console.error(`\n❌ 台帳に載っているのに検出されない項目が ${stale.length} 件あります\n`);
    for (const k of stale) console.error(`  ${k}`);
    console.error('\n直ったなら ALLOWLIST から削除してください（台帳は双方向です）。');
  }

  if (tableProblems.length > 0) {
    failed = true;
    console.error(`\n❌ SIMPLIFIED 表そのものに ${tableProblems.length} 件の問題があります\n`);
    for (const p of tableProblems) console.error(`  ${p}`);
  }

  if (failed) process.exit(1);
  console.log(`✅ 他文字種・簡体字の混入はありません（既知 ${ALLOWLIST.size} 件は台帳のまま）`);
}

function context(text, index) {
  const a = Math.max(0, index - 25);
  const b = Math.min(text.length, index + 25);
  return text.slice(a, b).replace(/\s+/g, ' ');
}

if (process.argv.slice(2).includes('--self-test')) {
  process.exit(selfTest());
}

main();
