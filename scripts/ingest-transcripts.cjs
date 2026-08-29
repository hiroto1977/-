#!/usr/bin/env node
/**
 * 動画の字幕を取り込み、**そこから取った主張が本当にその字幕に在るか**を確かめる。
 *
 * ## なぜ要るのか (2026-08-27 に実際にやらかしたこと)
 *
 * YouTube チャンネルから枠組みを取り出して手引きを作ったとき、
 * **組織病 3 件の語釈を名前から推測で書き、3 つとも間違っていた**。
 * 同じ項目を 1 日に 2 度訂正し、根拠が「読めないページの検索要約」だった節に
 * 最も強い出典ラベルを付けて、後で降格した。
 *
 * 原因は単純で、**「原文にその言い方が在る」ことを誰も確かめていなかった**。
 * 読んだつもりで書いた文が、読んだ物のどこにも無い —— これは目視では
 * 見つからない。字面で当てれば必ず見つかる。
 *
 * そこでこの本は 1 つのことだけをする ——
 * **主張が引く逐語 (`quote`) が、その動画の字幕に実際に現れるか。**
 *
 * ## 何を正規化し、何を正規化しないか (ここが緩いと検査が空になる)
 *
 * 正規化するのは**空白だけ**。字幕は文の途中で改行が入り、全角空白も混ざる。
 * 行の折り方が違うだけで落ちるなら使い物にならない。
 *
 * **文字は一切正規化しない。** 全角/半角、異体字、送り仮名の揺れを吸収すると、
 * 「だいたい合っている」を通してしまい、**引用が引用でなくなる**。
 * 1 文字でも違えば落とす。それがこの検査の存在理由である。
 *
 * ## 使い方
 *
 *   ingest/<channel>/<videoId>.md    字幕 (frontmatter + 本文)
 *   ingest/<channel>/claims.json     抽出した主張 (任意)
 *
 *   node scripts/ingest-transcripts.cjs [--dir ingest]
 *   node scripts/ingest-transcripts.cjs --self-test
 *
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 受け付ける出典強度。`src/shared/provenance.ts` と同じ語彙。 */
const SOURCE_STRENGTH = ['confirmed', 'secondary', 'gloss'];

/**
 * 空白だけを潰す。**文字は触らない。**
 *
 * 明示するのは**ゼロ幅スペース (U+200B) だけ**。全角空白 (U+3000) も
 * BOM (U+FEFF) も NBSP (U+00A0) も `\s` が既に拾うので、並べると
 * 冗長になり「消しても何も変わらない」等価変異を自分で作ることになる
 * (2026-08-29 に実測して確かめた)。U+200B は Cf であって Zs ではないため
 * `\s` の外にあり、字幕の書き出しに実際に混ざる。
 */
function collapseSpace(s) {
  return String(s).replace(/[\s\u200B]+/g, '');
}

/** frontmatter (`---` で挟んだ `key: value`) と本文に割る。 */
function parseTranscript(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text));
  if (m === null) return { meta: null, body: '', problems: ['frontmatter (--- で挟んだ見出し) がありません'] };
  const meta = {};
  const problems = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const kv = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (kv === null) {
      problems.push(`frontmatter の行を読めません: ${JSON.stringify(line.slice(0, 40))}`);
      continue;
    }
    meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2], problems };
}

/** 字幕 1 本として成立しているか。**欠けたまま静かに通さない。** */
function validateTranscript(rel, parsed) {
  const problems = parsed.problems.map((p) => `${rel}: ${p}`);
  if (parsed.meta === null) return problems;
  for (const key of ['title', 'videoId', 'publishedAt']) {
    const v = parsed.meta[key];
    if (typeof v !== 'string' || v === '') problems.push(`${rel}: frontmatter に ${key} がありません`);
  }
  // 本文が空の字幕は「取り込んだ」と言えない。0 件を静かに通すのと同じ形。
  if (collapseSpace(parsed.body).length === 0) problems.push(`${rel}: 字幕の本文が空です`);
  return problems;
}

/** 主張 1 件として成立しているか。 */
function validateClaimShape(c, idx) {
  const at = `claims[${idx}]`;
  const problems = [];
  for (const key of ['id', 'videoId', 'quote', 'claim']) {
    if (typeof c?.[key] !== 'string' || c[key] === '') problems.push(`${at}: ${key} がありません`);
  }
  if (!SOURCE_STRENGTH.includes(c?.strength)) {
    problems.push(`${at}: strength は ${SOURCE_STRENGTH.join(' / ')} のいずれか (実際 ${JSON.stringify(c?.strength)})`);
  }
  return problems;
}

