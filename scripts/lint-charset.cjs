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
 * 正当な出現の台帳。`ファイル::文字` をキーに理由を書く。
 * 双方向検証されるので、直したらここから消さないと落ちる。
 */
const ALLOWLIST = new Map([
  [
    'orchestration/knowledge-merge-plan.json::엄',
    '混入を修正した記録そのもの（『엄밀にはPLTではない』→『厳密に』と書いてある）',
  ],
  [
    'orchestration/knowledge-merge-plan.json::밀',
    '同上（修正記録の引用）',
  ],
  [
    'orchestration/knowledge-merge-plan.json::섭',
    '同上（『섭식障害』→『摂食障害』の修正記録）',
  ],
  [
    'orchestration/knowledge-merge-plan.json::식',
    '同上（修正記録の引用）',
  ],
]);

/** 走査対象。生成物 (dist / vault / graph) は元データを直せば直るので見ない。 */
const SCAN_DIRS = ['src', 'docs', 'orchestration', 'scripts'];
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

function main() {
  const files = [];
  for (const d of SCAN_DIRS) walk(path.join(REPO_ROOT, d), files);

  const findings = [];
  const seenKeys = new Set();

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    if (rel === SELF) continue;
    const text = fs.readFileSync(abs, 'utf8');

    for (const { name, re } of SCRIPT_RANGES) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const key = `${rel}::${m[0]}`;
        seenKeys.add(key);
        if (ALLOWLIST.has(key)) continue;
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
        if (ALLOWLIST.has(key)) continue;
        findings.push({
          rel, line: lineOf(text, i), char: simp, kind: '簡体字',
          hint: jp, context: context(text, i),
        });
      }
    }
  }

  const stale = [...ALLOWLIST.keys()].filter((k) => !seenKeys.has(k));

  console.log(
    `Checked ${files.length} file(s) for ${SCRIPT_RANGES.length} 文字体系 + ` +
      `${Object.keys(SIMPLIFIED).length} 簡体字（既知 ${ALLOWLIST.size} 件は台帳で除外）`,
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

  if (failed) process.exit(1);
  console.log(`✅ 他文字種・簡体字の混入はありません（既知 ${ALLOWLIST.size} 件は台帳のまま）`);
}

function context(text, index) {
  const a = Math.max(0, index - 25);
  const b = Math.min(text.length, index + 25);
  return text.slice(a, b).replace(/\s+/g, ' ');
}

main();
