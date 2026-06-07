import { describe, it, expect } from 'vitest';
import {
  NATIONAL_PENSION_MONTHLY,
  ADDITIONAL_PENSION_MONTHLY,
  paymentRatio,
  nationalPensionPremium,
  type ExemptionLevel,
} from '../taxNationalPension';

describe('国民年金保険料 — 定数', () => {
  it('定額保険料の月額は 17,510 円 (令和7年度)', () => {
    expect(NATIONAL_PENSION_MONTHLY).toBe(17_510);
  });

  it('付加保険料の月額は 400 円', () => {
    expect(ADDITIONAL_PENSION_MONTHLY).toBe(400);
  });
});

describe('paymentRatio — 免除区分→納付割合', () => {
  it('none (免除なし) は納付 1', () => {
    expect(paymentRatio('none')).toBe(1);
  });

  it('quarter (4分の1免除) は納付 0.75', () => {
    expect(paymentRatio('quarter')).toBe(0.75);
  });

  it('half (半額免除) は納付 0.5', () => {
    expect(paymentRatio('half')).toBe(0.5);
  });

  it('threeQuarter (4分の3免除) は納付 0.25', () => {
    expect(paymentRatio('threeQuarter')).toBe(0.25);
  });

  it('full (全額免除) は納付 0', () => {
    expect(paymentRatio('full')).toBe(0);
  });

  it('studentOrDeferral (学生納付特例・納付猶予) は納付 0', () => {
    expect(paymentRatio('studentOrDeferral')).toBe(0);
  });

  it('ホワイトリスト外の区分は throw する', () => {
    expect(() => paymentRatio('unknown' as ExemptionLevel)).toThrow(/unknown exemption level/);
  });

  it('プロトタイプ汚染値 (toString) も throw する', () => {
    expect(() => paymentRatio('toString' as ExemptionLevel)).toThrow(/unknown exemption level/);
  });
});

describe('nationalPensionPremium — 既定値', () => {
  it('引数なしで 12 か月・免除なし・付加なしの満額を返す', () => {
    expect(nationalPensionPremium()).toEqual({
      baseMonthly: 17_510,
      paymentRatio: 1,
      months: 12,
      basePremium: 210_120,
      additionalPremium: 0,
      total: 210_120,
    });
  });

  it('空オブジェクトでも引数なしと同じ結果を返す', () => {
    expect(nationalPensionPremium({})).toEqual(nationalPensionPremium());
  });
});

describe('nationalPensionPremium — months', () => {
  it('months=1 は月額 1 か月分', () => {
    const r = nationalPensionPremium({ months: 1 });
    expect(r.months).toBe(1);
    expect(r.basePremium).toBe(17_510);
    expect(r.total).toBe(17_510);
  });

  it('months=12 は月額 12 か月分', () => {
    expect(nationalPensionPremium({ months: 12 }).basePremium).toBe(210_120);
  });

  it('months=24 (任意の正整数、複数年分) を受け付ける', () => {
    const r = nationalPensionPremium({ months: 24 });
    expect(r.months).toBe(24);
    expect(r.basePremium).toBe(420_240);
  });
});

describe('nationalPensionPremium — 免除区分ごとの基本保険料 (12 か月)', () => {
  it('none は満額 210,120 円', () => {
    expect(nationalPensionPremium({ exemption: 'none' }).basePremium).toBe(210_120);
  });

  it('quarter (納付3/4) は round(13132.5)=13133 × 12 = 157,596 円', () => {
    const r = nationalPensionPremium({ exemption: 'quarter' });
    expect(r.paymentRatio).toBe(0.75);
    expect(r.basePremium).toBe(157_596);
  });

  it('half (納付1/2) は round(8755)=8755 × 12 = 105,060 円', () => {
    const r = nationalPensionPremium({ exemption: 'half' });
    expect(r.paymentRatio).toBe(0.5);
    expect(r.basePremium).toBe(105_060);
  });

  it('threeQuarter (納付1/4) は round(4377.5)=4378 × 12 = 52,536 円', () => {
    const r = nationalPensionPremium({ exemption: 'threeQuarter' });
    expect(r.paymentRatio).toBe(0.25);
    expect(r.basePremium).toBe(52_536);
  });

  it('full (全額免除) は基本保険料 0', () => {
    const r = nationalPensionPremium({ exemption: 'full' });
    expect(r.paymentRatio).toBe(0);
    expect(r.basePremium).toBe(0);
  });

  it('studentOrDeferral は基本保険料 0', () => {
    const r = nationalPensionPremium({ exemption: 'studentOrDeferral' });
    expect(r.paymentRatio).toBe(0);
    expect(r.basePremium).toBe(0);
  });
});

