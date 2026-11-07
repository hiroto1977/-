/**
 * **資金繰り表の取り込み注記に、取り込みで落ちた取引の断りを足す。** (パス 502)
 *
 * 会計連携の月次は freee の取引から組む。取引日が読めない取引・金額が数として読めない取引は
 * 集計から外れ、負の金額は 0 円として数えられる。**この表は税理士・金融機関に渡る** (パス 153) ので、
 * 取り込み注記は「その分だけ実際と異なるので、元帳と突き合わせること」まで書く。
 * 既存の検査は落ちた取引が無い場合の注記 (3 件) だけを値ごとに見ており、
 * **落ちた取引が在るときに注記が足されること** (足す判定が外れること) は誰も主張していなかった。
 */
import { describe, expect, it } from 'vitest';
import { buildCashPlanImport } from '../docImports';
import { EMPTY_PROFILE, type SubmissionProfile } from '../bankSubmission';
import type { BalanceSheet } from '../balanceSheet';
import type { FreeeDealIntake } from '../../../shared/freeeIntake';

const PROFILE: SubmissionProfile = { companyName: '株式会社テスト', representative: '山田 太郎', address: '', fiscalYearEnd: '2026-03' };
const BS: BalanceSheet = {
  asOf: '2026-03-31', currentAssets: 8_000_000, cash: 3_000_000, inventory: 1_000_000, accountsReceivable: 2_000_000,
  fixedAssets: 4_000_000, currentLiabilities: 5_000_000, accountsPayable: 1_500_000, fixedLiabilities: 3_000_000, netIncome: 600_000,
};
const month = (m: string, income: number, expense: number) => ({ month: m, income, expense, net: income - expense });
const ACC = [month('2025-04', 1_200_000, 900_000), month('2025-05', 1_100_000, 800_000), month('2025-06', 1_000_000, 700_000)];

const NOTE_SPLIT = '会計連携の月次は収入・支出の合計しか無いので、収入は売上入金、支出はその他経費に置いた。仕入・外注費・人件費・借入の行へ分け直すこと。';
const NOTE_MONTHS = '会計連携は 3 か月分。4 か月目以降は空欄のままなので、見込みを入れること。';
const NOTE_OPENING = '期首の現預金残高は貸借対照表の現預金。基準日が対象期間の期首と合っているか確かめること。';

const intake = (over: Partial<FreeeDealIntake>): FreeeDealIntake => ({
  deals: 10,
  skippedNoDate: 0,
  skippedBadAmount: 0,
  clampedNegative: 0,
  ...over,
});

describe('buildCashPlanImport — 落ちた取引の断り (パス 502)', () => {
  it('★ 取引日が読めない取引と金額が読めない取引があれば、2 つ目の注記として全文を足す', () => {
    const r = buildCashPlanImport({
      accounting: ACC,
      balanceSheet: BS,
      profile: PROFILE,
      existing: {},
      accountingIntake: intake({ skippedNoDate: 2, skippedBadAmount: 1 }),
    });
    expect(r.notes).toEqual([
      NOTE_SPLIT,
      '月ごとの入出金は、会計連携で取得した取引 10 件から組んでいる。' +
        '取引日が読めない 2 件は集計から外れている。' +
        '金額が数として読めない 1 件は集計から外れている。' +
        'その分だけ実際と異なるので、元帳と突き合わせること。',
      NOTE_MONTHS,
      NOTE_OPENING,
    ]);
  });

  it('★ 負の金額を 0 円として数えた取引だけでも、断りを足す', () => {
    const r = buildCashPlanImport({
      accounting: ACC,
      balanceSheet: BS,
      profile: PROFILE,
      existing: {},
      accountingIntake: intake({ deals: 4, clampedNegative: 3 }),
    });
    expect(r.notes).toEqual([
      NOTE_SPLIT,
      '月ごとの入出金は、会計連携で取得した取引 4 件から組んでいる。' +
        '金額が負の 3 件は 0 円として数えている。' +
        'その分だけ実際と異なるので、元帳と突き合わせること。',
      NOTE_MONTHS,
      NOTE_OPENING,
    ]);
  });

  it('★ 対照: 落ちた取引が 0 件なら断りは足さない (取引の件数だけ在っても)', () => {
    const r = buildCashPlanImport({
      accounting: ACC,
      balanceSheet: BS,
      profile: PROFILE,
      existing: {},
      accountingIntake: intake({ deals: 120 }),
    });
    expect(r.notes).toEqual([NOTE_SPLIT, NOTE_MONTHS, NOTE_OPENING]);
  });

  it('★ 対照: 取り込みの素性を渡さない呼び出しも、断りは足さない', () => {
    const r = buildCashPlanImport({ accounting: ACC, balanceSheet: BS, profile: PROFILE, existing: {} });
    expect(r.notes).toEqual([NOTE_SPLIT, NOTE_MONTHS, NOTE_OPENING]);
  });

  it('★ 会計連携の月が 1 つも無ければ、落ちた取引が在っても月次の断りは足さない (月次を取り込まないため)', () => {
    const r = buildCashPlanImport({
      accounting: [],
      balanceSheet: null,
      profile: EMPTY_PROFILE,
      existing: {},
      accountingIntake: intake({ skippedNoDate: 5 }),
    });
    expect(r.notes).toEqual([]);
  });
});
