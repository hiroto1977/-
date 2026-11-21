/**
 * **逆算が探索上限に張り付いても「解けた」として返していた。** (2026-09-09 · パス 103)
 *
 * `solveGrossForTakeHome` は目標手取りが高すぎて解が無いときも、二分探索の
 * 上限 (¥3,000,000/月) をそのまま返していた。関数自身の注記は
 *
 *     1 円単位。到達不能な高額もカンスト上限で打ち切る。
 *
 * と**打ち切ることを書いていた**が、返り値は `number` 1 本で、打ち切ったことを
 * 呼び出し側が知る術が無かった。下流の 4 面が「打ち切りは起きない」前提で
 * 書かれていた。
 *
 * ## 実測 (直す前)
 *
 * | 面 | 目標 | 刷っていた物 |
 * | --- | ---: | --- |
 * | チャット「手取り180万に必要な額面は？」 | ¥1,800,000 | 文は「必要な額面はおよそ **¥3,000,000**」・**同じ答えの内訳が「手取り ¥1,724,127」** |
 * | 同上 (目標 ¥5,000,000) | ¥5,000,000 | 同じ ¥3,000,000 —— 差は **¥3,275,873** で上限なく開く |
 * | 福利厚生カード | ¥1,600,000 | 通常側だけ飽和し、実質価値の差が ¥170,000 → **¥325,873** (1.92 倍) |
 * | 従業員向け説明資料 | ¥1,600,000 | 「手元残りは **同じ ¥1,600,000** をキープします」・2 行上の表は ¥1,444,127 と ¥1,600,000 |
 *
 * 従業員向け説明資料は**基本給の引き下げを本人に説明する書面**である。
 *
 * ## 規準は同じリポジトリの手の届く所に在った (8 か所目)
 *
 * `realEstateMetrics.ts` の `calcIrr` は**同じ二分法**で
 * 「区間端で符号が同じ (= 解が範囲外) なら **null**」を返す。同じアルゴリズムに
 * 正反対の方針が 2 つ在り、片方だけが呼び出し側に「解けなかった」を伝えていた。
 *
 * ## 判定はしきい値を写さない
 *
 * 上限で表せる**最大手取りは定数ではない** —— 実測 (2026 年分): 介護保険なし
 * ¥1,724,127 / 介護保険あり ¥1,718,588 / 大きな追加控除つき ¥1,927,627。
 * だから「解いた額面が本当に目標を出すか」をモデルに問い直す形にした。
 */
import { describe, expect, it } from 'vitest';
import {
  designWelfareScheme,
  monthlyCompensation,
  solveGrossForTakeHome,
  solveGrossForTakeHomeChecked,
  type WelfareSchemeInput,
} from '../welfareScheme';
import { consentFormMarkdown, employeeExplanationMarkdown } from '../welfareDocs';
import { calcIrr } from '../realEstateMetrics';

/** 基礎控除の段階が年分で変わるので年を固定する (暦が変わった日に落ちないため)。 */
const YEAR = 2026;

const BASE: WelfareSchemeInput = {
  targetFreeCash: 0,
  rentTotal: 200_000,
  rentCompanyShare: 100_000,
  mealTotal: 20_000,
  mealCompanyShare: 10_000,
  childcare: 50_000,
  ecPoints: 10_000,
  taxYear: YEAR,
};
const design = (targetFreeCash: number) => designWelfareScheme({ ...BASE, targetFreeCash });

