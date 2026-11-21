/**
 * 売上・KPI の精緻化分析 (round 69) — 月次の売上系列に対する、より高度な
 * 時系列分析を提供する純粋関数群。既存の `kpiActuals.ts` / `sales.ts` /
 * `financialTrend.ts` を変更せず**加算的**に追加する。
 *
 * 提供する指標:
 *  - 移動平均 (n ヶ月) と トレンド除去 (実測 − 移動平均)
 *  - 季節性指数 (月次の季節調整: 各月平均 ÷ 全体平均) と季節調整済み系列
 *  - 線形回帰トレンド & 予測 (最小二乗の傾き・切片、次期予測、決定係数 R²)
 *  - YoY / MoM 分解 (前年同月比・前月比とその寄与額)
 *  - 変動係数 (CV) による安定性、ピーク to ボトムのドローダウン
 *
 * すべて概算であり財務助言ではありません。入力は数値の時系列 (古い順) で、
 * 空配列・単一要素・分母 0・非有限を明快にガードし null / [] を返す。
 */

/** 有限数のみを通すフィルタ (NaN / Infinity / 非数値を除外)。 */
function finiteValues(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

/** 算術平均。空配列は null。 */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * 後方移動平均 (trailing simple moving average)。各位置 i について直近 `window`
 * 個 (i を含む過去側) の平均を返す。先頭 `window − 1` 個は窓が満たないため null。
 * `window` は 1 以上 (1 未満は 1 に切り上げ、小数は切り捨て)。空配列は []。
 */
export function movingAverage(
  values: readonly number[],
  window: number,
): readonly (number | null)[] {
  const w = Math.max(1, Math.floor(window));
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < w) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - w + 1; j <= i; j += 1) sum += values[j]!;
    out.push(sum / w);
  }
  return out;
}

/**
 * トレンド除去 = 実測値 − 後方移動平均。移動平均が算定できない先頭は null。
 * 季節・不規則変動 (移動平均で均されたトレンド成分を引いた残差) を見るのに使う。
 */
export function detrend(
  values: readonly number[],
  window: number,
): readonly (number | null)[] {
  const ma = movingAverage(values, window);
  return values.map((v, i) => {
    const base = ma[i];
    // ma は values と同長なので base は実行時 null のみ。== で null/undefined を一括
    // 判定し number に絞る (undefined 経路は到達不能)。
    return base == null ? null : v - base;
  });
}

/** 季節性分析の結果。 */
export interface SeasonalIndex {
  /** 周期 (例: 月次なら 12)。 */
  readonly period: number;
  /**
   * 各位相 (0..period−1) の季節指数 = 位相平均 ÷ 全体平均。1.0 が平均的、
   * >1 はその位相が平均より高い (繁忙)、<1 は低い (閑散)。データの無い位相は null。
   */
  readonly indices: readonly (number | null)[];
}

/**
 * 季節性指数を計算する。系列を `period` で位相分割し、各位相の平均を全体平均で
 * 割って指数化する。全体平均が 0 以下、または `period` が 2 未満、または有限値が
 * 無いときは null (季節調整は乗法的なので分母 0 / 非正だと意味を成さない)。
 *
 * `phaseOffset` は系列先頭の位相 (例: 系列が 4 月始まりで暦の 1 月基準にしたい等)。
 * 既定 0 (系列インデックス % period をそのまま位相にする)。
 */
export function seasonalIndices(
  values: readonly number[],
  period: number,
  phaseOffset = 0,
): SeasonalIndex | null {
  const p = Math.floor(period);
  if (p < 2) return null;
  const overall = mean(finiteValues(values));
  // overall===null は `null <= 0 === true` で右辺 (overall<=0) に必ず吸収されるため、
  // null 短絡を消す変異は equivalent (型を number に絞るための分岐)。
  // Stryker disable next-line ConditionalExpression
  if (overall === null || overall <= 0) return null;
  const off = ((Math.floor(phaseOffset) % p) + p) % p;
  const sums = new Array<number>(p).fill(0);
  const counts = new Array<number>(p).fill(0);
  // i<=length では values[length] が undefined → Number.isFinite で continue するため
  // 余分な反復は無作用。<→<= の EqualityOperator は equivalent。
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    const phase = (i + off) % p;
    sums[phase]! += v;
    counts[phase]! += 1;
  }
  const indices = sums.map((s, phase) =>
    counts[phase]! > 0 ? s / counts[phase]! / overall : null,
  );
  return { period: p, indices };
}