describe('nationalPensionPremium — 丸めは月単位で四捨五入してから月数を乗じる', () => {
  it('quarter 1 か月は round(13132.5)=13133 円 (四捨五入。切捨なら 13132)', () => {
    expect(nationalPensionPremium({ exemption: 'quarter', months: 1 }).basePremium).toBe(13_133);
  });

  it('threeQuarter 1 か月は round(4377.5)=4378 円 (四捨五入。切捨なら 4377)', () => {
    expect(nationalPensionPremium({ exemption: 'threeQuarter', months: 1 }).basePremium).toBe(4_378);
  });

  it('quarter 2 か月は 13133 × 2 = 26,266 円 (合計後に丸めるのではない)', () => {
    expect(nationalPensionPremium({ exemption: 'quarter', months: 2 }).basePremium).toBe(26_266);
  });
});

describe('nationalPensionPremium — 付加保険料 ON/OFF', () => {
  it('withAdditional=false は付加 0', () => {
    expect(nationalPensionPremium({ withAdditional: false }).additionalPremium).toBe(0);
  });

  it('withAdditional 既定 (省略) は付加 0', () => {
    expect(nationalPensionPremium({}).additionalPremium).toBe(0);
  });

  it('withAdditional=true・12 か月は 400 × 12 = 4,800 円', () => {
    const r = nationalPensionPremium({ withAdditional: true });
    expect(r.additionalPremium).toBe(4_800);
    expect(r.total).toBe(214_920);
  });

  it('withAdditional=true・1 か月は 400 円', () => {
    expect(nationalPensionPremium({ withAdditional: true, months: 1 }).additionalPremium).toBe(400);
  });
});

describe('nationalPensionPremium — 付加は免除の影響を受けない (独立性)', () => {
  it('full (基本0) でも付加加入なら付加は満額 4,800 円', () => {
    const r = nationalPensionPremium({ exemption: 'full', withAdditional: true });
    expect(r.basePremium).toBe(0);
    expect(r.additionalPremium).toBe(4_800);
    expect(r.total).toBe(4_800);
  });

  it('half でも付加は満額で total = 105060 + 4800 = 109,860 円', () => {
    const r = nationalPensionPremium({ exemption: 'half', withAdditional: true });
    expect(r.basePremium).toBe(105_060);
    expect(r.additionalPremium).toBe(4_800);
    expect(r.total).toBe(109_860);
  });

  it('studentOrDeferral (基本0) でも付加加入なら付加は満額 4,800 円', () => {
    const r = nationalPensionPremium({ exemption: 'studentOrDeferral', withAdditional: true });
    expect(r.basePremium).toBe(0);
    expect(r.additionalPremium).toBe(4_800);
    expect(r.total).toBe(4_800);
  });
});

describe('nationalPensionPremium — total は基本 + 付加', () => {
  it('none・付加なしは total = basePremium', () => {
    const r = nationalPensionPremium({ exemption: 'none' });
    expect(r.total).toBe(210_120);
  });

  it('none・付加ありは total = 210120 + 4800 = 214,920 円', () => {
    expect(nationalPensionPremium({ exemption: 'none', withAdditional: true }).total).toBe(214_920);
  });
});

describe('nationalPensionPremium — months の入力検証', () => {
  it('months=0 は throw する', () => {
    expect(() => nationalPensionPremium({ months: 0 })).toThrow(/positive integer/);
  });

  it('months が負は throw する', () => {
    expect(() => nationalPensionPremium({ months: -1 })).toThrow(/positive integer/);
  });

  it('months が非整数は throw する', () => {
    expect(() => nationalPensionPremium({ months: 1.5 })).toThrow(/positive integer/);
  });

  it('months が NaN は throw する', () => {
    expect(() => nationalPensionPremium({ months: Number.NaN })).toThrow(/positive integer/);
  });

  it('months が Infinity は throw する', () => {
    expect(() => nationalPensionPremium({ months: Number.POSITIVE_INFINITY })).toThrow(
      /positive integer/,
    );
  });
});

describe('nationalPensionPremium — exemption の入力検証', () => {
  it('ホワイトリスト外の exemption は throw する', () => {
    expect(() => nationalPensionPremium({ exemption: 'bogus' as ExemptionLevel })).toThrow(
      /unknown exemption level/,
    );
  });
});
