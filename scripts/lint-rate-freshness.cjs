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
  console.log('self-test:');
  for (const [label, declared, now, want] of cases) {
    const got = evaluate(declared, now).level;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${want})`);
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

  if (declared === null) {
    console.error(`❌ ${SOURCE} に ${CONST_NAME} がありません`);
    return 1;
  }
  console.log(`社会保険料率の宣言年度: 令和${declared - 2018}年度 (${declared}) / 現在: ${current} 年度`);
  if (level === 'ok') {
    console.log('✅ 料率は現年度のものです');
    return 0;
  }
  if (level === 'warn') {
    console.warn(
      `::warning::社会保険料率が ${behind} 年度ぶん古くなっています (宣言 ${declared} / 現在 ${current})。` +
        '協会けんぽ (健康・介護) と厚生労働省 (雇用保険) の当年度の料率を確認して更新してください。' +
        'もう 1 年度放置すると CI が落ちます',
    );
    return 0;
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

module.exports = { evaluate, fiscalYear, declaredFiscalYear };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
