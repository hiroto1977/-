/**
 * 全業務を 3 軸 (縦軸 / 横軸 / 斜め軸) で並べるための純粋ロジック。
 *
 * ## なぜ 3 軸なのか
 *
 * 財務指標は「いつの」「どの事業の」「何の」値かで決まる。2 軸の折れ線では
 * このうち 2 つしか置けないので、事業ごとに図を分けるか、期間を捨てて棒に
 * するしかなかった。どちらも**事業間の差と時間の動きを同時に読めない**。
 *
 * そこで奥行きを斜めに倒した軸 (斜投影 / カバリエ図法) を足す:
 *
 * - **横軸 (X)** — 期間。月次実績を古い順に並べる。
 * - **縦軸 (Y)** — 指標の値。単位はその指標のもの (%・倍・日・年・円)。
 * - **斜め軸 (Z)** — 業務。登録した事業と同梱サンプルを奥へ並べる。
 *
 * 投影は平行投影なので**奥行きで縮まない** — 手前の事業と奥の事業の折れ線が
 * 同じ縮尺で読める。遠近法にすると奥の事業の変化が小さく見え、「奥は動きが
 * 少ない」という嘘の印象を作るので採らない。
 *
 * ## 指標を 1 つずつ描く理由
 *
 * 17 指標は単位が違う (% / 倍 / ヶ月 / 年 / 日 / 円)。1 つの縦軸に混ぜると
 * 「ROE 34.9」と「CCC 39.5」が同じ高さに並び、比べられないものが比べられる
 * ように見える。**縦軸は常に 1 指標・1 単位**にして、指標は選んで切り替える。
 *
 * 金額の指標 (当期純利益・EBITDA) は事業をまたいで**足せる**ので、
 * 折れ線に加えて構成比 (円グラフ) でも意味を持つ。比率は足せないので
 * 円グラフには出さない — `additive` がその区別である。
 *
 * ## 元データ
 *
 * 各期の値は `deriveBusinessFinancials` → `computeFinancialRatios` を
 * **その期の月次実績に対して**通して求める。current だけを使って過去を
 * 補間したりはしない (無い数字を描くことになる)。履歴を持たない事業
 * (利用者が登録したばかりの事業) は当期 1 点だけの系列になる。
 */

import { deriveBusinessFinancials, type MonthlyBusinessKpi } from './businessFinancials';
import { computeFinancialRatios, type FinancialRatios } from './financialRatios';

/** 斜め軸の傾き (度)。カバリエ図法の慣用値。 */
export const DIAGONAL_ANGLE_DEG = 30;

/** 投影後の座標。単位は呼び出し側が渡したものと同じ。 */
export interface Projected {
  readonly x: number;
  readonly y: number;
}

/**
 * 平行投影 (斜投影)。`depth` が増えるほど右上へずれる。
 *
 * **`depth` は「何段目か」ではなく長さで渡す** — `x` / `y` と同じ単位で
 * 受け取り、同じ単位で返す。段数をそのまま渡すと、`x` が画素で `depth` が
 * 添字という取り違えが起き、奥行きが 1 画素も動かない図になる (実際にそう
 * 描いてしまった)。呼び出し側が「1 段あたり何画素か」を決めて掛ける。
 *
 * 縮小率を掛けないので、どの奥行きでも同じ長さが同じ長さに写る。
 * SVG は下向きが正なので、`y` は呼び出し側で反転させる前提の
 * 「上向きが正」の値を返す。
 */
export function projectAxonometric(x: number, y: number, depth: number): Projected {
  const rad = (DIAGONAL_ANGLE_DEG * Math.PI) / 180;
  return { x: x + depth * Math.cos(rad), y: y + depth * Math.sin(rad) };
}

/** 1 指標の定義。 */
export interface IndicatorSpec {
  readonly key: string;
  readonly label: string;
  /** 縦軸に出す単位。 */
  readonly unit: string;
  /** 高いほど良いか。低いほど良い指標もある (CCC・労働分配率など)。 */
  readonly higherIsBetter: boolean;
  /**
   * 事業をまたいで足せるか。金額だけが true。
   * 比率を足すと意味を成さないので、円グラフの対象はここで絞る。
   */
  readonly additive: boolean;
  readonly value: (r: FinancialRatios) => number | null;
}

/**
 * 経営サマリーに出している 17 指標。
 *
 * 並びは `radarAxes` と同じ (自己資本比率から ROE まで) にして、
 * 同じ画面の中で指標の順番が変わらないようにする。金額 2 種
 * (当期純利益・EBITDA) はレーダーには載らないが、ここには載せる —
 * 「全部使う」ためであり、かつ金額は構成比として読む価値があるため。
 */