describe('機構 — 探索上限は在り、そこで表せる最大手取りは定数ではない', () => {
  it('★ 上限の額面では目標に届かない高さが在る (打ち切りが実在する)', () => {
    const far = solveGrossForTakeHomeChecked(5_000_000, false, undefined, YEAR);
    expect(far.reached).toBe(false);
    // 上限に張り付いている: もっと高い目標でも同じ額面が返る。
    const farther = solveGrossForTakeHomeChecked(100_000_000, false, undefined, YEAR);
    expect(farther.gross).toBe(far.gross);
    // そして「その額面で出る手取り」は目標を大きく下回る。
    expect(far.takeHome).toBeLessThan(5_000_000);
  });

  it('★ 上限で表せる最大手取りは条件で動く (しきい値を写せない)', () => {
    const ceilingGross = solveGrossForTakeHomeChecked(100_000_000, false, undefined, YEAR).gross;
    const plain = monthlyCompensation(ceilingGross, false, undefined, YEAR).takeHome;
    const withCare = monthlyCompensation(ceilingGross, true, undefined, YEAR).takeHome;
    const deducted = monthlyCompensation(
      ceilingGross,
      false,
      { incomeTax: 5_000_000, residentTax: 4_000_000 },
      YEAR,
    ).takeHome;
    // 3 つとも違う。「手取り X 以上なら範囲外」という定数は書けない。
    expect(withCare).not.toBe(plain);
    expect(deducted).not.toBe(plain);
    expect(deducted).toBeGreaterThan(plain);
  });

  it('★ 手取りは額面に対し厳密には単調でない (検算で判定する理由)', () => {
    // **1 円の昇給で手取りが下がる点が実在する。** 実測で 33,322 か所・
    // 最大の下がりは額面 ¥2,245,834 で ¥6,695。二分探索は解を見つけ損なう
    // ことがありうるので、返り値を検算する形でなければ「解けた」を名乗れない。
    const at = 2_245_834;
    const before = monthlyCompensation(at - 1, false, undefined, YEAR).takeHome;
    const after = monthlyCompensation(at, false, undefined, YEAR).takeHome;
    expect(after).toBeLessThan(before);
    expect(Math.round(before - after)).toBe(6_695);
    // 対照: おおむねは増える (この検査が「常に下がる」を見ていない)。
    expect(monthlyCompensation(500_000, false, undefined, YEAR).takeHome).toBeGreaterThan(
      monthlyCompensation(400_000, false, undefined, YEAR).takeHome,
    );
  });

  it('★ 同じ二分法の calcIrr は「範囲外なら null」を返す (借りてきた規準)', () => {
    // 符号変化が無い = 区間内に解が無い → null。これが在ったのに逆算側は上限を返していた。
    expect(calcIrr([100, 100, 100])).toBeNull();
    // 対照: 解が在れば数を返す (この検査が「常に null」を見ていない)。
    expect(calcIrr([-1_000, 600, 600])).not.toBeNull();
  });
});

