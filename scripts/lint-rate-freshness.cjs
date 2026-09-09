#!/usr/bin/env node
'use strict';

/**
 * 年度で変わる料率が黙って古くならないようにするゲート。
 *
 * ## なぜ要るか
 *
 * 2026-08 の監査で、社会保険料率が**令和6年度のまま 2 年度分取り残されて
 * いた**のが見つかった。雇用保険料率はその間に 2 年連続で引き下げられて
 * いる (本人 0.6% → 0.55% → 0.5%)。
 *
 * 数字そのものは「間違い」の顔をしていない。0.6% は令和6年度には正しく、
 * 正しかったものが黙って古くなる。誰も気付かないまま画面に出続ける。
 *
 * ## 何を見るか
 *
 * `SOCIAL_INSURANCE_RATE_FISCAL_YEAR` が宣言する年度と、いまの年度を比べる。
 *
 * - 1 年度ぶん遅れ → **警告**。改定直後は毎年こうなるので落とさない
 * - 2 年度ぶん以上遅れ → **失敗**。今回見つかったのがこの状態
 *
 * 落ちるのは年に 1 度きりで、しかも「調べて上げる」以外の直し方が無い。
 * 摩擦を残すのが目的なので、警告のまま放置できないようにしてある。
 *
 * 年度は 4 月始まり。1〜3 月はまだ前年度なので、そこは差し引く。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = 'src/shared/taxSocialInsurance.ts';
const CONST_NAME = 'SOCIAL_INSURANCE_RATE_FISCAL_YEAR';

/**
 * **期限つきの経過措置の台帳。**
 *
 * 年度で変わる料率 (上) とは劣化の仕方が違う —— こちらは**ある日を境に
 * 使えなくなる**。放っておくと、期限を過ぎた特例をアプリが勧め続ける。
 *
 * 実測 (2026-08-23): 2割特例の適用期限は注記と画面の文言にはあったが、
 * **判定に使っている場所が無かった**。`taxConsumptionBusiness.ts` は期間を
 * 見ずに `best = 'twenty-percent'` を選びうるので、期限後も勧め続ける。
 * 2026-09-06 に繋いだ (`twentyPercentMeasureStatus()` が課税期間の規則で
 * 3 値に落とし、言い切れる `ended` でだけ最有利の候補から外す)。
 * **それでもこの門は要る** —— 期限が来たら、経過措置そのものを画面から
 * 下げるのか参考として残すのかを人が決める必要があり、コードは
 * 「勧めない」までしか自分で決められない。
 *
 * 料率の側は 2 年度分放置されてから見つかった。**こちらは期限が来る前に
 * 鳴らす** —— 過ぎてから直すのでは、その間に出した数字が既に誤っている。
 *
 * 日付は**コード側の定数から読む**。ここに書き写すと 2 か所になる。
 */
const DATED_MEASURES = [
  {
    label: 'インボイス 2割特例 (小規模事業者の税額控除に関する経過措置)',
    source: 'src/shared/taxConsumption.ts',
    constName: 'TWENTY_PERCENT_MEASURE_END',
    // 期限の前にこれだけ猶予があれば警告に留める。過ぎたら失敗。
    warnWithinDays: 180,
    how:
      '経過措置そのものを画面から下げるか、参考として残すかを決めてください ' +
      '(勧めない判定は twentyPercentMeasureStatus() が既に持っています。' +
      '期限の翌日から 1 年は「課税期間が期限内の日を含みうる」帯なので外していません)。' +
      '国税庁 https://www.nta.go.jp/publication/pamph/shohi/kaisei/202304/01.htm',
  },
  {
    /*
     * **安全の主張にも期限が要る** (2026-09-09 · パス 139)。Ollama の脆弱性の台帳は
     * 「いつ照合したか」を持ち、その日から半年で見直す。2026-05-12 の「未パッチ」の
     * 固定文は日付が無かったので、修正 (0.17.1) が出た後も 4 か月間そのまま刷られた。
     */
    label: 'Ollama 既知脆弱性の台帳の再照合 (src/shared/ollama.ts OLLAMA_ADVISORIES)',
    source: 'src/shared/ollama.ts',
    constName: 'OLLAMA_ADVISORIES_REVIEW_BY',
    warnWithinDays: 60,
    how:
      'GitHub Advisory Database (github.com/advisories?query=ollama) と NVD で新しい CVE を確認し、' +
      'OLLAMA_ADVISORIES に足して (修正版が出た項目は fixedIn を埋めて) MIN_SAFE_VERSION を台帳の最大に揃え、' +
      'OLLAMA_ADVISORIES_VERIFIED_ON を今日・OLLAMA_ADVISORIES_REVIEW_BY を半年後に進めてください ' +
      '(docs/OLLAMA_SECURITY.md の床と日付は lint:docs が照合します)。',
  },
  {
    /*
     * **2 年・3 年おきに延長されてきた措置** (2026-09-09 · パス 140)。令和 8 年度改正 (2026-04-01 施行) で
     * 上限 30 万 → 40 万円・従業員 500 → 400 人・期限 2029-03-31 になったのに、コードは 5 か月間 30 万円の
     * ままで、期限そのものを持っていなかった —— 定数さえ在ればこの台帳が鳴らす。
     */
    label: '少額減価償却資産の特例 (措法 67 の 5・中小企業者等の即時償却)',
    source: 'src/shared/depreciation.ts',
    constName: 'SME_MEASURE_END',
    warnWithinDays: 180,
    how:
      '翌年度の税制改正大綱 (財務省) と国税庁 No.5408 で延長の有無・取得価額の上限・従業員数要件を確かめ、' +
      'SME_MEASURE_END / SME_UNIT_LIMIT / SME_EMPLOYEE_CAP (src/shared/depreciation.ts) と ' +
      'complianceKnowledge.ts の tax-small-amount-depreciation を同時に進めてください ' +
      '(延長されなければ smeMeasureWindow() が measure-ended を返し、画面は特例を勧めません)。',
  },
  {
    label: '中小企業投資促進税制 (措法 42 の 6)',
    source: 'src/shared/taxCalc.ts',
    constName: 'INVESTMENT_PROMOTION_MEASURE_END',
    warnWithinDays: 180,
    how:
      '翌年度の税制改正大綱 (財務省) と国税庁 No.5433 で延長の有無を確かめ、INVESTMENT_PROMOTION_MEASURE_END ' +
      '(src/shared/taxCalc.ts) を進めるか、延長されなければ節税制度カタログから下げてください。',
  },
];

