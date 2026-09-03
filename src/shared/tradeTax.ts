/**
 * 貿易にかかる税 — 輸入（関税・輸入消費税）／輸出（輸出税・仕向国の関税と付加価値税）。
 *
 * **重要 — 概算試算であり、正確な税額計算・通関実務の助言ではありません。**
 * 実際の税額は品目の HS コード、原産地、適用する協定（WTO / 特恵 / EPA）、
 * 加算要素（買手が負担する容器・包装費、ロイヤルティ等）で変わります。
 * 申告は税関・通関業者にご確認ください。
 *
 * ## 日本へ輸入するときの計算順序（税関・ジェトロの説明に沿う）
 *   1. 課税価格 = 商品代金 + 国際運賃 + 保険料（CIF）→ **1,000円未満切捨て**
 *   2. 関税 = 課税価格 × 関税率 → **100円未満切捨て**
 *   3. 消費税の課税標準 = 課税価格 + 関税 + 個別消費税 → **1,000円未満切捨て**
 *   4. 消費税（国税）= 課税標準 × 7.8%（軽減 6.24%）→ **100円未満切捨て**
 *   5. 地方消費税 = 消費税（国税）× 22/78 → **100円未満切捨て**
 * 関税が消費税の課税標準に入るため、関税が高いほど消費税も増える。
 *
 * ## 輸出
 * **日本は輸出に関税を課していない**（関税定率法は輸入税のみ）。輸出取引は
 * 消費税が免除される（消費税法7条）。負担が生じるのは仕向国側の輸入関税と
 * 付加価値税で、DDP なら売手、DAP/FOB 等なら買手が負担する。
 * 一部の国は自国からの輸出に輸出税を課すため、税率を入力できるようにしてある。
 *
 * ## 課税価格の基準は国で違う
 * 多くの国は CIF（運賃・保険料を含む）だが、**米国は FOB**（含まない）。
 * 同じ貨物でも課税価格が変わるため、基準を選べるようにしている。
 *
 * 出典（2026-08 時点で確認）: 税関 カスタムスアンサー1006（少額免税）/
 * ジェトロ 輸入税額の計算方法：日本 / ジェトロ 関税制度：米国・EU /
 * 財務省 諸外国における付加価値税の概要（2026年1月現在）。
 */

/** 消費税（国税）の税率。標準 7.8% / 軽減 6.24%。 */
export const JP_NATIONAL_STANDARD = 0.078;
export const JP_NATIONAL_REDUCED = 0.0624;
/** 地方消費税は消費税（国税）の 22/78。 */
export const JP_LOCAL_RATIO = 22 / 78;

/** 少額輸入貨物の免税基準（課税価格の合計額）。 */
export const SMALL_VALUE_LIMIT = 10_000;
/** 個人的使用に供する物品の課税価格は海外小売価格の 60%。 */
export const PERSONAL_USE_FACTOR = 0.6;

/** 輸入消費税の率・少額免税の基準・個人使用の係数。省略すると定数。台帳から上書きできる。 */
export interface ImportParams {
  readonly nationalStandard: number;
  readonly nationalReduced: number;
  readonly smallValueLimit: number;
  readonly personalUseFactor: number;
}

export const DEFAULT_IMPORT_PARAMS: ImportParams = {
  nationalStandard: JP_NATIONAL_STANDARD,
  nationalReduced: JP_NATIONAL_REDUCED,
  smallValueLimit: SMALL_VALUE_LIMIT,
  personalUseFactor: PERSONAL_USE_FACTOR,
};

/** 課税価格の基準。CIF は運賃・保険料を含み、FOB は含まない（米国など）。 */
export type CustomsBasis = 'CIF' | 'FOB';

const floor1000 = (n: number) => Math.floor(n / 1000) * 1000;
const floor100 = (n: number) => Math.floor(n / 100) * 100;
// n > 0 / n >= 0 は n === 0 で同値になり変異を区別できないため、比較ごと Math.max に寄せる。
const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

export interface ImportInput {
  /** 商品代金（円）。個人使用のときは海外小売価格。 */
  readonly goodsValue: number;
  /** 国際運賃（円）。 */
  readonly freight: number;
  /** 保険料（円）。 */
  readonly insurance: number;
  /** 関税率（0..1）。無税は 0。 */
  readonly dutyRate: number;
  /** 消費税の軽減税率（飲食料品等）の対象か。 */
  readonly reducedRate?: boolean;
  /** 酒税・たばこ税などの個別消費税（円）。消費税の課税標準にも入る。 */
  readonly otherExcise?: number;
  /** 個人的使用に供する物品か（課税価格を小売価格の 60% で計算する特例）。 */
  readonly personalUse?: boolean;
  /** 少額免税（課税価格1万円以下）を適用するか。 */
  readonly smallValueExemption?: boolean;
  /** 革製バッグ・ニット製衣類など、少額でも免税されない品目か。 */
  readonly exemptionExcluded?: boolean;
}

