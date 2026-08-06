import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_RATE,
  ROUNDING_LABEL,
  TAX_KINDS,
  applyRounding,
  groupByTaxKind,
  lineAmount,
  perLineRoundingDelta,
  rateLabel,
  resolveRate,
  type TaxKind,
  type TaxLine,
} from '../invoiceTax';

const line = (name: string, qty: number, unitPrice: number, kind: TaxKind): TaxLine => ({ name, qty, unitPrice, kind });

describe('端数処理', () => {
  it('切捨て・切上げ・四捨五入を選べる', () => {
    expect(applyRounding(100.9, 'floor')).toBe(100);
    expect(applyRounding(100.1, 'ceil')).toBe(101);
    expect(applyRounding(100.5, 'round')).toBe(101);
    expect(applyRounding(100.4, 'round')).toBe(100);
  });

  it('表示名が全ての方法に用意されている', () => {
    expect(ROUNDING_LABEL).toEqual({ floor: '切捨て', ceil: '切上げ', round: '四捨五入' });
  });
});

describe('税率区分', () => {
  it('標準10% / 軽減8% / 免税0% が既定で入っている', () => {
    expect(resolveRate('standard')).toBe(0.1);
    expect(resolveRate('reduced')).toBe(0.08);
    expect(resolveRate('exportExempt')).toBe(0);
  });

  it('非課税・不課税は税率を持たない', () => {
    expect(resolveRate('nonTaxable')).toBeNull();
    expect(resolveRate('outOfScope')).toBeNull();
    expect(TAX_KINDS.nonTaxable.taxable).toBe(false);
    expect(TAX_KINDS.outOfScope.taxable).toBe(false);
    // 免税は「課税資産の譲渡等」なので taxable は true（税率が 0%）
    expect(TAX_KINDS.exportExempt.taxable).toBe(true);
  });

  it('任意税率は 0〜50% で指定でき、範囲外は丸められる', () => {
    expect(resolveRate('customA', { customRateA: 0.05 })).toBe(0.05);
    expect(resolveRate('customB', { customRateB: 0.15 })).toBe(0.15);
    expect(resolveRate('customA', { customRateA: 0.8 })).toBe(MAX_ITEM_RATE);
    expect(resolveRate('customA', { customRateA: -0.1 })).toBe(0);
    expect(resolveRate('customA')).toBe(0); // 未指定は 0%
  });

  it('軽減税率の区分だけ「その旨」の表示が要る', () => {
    expect(TAX_KINDS.reduced.isReduced).toBe(true);
    expect(TAX_KINDS.standard.isReduced).toBe(false);
  });
});