export const INDICATORS: readonly IndicatorSpec[] = [
  { key: 'equityRatio', label: '自己資本比率', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.equityRatioPct },
  { key: 'currentRatio', label: '流動比率', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.currentRatioPct },
  { key: 'fixedLongTermFit', label: '固定長期適合率', unit: '%', higherIsBetter: false, additive: false, value: (r) => r.fixedLongTermFitPct },
  { key: 'debtToMonthlySales', label: '借入金月商倍率', unit: 'ヶ月', higherIsBetter: false, additive: false, value: (r) => r.debtToMonthlySalesRatio },
  { key: 'debtRepaymentYears', label: '債務償還年数', unit: '年', higherIsBetter: false, additive: false, value: (r) => r.debtRepaymentYears },
  { key: 'operatingMargin', label: '営業利益率', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.operatingMarginPct },
  { key: 'ordinaryMargin', label: '経常利益率', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.ordinaryMarginPct },
  { key: 'netMargin', label: '当期純利益率', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.netMarginPct },
  { key: 'netProfit', label: '当期純利益', unit: '円', higherIsBetter: true, additive: true, value: (r) => r.netProfit },
  { key: 'laborShare', label: '労働分配率', unit: '%', higherIsBetter: false, additive: false, value: (r) => r.laborSharePct },
  { key: 'ebitda', label: 'EBITDA', unit: '円', higherIsBetter: true, additive: true, value: (r) => r.ebitda },
  { key: 'ebitdaMargin', label: 'EBITDAマージン', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.ebitdaMarginPct },
  { key: 'receivablesTurnover', label: '売上債権回転率', unit: '倍', higherIsBetter: true, additive: false, value: (r) => r.receivablesTurnover },
  { key: 'inventoryTurnover', label: '棚卸資産回転率', unit: '倍', higherIsBetter: true, additive: false, value: (r) => r.inventoryTurnover },
  { key: 'ccc', label: 'CCC', unit: '日', higherIsBetter: false, additive: false, value: (r) => r.cccDays },
  { key: 'roa', label: 'ROA', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.roaPct },
  { key: 'roe', label: 'ROE', unit: '%', higherIsBetter: true, additive: false, value: (r) => r.roePct },
];

/** キーから指標定義を引く。知らないキーは undefined。 */
export function findIndicator(key: string): IndicatorSpec | undefined {
  return INDICATORS.find((i) => i.key === key);
}

/** 3 軸に載せる 1 事業。 */
export interface AxonometricUnitInput {
  readonly id: string;
  readonly label: string;
  /** 同梱の模擬データなら true。 */
  readonly sample?: boolean;
  /** 当期の月次実績。 */
  readonly current: MonthlyBusinessKpi;
  /** 過去の月次実績 (古い順)。無ければ当期 1 点だけの系列になる。 */
  readonly history: readonly MonthlyBusinessKpi[];
}

/** 折れ線 1 点。 */
export interface SeriesPoint {
  /** 横軸の位置。0 が最も古い。 */
  readonly x: number;
  /** 「当月」から何ヶ月前か。0 が当月。 */
  readonly monthsAgo: number;
  readonly label: string;
  /** 指標の値。算定不能なら null (線は途切れる)。 */
  readonly value: number | null;
}

/** 1 事業の折れ線。 */
export interface UnitSeries {
  readonly id: string;
  readonly label: string;
  readonly sample: boolean;
  /** 斜め軸の位置。0 が手前。 */
  readonly z: number;
  readonly points: readonly SeriesPoint[];
}

/** 3 軸グラフ 1 枚ぶんのデータ。 */
export interface AxonometricChart {
  readonly indicator: IndicatorSpec;
  readonly series: readonly UnitSeries[];
  /** 横軸の目盛り数 (最長の系列に合わせる)。 */
  readonly periods: number;
  /** 縦軸の下限。0 を必ず含める (棒でも線でも 0 が見えないと大小を誤読する)。 */
  readonly min: number;
  /** 縦軸の上限。 */
  readonly max: number;
}

/** 何ヶ月前かを人が読む形にする。 */
function periodLabel(monthsAgo: number): string {
  return monthsAgo === 0 ? '当月' : `${monthsAgo}ヶ月前`;
}

/**
 * 1 事業ぶんの月次実績を古い順に並べる。
 *
 * `history` は古い順で入っている前提で、末尾に `current` を足す。
 * 履歴が無ければ当期 1 点だけを返す。
 */
function monthsOf(u: AxonometricUnitInput): readonly MonthlyBusinessKpi[] {
  return [...u.history, u.current];
}

