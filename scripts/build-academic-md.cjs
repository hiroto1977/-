#!/usr/bin/env node
/**
 * docs/ACADEMIC_KNOWLEDGE.md の概念表を `src/renderer/data/academicKnowledge.ts` から生成する。
 *
 * ## なぜ生成にしたか
 *
 * 表は 2026-06 から「バッチごとに 6 行を手で追記」で運用してきた。統合パスで
 * 項目を畳んだときも手で行を消す約束だったが、誰も表と本体を突き合わせて
 * いなかった。2026-09-05 の実測:
 *
 *   表 3,589 行 / 本体 3,519 項目
 *   本体に同じ分野＋題名の項目が無い行 942 / 表に行が無い項目 909 / 題名の重複 67
 *   ビジネス法の分野ラベルが 商法・ビジネス法務・経営法学・経営法務 の 4 通り
 *
 * つまり「現在の確証済み概念」を名乗る表が、本体と 4 分の 1 ずれていた。
 * 手で追記する限り再発するので、表は本体から**生成**し、`vault:check`
 * (= `verify:all` / CI) が「再生成した表 == committed」を検証する。
 * `knowledge-vault/` と同じ扱い —— 本体 (`VERIFIED_CONCEPTS`) だけが真実源。
 *
 * ## 使い方
 *
 *   node scripts/build-academic-md.cjs               表を再生成して docs/ACADEMIC_KNOWLEDGE.md に書き込む
 *   node scripts/build-academic-md.cjs --check       再生成した表が committed と一致するか (差分があれば exit 1)
 *   node scripts/build-academic-md.cjs --self-test   検査そのものの対照 (陽性・陰性)
 *
 * 表は `<!-- academic-table:begin -->` … `<!-- academic-table:end -->` の
 * マーカーの間だけを置き換える。マーカーの外 (採録の原則・検証フロー) は手書きのまま。
 *
 * 本体の読み込みは `orchestration/knowledge-context.cjs` の `loadModuleExports`
 * (追跡済み `src/renderer/data/*.ts` だけを型を落として評価する、台帳つきの例外) を借りる。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOC = path.join(REPO_ROOT, 'docs', 'ACADEMIC_KNOWLEDGE.md');
const DATA = path.join(REPO_ROOT, 'src', 'renderer', 'data', 'academicKnowledge.ts');

const BEGIN = '<!-- academic-table:begin — scripts/build-academic-md.cjs が生成する。手で編集しない (npm run knowledge:md) -->';
const END = '<!-- academic-table:end -->';
const HEADER = '| 分野 | 概念 | 提唱者・初出 |';
const RULE = '| --- | --- | --- |';

/** `discipline` → 表の分野ラベル。採録の原則 4 (経済学 / 経営学 / 人間科学 / ビジネス法務 / 情報社会学) と揃える。 */
const DISCIPLINE_LABELS = Object.freeze({
  economics: '経済学',
  management: '経営学',
  'human-science': '人間科学',
  'business-law': 'ビジネス法務',
  'information-sociology': '情報社会学',
});

/** 表に載せる「提唱者・初出」の上限 (先頭から)。全文は本体 `keyFigures` にある。 */
const MAX_FIGURES = 3;

/**
 * `keyFigures` を '／' で分ける。ただし（…）の内側の '／' は区切りではない
 * (「（1977 個体群生態学／1984 構造的慣性）」のような併記が切れないように)。
 */
