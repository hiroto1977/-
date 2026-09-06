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
];

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
  const datedFailures = checkDatedMeasures(now);

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

module.exports = { evaluate, fiscalYear, declaredFiscalYear, evaluateDated, declaredDate, DATED_MEASURES };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
