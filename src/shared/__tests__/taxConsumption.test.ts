import { describe, expect, it, vi } from 'vitest';
import {
  DEEMED_PURCHASE_RATES,
  TWENTY_PERCENT_MEASURE_END,
  TWENTY_PERCENT_RATE,
  twentyPercentMeasureStatus,
  type SimplifiedBusinessType,
} from '../taxConsumption';
import { calcSimplifiedTax, calcTwentyPercentTax } from '../taxConsumptionBusiness';

/**
 * 納付税額の算定そのものは `taxConsumptionBusiness.test.ts` が見る。
 * ここは法定の率と事業区分だけを固定する — 率を 1 つ書き間違えると、
 * 計算式が正しくても納付額が丸ごとずれる。
 */
describe('簡易課税のみなし仕入率', () => {
  it('6 区分すべての率が法定どおり', () => {
    expect(DEEMED_PURCHASE_RATES).toEqual({
      wholesale: 0.9,      // 第1種 卸売業
      retail: 0.8,         // 第2種 小売業・飲食料品の譲渡
      manufacturing: 0.7,  // 第3種 製造業・建設業・農林漁業
      other: 0.6,          // 第4種 その他（飲食店業等）
      service: 0.5,        // 第5種 サービス業・金融保険業
      'real-estate': 0.4,  // 第6種 不動産業
    });
  });

  it('区分は 6 つで、増減があれば気づく', () => {
    expect(Object.keys(DEEMED_PURCHASE_RATES)).toHaveLength(6);
  });

  it('率がそのまま納付額に効く（区分ごとに実際の税額で確かめる）', () => {
    // 売上1,000万 × 10% = 100万の売上税額。納付は 100万 × (1 − みなし仕入率)。
    const paid = (type: SimplifiedBusinessType) =>
      calcSimplifiedTax([{ type, sales: { standard: 10_000_000, reduced: 0 } }]);
    expect(paid('wholesale')).toBe(100_000);
    expect(paid('retail')).toBe(200_000);
    expect(paid('manufacturing')).toBe(300_000);
    expect(paid('other')).toBe(400_000);
    expect(paid('service')).toBe(500_000);
    expect(paid('real-estate')).toBe(600_000);
  });
});

describe('2割特例の割合', () => {
  it('売上に係る消費税額の 20%', () => {
    expect(TWENTY_PERCENT_RATE).toBe(0.2);
    expect(calcTwentyPercentTax({ standard: 10_000_000, reduced: 0 })).toBe(200_000);
  });
});

/**
 * **期限つきの措置に、期限を見る仕組みが要る。**
 *
 * `TWENTY_PERCENT_MEASURE_END` は 2026-08-23 に「機械が読める形に置くだけ」で
 * 入り、注記も「この定数は計算を変えない」と書いていた。2026-09-06 の実測で
 * 期限まで 24 日になったので判定に繋いだ。
 *
 * 判定が 3 値である理由は型の注記にある —— 適用は「期限までの日の属する
 * **課税期間**」で決まるので、今日の日付だけでは `active` と `ended` の
 * 間に**言い切れない帯**が 1 年ぶん残る。ここではその 3 帯の**境界**を留める
 * (期限当日 / 翌日 / 期限+1年-1日 / その翌日)。
 */
