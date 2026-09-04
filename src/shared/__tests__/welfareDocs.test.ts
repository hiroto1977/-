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
  // 年分を固定する (基礎控除の段階が年分で変わるため)。
  taxYear: 2026,
  targetFreeCash: 265_000,
  rentTotal: 80_000,
  rentCompanyShare: 70_000,
  mealTotal: 15_000,
  mealCompanyShare: 7_500,
  childcare: 50_000,
  ecPoints: 30_000,
};
/*
 * **describe 直下で対象を呼ばない** (罠 2-c-3)。
 *
 * ここは 2026-08-21 まで `const md = welfareRegulationMarkdown(input)` と
 * describe 直下で組み立てていた。収集時に確定した値を見ることになるので、
 * **変異体が有効になる前の結果**を検査していた。Stryker はこれを
 * 「static 変異体」と判定し、`ignoreStatic: true` の下で 45 件すべてを
 * 黙って無視していた — `stryker.config.json` の `mutate` に載っているのに
 * **1 件も測っていない**状態だった (スコアは n/a)。
 *
 * サンクにして各 `it` の中で評価する。`financialRatios.ts` を 51.20% から
 * 100% にしたときと同じ直し方で、検査の中身は 1 行も変えていない。
 */
const result = () => designWelfareScheme(input);

describe('employeeExplanationMarkdown', () => {
  const md = () => employeeExplanationMarkdown(result());
  it('説明資料の見出しを含む', () => {
    expect(md()).toContain('# 新しい給与・福利厚生制度のご説明');
    expect(md()).toContain('なぜ額面（基本給）が下がるのに、手取りが増えるのか');
  });
  it('①②の額面と実質手元残りの数値が文面に現れる', () => {
    expect(md()).toContain('¥580,088'); // normal.gross
    expect(md()).toContain('¥357,303'); // scheme.gross
    expect(md()).toContain('¥422,500'); // scheme.employeeRealValue
  });
  it('実質手取りの増加額を含む', () => {
    expect(md()).toContain('¥157,500'); // diff.employeeRealValue / inKindValue
  });
  it('額面連動項目への注意を明記する', () => {
    expect(md()).toContain('残業代の単価・賞与・将来の年金額');
  });
  it('作成日が YYYY-MM-DD 形式で入る (時刻部を含まない)', () => {
    expect(md()).toMatch(/作成日: \d{4}-\d{2}-\d{2}（/);
  });
});

describe('consentFormMarkdown', () => {
  const md = () => consentFormMarkdown(result());
  it('同意書の見出しと署名欄を含む', () => {
    expect(md()).toContain('# 給与制度変更に関する同意書');
    expect(md()).toContain('署名');
  });
  it('天引き額・変更後額面を含む', () => {
    expect(md()).toContain('¥17,500'); // scheme.payrollDeduction
    expect(md()).toContain('¥357,303'); // scheme.gross
  });
});

describe('welfareRegulationMarkdown', () => {
  const md = () => welfareRegulationMarkdown(input);
  it('規程の各条を含む', () => {
    expect(md()).toContain('# 福利厚生規程（ひな形）');
    expect(md()).toContain('第2条（社宅）');
    expect(md()).toContain('第3条（食事補助）');
    expect(md()).toContain('第4条（育児支援）');
    expect(md()).toContain('第5条（カフェテリアプラン）');
    expect(md()).toContain('第7条（非課税要件の遵守）');
  });
  it('入力金額が条文に反映される', () => {
    expect(md()).toContain('¥70,000'); // rentCompanyShare
    expect(md()).toContain('¥10,000'); // rentSelf = rentTotal - rentCompanyShare
    expect(md()).toContain('¥30,000'); // ecPoints
    expect(md()).toContain('¥50,000'); // childcare
  });
  // この検査は 2026-08-21 まで `expect(md()).toContain('3,500')` と書いてあった。
  // **数字を直に書き留めていた**ので、2026-04-01 施行の改正 (3,500 → 7,500) に
  // 気付かないどころか、直そうとすると検査の方が落ちて「合っている」と
  // 言い張る側に回る。定数を見るようにして、法令が動いたら 1 か所を直せば
  // 全部が追随するようにした。
  it('非課税要件 (食事の会社負担の上限・換金性排除) を明記する', () => {
    expect(md()).toContain(MEAL_SUBSIDY_TAX_FREE_LIMIT_YEN.toLocaleString('en-US'));
    expect(md()).toContain('現金との交換はできない');
  });

  it('改正前の 3,500 円が残っていない', () => {
    // 引き上げ後の値だけが出ること。古い上限が残っていると、規程を読んだ人が
    // 非課税枠を実際より小さく見積もる。
    expect(md()).not.toContain('3,500');
  });
});