export interface ImportResult {
  /** 課税価格（切捨て前）。 */
  readonly customsValueRaw: number;
  /** 課税価格（1,000円未満切捨て）。 */
  readonly customsValue: number;
  /** 関税（100円未満切捨て）。 */
  readonly duty: number;
  /** 個別消費税（入力値をそのまま）。 */
  readonly otherExcise: number;
  /** 消費税の課税標準（1,000円未満切捨て）。 */
  readonly consumptionBase: number;
  /** 消費税（国税）。 */
  readonly nationalTax: number;
  /** 地方消費税。 */
  readonly localTax: number;
  /** 税の合計（関税＋個別消費税＋消費税＋地方消費税）。 */
  readonly totalTax: number;
  /** 商品代金＋運賃＋保険料＋税の合計（通関までの原価）。 */
  readonly landedCost: number;
  /** 少額免税が適用されたか。 */
  readonly exempted: boolean;
  /** 判定の説明。 */
  readonly notes: readonly string[];
}

/**
 * 日本へ輸入するときの関税・輸入消費税を計算する。
 * 端数処理と計算順序は税関・ジェトロの説明に合わせている。
 */
export function calcJapanImport(input: ImportInput, p: ImportParams = DEFAULT_IMPORT_PARAMS): ImportResult {
  const goods = nonNeg(input.goodsValue);
  const freight = nonNeg(input.freight);
  const insurance = nonNeg(input.insurance);
  const otherExcise = nonNeg(input.otherExcise ?? 0);
  const notes: string[] = [];

  // 個人的使用の特例: 課税価格は海外小売価格の 60%（運賃・保険料は加えない）。
  const customsValueRaw = input.personalUse
    ? goods * p.personalUseFactor
    : goods + freight + insurance;
  if (input.personalUse) {
    notes.push(`個人的使用の特例により、課税価格を海外小売価格の${Number((p.personalUseFactor * 100).toPrecision(12))}%で計算しました（この特例は2028年4月1日から廃止される予定です）。`);
  }

  const customsValue = floor1000(customsValueRaw);

  // 少額免税: 課税価格の合計額が1万円以下なら関税・消費税が免除される。
  // ただし革製バッグ・ニット製衣類等は除外され、個別消費税は免除されない。
  const smallValue = customsValue <= p.smallValueLimit;
  const exempted = (input.smallValueExemption ?? true) && smallValue && !input.exemptionExcluded;
  if (smallValue && input.exemptionExcluded) {
    notes.push('課税価格は1万円以下ですが、革製バッグ・ニット製衣類等は少額免税の対象外のため課税されます。');
  }
  if (exempted) {
    notes.push('課税価格の合計額が1万円以下のため、関税と消費税が免除されます（酒税・たばこ税等の個別消費税は免除されません）。この免税は2028年4月1日から一部廃止される予定です。');
  }

  const duty = exempted ? 0 : floor100(customsValue * Math.max(0, input.dutyRate));
  const consumptionBase = exempted ? 0 : floor1000(customsValue + duty + otherExcise);
  const rate = input.reducedRate ? p.nationalReduced : p.nationalStandard;
  const nationalTax = exempted ? 0 : floor100(consumptionBase * rate);
  const localTax = exempted ? 0 : floor100(nationalTax * JP_LOCAL_RATIO);

  if (!exempted && otherExcise > 0) {
    notes.push('個別消費税（酒税・たばこ税等）は消費税の課税標準にも含まれます。税額は品目ごとに異なるため、税関にご確認ください。');
  }

  const totalTax = duty + otherExcise + nationalTax + localTax;
  return {
    customsValueRaw,
    customsValue,
    duty,
    otherExcise, // 少額免税でも個別消費税は免除されない
    consumptionBase,
    nationalTax,
    localTax,
    totalTax,
    landedCost: goods + freight + insurance + totalTax,
    exempted,
    notes,
  };
}

export interface ExportInput {
  readonly goodsValue: number;
  readonly freight: number;
  readonly insurance: number;
  /** 自国が課す輸出税の税率（0..1）。**日本は輸出関税を課していないため 0**。 */
  readonly exportDutyRate?: number;
  /** 仕向国の関税の課税価格の基準。米国は FOB、多くの国は CIF。 */
  readonly destBasis: CustomsBasis;
  /** 仕向国の関税率（0..1）。 */
  readonly destDutyRate: number;
  /** 仕向国の付加価値税（VAT/GST）の税率（0..1）。 */
  readonly destVatRate: number;
  /** 仕向国の付加価値税の課税標準に関税を含めるか（多くの国は含める）。 */
  readonly vatIncludesDuty?: boolean;
  /** 誰が仕向国の税を負担するか。DDP は売手、DAP/FOB 等は買手。 */
  readonly bearer?: 'seller' | 'buyer';
}