describe('品目の仕分け', () => {
  it('同じ区分の品目が 1 グループにまとまる', () => {
    const totals = groupByTaxKind([
      line('保守', 1, 300_000, 'standard'),
      line('弁当', 20, 1_080, 'reduced'),
      line('追加開発', 2, 50_000, 'standard'),
    ]);
    expect(totals.groups).toHaveLength(2);
    const std = totals.groups.find((g) => g.kind === 'standard')!;
    expect(std.lines).toHaveLength(2);
    expect(std.subtotal).toBe(400_000);
    expect(std.tax).toBe(40_000);
    const red = totals.groups.find((g) => g.kind === 'reduced')!;
    expect(red.subtotal).toBe(21_600);
    expect(red.tax).toBe(1_728);
    expect(totals.grandTotal).toBe(400_000 + 40_000 + 21_600 + 1_728);
    expect(totals.hasReduced).toBe(true);
  });

  it('グループは表示順（標準→軽減→任意→免税→非課税→不課税）に並ぶ', () => {
    const totals = groupByTaxKind([
      line('不課税', 1, 100, 'outOfScope'),
      line('非課税', 1, 100, 'nonTaxable'),
      line('軽減', 1, 100, 'reduced'),
      line('標準', 1, 100, 'standard'),
      line('免税', 1, 100, 'exportExempt'),
    ]);
    expect(totals.groups.map((g) => g.kind)).toEqual([
      'standard', 'reduced', 'exportExempt', 'nonTaxable', 'outOfScope',
    ]);
  });

  it('★ 端数処理は区分ごとに 1 回だけで、行ごとには行わない', () => {
    // 各行 333 円 × 10% = 33.3 → 行ごとに切捨てると 33×3 = 99
    // 区分合計 999 × 10% = 99.9 → 1 回だけ切捨てて 99 … ここでは同じ
    // 差が出る組合せで確かめる: 各行 105 円 × 8% = 8.4 → 行ごと 8×3 = 24
    // 合計 315 × 8% = 25.2 → 1 回切捨てで 25
    const totals = groupByTaxKind([
      line('a', 1, 105, 'reduced'),
      line('b', 1, 105, 'reduced'),
      line('c', 1, 105, 'reduced'),
    ]);
    expect(totals.groups[0]!.subtotal).toBe(315);
    expect(totals.groups[0]!.tax).toBe(25);
    // 行ごとに積み上げると 24 になる（認められない方法）
    expect(perLineRoundingDelta(totals)).toBe(-1);
  });

  it('端数処理の方法を変えると税額が変わる', () => {
    const lines = [line('a', 1, 105, 'reduced')]; // 8.4
    expect(groupByTaxKind(lines, { rounding: 'floor' }).totalTax).toBe(8);
    expect(groupByTaxKind(lines, { rounding: 'ceil' }).totalTax).toBe(9);
    expect(groupByTaxKind(lines, { rounding: 'round' }).totalTax).toBe(8);
  });

  it('免税(0%)は税額 0 だが課税資産の譲渡等として集計される', () => {
    const totals = groupByTaxKind([line('輸出品', 1, 100_000, 'exportExempt')]);
    const g = totals.groups[0]!;
    expect(g.rate).toBe(0);
    expect(g.tax).toBe(0);
    expect(totals.taxableSubtotal).toBe(100_000);
    expect(totals.nonTaxableSubtotal).toBe(0);
  });

  it('非課税・不課税は課税対象外として別に集計される', () => {
    const totals = groupByTaxKind([
      line('土地の貸付け', 1, 200_000, 'nonTaxable'),
      line('慶弔見舞金', 1, 30_000, 'outOfScope'),
    ]);
    expect(totals.taxableSubtotal).toBe(0);
    expect(totals.nonTaxableSubtotal).toBe(230_000);
    expect(totals.totalTax).toBe(0);
    expect(totals.grandTotal).toBe(230_000);
    for (const g of totals.groups) expect(g.rate).toBeNull();
  });

  it('任意税率で 0%〜50% の任意の税率を品目に割り当てられる', () => {
    const lines = [line('A対象', 1, 1_000_000, 'customA'), line('B対象', 1, 1_000_000, 'customB')];
    const totals = groupByTaxKind(lines, { customRateA: 0.05, customRateB: 0.5 });
    expect(totals.groups.find((g) => g.kind === 'customA')!.tax).toBe(50_000);
    expect(totals.groups.find((g) => g.kind === 'customB')!.tax).toBe(500_000);
    expect(totals.totalTax).toBe(550_000);
  });

  it('任意税率 0% は税額 0 になる（未指定と同じ）', () => {
    const totals = groupByTaxKind([line('A', 1, 100_000, 'customA')], { customRateA: 0 });
    expect(totals.groups[0]!.tax).toBe(0);
    expect(totals.taxableSubtotal).toBe(100_000);
  });

  it('品名も金額も無い行は表に出さない', () => {
    const totals = groupByTaxKind([
      line('保守', 1, 300_000, 'standard'),
      line('', 0, 0, 'standard'),
      line('', 1, 0, 'reduced'),
    ]);
    expect(totals.groups).toHaveLength(1);
    expect(totals.groups[0]!.lines).toHaveLength(1);
  });

  it('名前だけの行は残す（金額未入力の取りこぼしを隠さない）', () => {
    const totals = groupByTaxKind([line('入力途中の品目', 1, 0, 'standard')]);
    expect(totals.groups[0]!.lines).toHaveLength(1);
    expect(totals.groups[0]!.subtotal).toBe(0);
  });

  it('負の数量・単価は 0 として扱う', () => {
    expect(lineAmount(line('x', -5, 100, 'standard'))).toBe(0);
    expect(lineAmount(line('x', 5, -100, 'standard'))).toBe(0);
    expect(lineAmount(line('x', 3, 100, 'standard'))).toBe(300);
  });

  it('空の明細では合計がすべて 0 になる', () => {
    const totals = groupByTaxKind([]);
    expect(totals.groups).toEqual([]);
    expect(totals.grandTotal).toBe(0);
    expect(totals.totalTax).toBe(0);
    expect(totals.hasReduced).toBe(false);
  });

  it('軽減税率の品目が無ければ「その旨」の表示は不要', () => {
    expect(groupByTaxKind([line('保守', 1, 1_000, 'standard')]).hasReduced).toBe(false);
    expect(groupByTaxKind([line('弁当', 1, 1_000, 'reduced')]).hasReduced).toBe(true);
  });
});

