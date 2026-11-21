#!/usr/bin/env node
'use strict';

/*
 * 知識台帳が参照する id が、実際にコーパスに存在することを検査する。
 *
 * ## なぜ必要か
 *
 * 重複裁定の記録は 2 つの台帳に分かれている:
 *   - knowledge-distinct-pairs.json … 「別概念として保持する」と裁定したペア
 *   - knowledge-merge-plan.json     … 「統合する」と裁定したペアの実行計画
 *
 * 前者は knowledge-autopilot が重複疑いキューから機械的に除外するのに使う。
 * つまり **台帳が実体とズレると、キューの中身が黙って狂う**。統合でエントリを
 * 削除したとき台帳を刈り忘れると、消えた id とのペアが「裁定済み」として
 * 残り続け、以後その id が復活しても除外されたままになる。
 *
 * 実際にパス4の統合で 3 ペアがこの状態になった (削除した id を参照していた)。
 * 事前に気づけたのは手で照合したからで、次も気づける保証はない。だから検査する。
 *
 * ## 検査するもの
 *
 * distinct-pairs が参照する id は **すべてコーパスに存在しなければならない**。
 * 一方が消えたペアは比較対象が無く、裁定として意味を持たない。
 *
 * merge-plan の ready[].drop は **意図的に例外**とする。統合を実行すると drop は
 * 消えるが、計画は「何をどう統合したか」の履歴として残す価値がある。keep 側は
 * 存在しなければならない (統合先が消えていたら情報が失われている)。
 *
 * ## 「空」と「読めない」を分ける (2026-09-25 · パス 467)
 *
 * 2026-09-25 まで、台帳の読みは `try { JSON.parse(...) } catch { return null }` で、
 * 呼ぶ側は `null` を「見るものが無い」として**素通り**していた。つまり
 * **読めない台帳と空の台帳が同じ答えになっていた**。実測 (2026-09-25 · 実物に
 * マージ衝突の印を 1 行入れる):
 *
 *   Checked 0 adjudicated pair(s) + 20 merge target(s) against 4039 corpus ids
 *   ✅ 台帳の参照はすべて実在する id を指しています        ← exit 0
 *
 * そして `verify:all` の 37 ゲートも**全部素通りした** (exit 0)。`src/` にこの台帳を
 * 読む検査は 1 件も無いので、`npm test` にも映らない。
 *
 * ★ **向きが重い** —— 消費者 (`knowledge-autopilot.cjs` の `loadDistinctPairs`) も
 * 同じ形で `catch { return new Set(); }` だったので、読めない台帳は
 * **裁定済み 127 件がまるごと重複疑いキューへ戻る**ことを意味する。実測
 * (空の Set を実物の検出器へ渡す): `sourceDedupeSuspects` 0 → **16 件**・
 * `sharedSourceDedupeSuspects` 0 → **12 件**。キューは LLM の統合作業へ回るので、
 * 「別概念として残す」と裁定した対が**もう一度統合を勧められる**。
 *
 * ★ **床とは別の話である** —— 下の `MIN_CORPUS_IDS` は「突き合わせ先が 0 件なら
 * 主張が空虚に成立する」を見る床で、その理由は今も正しい。台帳側の件数
 * (pairCount / keepCount) に床を置かないのも正しい —— 課題が片付けば 0 に
 * なりうるので、実測に張り付けた床は**直した日に落ちる門**になる (パス 378)。
 * 欠けていたのは**読めたかどうか**で、そこは件数とは別の軸である。
 *
 * 使い方:
 *   node scripts/lint-knowledge-refs.cjs
 *   node scripts/lint-knowledge-refs.cjs --self-test
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DISTINCT_REL = 'knowledge-distinct-pairs.json';
const MERGE_REL = 'knowledge-merge-plan.json';
const DISTINCT = path.join(REPO_ROOT, 'orchestration', DISTINCT_REL);
const MERGE_PLAN = path.join(REPO_ROOT, 'orchestration', MERGE_REL);

/*
 * 突き合わせ先 (corpus id) の床。台帳側の件数 (pairCount / keepCount) は
 * 課題が片付けば 0 になりうるので床を置かない —— **参照先が 0 件**なら
 * 「すべて実在する id を指す」は空虚に成立してしまうので、そちらだけ見る。
 */
