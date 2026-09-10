/**
 * 免税事業者等からの課税仕入れの経過措置 —— **段階の表と、そこから作る文面** (2026-09-10 · パス 142)。
 *
 * 表そのものの性質 (途切れない・重ならない・順に下がる) と、境目の日付、
 * 読めない時計の倒し方をここで留める。文面が台帳・画面・書類と一致することは
 * `renderer/data/__tests__/invoiceTransitionConsistency.test.ts` が見る。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  INVOICE_TRANSITION_ANNUAL_CAP,
  INVOICE_TRANSITION_END,
  INVOICE_TRANSITION_STAGES,
  INVOICE_TRANSITION_START,
  invoiceTransitionCurrentLabel,
  invoiceTransitionPercent,
  invoiceTransitionRateOn,
  invoiceTransitionScheduleLabel,
  invoiceTransitionStageMonth,
  invoiceTransitionStageOn,
} from '../invoiceTransition';

/** 利用者の時計の正午 (時間帯で日付が動かない位置)。 */
const noon = (iso: string): Date => {
  const p = iso.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
};

describe('INVOICE_TRANSITION_STAGES (段階の表)', () => {
  it('★ 令和 8 年度改正後の 4 段: 80% → 70% → 50% → 30%', () => {
    expect(INVOICE_TRANSITION_STAGES.map((s) => invoiceTransitionPercent(s.rate))).toEqual([80, 70, 50, 30]);
  });

  it('★ 段は途切れず重ならない (前の段の翌日が次の段の初日)', () => {
    for (let i = 1; i < INVOICE_TRANSITION_STAGES.length; i += 1) {
      const prev = INVOICE_TRANSITION_STAGES[i - 1]!;
      const cur = INVOICE_TRANSITION_STAGES[i]!;
      const next = new Date(`${prev.to}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      expect(cur.from).toBe(next.toISOString().slice(0, 10));
      expect(prev.rate).toBeGreaterThan(cur.rate); // 縮小する一方
    }
  });

  it('★ 端は START / END と同じ (台帳が見るのは END)', () => {
    expect(INVOICE_TRANSITION_STAGES[0]!.from).toBe(INVOICE_TRANSITION_START);
    expect(INVOICE_TRANSITION_STAGES[INVOICE_TRANSITION_STAGES.length - 1]!.to).toBe(INVOICE_TRANSITION_END);
    expect(INVOICE_TRANSITION_START).toBe('2023-10-01');
    expect(INVOICE_TRANSITION_END).toBe('2031-09-30');
    expect(INVOICE_TRANSITION_ANNUAL_CAP).toBe(100_000_000);
  });
});

describe('invoiceTransitionStageOn / RateOn (今日の段)', () => {
  it('★ 段の境目: 2026-09-30 は 80%、翌日 2026-10-01 から 70%', () => {
    expect(invoiceTransitionRateOn(noon('2026-09-30'))).toBe(0.8);
    expect(invoiceTransitionRateOn(noon('2026-10-01'))).toBe(0.7);
    expect(invoiceTransitionRateOn(noon('2028-09-30'))).toBe(0.7);
    expect(invoiceTransitionRateOn(noon('2028-10-01'))).toBe(0.5);
    expect(invoiceTransitionRateOn(noon('2030-09-30'))).toBe(0.5);
    expect(invoiceTransitionRateOn(noon('2030-10-01'))).toBe(0.3);
  });

  it('★ 措置の外は null —— 開始の前日と、終了の翌日 (0% と混ぜない)', () => {
    expect(invoiceTransitionRateOn(noon('2023-09-30'))).toBeNull();
    expect(invoiceTransitionRateOn(noon('2023-10-01'))).toBe(0.8);
    expect(invoiceTransitionRateOn(noon('2031-09-30'))).toBe(0.3);
    expect(invoiceTransitionRateOn(noon('2031-10-01'))).toBeNull();
  });

  it('★ 読めない時計は null (段を選ばない)', () => {
    expect(invoiceTransitionStageOn(new Date(NaN))).toBeNull();
    expect(invoiceTransitionRateOn(new Date(NaN))).toBeNull();
  });

  it('段の表は差し替えられる (既定は定数)', () => {
    const stages = [{ from: '2020-01-01', to: '2020-12-31', rate: 0.9 }];
    expect(invoiceTransitionRateOn(noon('2020-06-01'), stages)).toBe(0.9);
    expect(invoiceTransitionRateOn(noon('2026-06-01'), stages)).toBeNull();
    expect(invoiceTransitionStageOn(noon('2026-06-01'))).toEqual(INVOICE_TRANSITION_STAGES[0]);
    expect(invoiceTransitionRateOn(noon('2026-06-01'), [])).toBeNull();
  });
});

describe('文面 (表から組む)', () => {
  it('★ 日程の文面は「2026年9月30日まで80% → 70%（〜2028年9月） → 50%（〜2030年9月） → 30%（〜2031年9月）」', () => {
    expect(invoiceTransitionScheduleLabel()).toBe(
      '2026年9月30日まで80% → 70%（〜2028年9月） → 50%（〜2030年9月） → 30%（〜2031年9月）',
    );
  });

  it('段が 1 つでも 0 でも壊れない (空なら空文字)', () => {
    expect(invoiceTransitionScheduleLabel([{ from: '2023-10-01', to: '2026-09-30', rate: 0.8 }])).toBe('2026年9月30日まで80%');
    expect(invoiceTransitionScheduleLabel([])).toBe('');
  });

  it('★ 今日の段の文面 —— 措置の中・終了後・開始前・読めない時計', () => {
    expect(invoiceTransitionCurrentLabel(noon('2026-09-30'))).toBe('80%（2026年9月まで）');
    expect(invoiceTransitionCurrentLabel(noon('2026-10-01'))).toBe('70%（2028年9月まで）');
    expect(invoiceTransitionCurrentLabel(noon('2031-10-01'))).toBe('経過措置は終了（控除できません）');
    expect(invoiceTransitionCurrentLabel(noon('2023-09-30'))).toBe('経過措置はまだ始まっていません');
    expect(invoiceTransitionCurrentLabel(new Date(NaN))).toBe('経過措置の割合は日程によります');
    expect(invoiceTransitionCurrentLabel(noon('2026-06-01'), [])).toBe('経過措置はまだ始まっていません');
  });

  it('割合の百分率と段の末月', () => {
    expect(invoiceTransitionPercent(0.8)).toBe(80);
    expect(invoiceTransitionPercent(0.7)).toBe(70); // 0.7 * 100 の丸め誤差 (69.99999999999999) を閉じる
    expect(invoiceTransitionStageMonth({ from: '2026-10-01', to: '2028-09-30', rate: 0.7 })).toBe('2028年9月');
    expect(invoiceTransitionStageMonth({ from: '2030-10-01', to: '2031-12-31', rate: 0.3 })).toBe('2031年12月');
  });
});

/*
 * module レベルの const は import 時に評価済みで、変異体の切替の前に読まれた値が残る
 * (covered-static —— `stryker.config.json` の `_commentIgnoreStatic`)。読み直して測る。
 */
describe('段階の表 (読み直して測る)', () => {
  it('★ 4 段の from / to / rate をそのまま留める', async () => {
    vi.resetModules();
    const fresh = await import('../invoiceTransition');
    expect(fresh.INVOICE_TRANSITION_STAGES).toEqual([
      { from: '2023-10-01', to: '2026-09-30', rate: 0.8 },
      { from: '2026-10-01', to: '2028-09-30', rate: 0.7 },
      { from: '2028-10-01', to: '2030-09-30', rate: 0.5 },
      { from: '2030-10-01', to: '2031-09-30', rate: 0.3 },
    ]);
    expect(fresh.INVOICE_TRANSITION_START).toBe('2023-10-01');
    expect(fresh.INVOICE_TRANSITION_END).toBe('2031-09-30');
    expect(fresh.INVOICE_TRANSITION_ANNUAL_CAP).toBe(100_000_000);
    expect(fresh.invoiceTransitionScheduleLabel()).toBe(invoiceTransitionScheduleLabel());
    expect(fresh.invoiceTransitionRateOn(noon('2027-06-01'))).toBe(0.7);
  });
});