describe('solveGrossForTakeHomeChecked — 届いたかを値と一緒に返す', () => {
  it('★ 収束する帯では reached が true で、残差が 0 (刷る粒度で一致)', () => {
    for (const target of [1, 1_000, 300_000, 800_000, 1_500_000]) {
      const r = solveGrossForTakeHomeChecked(target, false, undefined, YEAR);
      expect(r.reached, `target ${target}`).toBe(true);
      const actual = monthlyCompensation(r.gross, false, undefined, YEAR).takeHome;
      expect(Math.round(actual), `target ${target}`).toBe(target);
    }
  });

  /**
   * 届く最大の目標を `reached` で二分探索して**探す**。
   *
   * **上限額面が出す手取りを「届く最大」と決め打ってはいけない。** 手取りは
   * 額面に対し厳密には単調でないので (下の機構の検査で実測)、段差の谷では
   * 上限より低い額面のほうが手取りが多い。実測: 介護保険つきで届く最大は
   * ¥1,718,608 で、上限額面が出す ¥1,718,588 より ¥20 高い。
   * 最初はそこを決め打って書き、この検査自身が落ちて教えてくれた。
   */
  const maxReachable = (withCare: boolean): number => {
    let lo = 1;
    let hi = 3_000_000;
    for (let i = 0; i < 40; i += 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (solveGrossForTakeHomeChecked(mid, withCare, undefined, YEAR).reached) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  it('★ 境目の両側を見る (1 円越えで false・ちょうどで true)', () => {
    const max = maxReachable(false);
    expect(solveGrossForTakeHomeChecked(max, false, undefined, YEAR).reached).toBe(true);
    expect(solveGrossForTakeHomeChecked(max + 1, false, undefined, YEAR).reached).toBe(false);
    // 境目が「探索の端」ではないこと (0 や 3,000,000 に張り付いた偽の境目でない)。
    expect(max).toBeGreaterThan(1_000_000);
    expect(max).toBeLessThan(3_000_000);
  });

  it('★ 介護保険つきでも同じ規則で判定する (境目は別の場所に在る)', () => {
    const maxCare = maxReachable(true);
    expect(solveGrossForTakeHomeChecked(maxCare, true, undefined, YEAR).reached).toBe(true);
    expect(solveGrossForTakeHomeChecked(maxCare + 1, true, undefined, YEAR).reached).toBe(false);
    // 介護保険料が増えるので、届く最大は介護保険なしより低い ——
    // つまり「手取り X 以上なら範囲外」という定数は書けない。
    expect(maxCare).toBeLessThan(maxReachable(false));
  });

  it('★ 目標 0 以下は額面 0 で足りる (届いた扱い・規則は 1 つ)', () => {
    for (const target of [0, -1, -500_000]) {
      const r = solveGrossForTakeHomeChecked(target, false, undefined, YEAR);
      expect(r.gross, `target ${target}`).toBe(0);
      expect(r.reached, `target ${target}`).toBe(true);
    }
  });

  it('★ 対照: 額面だけを返す従来の関数は今までどおりの値 (呼び出し元を壊していない)', () => {
    for (const target of [1, 300_000, 1_500_000, 5_000_000]) {
      expect(solveGrossForTakeHome(target, false, undefined, YEAR)).toBe(
        solveGrossForTakeHomeChecked(target, false, undefined, YEAR).gross,
      );
    }
  });
});

describe('福利厚生スキーム — 目標に届いたかを筋書きが持つ', () => {
  it('★ 届く目標では両筋書きが reachedTarget=true で、手元残りが目標と一致', () => {
    const r = design(800_000);
    expect(r.normal.reachedTarget).toBe(true);
    expect(r.scheme.reachedTarget).toBe(true);
    expect(Math.round(r.normal.freeCash)).toBe(800_000);
    expect(Math.round(r.scheme.freeCash)).toBe(800_000);
  });

  it('★ 通常側だけが飽和する目標が在る (比較の前提が崩れる)', () => {
    const r = design(1_600_000);
    expect(r.normal.reachedTarget).toBe(false);
    expect(r.scheme.reachedTarget).toBe(true);
    // 「同じ手元残りでの比較」になっていない —— これが欠陥の中身。
    expect(Math.round(r.normal.freeCash)).not.toBe(Math.round(r.scheme.freeCash));
    expect(Math.round(r.normal.freeCash)).toBeLessThan(1_600_000);
  });

  it('★ 飽和すると実質価値の差が水増しされる (制度の効果ではない)', () => {
    const honest = design(800_000).diff.employeeRealValue;
    const inflated = design(1_600_000).diff.employeeRealValue;
    // 現物価値は目標に依らないので、届いている限り差は一定。
    expect(Math.round(design(1_200_000).diff.employeeRealValue)).toBe(Math.round(honest));
    // 飽和した側では差が膨らむ (実測 ¥170,000 → ¥325,873)。
    expect(inflated).toBeGreaterThan(honest);
  });
});

describe('書面 — 成り立たない主張を刷らない', () => {
  const SAME_CLAIM = '同じ';

  it('★ 届いた目標なら「手元残りは同じ ¥X をキープします」を今までどおり刷る', () => {
    const md = employeeExplanationMarkdown(design(800_000));
    expect(md).toContain(`手元残り（自由に使えるお金）は **${SAME_CLAIM} ¥800,000** をキープします`);
    expect(md).toContain('月 ¥170,000 増える');
    // 断り書きは出ない。
    expect(md).not.toContain('本試算モデルの範囲を超えています');
  });

  it('★ 飽和したら「同じ」と言わず、表の 2 つの額を並べて断る', () => {
    const r = design(1_600_000);
    const md = employeeExplanationMarkdown(r);
    // **これが直した中身** —— 「同じ ¥1,600,000 をキープします」を刷らない。
    expect(md).not.toContain(`${SAME_CLAIM} ¥1,600,000** をキープ`);
    expect(md).toContain('同額になっていません');
    expect(md).toContain('本試算モデルの範囲を超えています');
    // 断りは表の実物の額を引く (手で写さない)。
    expect(md).toContain(`¥${Math.round(r.normal.freeCash).toLocaleString('ja-JP')}`);
    // 差額を「制度の効果」として読ませない。
    expect(md).not.toContain('増える** 計算です');
    expect(md).toContain('制度の効果とは言えません');
  });

  it('★ 署名を求める同意書にも断りが出る (表だけ渡さない)', () => {
    expect(consentFormMarkdown(design(1_600_000))).toContain('本試算モデルの範囲を超えています');
    // 対照: 届いていれば同意書は今までどおり。
    expect(consentFormMarkdown(design(800_000))).not.toContain('本試算モデルの範囲を超えています');
  });

  it('★ どちらの側が届かなかったかを名指しする', () => {
    // 通常側だけが飽和する目標。
    const one = employeeExplanationMarkdown(design(1_600_000));
    expect(one).toContain('① これまで');
    expect(one).not.toContain('② 新制度（');
    // 両方が飽和する目標では両方を挙げる。
    const both = design(2_000_000);
    expect(both.normal.reachedTarget).toBe(false);
    expect(both.scheme.reachedTarget).toBe(false);
    const md = employeeExplanationMarkdown(both);
    expect(md).toContain('① これまで');
    expect(md).toContain('② 新制度（');
  });
});