/**
 * **これがこの本の目的。** 引用が、その動画の字幕に逐語で現れるか。
 *
 * `gloss` (当方の読み解き) も逃がさない —— 読み解きであっても、
 * **何を読んで解いたのか**は原文に在るはずである。引ける物が無いなら、
 * それは読み解きですらない。
 */
function checkQuoteAnchors(claims, transcriptsByVideoId) {
  const problems = [];
  claims.forEach((c, i) => {
    const shape = validateClaimShape(c, i);
    if (shape.length > 0) {
      problems.push(...shape);
      return;
    }
    const t = transcriptsByVideoId.get(c.videoId);
    if (t === undefined) {
      problems.push(`claims[${i}] (${c.id}): videoId ${c.videoId} の字幕がありません`);
      return;
    }
    if (!collapseSpace(t).includes(collapseSpace(c.quote))) {
      problems.push(
        `claims[${i}] (${c.id}): 引用が字幕に見つかりません —— ${JSON.stringify(c.quote.slice(0, 40))}`,
      );
    }
  });
  return problems;
}

/** 取り込み一式を読む。`readDir` / `readFile` を差せるので単体で試せる。 */
function ingest(dir, io = {}) {
  const readdir = io.readdir ?? ((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []));
  const readFile = io.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));

  const problems = [];
  const transcripts = new Map();
  let claims = [];

  for (const name of readdir(dir).slice().sort()) {
    if (!name.endsWith('.md')) continue;
    const parsed = parseTranscript(readFile(path.join(dir, name)));
    const bad = validateTranscript(name, parsed);
    if (bad.length > 0) {
      problems.push(...bad);
      continue;
    }
    const id = parsed.meta.videoId;
    if (transcripts.has(id)) {
      problems.push(`${name}: videoId ${id} が重複しています`);
      continue;
    }
    transcripts.set(id, parsed.body);
  }

  const claimsPath = path.join(dir, 'claims.json');
  const names = readdir(dir);
  if (names.includes('claims.json')) {
    try {
      const parsed = JSON.parse(readFile(claimsPath));
      if (!Array.isArray(parsed)) problems.push('claims.json が配列ではありません');
      else claims = parsed;
    } catch (e) {
      problems.push(`claims.json を読めません: ${e.message}`);
    }
  }

  problems.push(...checkQuoteAnchors(claims, transcripts));
  return { transcripts, claims, problems };
}

// --- self-test ------------------------------------------------------------