describe('税率の表示', () => {
  it('整数はそのまま、小数は 2 桁まで、税率なしは —', () => {
    const g = (kind: TaxKind, opts = {}) => groupByTaxKind([line('x', 1, 100, kind)], opts).groups[0]!;
    expect(rateLabel(g('standard'))).toBe('10%');
    expect(rateLabel(g('reduced'))).toBe('8%');
    expect(rateLabel(g('exportExempt'))).toBe('0%');
    expect(rateLabel(g('customA', { customRateA: 0.125 }))).toBe('12.5%');
    expect(rateLabel(g('nonTaxable'))).toBe('—');
  });
});

/* mutation testing で生き残った変異体を狙って足したケース。 */

describe('税率区分の定義（表そのものを固定する）', () => {
  it('7 区分すべての表示名・既定税率・軽減フラグ・課税フラグ・並び順', () => {
    expect(TAX_KINDS).toEqual({
      standard: { label: '標準税率', defaultRate: 0.1, isReduced: false, taxable: true, order: 1 },
      reduced: { label: '軽減税率', defaultRate: 0.08, isReduced: true, taxable: true, order: 2 },
      customA: { label: '任意税率A', defaultRate: null, isReduced: false, taxable: true, order: 3 },
      customB: { label: '任意税率B', defaultRate: null, isReduced: false, taxable: true, order: 4 },
      exportExempt: { label: '免税（輸出取引等）', defaultRate: 0, isReduced: false, taxable: true, order: 5 },
      nonTaxable: { label: '非課税', defaultRate: null, isReduced: false, taxable: false, order: 6 },
      outOfScope: { label: '不課税（対象外）', defaultRate: null, isReduced: false, taxable: false, order: 7 },
    });
  });

  it('グループの label は区分の表示名がそのまま入る', () => {
    const g = (k: TaxKind) => groupByTaxKind([line('x', 1, 100, k)]).groups[0]!;
    expect(g('standard').label).toBe('標準税率');
    expect(g('reduced').label).toBe('軽減税率');
    expect(g('customA').label).toBe('任意税率A');
    expect(g('customB').label).toBe('任意税率B');
    expect(g('exportExempt').label).toBe('免税（輸出取引等）');
    expect(g('nonTaxable').label).toBe('非課税');
    expect(g('outOfScope').label).toBe('不課税（対象外）');
  });

  it('軽減フラグが立つのは reduced だけ', () => {
    for (const k of ['standard', 'customA', 'customB', 'exportExempt', 'nonTaxable', 'outOfScope'] as const) {
      expect(groupByTaxKind([line('x', 1, 100, k)]).groups[0]!.isReduced, k).toBe(false);
    }
    expect(groupByTaxKind([line('x', 1, 100, 'reduced')]).groups[0]!.isReduced).toBe(true);
  });

  it('課税対象外は nonTaxable と outOfScope だけ', () => {
    for (const k of ['standard', 'reduced', 'customA', 'customB', 'exportExempt'] as const) {
      expect(groupByTaxKind([line('x', 1, 100, k)]).groups[0]!.taxable, k).toBe(true);
    }
    for (const k of ['nonTaxable', 'outOfScope'] as const) {
      expect(groupByTaxKind([line('x', 1, 100, k)]).groups[0]!.taxable, k).toBe(false);
    }
  });
});

