/**
 * ワンストップ特例の判定が**読めない入力**のときに言う文を、値ごと (`toEqual`) 留める (パス 502)。
 *
 * 寄附先の件数・上限が数として読めない (NaN / ±Infinity) とき、判定は「対象です (確定申告不要)」へ
 * 倒れてはいけない —— 申告しなくてよいと告げる側の誤りになる。`nonFiniteEntryPoints.test.ts` は
 * その**向き** (`eligible: false`) を留めるが、理由の文を見ていないので、文を別の文にしても
 * (あるいは空にしても) 緑だった。画面 (`TaxPage`) はこの `reason` をそのまま利用者へ出す。
 */
import { describe, expect, it } from 'vitest';
import { furusatoOneStopEligibility } from '../taxFurusato';

const UNREADABLE = {
  eligible: false,
  reason: '寄附先の件数が読めないため、ワンストップ特例の判定ができません (入力を確認してください)',
};

describe('furusatoOneStopEligibility — 件数や上限が読めないときは「判定できません」と言う', () => {
  it('寄附先の件数が NaN / ±Infinity なら、判定できないと言う (対象とも対象外とも言わない)', () => {
    for (const n of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(furusatoOneStopEligibility(n, false), String(n)).toEqual(UNREADABLE);
    }
  });

  it('上限 (自治体数の上限) が読めないときも同じ文', () => {
    expect(furusatoOneStopEligibility(3, false, Number.NaN)).toEqual(UNREADABLE);
    expect(furusatoOneStopEligibility(3, false, Number.POSITIVE_INFINITY)).toEqual(UNREADABLE);
  });

  it('対照: 確定申告を行うなら、件数が読めなくても先に「使えません」と言う (読めない文を前へ出さない)', () => {
    expect(furusatoOneStopEligibility(Number.NaN, true)).toEqual({
      eligible: false,
      reason: '確定申告を行う場合はワンストップ特例を使えません (申告に寄附金控除を含めます)',
    });
  });

  it('対照: 読める入力なら、この文は出ない (5 自治体以内は対象)', () => {
    expect(furusatoOneStopEligibility(5, false)).toEqual({
      eligible: true,
      reason: 'ワンストップ特例の対象です (給与所得者・確定申告不要・5自治体以内)',
    });
  });
});