/*
 * 第6条（年金制度による還元）と付表の描画。
 *
 * 台帳の中身そのものは employerBenefits.test.ts の golden が押さえている。
 * ここは**描画**を見る — どれを第6条に並べるか、区分の見出し、要件の箇条書き、
 * 注意書きの有無、出典の並べ方。
 */
describe('welfareRegulationMarkdown — 年金制度の条文と付表', () => {
  const md = () => welfareRegulationMarkdown(input);

  it('第6条には年金の 2 種類だけを並べる (現物・手当は入れない)', () => {
    const article = md().split('## 第7条')[0]!.split('## 第6条')[1]!;
    expect(article).toContain('- iDeCo+ (中小事業主掛金納付制度)：');
    expect(article).toContain('- 企業型DC (企業型確定拠出年金) の事業主掛金：');
    expect(article).toContain('- はぐくみ基金 (選択制の確定給付企業年金)：');
    // 通勤手当・食事補助は年金ではないので第6条には出さない。
    expect(article).not.toContain('通勤手当');
    expect(article).not.toContain('食事補助');
    // 並びは台帳の順。
    expect(article.indexOf('iDeCo+')).toBeLessThan(article.indexOf('企業型DC'));
    expect(article.indexOf('企業型DC')).toBeLessThan(article.indexOf('はぐくみ'));
  });

  it('第6条は給与振替の説明義務を書く', () => {
    const article = md().split('## 第7条')[0]!.split('## 第6条')[1]!;
    expect(article).toContain('標準報酬月額の低下により将来の公的給付が減少すること');
    expect(article).toContain('書面で説明する');
  });

  it('付表は台帳の 5 件をすべて出す', () => {
    const table = md().split('## 付表')[1]!;
    for (const label of [
      'iDeCo+ (中小事業主掛金納付制度)',
      '企業型DC (企業型確定拠出年金) の事業主掛金',
      'はぐくみ基金 (選択制の確定給付企業年金)',
      '通勤手当',
      '食事補助',
    ]) {
      expect(table).toContain(`### ${label}`);
    }
  });

  it('区分の見出しを効き方ごとに出し分ける', () => {
    const table = md().split('## 付表')[1]!;
    expect(table).toContain('区分：会社が上乗せ（将来受け取る・額面は下がらない）');
    expect(table).toContain('区分：給与から振替（将来受け取る・標準報酬月額が下がる）');
    expect(table).toContain('区分：現物・手当（いま受け取る）');
  });

  it('要件は 1 行ずつ箇条書きにする', () => {
    const table = md().split('## 付表')[1]!;
    expect(table).toContain('- 厚生年金適用事業所で、従業員数が 300 人以下であること (複数事業所は合計)');
    expect(table).toContain('- 加入者掛金 + 事業主掛金の合計が月 5,000 円以上 23,000 円以下');
    expect(table).toContain('- 上限は「基本給の 20%」と「月 400,000 円」の低い方 (2024-08-01 に 100 万円から引き下げ)');
  });

  it('注意書きは caveat がある給付にだけ出す', () => {
    const table = md().split('## 付表')[1]!;
    const hagukumi = table.split('### 通勤手当')[0]!.split('### はぐくみ基金')[1]!;
    expect(hagukumi).toContain('**注意：** 標準報酬月額が下がるので');
    expect(hagukumi).toContain('老齢厚生年金');
    // 食事補助は caveat が null なので注意書きの行を出さない。
    const meal = table.split('### 食事補助')[1]!;
    expect(meal).not.toContain('**注意：**');
  });

  it('出典はラベルと URL を 1 行ずつ並べる', () => {
    const table = md().split('## 付表')[1]!;
    expect(table).toContain(
      '- 国民年金基金連合会 iDeCo+ 導入時の留意事項: https://www.ideco-koushiki.jp/ideco_plus/ideco_plus_notice.html',
    );
    expect(table).toContain(
      '- はぐくみ企業年金 掛金上限額について: https://hagukumikikin.jp/qaa/077/',
    );
    expect(table).toContain(
      '- 国税庁 No.2582 電車・バス通勤者の通勤手当: https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2582.htm',
    );
  });

  it('付表の 1 件目の golden (見出し・区分・要約・要件・注意・出典の順序)', () => {
    const table = md().split('## 付表')[1]!;
    const entry = table.split('### 企業型DC')[0]!.split('### iDeCo+ (中小事業主掛金納付制度)')[1]!;
    expect(entry).toBe(
      `\n\n区分：会社が上乗せ（将来受け取る・額面は下がらない）\n\n` +
        `従業員が自分で入っている iDeCo に、会社が掛金を上乗せする。給与を下げずに上積みできる。\n\n` +
        `**要件**\n\n` +
        `- 厚生年金適用事業所で、従業員数が 300 人以下であること (複数事業所は合計)\n` +
        `- 対象は iDeCo に加入している厚生年金被保険者 (第2号被保険者)\n` +
        `- 加入者掛金 + 事業主掛金の合計が月 5,000 円以上 23,000 円以下\n` +
        `- 事業主掛金は 1,000 円単位で設定する\n` +
        `- 制度の利用・掛金額・対象者について労使合意が必要\n` +
        `- 事業主掛金は全額損金算入。従業員に課税されず、社会保険料の算定基礎にも含まれない\n` +
        `\n**注意：** 2026年12月に拠出限度額が月 6.2 万円へ引き上げられる予定。規程に金額を直書きしていると改正時に取り残される。\n\n` +
        `**出典**\n\n` +
        `- 国民年金基金連合会 iDeCo+ 導入時の留意事項: https://www.ideco-koushiki.jp/ideco_plus/ideco_plus_notice.html\n` +
        `- 国民年金基金連合会 中小事業主掛金納付制度の手引き: https://www.ideco-koushiki.jp/library/pdf/idecoPlus_guide.pdf\n\n`,
    );
  });

  it('第6条の 3 制度は改行で区切る (1 行に繋げない)', () => {
    const article = md().split('## 第7条')[0]!.split('## 第6条')[1]!;
    expect(article).toContain(
      '   - iDeCo+ (中小事業主掛金納付制度)：従業員が自分で入っている iDeCo に、会社が掛金を上乗せする。給与を下げずに上積みできる。\n' +
        '   - 企業型DC (企業型確定拠出年金) の事業主掛金：会社が掛金を拠出する年金制度。給与を下げずに上積みできる。\n' +
        '   - はぐくみ基金 (選択制の確定給付企業年金)：',
    );
  });

  it('caveat が無い給付は注意の行そのものを出さない (空文字を挟むだけ)', () => {
    const table = md().split('## 付表')[1]!;
    const meal = table.split('### 食事補助')[1]!;
    // 食事補助は台帳の最後なので、後ろに附則が続く。項目の本体だけを見る。
    expect(meal.split('\n\n附則')[0]! + '\n').toBe(
      `\n\n区分：現物・手当（いま受け取る）\n\n` +
        `食事の現物支給または食事補助。要件を満たせば非課税。\n\n` +
        `**要件**\n\n` +
        `- 従業員が食事の価額の半額以上を負担すること\n` +
        `- 会社負担 (食事の価額 − 本人負担) が月 7,500 円以下 (税抜) — 2026-04-01 施行の改正後\n` +
        `- 深夜勤務者への夜食代の金銭支給は月 650 円まで非課税\n\n` +
        `**出典**\n\n` +
        `- 国税庁 食事の現物支給に係る所得税の非課税限度額の引上げについて: https://www.nta.go.jp/users/gensen/2026shokuji/index.htm\n` +
        `- 国税庁 No.2594 食事を支給したとき: https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2594.htm\n`,
    );
  });

  it('付表の項目どうしは空行 2 つで区切る', () => {
    const table = md().split('## 付表')[1]!;
    expect(table).toContain('\n\n### 企業型DC');
  });
});
