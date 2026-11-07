/**
 * **チャットの手取り計算が「範囲外」と答える文を、全文で留める。** (パス 502)
 *
 * 範囲外の 2 つの答え (逆算が目標に届かない / 額面が低すぎて手取りが 0 以下) は、
 * 断片ごとの `toContain` だけでは文の**繋ぎ目**が見えなかった —— 断りの 4 つの
 * 断片のどれを空にしても、既存の検査 (`範囲外` / `最低等級` を探す) は通っていた。
 * ここでは入力 → 出力の全文を値ごと (`toBe`) で並べる。
 *
 * 期待値は原文の式の写しではなく、**独立に導いた値**で組む:
 * - 「差し引き」は 社会保険料 + 所得税 + 住民税。手で組んだ内訳の 3 つの数の和を
 *   この検査の中で書き下す (10,952 + 300 + 500 = 11,752)。
 * - 実際のモデルが出す内訳には、額面 − 手取り という別の導き方を当てる
 *   (`takeHome = gross − 3 つの控除` は `monthlyCompensation` の定義そのもの)。
 */
import { describe, expect, it } from 'vitest';
import { formatCalcAnswer, parseAmountJa, runCalcQuery } from '../chatCalc';
import type { CalcAnswer } from '../chatCalc';

/** 手で組んだ内訳。数は互いに違う値にして、足し算の向きを取り違えたら必ず値が変わるようにする。 */
function answerOf(over: {
  readonly kind: 'take-home' | 'required-gross';
  readonly amount: number;
  readonly gross: number;
  readonly socialInsurance: number;
  readonly incomeTax: number;
  readonly residentTax: number;
  readonly takeHome: number;
  readonly reached: boolean;
}): CalcAnswer {
  return {
    query: { kind: over.kind, amount: over.amount },
    comp: {
      gross: over.gross,
      employeeSocialInsurance: over.socialInsurance,
      incomeTax: over.incomeTax,
      residentTax: over.residentTax,
      takeHome: over.takeHome,
      employerSocialInsurance: 0,
    },
    reached: over.reached,
  };
}

describe('formatCalcAnswer — 範囲外の答えを全文で留める (パス 502)', () => {
  it('★ 逆算が目標に届かないときは、断りの 4 つの断片を繋いだ全文を返す', () => {
    const text = formatCalcAnswer(
      answerOf({
        kind: 'required-gross',
        amount: 1_800_000,
        gross: 3_000_000,
        socialInsurance: 650_000,
        incomeTax: 500_000,
        residentTax: 125_873,
        takeHome: 1_724_127,
        reached: false,
      }),
    );
    expect(text).toBe(
      '💴 手取り ¥1,800,000/月 は、このモデルの範囲外です。' +
        'このモデルで扱える上限は 額面 ¥3,000,000/月 のときの 手取り ¥1,724,127/月 までです。\n' +
        '※ 標準報酬月額の等級表と基礎控除だけの簡略モデルなので、役員報酬のような高額は' +
        '「税務試算」ページか税理士へどうぞ。',
    );
  });

  it('★ 手取りが 0 以下の額面は、差し引きの合計 (社保 + 所得税 + 住民税) を添えた全文を返す', () => {
    const text = formatCalcAnswer(
      answerOf({
        kind: 'take-home',
        amount: 1_000,
        gross: 1_000,
        socialInsurance: 10_952,
        incomeTax: 300,
        residentTax: 500,
        takeHome: -10_752,
        reached: true,
      }),
    );
    // 差し引き = 10,952 + 300 + 500 = 11,752 (どの項の符号を取り違えても別の額になる)。
    expect(text).toBe(
      '💴 額面 ¥1,000/月 は、このモデルの範囲外です。' +
        '社会保険料は標準報酬月額の最低等級で下支えされるため、' +
        'この額面では手取りが 0 以下になります (差し引き ¥11,752/月)。\n' +
        '※ 月額の金額を「額面30万」「手取り25万」のように書いてもう一度お試しください。',
    );
  });

  it('★ 境目: 手取りがちょうど 0 円でも範囲外と答える (1 円でも残れば内訳を出す)', () => {
    // 額面 11,752 − (10,952 + 300 + 500) = 0 ちょうど。
    const zero = formatCalcAnswer(
      answerOf({
        kind: 'take-home',
        amount: 11_752,
        gross: 11_752,
        socialInsurance: 10_952,
        incomeTax: 300,
        residentTax: 500,
        takeHome: 0,
        reached: true,
      }),
    );
    expect(zero).toBe(
      '💴 額面 ¥11,752/月 は、このモデルの範囲外です。' +
        '社会保険料は標準報酬月額の最低等級で下支えされるため、' +
        'この額面では手取りが 0 以下になります (差し引き ¥11,752/月)。\n' +
        '※ 月額の金額を「額面30万」「手取り25万」のように書いてもう一度お試しください。',
    );
    // 対照: 手取りが 1 円なら断らず、内訳を出す (境目が 1 つ上へずれていない)。
    const one = formatCalcAnswer(
      answerOf({
        kind: 'take-home',
        amount: 11_753,
        gross: 11_753,
        socialInsurance: 10_952,
        incomeTax: 300,
        residentTax: 500,
        takeHome: 1,
        reached: true,
      }),
    );
    expect(one).not.toContain('範囲外');
    expect(one).toContain('額面 ¥11,753/月 → 社会保険料 ¥10,952 / 所得税 ¥300 / 住民税 ¥500 / 手取り ¥1');
  });

  it('★ 実際のモデルが出す内訳でも、差し引きは 額面 − 手取り と一致する', () => {
    // 額面 ¥1,000 は手取りが負になる (最低等級の社保 ¥10,952 が引かれるため)。
    const answer = runCalcQuery({ kind: 'take-home', amount: 1_000 }, 2026);
    expect(answer.comp.takeHome).toBeLessThanOrEqual(0);
    const deducted = answer.comp.gross - answer.comp.takeHome;
    // 額面 1,000 − 手取り (負) = 1,000 + |手取り| = 3 つの控除の和。
    expect(deducted).toBeGreaterThan(answer.comp.employeeSocialInsurance);
    const yen = (n: number): string => `¥${n.toLocaleString('en-US')}`;
    expect(formatCalcAnswer(answer)).toContain(`差し引き ${yen(deducted)}/月`);
  });
});