/**
 * **台帳の母集団を機械で数える** (2026-09-09 · パス 140)。
 *
 * 台帳は手で足す物で、足し忘れた期限は誰も見ない。そこで `src/shared` の期限の定数 —— 名前が
 * `_END` / `_UNTIL` / `_DEADLINE` / `_REVIEW_BY` / `_EXPIRES` で終わる `export const X = 'YYYY-MM-DD'` ——
 * を全部拾い、台帳に無ければ落とす。過去の日付を表す名前 (`_VERIFIED_ON` / `_STEP_DATE` / `_SINCE` /
 * `_FROM`) は期限ではないので外。**1 件も見つからなければ走査の故障**として落とす (0 件で通る門は門でない)。
 */
const DEADLINE_NAME = /^[A-Z0-9_]+_(END|UNTIL|DEADLINE|REVIEW_BY|EXPIRES)$/;
const DATED_CONST = /export const ([A-Z0-9_]+)\s*=\s*'(\d{4}-\d{2}-\d{2})'/g;

/** 期限の名前を持つ日付定数の名前を列挙する。 */
function deadlineConstsIn(text) {
  const out = [];
  for (const m of text.matchAll(DATED_CONST)) if (DEADLINE_NAME.test(m[1])) out.push(m[1]);
  return out;
}

/** `[{ file, text }]` のうち台帳に無い期限定数を `file::NAME` で返す。 */
function unledgeredDeadlines(files, ledger = DATED_MEASURES) {
  const known = new Set(ledger.map((m) => `${m.source}::${m.constName}`));
  const out = [];
  for (const { file, text } of files) {
    for (const name of deadlineConstsIn(text)) if (!known.has(`${file}::${name}`)) out.push(`${file}::${name}`);
  }
  return out;
}