const MIN_CORPUS_IDS = 1000; // 実測 4039 (2026-09-25)

/**
 * 突き合わせ先が死んでいないか。**述語として切り出したのは、床の値そのものを
 * 使って主張すると自己満足になるため** —— 2026-09-25 に対照 (床を 0 へ) を
 * 回すと、`size < MIN_CORPUS_IDS` を写した主張も `MIN_CORPUS_IDS` を読む主張も
 * **どちらも鳴らなかった**。`corpusTooSmall(0)` は床の値に依らず真であるべきで、
 * そこを留めれば床を 0 へ下げた日に鳴る。
 */
function corpusTooSmall(size) {
  return size < MIN_CORPUS_IDS;
}

/**
 * 台帳を読む。**「空」と「読めない」を分ける** のがこの関数の仕事で、
 * どちらも `null` に畳むと呼ぶ側が見分けられなくなる (パス 467 の欠陥)。
 */
function readLedger(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, reason: e && e.code === 'ENOENT' ? 'missing' : 'unreadable', detail: String((e && e.message) || e) };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, reason: 'unparseable', detail: String((e && e.message) || e) };
  }
}

const WHY_UNREADABLE = {
  missing: '台帳のファイルがありません',
  unreadable: '台帳のファイルを読めません',
  unparseable: '台帳が JSON として解析できません',
};

/**
 * 判定本体 (純関数)。`distinct` / `plan` は `readLedger` の戻り値をそのまま渡す。
 * IO を外に出してあるので self-test と外側の証人が同じ関数を走らせられる。
 */
function evaluate({ ids, distinct, plan }) {
  const problems = [];
  let pairCount = 0;
  let keepCount = 0;

  // --- distinct-pairs: 読めること・形が合うこと・両側とも実在すること
  if (!distinct.ok) {
    problems.push({
      where: DISTINCT_REL,
      detail: `${WHY_UNREADABLE[distinct.reason]} (${distinct.detail}) —— `
        + '消費者 (knowledge-autopilot) は読めない台帳を「裁定 0 件」として扱うので、'
        + '裁定済みのペアがまるごと重複疑いキューへ戻ります',
    });
  } else if (!Array.isArray(distinct.value.adjudicatedDistinct)) {
    problems.push({
      where: DISTINCT_REL,
      detail: `adjudicatedDistinct が配列ではありません (${typeof distinct.value.adjudicatedDistinct}) —— `
        + '鍵の綴りが変わると検査も消費者も黙って 0 件になります',
    });
  } else {
    pairCount = distinct.value.adjudicatedDistinct.length;
    for (const pair of distinct.value.adjudicatedDistinct) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        problems.push({ where: DISTINCT_REL, detail: `[idA, idB] の形でないペア: ${JSON.stringify(pair)}` });
        continue;
      }
      for (const id of pair) {
        if (!ids.has(id)) {
          problems.push({ where: DISTINCT_REL, detail: `存在しない id を参照: ${id} (ペア: ${pair.join(' ⇔ ')})` });
        }
      }
    }
  }

  // --- merge-plan: keep 側は実在すること (drop は統合済みなら消えていて正常)
  if (!plan.ok) {
    problems.push({
      where: MERGE_REL,
      detail: `${WHY_UNREADABLE[plan.reason]} (${plan.detail}) —— 統合先が実在するかを誰も確かめられません`,
    });
  } else {
    if (!Array.isArray(plan.value.ready)) {
      problems.push({
        where: MERGE_REL,
        detail: `ready が配列ではありません (${typeof plan.value.ready})`,
      });
    } else {
      for (const item of plan.value.ready) {
        if (typeof item.keep !== 'string') continue;
        keepCount += 1;
        if (!ids.has(item.keep)) {
          problems.push({
            where: MERGE_REL,
            detail: `統合先 (keep) が存在しない: ${item.keep} — 統合先が消えていれば情報が失われている`,
          });
        }
      }
    }
    const clusters = plan.value.clusters;
    if (clusters !== null && clusters !== undefined && typeof clusters === 'object') {
      if (!Array.isArray(clusters.items)) {
        problems.push({ where: MERGE_REL, detail: `clusters.items が配列ではありません (${typeof clusters.items})` });
      } else {
        for (const c of clusters.items) {
          if (typeof c.keep !== 'string') continue;
          keepCount += 1;
          if (!ids.has(c.keep)) {
            problems.push({ where: MERGE_REL, detail: `クラスタの統合先 (keep) が存在しない: ${c.keep}` });
          }
        }
      }
    }
  }

  return { problems, pairCount, keepCount };
}

