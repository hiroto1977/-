import { describe, it, expect } from 'vitest';
import {
  designWelfareScheme,
  MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN,
  type WelfareSchemeInput,
} from '../welfareScheme';
import {
  employeeExplanationMarkdown,
  consentFormMarkdown,
  welfareRegulationMarkdown,
} from '../welfareDocs';

const input: WelfareSchemeInput = {
  targetFreeCash: 265_000,
  rentTotal: 80_000,
  rentCompanyShare: 70_000,
  mealTotal: 15_000,
  mealCompanyShare: 7_500,
  childcare: 50_000,
  ecPoints: 30_000,
};
const result = designWelfareScheme(input);

describe('employeeExplanationMarkdown', () => {
  const md = employeeExplanationMarkdown(result);
  it('説明資料の見出しを含む', () => {
    expect(md).toContain('# 新しい給与・福利厚生制度のご説明');
    expect(md).toContain('なぜ額面（基本給）が下がるのに、手取りが増えるのか');
  });
  it('①②の額面と実質手元残りの数値が文面に現れる', () => {
    expect(md).toContain('¥585,123'); // normal.gross
    expect(md).toContain('¥360,376'); // scheme.gross
    expect(md).toContain('¥422,500'); // scheme.employeeRealValue
  });
  it('実質手取りの増加額を含む', () => {
    expect(md).toContain('¥157,500'); // diff.employeeRealValue / inKindValue
  });
  it('額面連動項目への注意を明記する', () => {
    expect(md).toContain('残業代の単価・賞与・将来の年金額');
  });
  it('作成日が YYYY-MM-DD 形式で入る (時刻部を含まない)', () => {
    expect(md).toMatch(/作成日: \d{4}-\d{2}-\d{2}（/);
  });
});

describe('consentFormMarkdown', () => {
  const md = consentFormMarkdown(result);
  it('同意書の見出しと署名欄を含む', () => {
    expect(md).toContain('# 給与制度変更に関する同意書');
    expect(md).toContain('署名');
  });
  it('天引き額・変更後額面を含む', () => {
    expect(md).toContain('¥17,500'); // scheme.payrollDeduction
    expect(md).toContain('¥360,376'); // scheme.gross
  });
});

describe('welfareRegulationMarkdown', () => {
  const md = welfareRegulationMarkdown(input);
  it('規程の各条を含む', () => {
    expect(md).toContain('# 福利厚生規程（ひな形）');
    expect(md).toContain('第2条（社宅）');
    expect(md).toContain('第3条（食事補助）');
    expect(md).toContain('第4条（育児支援）');
    expect(md).toContain('第5条（カフェテリアプラン）');
    expect(md).toContain('第6条（非課税要件の遵守）');
  });
  it('入力金額が条文に反映される', () => {
    expect(md).toContain('¥70,000'); // rentCompanyShare
    expect(md).toContain('¥10,000'); // rentSelf = rentTotal - rentCompanyShare
    expect(md).toContain('¥30,000'); // ecPoints
    expect(md).toContain('¥50,000'); // childcare
  });
  // この検査は 2026-08-21 まで `expect(md).toContain('3,500')` と書いてあった。
  // **数字を直に書き留めていた**ので、2026-04-01 施行の改正 (3,500 → 7,500) に
  // 気付かないどころか、直そうとすると検査の方が落ちて「合っている」と
  // 言い張る側に回る。定数を見るようにして、法令が動いたら 1 か所を直せば
  // 全部が追随するようにした。
  it('非課税要件 (食事の会社負担の上限・換金性排除) を明記する', () => {
    expect(md).toContain(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN.toLocaleString('en-US'));
    expect(md).toContain('現金との交換はできない');
  });

  it('改正前の 3,500 円が残っていない', () => {
    // 引き上げ後の値だけが出ること。古い上限が残っていると、規程を読んだ人が
    // 非課税枠を実際より小さく見積もる。
    expect(md).not.toContain('3,500');
  });
});
