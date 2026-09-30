/**
 * フルローン (自己資金 0) の理由の文を、返済後キャッシュフローの**符号と境目**ごとに値で留める (パス 502)。
 *
 * `fullLeverageNote` は自己資金が 0 で CCR が出せないとき、「率は出せないが、返済後 CF が持ち出しか
 * 手残りかは言える」として、CF の符号で文末を分ける。既存の検査 (`realEstateMetrics.test.ts`) は
 * **持ち出しの枝だけ**を `toContain` で見ており、
 *
 *   - **手残り (CF ≥ 0) の枝は、どの検査も 1 度も通っていなかった** (変異検査の NoCoverage) ・
 *   - **CF がちょうど 0 円** (持ち出しでも手残りでもない) の境目 ・
 *   - 金額の桁区切り (`ja-JP`)
 *
 * は誰も主張していなかった。フルローンの利用者が画面で最初に読む 1 文で、「持ち出しです」と
 * 「手残りです」を取り違えると、買い増しの判断を逆向きに誤らせる。
 */
import { describe, expect, it } from 'vitest';
import { fullLeverageNote, type RealEstateLeverage } from '../realEstateMetrics';

/** 自己資金 0 = CCR が算定不能 (`null`) の控え。返済後 CF だけを呼び手が決める。 */
const fullLoan = (annualCashflow: number): RealEstateLeverage => ({
  annualDebtService: 3_200_000,
  annualCashflow,
  cashOnCashReturnPct: null,
  yieldGapPct: null,
});

const HEAD = '自己資金が 0 円のため、自己資金回収率（CCR）は算定していません（自己資金で割る指標です）。';

describe('fullLeverageNote — CCR が出せない理由と、返済後 CF の符号', () => {
  it('返済後 CF がマイナスなら「持ち出し」と、絶対値の額で言う', () => {
    expect(fullLeverageNote(fullLoan(-1_234_567))).toBe(
      `${HEAD}返済後の年間キャッシュフローは 1,234,567 円の持ち出しです。`,
    );
  });

  it('返済後 CF がプラスなら「持ち出し」とは言わず、額だけを言う', () => {
    expect(fullLeverageNote(fullLoan(1_234_567))).toBe(`${HEAD}返済後の年間キャッシュフローは 1,234,567 円です。`);
  });

  it('返済後 CF がちょうど 0 円なら持ち出しではない (境目は「マイナスだけ」が持ち出し)', () => {
    expect(fullLeverageNote(fullLoan(0))).toBe(`${HEAD}返済後の年間キャッシュフローは 0 円です。`);
  });

  it('持ち出しが 1 円でもマイナスなら持ち出しと言う (境目の反対側)', () => {
    expect(fullLeverageNote(fullLoan(-1))).toBe(`${HEAD}返済後の年間キャッシュフローは 1 円の持ち出しです。`);
  });

  it('CCR が算定できているなら (自己資金が在るなら) 何も言わない', () => {
    expect(fullLeverageNote({ ...fullLoan(-1_234_567), cashOnCashReturnPct: -1.23 })).toBeNull();
    expect(fullLeverageNote({ ...fullLoan(1_234_567), cashOnCashReturnPct: 0 })).toBeNull();
  });
});