function splitKeyFigures(keyFigures) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(keyFigures == null ? '' : keyFigures)) {
    if (ch === '（' || ch === '(') depth += 1;
    else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '／' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * 表のセルに入れられる形へ。`src/shared/escape.ts` の `escapeMarkdownInline` と
 * **同じ 4 つの置換** (`\` → `\\`、`|` → `\|`、CR/LF → 空白、`<` → `&lt;`)。
 * ここは素の CJS で TS の共有実装を読めないので写しを持つ —— 写しが共有実装と
 * ずれていないことは `src/shared/__tests__/academicMdTable.test.ts` が
 * 両方に同じ標本を通して留める (`lint:forbidden` の台帳に件数つきで登録)。
 */
function cell(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/</g, '&lt;');
}

function renderRow(entry) {
  const label = DISCIPLINE_LABELS[entry.discipline];
  if (!label) throw new Error(`未知の discipline "${entry.discipline}" (${entry.id})`);
  if (!entry.title) throw new Error(`title が空 (${entry.id})`);
  const figures = splitKeyFigures(entry.keyFigures).slice(0, MAX_FIGURES).join(' ／ ');
  return `| ${label} | ${cell(entry.title)} | ${cell(figures)} |`;
}

/** 本体の順 (追加順) のまま表にする。 */
function renderTable(entries) {
  return [BEGIN, HEADER, RULE, ...entries.map(renderRow), END].join('\n');
}

function loadEntries() {
  const { loadModuleExports } = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
  const mod = loadModuleExports(DATA);
  const list = mod.VERIFIED_CONCEPTS;
  if (!Array.isArray(list) || list.length === 0) throw new Error(`VERIFIED_CONCEPTS が読めません (${DATA})`);
  return list;
}

/** マーカーで囲まれた表の位置。無ければ null。 */
function findTable(doc) {
  const begin = doc.indexOf(BEGIN);
  if (begin < 0) return null;
  const end = doc.indexOf(END, begin);
  if (end < 0) throw new Error(`終端マーカー "${END}" がありません`);
  return { begin, end: end + END.length };
}

/**
 * 表を差し替えた文書を返す。マーカーが無い文書 (初回移行) は、ヘッダ行から
 * **最後の表行**までを 1 つの表とみなして置き換える。手書き時代の表はバッチの
 * 区切りに空行を挟んでいた (2026-09-05 実測で 13 か所) ので、空行は表の一部として
 * 読む。空行でも表行でもない行が挟まっていたら、何を消すことになるか分からないので
 * 書き込まずに例外にする。
 */
function applyTable(doc, table) {
  const found = findTable(doc);
  if (found) return doc.slice(0, found.begin) + table + doc.slice(found.end);
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.trim() === HEADER);
  if (start < 0) throw new Error(`表が見つかりません (マーカーもヘッダ行 "${HEADER}" もない)`);
  let last = start;
  for (let i = start + 1; i < lines.length; i += 1) if (lines[i].startsWith('|')) last = i;
  for (let i = start + 1; i < last; i += 1) {
    if (!lines[i].startsWith('|') && lines[i].trim() !== '') {
      throw new Error(`旧表の途中 (${i + 1} 行目) に表でも空行でもない行があります: "${lines[i].slice(0, 60)}"`);
    }
  }
  return [...lines.slice(0, start), table, ...lines.slice(last + 1)].join('\n');
}

/** committed の表と再生成した表の差を要約する (一致なら null)。 */
function staleReason(doc, table) {
  const found = findTable(doc);
  if (!found) return 'マーカー付きの表がありません — `npm run knowledge:md` で生成してください';
  const committed = doc.slice(found.begin, found.end);
  if (committed === table) return null;
  const a = committed.split('\n');
  const b = table.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const at = i < a.length ? a[i] : '(行が足りない)';
  const want = i < b.length ? b[i] : '(行が余っている)';
  return `表が本体とずれています (committed ${a.length - 3} 行 / 再生成 ${b.length - 3} 行)。最初の差: 表側 "${at.slice(0, 80)}" / 本体側 "${want.slice(0, 80)}" — \`npm run knowledge:md\` で再生成してください`;
}

function selfTest() {
  const failures = [];
  const check = (name, ok) => {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failures.push(name);
  };
  const e1 = { id: 'econ-x', discipline: 'economics', title: 'X理論——要約', keyFigures: 'A（1977 甲／1984 乙）／B／C／D' };
  const e2 = { id: 'bizlaw-y', discipline: 'business-law', title: 'Y | 縦棒', keyFigures: 'E' };
  // 陽性: 期待する行がそのまま出る
  check('（…）内の ／ は区切らない', JSON.stringify(splitKeyFigures(e1.keyFigures)) === JSON.stringify(['A（1977 甲／1984 乙）', 'B', 'C', 'D']));
  check('★ 対照: 素朴な split なら 5 分割になる', e1.keyFigures.split('／').length === 5);
  check('先頭 3 件までを載せる', renderRow(e1) === '| 経済学 | X理論——要約 | A（1977 甲／1984 乙） ／ B ／ C |');
  check('ビジネス法は「ビジネス法務」で 1 通り、\'|\' はエスケープ', renderRow(e2) === '| ビジネス法務 | Y \\| 縦棒 | E |');
  let threw = false;
  try {
    renderRow({ id: 'z', discipline: 'zoology', title: 'Z' });
  } catch {
    threw = true;
  }
  check('未知の discipline は例外', threw);
  // 表の差し替え: 初回 (マーカー無し) と 2 回目 (マーカー有り) の両方が同じ結果になる
  const legacy = ['# 見出し', '', HEADER, RULE, '| 経済学 | 古い行 | 誰か |', '', '| 経営学 | 空行の後の古い行 | 誰か |', '', '脚注'].join('\n');
  const table = renderTable([e1, e2]);
  const once = applyTable(legacy, table);
  check('マーカー無しの表はヘッダから最後の表行まで (途中の空行ごと) 置き換える', once === ['# 見出し', '', table, '', '脚注'].join('\n'));
  threw = false;
  try {
    applyTable(['# 見出し', HEADER, RULE, '| 経済学 | 行 | 誰か |', '表でない文', '| 経営学 | 行 | 誰か |'].join('\n'), table);
  } catch {
    threw = true;
  }
  check('旧表の途中に表でも空行でもない行があれば書き込まない (例外)', threw);
  check('マーカー有りの表を再適用しても同じ', applyTable(once, table) === once);
  check('置き換え後は最新 (差分なし)', staleReason(once, table) === null);
  // 陰性: 1 行でも違えば鳴る
  const tampered = once.replace('| 経済学 | X理論——要約 |', '| 経済学 | X理論——書き換え |');
  check('★ 表の 1 行が本体と違えば鳴る', typeof staleReason(tampered, table) === 'string');
  check('★ 行が 1 つ足りなくても鳴る', typeof staleReason(applyTable(once, renderTable([e1])), table) === 'string');
  check('★ マーカーが無ければ鳴る', typeof staleReason(legacy, table) === 'string');
  threw = false;
  try {
    applyTable('# 表の無い文書', table);
  } catch {
    threw = true;
  }
  check('表もマーカーも無い文書には書き込まない (例外)', threw);
  if (failures.length) {
    console.error(`❌ self-test 失敗: ${failures.length} 件`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const entries = loadEntries();
  const table = renderTable(entries);
  const doc = fs.readFileSync(DOC, 'utf8');
  if (argv.includes('--check')) {
    const reason = staleReason(doc, table);
    if (reason) {
      console.error(`❌ docs/ACADEMIC_KNOWLEDGE.md: ${reason}`);
      process.exit(1);
    }
    console.log(`✅ docs/ACADEMIC_KNOWLEDGE.md の概念表は本体と一致 (${entries.length} 行)`);
    return;
  }
  const next = applyTable(doc, table);
  if (next === doc) {
    console.log(`✅ docs/ACADEMIC_KNOWLEDGE.md は最新 (${entries.length} 行)`);
    return;
  }
  fs.writeFileSync(DOC, next);
  console.log(`✅ docs/ACADEMIC_KNOWLEDGE.md の概念表を再生成 (${entries.length} 行)`);
}

if (require.main === module) main();

module.exports = { BEGIN, END, HEADER, DISCIPLINE_LABELS, MAX_FIGURES, splitKeyFigures, cell, renderRow, renderTable, findTable, applyTable, staleReason };