function selfTest() {
  let bad = 0;
  const check = (label, cond) => {
    if (cond) console.log(`  ✓ ${label}`);
    else {
      console.error(`  ✗ ${label}`);
      bad += 1;
    }
  };

  const md = (id, body) => `---\ntitle: T\nvideoId: ${id}\npublishedAt: 2026-01-01\n---\n${body}`;
  const io = (files) => ({
    readdir: () => Object.keys(files),
    readFile: (p) => files[path.basename(p)],
  });

  // --- frontmatter ---
  check('frontmatter と本文に割れる', parseTranscript(md('a', 'ほんぶん')).meta.videoId === 'a');
  check('frontmatter が無ければ鳴る', parseTranscript('ほんぶん').problems.length === 1);
  check(
    'frontmatter の欄が欠けたら鳴る',
    validateTranscript('x.md', parseTranscript('---\ntitle: T\n---\nb')).some((p) => p.includes('videoId')),
  );
  check(
    '★ 本文が空なら鳴る (0 件を静かに通さない)',
    validateTranscript('x.md', parseTranscript(md('a', '　\n \n'))).some((p) => p.includes('本文が空')),
  );

  // --- 引用の照合 (この本の目的) ---
  const okQuote = ingest('/d', io({ 'a.md': md('a', '倒産は資金繰りで決まります'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '資金繰りで決まります', claim: 'x', strength: 'confirmed' }]) }));
  check('引用が字幕に在れば通る', okQuote.problems.length === 0);

  const wrapped = ingest('/d', io({ 'a.md': md('a', '倒産は資金繰り\nで決まります'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '資金繰り で決まります', claim: 'x', strength: 'confirmed' }]) }));
  check('★ 改行や空白の違いは吸収する (字幕は文の途中で折れる)', wrapped.problems.length === 0);

  const zenkaku = ingest('/d', io({ 'a.md': md('a', '倒産は　資金繰りで決まります'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '倒産は資金繰りで', claim: 'x', strength: 'confirmed' }]) }));
  check('全角空白も吸収する', zenkaku.problems.length === 0);

  const oneChar = ingest('/d', io({ 'a.md': md('a', '倒産は資金繰りで決まります'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '資金繰りで決まりました', claim: 'x', strength: 'confirmed' }]) }));
  check('★ 1 文字でも違えば落とす (「だいたい合っている」を通さない)', oneChar.problems.some((p) => p.includes('引用が字幕に見つかりません')));

  const halfWidth = ingest('/d', io({ 'a.md': md('a', '資金繰りが１番大事'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '資金繰りが1番大事', claim: 'x', strength: 'confirmed' }]) }));
  check('★ 全角/半角の違いも落とす (文字は正規化しない)', halfWidth.problems.length === 1);

  const invented = ingest('/d', io({ 'a.md': md('a', '倒産は資金繰りで決まります'),
    'claims.json': JSON.stringify([{ id: 'c1', videoId: 'a', quote: '社長の器で決まります', claim: 'x', strength: 'gloss' }]) }));
  check('★ gloss でも引用は要る (読み解きにも原文が要る)', invented.problems.length === 1);

  const noVideo = ingest('/d', io({ 'claims.json': JSON.stringify([{ id: 'c1', videoId: 'zzz', quote: 'q', claim: 'x', strength: 'confirmed' }]) }));
  check('字幕の無い videoId を引いたら鳴る', noVideo.problems.some((p) => p.includes('の字幕がありません')));

  // --- 形の検査 ---
  check('strength が語彙外なら鳴る', validateClaimShape({ id: 'a', videoId: 'b', quote: 'q', claim: 'c', strength: 'verified' }, 0).length === 1);
  check('欄が欠けたら鳴る', validateClaimShape({ id: 'a' }, 0).length >= 3);
  check('揃っていれば通る', validateClaimShape({ id: 'a', videoId: 'b', quote: 'q', claim: 'c', strength: 'gloss' }, 0).length === 0);

  // --- 重複 ---
  const dup = ingest('/d', io({ 'a.md': md('same', 'ほんぶん'), 'b.md': md('same', 'ほんぶん') }));
  check('videoId が重複したら鳴る', dup.problems.some((p) => p.includes('重複')));

  // --- claims.json が無くても字幕だけで通る ---
  const noClaims = ingest('/d', io({ 'a.md': md('a', 'ほんぶん') }));
  check('claims.json が無くても字幕だけで通る', noClaims.problems.length === 0 && noClaims.transcripts.size === 1);

  // --- 壊れた claims.json ---
  const brokenJson = ingest('/d', io({ 'claims.json': '{' }));
  check('壊れた claims.json は鳴る', brokenJson.problems.some((p) => p.includes('読めません')));

  // --- 語彙が provenance.ts と一致していること ---
  const pv = fs.readFileSync(path.join(REPO_ROOT, 'src/shared/provenance.ts'), 'utf8');
  check(
    '★ 出典強度の語彙が src/shared/provenance.ts と一致している',
    SOURCE_STRENGTH.every((s) => pv.includes(`'${s}'`)),
  );

  if (bad > 0) {
    console.error(`❌ self-test ${bad} 件不一致`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const dirArg = argv.indexOf('--dir');
  const root = path.resolve(REPO_ROOT, dirArg >= 0 ? argv[dirArg + 1] : 'ingest');
  if (!fs.existsSync(root)) {
    console.log(`取り込み対象がありません (${path.relative(REPO_ROOT, root)}/ が未作成)。`);
    console.log('字幕を ingest/<channel>/<videoId>.md に置いてから実行してください。');
    return 0;
  }

  const channels = fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory());
  let bad = 0;
  for (const ch of channels.sort()) {
    const { transcripts, claims, problems } = ingest(path.join(root, ch));
    console.log(`${ch}: 字幕 ${transcripts.size} 本 / 主張 ${claims.length} 件`);
    for (const p of problems) console.error(`  ❌ ${p}`);
    bad += problems.length;
  }
  if (bad > 0) {
    console.error(`\n❌ ${bad} 件`);
    return 1;
  }
  console.log('✅ 引用はすべて字幕に見つかりました');
  return 0;
}

module.exports = { parseTranscript, validateTranscript, validateClaimShape, checkQuoteAnchors, collapseSpace, ingest, SOURCE_STRENGTH };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