/**
 * 季節調整済み系列 = 実測値 ÷ その位相の季節指数。指数が算定不能 (null) または
 * 0 以下の位相は調整せず実測値をそのまま返す (乗法的調整なので 0 除算を回避)。
 * 季節性が算定できない (`seasonalIndices` が null) ときは実測値の写しを返す。
 */
export function seasonallyAdjusted(
  values: readonly number[],
  period: number,
  phaseOffset = 0,
): readonly number[] {
  const seasonal = seasonalIndices(values, period, phaseOffset);
  if (seasonal === null) return [...values];
  const p = seasonal.period;
  const off = ((Math.floor(phaseOffset) % p) + p) % p;
  return values.map((v, i) => {
    // (i+off)%p は 0..p-1 で indices(長さ p)の範囲内のため idx は実行時 null のみ。
    // == null で null/undefined を一括判定 (undefined 経路は到達不能)。
    const idx = seasonal.indices[(i + off) % p];
    // idx==null は `null <= 0 === true` で右辺に吸収されるため null 短絡を消す変異は
    // equivalent (型を number に絞るための分岐)。
    // Stryker disable next-line ConditionalExpression
    if (idx == null || idx <= 0) return v;
    return v / idx;
  });
}

/** 最小二乗による線形回帰トレンドと次期予測。 */
export interface LinearTrend {
  /** 傾き (1 期あたりの変化量)。 */
  readonly slope: number;
  /** 切片 (x=0、すなわち最初の期の推定値)。 */
  readonly intercept: number;
  /** 決定係数 R² (0..1、当てはまりの良さ)。全 y が同値なら 1。 */
  readonly r2: number;
  /** 次期 (x = n) の予測値。 */
  readonly forecast: number;
}

/**
 * 系列 (古い順、x = 0,1,2,…) に最小二乗直線を当て、傾き・切片・R²・次期予測を返す。
 *
 * 数値的注意:
 *  - 点が 2 つ未満、または有限値が 2 つ未満なら回帰不能で null。
 *  - x の分散が 0 になるのは点が 1 つの時だけ (上で除外済) なので傾きの分母は安全。
 *  - y が全て同値 (総変動 0) のときは「完全な水平直線が完全に当てはまる」とみなし
 *    R² = 1 とする (0/0 を 1 に規定)。
 *
 * NaN / Infinity を含む点は回帰から除外し、残った点の元インデックスを x に使う
 * (欠損があっても等間隔の期番号で当てる)。次期予測は x = (元系列長) の点。
 */
export function linearTrend(values: readonly number[]): LinearTrend | null {
  const pts: { x: number; y: number }[] = [];
  // i<=length では values[length] が undefined → Number.isFinite が false で push されず、
  // 余分な反復は無作用。<→<= の EqualityOperator は equivalent。
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i]!)) pts.push({ x: i, y: values[i]! });
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  for (const pt of pts) {
    sx += pt.x;
    sy += pt.y;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const pt of pts) {
    const dx = pt.x - mx;
    const dy = pt.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  // 総変動 0 (y が全て同値) → 当てはめ残差も 0。0/0 を避け R²=1 と規定する。
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));
  const forecast = slope * values.length + intercept;
  return { slope, intercept, r2, forecast };
}

/** YoY / MoM 分解の 1 期分。 */
export interface PeriodChange {
  /** 当期の値。 */
  readonly value: number;
  /** 比較対象 (前期 or 前年同期) の値。比較不能なら null。 */
  readonly base: number | null;
  /** 変化額 = 当期 − 比較対象。比較不能なら null。 */
  readonly delta: number | null;
  /** 変化率 (%)。比較対象が 0 以下 / 非有限 / 不在なら null。 */
  readonly pct: number | null;
}

/** 0.1% 単位に丸めた変化率を返す純粋ヘルパ。base が 0 以下 / 非有限なら null。 */
function changePct(value: number, base: number): number | null {
  if (!Number.isFinite(base) || base <= 0) return null;
  return Math.round(((value - base) / base) * 1000) / 10;
}