export interface ExportResult {
  /** 日本の輸出取引にかかる消費税（免税のため常に 0）。 */
  readonly jpConsumptionTax: 0;
  /** 自国の輸出税。 */
  readonly exportDuty: number;
  /** 仕向国の関税の課税価格。 */
  readonly destCustomsValue: number;
  /** 仕向国の関税。 */
  readonly destDuty: number;
  /** 仕向国の付加価値税の課税標準。 */
  readonly destVatBase: number;
  /** 仕向国の付加価値税。 */
  readonly destVat: number;
  /** 仕向国で発生する税の合計。 */
  readonly destTotalTax: number;
  /** 売手が負担する額（bearer が seller のときのみ仕向国の税を含む）。 */
  readonly sellerBurden: number;
  /** 買手が負担する額。 */
  readonly buyerBurden: number;
  readonly notes: readonly string[];
}

/**
 * 輸出時の税を計算する。
 *
 * 日本は輸出に関税を課しておらず、輸出取引は消費税が免除される。
 * 実際に負担が生じるのは仕向国の輸入関税と付加価値税で、どちらが負担するかは
 * インコタームズで決まる。仕向国側には端数処理を仮定していない
 * （国ごとに規則が違うため）。
 */
export function calcExport(input: ExportInput): ExportResult {
  const goods = nonNeg(input.goodsValue);
  const freight = nonNeg(input.freight);
  const insurance = nonNeg(input.insurance);
  const notes: string[] = [];

  const exportDutyRate = Math.max(0, input.exportDutyRate ?? 0);
  const exportDuty = goods * exportDutyRate;
  if (exportDutyRate > 0) {
    notes.push('日本は輸出に関税を課していません。輸出税を入力しているため、日本以外からの輸出として計算しています。');
  } else {
    notes.push('日本は輸出に関税を課していません。輸出取引は消費税も免除されます（消費税法7条）。');
  }

  const destCustomsValue = input.destBasis === 'CIF' ? goods + freight + insurance : goods;
  if (input.destBasis === 'FOB') {
    notes.push('課税価格を FOB（国際運賃・保険料を含まない）で計算しています。米国はこの基準です。');
  } else {
    notes.push('課税価格を CIF（国際運賃・保険料を含む）で計算しています。EU をはじめ多くの国はこの基準です。');
  }

  const destDuty = destCustomsValue * Math.max(0, input.destDutyRate);
  const vatIncludesDuty = input.vatIncludesDuty ?? true;
  const destVatBase = vatIncludesDuty ? destCustomsValue + destDuty : destCustomsValue;
  const destVat = destVatBase * Math.max(0, input.destVatRate);
  const destTotalTax = destDuty + destVat;

  const bearer = input.bearer ?? 'buyer';
  notes.push(
    bearer === 'seller'
      ? 'DDP など売手が輸入通関を行う条件のため、仕向国の関税・付加価値税を売手の負担として計上しています。'
      : 'DAP・FOB など買手が輸入通関を行う条件のため、仕向国の関税・付加価値税は買手の負担です。',
  );
  notes.push('仕向国側の端数処理は国ごとに規則が異なるため、丸めを行っていません。');

  return {
    jpConsumptionTax: 0,
    exportDuty,
    destCustomsValue,
    destDuty,
    destVatBase,
    destVat,
    destTotalTax,
    sellerBurden: exportDuty + (bearer === 'seller' ? destTotalTax : 0),
    buyerBurden: bearer === 'buyer' ? destTotalTax : 0,
    notes,
  };
}

/** 付加価値税の参考税率。**改正で変わるため、必ず最新を確認して上書きすること。** */
export interface VatReference {
  readonly code: string;
  readonly name: string;
  /** 標準税率（0..1）。付加価値税が無い国は null。 */
  readonly standard: number | null;
  /** 軽減税率（0..1）。 */
  readonly reduced?: readonly number[];
  readonly note?: string;
}

/** 参考税率の基準時点。 */
export const VAT_REFERENCE_AS_OF = '2026年1月';

/**
 * 確認できた範囲の参考税率のみを載せる。網羅表ではない。
 * ここに無い国は画面で税率を直接入力する（計算は必ず入力値を使う）。
 */
export const VAT_REFERENCE: readonly VatReference[] = [
  { code: 'JP', name: '日本', standard: 0.1, reduced: [0.08] },
  { code: 'GB', name: '英国', standard: 0.2 },
  { code: 'FR', name: 'フランス', standard: 0.2, reduced: [0.1, 0.055, 0.021] },
  { code: 'DE', name: 'ドイツ', standard: 0.19 },
  { code: 'KR', name: '韓国', standard: 0.1 },
  { code: 'CN', name: '中国', standard: 0.13 },
  {
    code: 'US',
    name: '米国',
    standard: null,
    note: '連邦の付加価値税はありません。州・地方の小売売上税（sales tax）が課され、税率は州や郡・市で異なります。関税の課税価格は FOB 基準です。',
  },
  { code: 'EU', name: 'EU（指令の下限）', standard: 0.15, note: 'EU 指令は標準税率を15%以上と定めており、実際の税率は加盟国ごとに異なります。' },
];

/** 参考税率を引く。無ければ null。 */
export function lookupVat(code: string): VatReference | null {
  return VAT_REFERENCE.find((v) => v.code === code) ?? null;
}
