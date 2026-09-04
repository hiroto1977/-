/**
 * 適格請求書（インボイス）の品目別 税率仕分けと集計。
 *
 * 適格請求書は「税率ごとに区分して合計した対価の額」と「税率ごとに区分した
 * 消費税額等」の記載が要件で、**消費税額等の端数処理は一の適格請求書につき
 * 税率ごとに1回**に限られる（消費税法57条の4）。明細行ごとに端数処理して
 * 積み上げる方式は認められない。
 *
 * そのためこのモジュールは
 *   1. 品目を税率区分ごとにまとめ、
 *   2. **区分の合計に対して1回だけ**端数処理して消費税額を出す。
 * 行ごとの税額は持たない（持てば必ず誰かが積み上げてしまう）。
 *
 * 税率は 0%〜50% の任意の値を扱える。現行の 10% / 8% は既定の区分として
 * 用意しつつ、免税（輸出等）・非課税・不課税を税率とは別の区分として分ける。
 * 0% と非課税・不課税は「消費税額が 0」という結果だけが同じで意味は違うため、
 * 一緒くたにしない。
 */

/** 品目に割り当てる税率区分。 */
export type TaxKind =
  | 'standard' // 標準税率
  | 'reduced' // 軽減税率
  | 'exportExempt' // 免税（輸出取引等）— 課税取引だが税率 0%
  | 'nonTaxable' // 非課税（土地の譲渡・貸付け、社会保険医療 等）
  | 'outOfScope' // 不課税（対象外。給与・寄附金・配当 等）
  | 'customA' // 任意税率 A
  | 'customB'; // 任意税率 B

export interface TaxKindMeta {
  readonly label: string;
  /** 既定の税率。任意税率は null（呼び出し側が指定する）。 */
  readonly defaultRate: number | null;
  /** 軽減税率の対象である旨の記載が要る区分か。 */
  readonly isReduced: boolean;
  /** 課税資産の譲渡等（＝適格請求書の税率区分に載る）か。 */
  readonly taxable: boolean;
  /** 表示順。 */
  readonly order: number;
}

export const TAX_KINDS: Record<TaxKind, TaxKindMeta> = {
  standard: { label: '標準税率', defaultRate: 0.1, isReduced: false, taxable: true, order: 1 },
  reduced: { label: '軽減税率', defaultRate: 0.08, isReduced: true, taxable: true, order: 2 },
  customA: { label: '任意税率A', defaultRate: null, isReduced: false, taxable: true, order: 3 },
  customB: { label: '任意税率B', defaultRate: null, isReduced: false, taxable: true, order: 4 },
  exportExempt: { label: '免税（輸出取引等）', defaultRate: 0, isReduced: false, taxable: true, order: 5 },
  nonTaxable: { label: '非課税', defaultRate: null, isReduced: false, taxable: false, order: 6 },
  outOfScope: { label: '不課税（対象外）', defaultRate: null, isReduced: false, taxable: false, order: 7 },
};

/** 扱える税率の上限（消費税スケジュールと揃える）。 */
export const MAX_ITEM_RATE = 0.5;

/** 端数処理の方法。税率ごとに1回であれば、方法は事業者が任意に選べる。 */
export type RoundingMode = 'floor' | 'ceil' | 'round';

export const ROUNDING_LABEL: Record<RoundingMode, string> = {
  floor: '切捨て',
  ceil: '切上げ',
  round: '四捨五入',
};

export function applyRounding(n: number, mode: RoundingMode): number {
  if (mode === 'ceil') return Math.ceil(n);
  if (mode === 'round') return Math.round(n);
  return Math.floor(n);
}

/** 明細 1 行。金額は数量 × 単価（税抜）で求める。 */
export interface TaxLine {
  readonly name: string;
  readonly qty: number;
  readonly unitPrice: number;
  readonly kind: TaxKind;
}

/** 行の税抜金額。負の数量・単価は 0 として扱う。 */
export function lineAmount(line: TaxLine): number {
  const q = Math.max(0, line.qty);
  const p = Math.max(0, line.unitPrice);
  return q * p;
}

/** 税率区分ごとにまとまった 1 グループ。行ごとの税額は持たない。 */
export interface TaxGroup {
  readonly kind: TaxKind;
  readonly label: string;
  /** 適用税率。非課税・不課税は null。 */
  readonly rate: number | null;
  readonly isReduced: boolean;
  readonly taxable: boolean;
  readonly lines: readonly TaxLine[];
  /** 税抜の合計。 */
  readonly subtotal: number;
  /** 区分の合計に対して 1 回だけ端数処理した消費税額。 */
  readonly tax: number;
  /** 税込。 */
  readonly total: number;
}