/**
 * `lag` 期前との分解 (MoM は lag=1、月次系列の YoY は lag=12)。各期について
 * 当期値・比較対象値・変化額・変化率を返す。比較対象が無い先頭 `lag` 期は
 * base / delta / pct = null。非有限の当期値はそのまま value に載るが base 側の
 * ガードで pct は null になる。`lag` は 1 以上 (1 未満は 1)。
 */
export function decomposeChange(
  values: readonly number[],
  lag: number,
): readonly PeriodChange[] {
  const l = Math.max(1, Math.floor(lag));
  return values.map((value, i) => {
    if (i < l) return { value, base: null, delta: null, pct: null };
    const base = values[i - l]!;
    const delta = value - base;
    return { value, base, delta, pct: changePct(value, base) };
  });
}

/** ばらつき・安定性の指標。 */
export interface Variability {
  /** 平均。空なら null。 */
  readonly mean: number | null;
  /** 標本標準偏差 (n−1 で割る)。点が 2 つ未満なら null。 */
  readonly stdDev: number | null;
  /** 変動係数 = 標準偏差 ÷ 平均 (割合)。平均が 0 以下 / null なら null。 */
  readonly cv: number | null;
}

/**
 * 売上の安定性を変動係数 (CV) で評価する。標準偏差は標本標準偏差 (不偏、n−1)。
 * CV は平均で正規化した相対ばらつきで、規模の異なる事業間でも比較できる。
 * 平均が 0 以下のときは CV を定義できず null (符号や 0 除算を避ける)。
 */
export function variability(values: readonly number[]): Variability {
  const fin = finiteValues(values);
  const m = mean(fin);
  // m===null は fin が空のときのみ。その場合は次の length<2 分岐も {mean:m(=null),…} を
  // 返すため、この早期 return を消す変異は出力が同値 (equivalent)。
  // Stryker disable next-line ConditionalExpression
  if (m === null) return { mean: null, stdDev: null, cv: null };
  if (fin.length < 2) return { mean: m, stdDev: null, cv: null };
  let ss = 0;
  // Σ(v−m)² と Σ(v+m)(v−m)=Σ(v²−m²) は Σv²−n·m² で恒等的に一致する (Σv=n·m)。
  // よって (v−m) を (v+m) に置換する ArithmeticOperator 変異は数学的に equivalent。
  // Stryker disable next-line ArithmeticOperator
  for (const v of fin) ss += (v - m) * (v - m);
  const stdDev = Math.sqrt(ss / (fin.length - 1));
  const cv = m > 0 ? stdDev / m : null;
  return { mean: m, stdDev, cv };
}

/** ピーク to ボトムの最大ドローダウン。 */
export interface Drawdown {
  /** 最大ドローダウンの割合 (0..1)。下落が無ければ 0。算定不能なら null。 */
  readonly maxDrawdown: number | null;
  /** ドローダウン直前のピーク値。算定不能なら null。 */
  readonly peak: number | null;
  /** ピーク後に付けたボトム値。算定不能なら null。 */
  readonly trough: number | null;
}

/**
 * 系列を左から走査し、それまでの最高値 (ピーク) からの最大下落率を求める。
 * peak−trough ドローダウン = (peak − trough) ÷ peak。ピークが 0 以下のときは
 * 割合化できないためその区間は無視する。有限値が 1 つも無ければ全 null、
 * 下落が一度も無ければ maxDrawdown = 0 (ピーク/ボトムは現時点のピーク)。
 */
export function maxDrawdown(values: readonly number[]): Drawdown {
  const fin = finiteValues(values);
  if (fin.length === 0) return { maxDrawdown: null, peak: null, trough: null };
  let peak = fin[0]!;
  let worst = 0;
  let worstPeak = peak;
  let worstTrough = peak;
  for (const v of fin) {
    // v===peak のとき peak=v は同値代入 (no-op) なので > → >= の EqualityOperator は
    // equivalent。
    // Stryker disable next-line EqualityOperator
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > worst) {
        worst = dd;
        worstPeak = peak;
        worstTrough = v;
      }
    }
  }
  return { maxDrawdown: worst, peak: worstPeak, trough: worstTrough };
}
