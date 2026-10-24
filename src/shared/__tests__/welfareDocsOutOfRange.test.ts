/**
 * 福利厚生の書面の**冒頭の文の繋ぎ目**を、値ごと (`toBe`) 留める (パス 502)。
 *
 * `welfareDocs.ts` の `outOfRangeNotice` (目標の手元残りが範囲を超えたときの断り) は、届かなかった側の
 * 名指し (`① これまで（…）` / `② 新制度（…）`) を `filter` で選り分けて ` と ` で繋ぐ。既存の検査は
 * 断片ごとの `toContain` (「① これまで」が在る・「② 新制度（」が無い) で、**片側だけが届かなかったとき
 * 配列の `null` が選別されず `" と ② 新制度…"` と先頭に区切りが残る形**も、両側のとき区切りが無くなる形も、
 * 書面の「同じでも」「の変化は下表のとおりで」が入れ替わる形も、通していた。
 *
 * この書面は**基本給の引き下げを従業員に説明し、署名を求める**物なので、断りの文が崩れても
 * 「同じ手元残り」と読める側へは倒れないが、崩れた文は利用者の目にそのまま出る。
 *
 * 入力は計算 (`designWelfareScheme`) を通さず**手で組んだ結果**にする。期待値が計算の出力に
 * 引きずられないのと、届いた / 届かなかったを 3 通り (両方 / 通常側だけ / 新制度側だけ) 自由に作れるため。
 */
import { describe, expect, it } from 'vitest';
import { consentFormMarkdown, employeeExplanationMarkdown } from '../welfareDocs';
import type { WelfareScenario, WelfareSchemeResult } from '../welfareScheme';

function scenario(over: Partial<WelfareScenario>): WelfareScenario {
  return {
    gross: 500_000,
    employeeSocialInsurance: 70_000,
    tax: 20_000,
    payrollDeduction: 0,
    netPaid: 410_000,
    freeCash: 300_000,
    inKindValue: 0,
    taxableInKind: 0,
    employeeRealValue: 300_000,
    companyTotalCost: 600_000,
    reachedTarget: true,
    ...over,
  };
}

/** 通常側 (①) の手元残りは ¥1,234,567・新制度側 (②) は ¥1,400,000。届いたかどうかだけを呼び手が決める。 */
function result(normalReached: boolean, schemeReached: boolean): WelfareSchemeResult {
  const zero = { gross: 0, employeeSocialInsurance: 0, tax: 0, employeeRealValue: 0, companyTotalCost: 0 };
  return {
    normal: scenario({ freeCash: 1_234_567, reachedTarget: normalReached }),
    scheme: scenario({ freeCash: 1_400_000, reachedTarget: schemeReached }),
    diff: zero,
    mealSubsidy: { taxFree: true, reasons: [] },
    deductions: {
      dependent: { incomeTax: 0, residentTax: 0 },
      blue: 0,
      spouse: { incomeTax: 0, residentTax: 0 },
      total: { incomeTax: 0, residentTax: 0 },
    },
  };
}

/** 断りの枠。`sides` (届かなかった側の名指し) だけが可変で、残りは利用者が読む文そのもの。 */
function notice(sides: string): string {
  return (
    '> ⚠ **この目標の手元残りは、本試算モデルの範囲を超えています。**\n' +
    `> ${sides} が目標額に届いていないため、**下表の 2 つの筋書きは\n` +
    '> 「同じ手元残り」での比較になっていません。**額面の上限に張り付いた結果を\n' +
    '> 並べているだけなので、差額をそのまま制度の効果として読まないでください。\n' +
    '> 目標額を下げるか、税理士・社労士にご相談ください。\n' +
    '\n'
  );
}

const NORMAL_SIDE = '① これまで（¥1,234,567）';
const SCHEME_SIDE = '② 新制度（¥1,400,000）';

/** 従業員向け説明資料の冒頭 (表の前まで)。`notice` は断りの枠 (届いているなら空)、`verb` は手元残りの句。 */
function explanationHead(noticeText: string, verb: string): string {
  return (
    '# 新しい給与・福利厚生制度のご説明\n' +
    '\n' +
    `${noticeText}## なぜ額面（基本給）が下がるのに、手取りが増えるのか\n` +
    '\n' +
    '会社が **社宅・食事補助・育児補助・自社EC ポイント** を直接ご提供することで、\n' +
    'その分の基本給を下げます。額面が下がると **社会保険料と税金も下がる** ため、\n' +
    `生活費を払った後に自由に使えるお金（手元残り）${verb}、**会社が現物で\n` +
    '提供する価値の分だけ、あなたの実質的な手取りは増えます。**\n' +
    '\n'
  );
}

const headOf = (md: string): string => md.split('## 数字での比較')[0]!;

describe('従業員向け説明資料 — 冒頭の断りと手元残りの句を値ごと留める', () => {
  it('両方届いたら断りを出さず、手元残りは「は同じでも」と言う (余計な文字を挟まない)', () => {
    expect(headOf(employeeExplanationMarkdown(result(true, true)))).toBe(explanationHead('', 'は同じでも'));
  });

  it('両方届かなかったら、2 つの名指しを「 と 」で繋ぎ、手元残りは「の変化は下表のとおりで」と言う', () => {
    expect(headOf(employeeExplanationMarkdown(result(false, false)))).toBe(
      explanationHead(notice(`${NORMAL_SIDE} と ${SCHEME_SIDE}`), 'の変化は下表のとおりで'),
    );
  });

  it('通常側だけが届かなかったら、名指しは ① だけ (区切りを残さない)', () => {
    expect(headOf(employeeExplanationMarkdown(result(false, true)))).toBe(
      explanationHead(notice(NORMAL_SIDE), 'の変化は下表のとおりで'),
    );
  });

  it('新制度側だけが届かなかったら、名指しは ② だけ (先頭に区切りを残さない)', () => {
    expect(headOf(employeeExplanationMarkdown(result(true, false)))).toBe(
      explanationHead(notice(SCHEME_SIDE), 'の変化は下表のとおりで'),
    );
  });
});

describe('給与変更・天引き同意書 — 冒頭の断りを値ごと留める (署名を求める書面)', () => {
  const titleAndNotice = (md: string): string => md.split('私は、会社が導入する')[0]!;
  const TITLE = '# 給与制度変更に関する同意書\n\n';

  it('両方届いたら断りを出さず、見出しの直後に本文が続く (余計な文字を挟まない)', () => {
    expect(titleAndNotice(consentFormMarkdown(result(true, true)))).toBe(TITLE);
  });

  it('両方届かなかったら、見出しの直後に 2 つの名指しを「 と 」で繋いだ断りを置く', () => {
    expect(titleAndNotice(consentFormMarkdown(result(false, false)))).toBe(
      TITLE + notice(`${NORMAL_SIDE} と ${SCHEME_SIDE}`),
    );
  });

  it('片側だけ届かなかったら、その側だけを名指しする', () => {
    expect(titleAndNotice(consentFormMarkdown(result(false, true)))).toBe(TITLE + notice(NORMAL_SIDE));
    expect(titleAndNotice(consentFormMarkdown(result(true, false)))).toBe(TITLE + notice(SCHEME_SIDE));
  });
});