function selfTest() {
  const ok = (value) => ({ ok: true, value });
  const ids = new Set(['a', 'b', 'c']);
  const goodDistinct = ok({ adjudicatedDistinct: [['a', 'b']] });
  const goodPlan = ok({ ready: [{ keep: 'c' }], clusters: { items: [] } });
  const cases = [
    ['健全な台帳は 0 件', { ids, distinct: goodDistinct, plan: goodPlan }, 0],
    ['★ 台帳が読めない (解析できない) → 鳴る', { ids, distinct: { ok: false, reason: 'unparseable', detail: 'x' }, plan: goodPlan }, 1],
    ['★ 台帳のファイルが無い → 鳴る', { ids, distinct: { ok: false, reason: 'missing', detail: 'x' }, plan: goodPlan }, 1],
    ['★ 鍵の綴りが変わった (配列でない) → 鳴る', { ids, distinct: ok({ adjudicated_distinct: [['a', 'b']] }), plan: goodPlan }, 1],
    ['★ 統合計画が読めない → 鳴る', { ids, distinct: goodDistinct, plan: { ok: false, reason: 'unparseable', detail: 'x' } }, 1],
    ['★ ready が配列でない → 鳴る', { ids, distinct: goodDistinct, plan: ok({ ready: {} }) }, 1],
    ['★ clusters.items が配列でない → 鳴る', { ids, distinct: goodDistinct, plan: ok({ ready: [], clusters: {} }) }, 1],
    ['存在しない id を指すペア → 鳴る', { ids, distinct: ok({ adjudicatedDistinct: [['a', 'zz']] }), plan: goodPlan }, 1],
    ['両側とも存在しない → 2 件', { ids, distinct: ok({ adjudicatedDistinct: [['yy', 'zz']] }), plan: goodPlan }, 2],
    ['ペアの形が違う → 鳴る', { ids, distinct: ok({ adjudicatedDistinct: [['a']] }), plan: goodPlan }, 1],
    ['統合先が存在しない → 鳴る', { ids, distinct: goodDistinct, plan: ok({ ready: [{ keep: 'zz' }] }) }, 1],
    ['clusters が無いのは正常 (任意)', { ids, distinct: goodDistinct, plan: ok({ ready: [] }) }, 0],
    ['空の台帳は正常 (課題が片付けば 0 になる)', { ids, distinct: ok({ adjudicatedDistinct: [] }), plan: ok({ ready: [] }) }, 0],
  ];
  let bad = 0;
  for (const [name, input, want] of cases) {
    const got = evaluate(input).problems.length;
    const pass = got === want;
    if (!pass) bad += 1;
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${got} 件 (期待 ${want})`);
  }
  /*
   * 床の標本。**値に依らない側を先に置く** —— `corpusTooSmall(0)` は
   * 「読み手が死んだ」を必ず捕まえるべきで、床を 0 へ下げるとここが鳴る
   * (`MIN_CORPUS_IDS` を写した主張だけでは鳴らない · 上の docblock の実測)。
   */
  for (const [name, size, want] of [
    ['★ 読み手が死んだ (0 件) は必ず鳴る', 0, true],
    ['床ちょうどは通る', MIN_CORPUS_IDS, false],
    ['床を 1 下回ると鳴る', MIN_CORPUS_IDS - 1, true],
    ['★ 床は 1 件では務まらない (実測の 1 割以上)', 1, true],
  ]) {
    const got = corpusTooSmall(size);
    const pass = got === want;
    if (!pass) bad += 1;
    console.log(`  ${pass ? '✓' : '✗'} ${name}: ${got} (期待 ${want})`);
  }
  /*
   * ★ **読む口そのものを通す** —— 上の case は `readLedger` の戻り値を手で
   * 組み立てるので、**`readLedger` の中を「読めなくても空として返す」形に
   * 戻しても 1 件も鳴らない** (2026-09-25 に実測。`{ ok: true, value: {} }`
   * へ戻すと配列の検査が拾うので鳴るが、`{ adjudicatedDistinct: [] }` へ
   * 戻すと**門は ✅ exit 0 に戻る**)。だから実ファイルで往復させる。
   */
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-refs-'));
  try {
    const write = (name, body) => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, body, 'utf8');
      return f;
    };
    const io = [
      ['健全なファイルは読める', write('ok.json', '{"adjudicatedDistinct":[]}'), true, null],
      ['★ 解析できないファイルは読めない', write('broken.json', '{"adjudicatedDistinct":[\n<<<<<<< HEAD\n'), false, 'unparseable'],
      ['★ 無いファイルは読めない', path.join(dir, 'nope.json'), false, 'missing'],
    ];
    for (const [name, file, wantOk, wantReason] of io) {
      const got = readLedger(file);
      const pass = got.ok === wantOk && (wantReason === null || got.reason === wantReason);
      if (!pass) bad += 1;
      console.log(`  ${pass ? '✓' : '✗'} ${name}: ok=${got.ok} reason=${got.reason ?? '-'} (期待 ok=${wantOk}${wantReason ? ` reason=${wantReason}` : ''})`);
    }
    // ★ 読む口と判定を繋いで通す (ここが繋がっていないと、読む口を戻しても誰も鳴らない)
    const endToEnd = evaluate({
      ids: new Set(['a']),
      distinct: readLedger(path.join(dir, 'broken.json')),
      plan: readLedger(path.join(dir, 'ok.json')),
    }).problems.length;
    const passEnd = endToEnd >= 1;
    if (!passEnd) bad += 1;
    console.log(`  ${passEnd ? '✓' : '✗'} ★ 読めないファイルを判定まで通すと鳴る: ${endToEnd} 件 (期待 1 件以上)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (bad > 0) {
    console.error(`\n❌ self-test ${bad} 件が不一致`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
  const ids = new Set(kc.loadEntries().map((e) => e.id));

  if (corpusTooSmall(ids.size)) {
    console.error(
      `❌ corpus id を ${ids.size} 件しか読めませんでした (${MIN_CORPUS_IDS} 件以上を期待)。`
        + ' 読み込みが壊れている可能性があります —— 0 件なら参照検査が空虚に通ります。',
    );
    process.exit(1);
  }

  const { problems, pairCount, keepCount } = evaluate({
    ids,
    distinct: readLedger(DISTINCT),
    plan: readLedger(MERGE_PLAN),
  });

  console.log(
    `Checked ${pairCount} adjudicated pair(s) + ${keepCount} merge target(s) against ${ids.size} corpus ids`,
  );

  if (problems.length === 0) {
    console.log('✅ 台帳の参照はすべて実在する id を指しています');
    return;
  }

  console.error(`❌ ${problems.length} 件の問題`);
  for (const p of problems) console.error(`  [${p.where}] ${p.detail}`);
  console.error('');
  console.error('直し方: エントリを統合・削除したら、その id を参照している台帳の行も');
  console.error('        あわせて刈ってください (一方が消えたペアは裁定として意味を失います)。');
  console.error('        台帳そのものが読めない場合は、まず JSON として直してください ——');
  console.error('        消費者はそれを「裁定 0 件」として扱い、キューが黙って狂います。');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { evaluate, readLedger, corpusTooSmall, MIN_CORPUS_IDS, DISTINCT_REL, MERGE_REL };