export interface InvoiceTotals {
  readonly groups: readonly TaxGroup[];
  /** 課税資産の譲渡等の税抜合計。 */
  readonly taxableSubtotal: number;
  /** 税率ごとの消費税額の合計。 */
  readonly totalTax: number;
  /** 非課税・不課税の合計。 */
  readonly nonTaxableSubtotal: number;
  /** 請求総額。 */
  readonly grandTotal: number;
  /** 軽減税率の対象品目を含むか（含むならその旨の記載が要る）。 */
  readonly hasReduced: boolean;
  readonly rounding: RoundingMode;
}

export interface GroupOptions {
  /** 任意税率 A の値（0..0.5）。 */
  readonly customRateA?: number;
  /** 任意税率 B の値（0..0.5）。 */
  readonly customRateB?: number;
  readonly rounding?: RoundingMode;
}

/** 区分に適用する税率を決める。範囲外は 0〜50% に丸める。 */
export function resolveRate(kind: TaxKind, opts: GroupOptions = {}): number | null {
  const clamp = (n: number) => Math.min(MAX_ITEM_RATE, Math.max(0, n));
  if (kind === 'customA') return clamp(opts.customRateA ?? 0);
  if (kind === 'customB') return clamp(opts.customRateB ?? 0);
  const meta = TAX_KINDS[kind];
  return meta.defaultRate === null ? null : clamp(meta.defaultRate);
}

/**
 * 品目を税率区分ごとに仕分けし、区分ごとに 1 回だけ端数処理して集計する。
 * 金額も名称も無い行は捨てる（フォームの空行を表に出さないため）。
 */
export function groupByTaxKind(lines: readonly TaxLine[], opts: GroupOptions = {}): InvoiceTotals {
  const rounding = opts.rounding ?? 'floor';
  const live = lines.filter((l) => l.name.trim() !== '' || lineAmount(l) > 0);

  const buckets = new Map<TaxKind, TaxLine[]>();
  for (const l of live) {
    const bucket = buckets.get(l.kind);
    if (bucket) bucket.push(l);
    else buckets.set(l.kind, [l]);
  }

  const groups: TaxGroup[] = [];
  for (const [kind, ls] of buckets) {
    const meta = TAX_KINDS[kind];
    const rate = resolveRate(kind, opts);
    const subtotal = ls.reduce((s, l) => s + lineAmount(l), 0);
    // ★ 端数処理は区分の合計に対して 1 回だけ。行ごとには絶対に行わない。
    // Stryker disable next-line ConditionalExpression,LogicalOperator: 非課税・不課税は rate が null で、
    // どの分岐を潰しても `subtotal * null === 0` により税額 0 のまま。課税区分では rate が null に
    // ならないため、条件を入れ替えても観測できる差が出ない（等価変異）。
    const tax = meta.taxable && rate !== null ? applyRounding(subtotal * rate, rounding) : 0;
    groups.push({
      kind,
      label: meta.label,
      rate,
      isReduced: meta.isReduced,
      taxable: meta.taxable,
      lines: ls,
      subtotal,
      tax,
      total: subtotal + tax,
    });
  }
  groups.sort((a, b) => TAX_KINDS[a.kind].order - TAX_KINDS[b.kind].order);

  const taxableSubtotal = groups.filter((g) => g.taxable).reduce((s, g) => s + g.subtotal, 0);
  const nonTaxableSubtotal = groups.filter((g) => !g.taxable).reduce((s, g) => s + g.subtotal, 0);
  const totalTax = groups.reduce((s, g) => s + g.tax, 0);

  return {
    groups,
    taxableSubtotal,
    totalTax,
    nonTaxableSubtotal,
    grandTotal: taxableSubtotal + nonTaxableSubtotal + totalTax,
    hasReduced: groups.some((g) => g.isReduced && g.subtotal > 0),
    rounding,
  };
}

/** 税率の表示（10% / 8% / 0% / —）。 */
export function rateLabel(group: TaxGroup): string {
  if (group.rate === null) return '—';
  const pct = group.rate * 100;
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
}

/**
 * 行ごとに端数処理して積み上げた場合との差。
 *
 * 認められない計算方法との差額を示すために使う。差が出るのは、
 * 端数処理を1回にまとめているからだと説明できる。
 */
export function perLineRoundingDelta(totals: InvoiceTotals): number {
  const rounding = totals.rounding;
  let perLine = 0;
  for (const g of totals.groups) {
    // Stryker disable next-line ConditionalExpression,LogicalOperator: skip をやめても
    // 非課税区分は rate が null で `amount * null === 0` になり、加算結果が変わらない（等価変異）。
    if (!g.taxable || g.rate === null) continue;
    for (const l of g.lines) perLine += applyRounding(lineAmount(l) * g.rate, rounding);
  }
  return perLine - totals.totalTax;
}