/**
 * 全事業 × 全期間で 1 指標の 3 軸グラフを組み立てる。
 *
 * 横軸は**最も長い系列に合わせて右詰め**にする。履歴の長さが事業ごとに
 * 違うとき、左詰めにすると「当月」の位置が事業ごとにずれて、同じ縦線が
 * 別の月を指すことになる。右端を当月に揃えれば、縦に切った断面が
 * 常に同じ月の事業間比較になる。
 */
export function buildAxonometric(
  units: readonly AxonometricUnitInput[],
  indicatorKey: string,
): AxonometricChart | null {
  const indicator = findIndicator(indicatorKey);
  if (indicator === undefined) return null;

  const monthsPerUnit = units.map(monthsOf);
  const periods = monthsPerUnit.reduce((m, xs) => Math.max(m, xs.length), 0);

  const series: UnitSeries[] = units.map((u, z) => {
    const months = monthsPerUnit[z]!;
    // 右詰め: 最後の点が必ず横軸の右端 (= 当月) に来る。
    const offset = periods - months.length;
    const points: SeriesPoint[] = months.map((m, i) => {
      const monthsAgo = months.length - 1 - i;
      const ratios = computeFinancialRatios(deriveBusinessFinancials(m));
      return {
        x: offset + i,
        monthsAgo,
        label: periodLabel(monthsAgo),
        value: indicator.value(ratios),
      };
    });
    return { id: u.id, label: u.label, sample: u.sample === true, z, points };
  });

  // 0 を必ず含めた範囲にする。全点が算定不能なら 0..1 の空の枠を返す
  // (縦軸が潰れて線が引けなくなるのを避ける)。
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);

  return { indicator, series, periods, min, max };
}

// --- 構成比 (円グラフ) ------------------------------------------------------

/** 円グラフに載せられる量。すべて金額 (事業をまたいで足せる)。 */
export type CompositionKey = 'revenue' | 'netProfit' | 'ebitda' | 'laborCost';

/** 構成比の対象と、その日本語名。 */
export const COMPOSITION_LABELS: Readonly<Record<CompositionKey, string>> = {
  revenue: '売上高',
  netProfit: '当期純利益',
  ebitda: 'EBITDA',
  laborCost: '人件費',
};

/** 円グラフの 1 切れ。 */
export interface CompositionSlice {
  readonly id: string;
  readonly label: string;
  readonly sample: boolean;
  readonly value: number;
  /** 全体に占める割合 (%)。合計が 0 のときは 0。 */
  readonly pct: number;
}

/** 構成比 1 枚ぶん。 */
export interface Composition {
  readonly key: CompositionKey;
  readonly label: string;
  readonly slices: readonly CompositionSlice[];
  /** 正の値の合計 (= 円の全体)。 */
  readonly total: number;
  /**
   * 値が負だった事業。**円グラフには載せられない。**
   *
   * 負の切れは描きようがないので 0 に丸めるのが普通だが、それをすると
   * 赤字の事業が「構成比 0%」として黙って消え、全体が黒字であるかのように
   * 見える。**別に返して画面に必ず出す**。
   */
  readonly negatives: readonly { readonly id: string; readonly label: string; readonly value: number }[];
}

/** 当期の 1 事業から、構成比に使う金額を取り出す。 */
function amountOf(u: AxonometricUnitInput, key: CompositionKey): number {
  const inputs = deriveBusinessFinancials(u.current);
  if (key === 'revenue') return inputs.revenue;
  if (key === 'laborCost') return inputs.laborCost;
  const ratios = computeFinancialRatios(inputs);
  return key === 'netProfit' ? ratios.netProfit : ratios.ebitda;
}

/**
 * 全事業の当期の構成比を組み立てる。
 *
 * 値が大きい順に並べる — 円グラフは面積で読むものなので、並びが値と
 * 一致していないと凡例と図の対応を目で追うことになる。
 */
export function buildComposition(
  units: readonly AxonometricUnitInput[],
  key: CompositionKey,
): Composition {
  const rows = units.map((u) => ({
    id: u.id,
    label: u.label,
    sample: u.sample === true,
    value: amountOf(u, key),
  }));
  const negatives = rows.filter((r) => r.value < 0).map((r) => ({ id: r.id, label: r.label, value: r.value }));
  const positives = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const total = positives.reduce((s, r) => s + r.value, 0);
  // `positives` は正の値だけなので、1 件でもあれば total は必ず正。
  // 0 除算の番人を置くと、通らない枝が 1 つ増えるだけになる。
  const slices = positives.map((r) => ({
    ...r,
    pct: Math.round((r.value / total) * 1000) / 10,
  }));
  return { key, label: COMPOSITION_LABELS[key], slices, total, negatives };
}