describe('parseAmountJa — 位取りの字は 万・億・兆 だけ (パス 502)', () => {
  it('★ 数の直後の英字を位取りとして食わない (その先の単位は「すぐ後ろ」ではない)', () => {
    // 「40歳」の 40 は年齢で金額ではないので飛ばす。ところが数と「歳」のあいだに
    // 英字が挟まれば、単位は数の**すぐ後ろ**ではなくなり、40 は金額として読める
    // (位取りの字に英字が混ざると、英字を位取りとして食って「歳」が直後に見えてしまう)。
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of letters) {
      expect(parseAmountJa(`40${ch}歳`), `40${ch}歳`).toBe(40);
    }
    // 記号も同じ (`,` は桁区切りとして数の一部になるので標本に入れない)。
    for (const ch of ['!', '-', '_', '.']) {
      expect(parseAmountJa(`40${ch}歳`), `40${ch}歳`).toBe(40);
    }
  });

  it('★ 対照: 数と単位のあいだが空白だけなら、単位は直後と見なして飛ばす (断りが広すぎない)', () => {
    expect(parseAmountJa('40 歳')).toBeNull();
    expect(parseAmountJa('40歳')).toBeNull();
    // 位取りの字の直後の単位も同じ (「40万」の直後が「歳」なら金額ではない)。
    expect(parseAmountJa('40万歳')).toBeNull();
  });

  it('★ 位取りの字 3 つは、いずれも 1 つだけ読まれる (万・億・兆)', () => {
    expect(parseAmountJa('3万')).toBe(30_000);
    expect(parseAmountJa('3億')).toBe(300_000_000);
    expect(parseAmountJa('3兆')).toBe(3_000_000_000_000);
  });

  it('★ 桁が大きすぎる入力は、位取りの有無に関わらず断る (Infinity を返さない)', () => {
    // 数そのものが Infinity になる桁 (309 桁) も、位取りで有限を外れる値 (1e300 兆) も null。
    expect(parseAmountJa(`1${'0'.repeat(309)}`)).toBeNull();
    expect(parseAmountJa(`1${'0'.repeat(309)}万`)).toBeNull();
    expect(parseAmountJa(`1${'0'.repeat(300)}兆`)).toBeNull();
    // 対照: 大きくても有限なら返す (断りが広すぎない)。
    expect(parseAmountJa(`1${'0'.repeat(300)}`)).toBe(1e300);
  });
});