describe('twentyPercentMeasureStatus (2割特例の適用期限)', () => {
  /** 利用者の時計の正午 (時間帯で日付が動かない位置)。 */
  const at = (iso: string): Date => {
    const p = iso.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  };

  it('期限の前は active', () => {
    expect(twentyPercentMeasureStatus(at('2026-09-06'))).toBe('active');
    expect(twentyPercentMeasureStatus(at('2023-10-01'))).toBe('active');
  });

  it('★ 期限当日はまだ active (「までの日」は当日を含む)', () => {
    expect(twentyPercentMeasureStatus(at('2026-09-30'))).toBe('active');
  });

  it('★ 期限の翌日から period-dependent — 期限を含む課税期間がまだありうる', () => {
    // 3 月決算法人の課税期間 2026-04-01〜2027-03-31 は 2026-09-30 を含む。
    expect(twentyPercentMeasureStatus(at('2026-10-01'))).toBe('period-dependent');
    expect(twentyPercentMeasureStatus(at('2027-03-31'))).toBe('period-dependent');
  });

  it('★ 期限 + 1年 - 1日 はまだ period-dependent (課税期間 2026-09-30〜2027-09-29)', () => {
    expect(twentyPercentMeasureStatus(at('2027-09-29'))).toBe('period-dependent');
  });

  it('★ その翌日から ended — 今日を含むどの課税期間も期限内の日を含みえない', () => {
    // 最も早く始まる 1 年の課税期間が 2026-10-01〜2027-09-30 になる日。
    expect(twentyPercentMeasureStatus(at('2027-09-30'))).toBe('ended');
    expect(twentyPercentMeasureStatus(at('2030-01-01'))).toBe('ended');
  });

  it('既定の期限は定数を読む (書き写していない)', () => {
    expect(TWENTY_PERCENT_MEASURE_END).toBe('2026-09-30');
    const dayAfter = at('2026-10-01');
    expect(twentyPercentMeasureStatus(dayAfter)).toBe(twentyPercentMeasureStatus(dayAfter, TWENTY_PERCENT_MEASURE_END));
  });

  it('期限を動かすと帯も動く (定数を見ている対照)', () => {
    expect(twentyPercentMeasureStatus(at('2026-10-01'), '2026-12-31')).toBe('active');
    expect(twentyPercentMeasureStatus(at('2026-10-01'), '2025-03-31')).toBe('ended');
  });

  it('★ 読めない時計・読めない期限は period-dependent に倒す (使えないと言い切らない)', () => {
    expect(twentyPercentMeasureStatus(new Date(NaN))).toBe('period-dependent');
    expect(twentyPercentMeasureStatus(at('2030-01-01'), 'いつか')).toBe('period-dependent');
    expect(twentyPercentMeasureStatus(at('2030-01-01'), '2026-9-30')).toBe('period-dependent');
    expect(twentyPercentMeasureStatus(at('2030-01-01'), '2026-02-30')).toBe('period-dependent'); // 暦に無い日
    expect(twentyPercentMeasureStatus(at('2030-01-01'), '2026-13-01')).toBe('period-dependent'); // 13 月
    expect(twentyPercentMeasureStatus(at('2030-01-01'), '2026-09')).toBe('period-dependent'); // 日が無い
    expect(twentyPercentMeasureStatus(at('2030-01-01'), 'x2026-09-30')).toBe('period-dependent'); // 前に何か付いている
    expect(twentyPercentMeasureStatus(at('2030-01-01'), '2026-09-30x')).toBe('period-dependent'); // 後ろに何か付いている
  });

  it('★ 帯の境目は 0 詰めした日付で比べる — 1 桁の月日でも桁が揃う', () => {
    // 期限 2026-09-10 なら「期限 + 1年 - 1日」は 2027-09-09。0 詰めを外すと
    // '2027-9-09' になり、辞書順で 2027-10-01 が**その内側**に入ってしまう
    // ('1' < '9')。つまり期限から 1 年以上あとを period-dependent と読む。
    expect(twentyPercentMeasureStatus(at('2027-09-09'), '2026-09-10')).toBe('period-dependent');
    // 日の 0 詰めを外すと境目が '2027-09-9' になり、その 1 日あとが**内側**に入る
    // ('1' < '9')。境目のすぐ隣で測らないと、この 1 文字は見えない。
    expect(twentyPercentMeasureStatus(at('2027-09-10'), '2026-09-10')).toBe('ended');
    expect(twentyPercentMeasureStatus(at('2027-10-01'), '2026-09-10')).toBe('ended');
    // 月の側も同じ (期限 2026-01-31 → 2027-01-30。'2027-1-30' だと 2027-02-01 が内側)。
    expect(twentyPercentMeasureStatus(at('2027-02-01'), '2026-01-31')).toBe('ended');
  });

  it('★ 時間帯で日付が動かない — 日本の 0 時台でも「その日」で判定する', () => {
    // toISOString() の UTC 日付で比べると 2026-09-30 の 0 時台は前日になり、
    // 期限翌日 (2026-10-01) の 0 時台は「期限当日」に見えてしまう。
    const jstMidnight = new Date(2026, 9, 1, 0, 30, 0); // 2026-10-01 00:30 (利用者の時計)
    expect(twentyPercentMeasureStatus(jstMidnight)).toBe('period-dependent');
    expect(twentyPercentMeasureStatus(new Date(2026, 8, 30, 0, 30, 0))).toBe('active');
  });

  it('既定引数は「今日」— 引数なしでも 3 値のどれかを返す', () => {
    expect(['active', 'period-dependent', 'ended']).toContain(twentyPercentMeasureStatus());
  });
});

/**
 * **定数表は読み直して確かめる。**
 *
 * 上の検査は module の先頭で import した値を見るので、Stryker が
 * module 読み込み**後**に有効化する static 変異体 (表を空にする / 日付を空文字に
 * する) を殺せない ——「覆われているのに生存」と報告される
 * (`stryker.config.json` の `_commentIgnoreStatic` に経緯がある。`oauth.test.ts` の
 * freshConfigs と同じ形で、`vi.resetModules()` + 動的 import で毎回評価し直す)。
 */
describe('定数を読み直しても同じ (static 変異体の検査)', () => {
  it('★ みなし仕入率の表と 2割特例の期限は、読み直しても同じ値', async () => {
    vi.resetModules();
    const fresh = await import('../taxConsumption');
    expect(fresh.DEEMED_PURCHASE_RATES).toEqual({
      wholesale: 0.9,
      retail: 0.8,
      manufacturing: 0.7,
      other: 0.6,
      service: 0.5,
      'real-estate': 0.4,
    });
    expect(fresh.TWENTY_PERCENT_MEASURE_END).toBe('2026-09-30');
    expect(fresh.TWENTY_PERCENT_RATE).toBe(0.2);
  });
});