/** `src/shared` の実装ファイル (検査は除く) を読む。 */
function sharedSources() {
  const dir = path.join(REPO_ROOT, 'src', 'shared');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => ({ file: `src/shared/${f}`, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/** `export const NAME = 'YYYY-MM-DD';` を読む。読めなければ null。 */
function declaredDate(src, constName) {
  const m = new RegExp(`export const ${constName}\\s*=\\s*'(\\d{4}-\\d{2}-\\d{2})'`).exec(src);
  return m === null ? null : m[1];
}

/** 期限つき措置の判定。`days` は期限までの残日数 (過ぎていれば負)。 */
function evaluateDated(dateStr, now, warnWithinDays) {
  if (dateStr === null) return { level: 'error', days: null };
  const end = new Date(`${dateStr}T23:59:59Z`);
  const days = Math.floor((end.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { level: 'error', days };
  if (days <= warnWithinDays) return { level: 'warn', days };
  return { level: 'ok', days };
}

/** 日本の年度 (4 月始まり)。 */
function fiscalYear(date) {
  const y = date.getFullYear();
  return date.getMonth() + 1 >= 4 ? y : y - 1;
}

/** 宣言されている年度を読む。読めなければ null。 */
function declaredFiscalYear(src) {
  const m = new RegExp(`export const ${CONST_NAME}\\s*=\\s*(\\d{4})`).exec(src);
  return m === null ? null : Number(m[1]);
}

/** 判定。`behind` は遅れている年度数。 */
function evaluate(declared, now) {
  if (declared === null) return { level: 'error', behind: null };
  const behind = fiscalYear(now) - declared;
  if (behind >= 2) return { level: 'error', behind };
  if (behind === 1) return { level: 'warn', behind };
  return { level: 'ok', behind };
}

/** 対照実験 — 規則ごとに 1 件だけ鳴る。 */
function selfTest() {
  const cases = [
    ['同じ年度なら ok', 2026, new Date('2026-08-21T00:00:00Z'), 'ok'],
    ['1 年度遅れは警告', 2025, new Date('2026-08-21T00:00:00Z'), 'warn'],
    ['2 年度遅れは失敗', 2024, new Date('2026-08-21T00:00:00Z'), 'error'],
    ['3 月はまだ前年度 (1〜3 月を年度に含めない)', 2025, new Date('2026-03-31T00:00:00Z'), 'ok'],
    ['4 月から新年度', 2025, new Date('2026-04-01T00:00:00Z'), 'warn'],
    ['宣言が読めなければ失敗', null, new Date('2026-08-21T00:00:00Z'), 'error'],
  ];
  let failed = 0;
  // --- 期限つき措置の対照 ---
  // 「期限の前」「近い」「過ぎた」「読めない」の 4 通り。**過ぎた側だけ**では
  // 早すぎる警告 (常に鳴る門) を止められないので、余裕がある側も見る。
  const datedCases = [
    ['期限まで十分あれば ok', '2026-09-30', new Date('2025-01-01T00:00:00Z'), 180, 'ok'],
    ['期限が近ければ警告', '2026-09-30', new Date('2026-08-23T00:00:00Z'), 180, 'warn'],
    ['期限当日はまだ使える (境界)', '2026-09-30', new Date('2026-09-30T12:00:00Z'), 180, 'warn'],
    ['翌日は失敗 (境界)', '2026-09-30', new Date('2026-10-01T12:00:00Z'), 180, 'error'],
    ['日付が読めなければ失敗', null, new Date('2026-08-23T00:00:00Z'), 180, 'error'],
  ];

  console.log('self-test:');
  for (const [label, declared, now, want] of cases) {
    const got = evaluate(declared, now).level;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${want})`);
  }
  for (const [name, dateStr, now, within, want] of datedCases) {
    const got = evaluateDated(dateStr, now, within).level;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}: ${got} (期待 ${want})`);
  }

  // 台帳の日付が**実際にコードから読める**ことも見る (書き写しの検出)。
  for (const m of DATED_MEASURES) {
    const src = fs.readFileSync(path.join(REPO_ROOT, m.source), 'utf8');
    const got = declaredDate(src, m.constName);
    const ok = got !== null;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${m.constName} をコードから読める: ${got ?? '読めない'}`);
  }

  // --- 台帳の母集団の対照 (標本) --- 台帳に無い期限定数は拾い、期限でない名前と台帳済みは拾わない。
  const ledger = [{ source: 'src/shared/x.ts', constName: 'KNOWN_END' }];
  const coverageCases = [
    ['台帳に無い _END は拾う', "export const FOO_MEASURE_END = '2027-01-01';", ['src/shared/x.ts::FOO_MEASURE_END']],
    ['台帳に無い _REVIEW_BY は拾う', "export const BAR_REVIEW_BY = '2027-01-01';", ['src/shared/x.ts::BAR_REVIEW_BY']],
    ['台帳済みは拾わない', "export const KNOWN_END = '2027-01-01';", []],
    ['過去の日付の名前 (_VERIFIED_ON / _STEP_DATE) は期限ではない', "export const A_VERIFIED_ON = '2026-09-09';\nexport const B_STEP_DATE = '2026-04-01';", []],
    ['日付でない値・小文字の名前は拾わない', "export const foo_end = '2027-01-01';\nexport const BAZ_END = 'later';", []],
    ['同じファイルで別のファイルの台帳項目は拾う (file::NAME で照合)', "export const KNOWN_END = '2027-01-01';", ['src/shared/y.ts::KNOWN_END'], 'src/shared/y.ts'],
  ];
  for (const [label, text, want, file = 'src/shared/x.ts'] of coverageCases) {
    const got = unledgeredDeadlines([{ file, text }], ledger);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)}`);
  }
  // 実物の走査が生きている (台帳の定数を自分で見つける) ことも見る。
  const found = sharedSources().flatMap((f) => deadlineConstsIn(f.text));
  const liveOk = DATED_MEASURES.every((m) => found.includes(m.constName));
  if (!liveOk) failed += 1;
  console.log(`  ${liveOk ? '✓' : '✗'} 走査が台帳の定数 ${DATED_MEASURES.length} 件を src/shared で見つける (${found.length} 件)`);

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const src = fs.readFileSync(path.join(REPO_ROOT, SOURCE), 'utf8');
  const declared = declaredFiscalYear(src);
  const now = new Date();
  const { level, behind } = evaluate(declared, now);
  const current = fiscalYear(now);

  // **料率の結果に関わらず期限も見る。** 片方で早期 return すると、
  // もう片方が黙って測られなくなる。
  console.log(`期限つき措置 ${DATED_MEASURES.length} 件:`);
  const datedFailures = checkDatedMeasures(now) + checkLedgerCoverage();

  if (declared === null) {
    console.error(`❌ ${SOURCE} に ${CONST_NAME} がありません`);
    return 1;
  }
  console.log(`社会保険料率の宣言年度: 令和${declared - 2018}年度 (${declared}) / 現在: ${current} 年度`);
  if (level === 'ok') {
    console.log('✅ 料率は現年度のものです');
    return datedFailures > 0 ? 1 : 0;
  }
  if (level === 'warn') {
    console.warn(
      `::warning::社会保険料率が ${behind} 年度ぶん古くなっています (宣言 ${declared} / 現在 ${current})。` +
        '協会けんぽ (健康・介護) と厚生労働省 (雇用保険) の当年度の料率を確認して更新してください。' +
        'もう 1 年度放置すると CI が落ちます',
    );
    return datedFailures > 0 ? 1 : 0;
  }
  console.error(
    `❌ 社会保険料率が ${behind} 年度ぶん古くなっています (宣言 ${declared} / 現在 ${current})。\n` +
      '   数字そのものは「間違い」の顔をしません — 宣言年度には正しかったものが黙って古くなります。\n' +
      '   協会けんぽ https://www.kyoukaikenpo.or.jp/ (健康保険・介護保険) と\n' +
      '   厚生労働省の雇用保険料率のご案内を確認し、料率と ' +
      `${CONST_NAME} を更新してください。`,
  );
  return 1;
}

/**
 * 台帳の母集団: `src/shared` の期限定数が全部台帳に在るか。戻り値は失敗した件数。
 * 走査が 1 件も見つけなければ (台帳の定数さえ見えない) 走査の故障として落とす。
 */
function checkLedgerCoverage() {
  const files = sharedSources();
  const found = files.flatMap((f) => deadlineConstsIn(f.text));
  if (found.length === 0) {
    console.error('❌ src/shared に期限の定数が 1 件も見つかりません (走査の不具合を疑ってください)');
    return 1;
  }
  const missing = unledgeredDeadlines(files);
  if (missing.length === 0) {
    console.log(`  ✅ 期限の定数 ${found.length} 件はすべて台帳に在ります`);
    return 0;
  }
  console.error(
    `❌ 台帳 (DATED_MEASURES) に無い期限の定数が ${missing.length} 件:\n` +
      missing.map((m) => `   - ${m}`).join('\n') +
      '\n   期限なら scripts/lint-rate-freshness.cjs の DATED_MEASURES に (label / source / constName / warnWithinDays / how) を足し、' +
      '期限でないなら _END / _UNTIL / _DEADLINE / _REVIEW_BY / _EXPIRES で終わらない名前にしてください。',
  );
  return missing.length;
}

/** 期限つき措置を全部見る。戻り値は失敗した件数。 */
function checkDatedMeasures(now) {
  let failed = 0;
  for (const m of DATED_MEASURES) {
    const src = fs.readFileSync(path.join(REPO_ROOT, m.source), 'utf8');
    const dateStr = declaredDate(src, m.constName);
    const { level, days } = evaluateDated(dateStr, now, m.warnWithinDays);
    if (dateStr === null) {
      console.error(`❌ ${m.source} に ${m.constName} がありません`);
      failed += 1;
      continue;
    }
    if (level === 'ok') {
      console.log(`  ✅ ${m.label}: 期限 ${dateStr} まで残り ${days} 日`);
      continue;
    }
    if (level === 'warn') {
      console.warn(
        `::warning::${m.label} の適用期限が近づいています (${dateStr} / 残り ${days} 日)。` +
          `${m.how} 期限を過ぎると CI が落ちます`,
      );
      continue;
    }
    console.error(
      `❌ ${m.label} の適用期限を過ぎています (${dateStr} / ${-days} 日経過)。\n` +
        '   期限つきの措置は、期限を境に「正しかったもの」が誤りになります。\n' +
        `   ${m.how}`,
    );
    failed += 1;
  }
  return failed;
}

module.exports = { evaluate, fiscalYear, declaredFiscalYear, evaluateDated, declaredDate, DATED_MEASURES, deadlineConstsIn, unledgeredDeadlines };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