describe('集計の細部', () => {
  it('端数処理を省略すると切捨てになる', () => {
    // 105 × 8% = 8.4 → 切捨て 8
    expect(groupByTaxKind([line('a', 1, 105, 'reduced')]).totalTax).toBe(8);
    expect(groupByTaxKind([line('a', 1, 105, 'reduced')]).rounding).toBe('floor');
    expect(groupByTaxKind([line('a', 1, 105, 'reduced')], {}).rounding).toBe('floor');
  });

  it('名前だけの行も金額だけの行も残す（どちらか一方でよい）', () => {
    expect(groupByTaxKind([line('名前だけ', 0, 0, 'standard')]).groups[0]!.lines).toHaveLength(1);
    expect(groupByTaxKind([line('', 1, 500, 'standard')]).groups[0]!.lines).toHaveLength(1);
    // 両方無い行だけが捨てられる
    expect(groupByTaxKind([line('', 0, 0, 'standard')]).groups).toHaveLength(0);
    expect(groupByTaxKind([line('  ', 0, 0, 'standard')]).groups).toHaveLength(0);
  });

  it('非課税・不課税の税額は 0 で、税率が null なら計算しない', () => {
    const t = groupByTaxKind([line('x', 1, 1_000_000, 'nonTaxable')]);
    expect(t.groups[0]!.tax).toBe(0);
    expect(t.groups[0]!.total).toBe(1_000_000);
    expect(t.totalTax).toBe(0);
  });

  it('グループの total は 税抜小計 + 消費税', () => {
    const g = groupByTaxKind([line('a', 2, 500, 'standard')]).groups[0]!;
    expect(g.subtotal).toBe(1000);
    expect(g.tax).toBe(100);
    expect(g.total).toBe(1100);
  });

  it('hasReduced は軽減の小計が 0 より大きいときだけ true', () => {
    // 軽減の行はあるが金額 0（名前だけ）→ false
    expect(groupByTaxKind([line('名前だけ', 0, 0, 'reduced')]).hasReduced).toBe(false);
    expect(groupByTaxKind([line('弁当', 1, 1, 'reduced')]).hasReduced).toBe(true);
  });

  it('perLineRoundingDelta は非課税・税率 null の区分を無視する', () => {
    const t = groupByTaxKind([
      line('a', 1, 105, 'reduced'),
      line('b', 1, 105, 'reduced'),
      line('c', 1, 105, 'reduced'),
      line('土地', 1, 999_999, 'nonTaxable'),
    ]);
    expect(perLineRoundingDelta(t)).toBe(-1);
  });

  it('端数が出ない組合せでは差が 0 になる', () => {
    const t = groupByTaxKind([line('a', 1, 1000, 'standard'), line('b', 1, 2000, 'standard')]);
    expect(perLineRoundingDelta(t)).toBe(0);
  });

  it('切上げでは行ごとの積み上げが本来より多くなる', () => {
    const t = groupByTaxKind(
      [line('a', 1, 105, 'reduced'), line('b', 1, 105, 'reduced'), line('c', 1, 105, 'reduced')],
      { rounding: 'ceil' },
    );
    expect(t.totalTax).toBe(26); // 315 × 8% = 25.2 → 26
    expect(perLineRoundingDelta(t)).toBe(1); // 9×3 = 27
  });

  it('lineAmount は数量 × 単価', () => {
    expect(lineAmount(line('x', 3, 1080, 'reduced'))).toBe(3240);
    expect(lineAmount(line('x', 0, 1080, 'reduced'))).toBe(0);
  });

  it('applyRounding の既定は切捨て', () => {
    expect(applyRounding(9.9, 'floor')).toBe(9);
  });

  it('resolveRate は任意税率の指定が無ければ 0 を返す', () => {
    expect(resolveRate('customA', {})).toBe(0);
    expect(resolveRate('customB', {})).toBe(0);
  });
});
