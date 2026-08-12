/**
 * 可視化の動作確認用データセット (仮想データ)。
 *
 * ## なぜ仮想データを本体に置くのか
 *
 * チャートは「それらしい図」が出てしまうため、実データだけで検証すると
 * **壊れていても気づけない**。値が既知のデータを流し込んで、出てくる図が
 * 想定どおりかを目でも数値でも確かめられるようにしておく。
 *
 * ## 決定論であること
 *
 * `Math.random()` は使わない。このリポジトリは生成物のバイト一致を検証して
 * いる（`verify:graph`）ので、実行のたびに変わる値をモジュール初期化時に
 * 作ると再現性が壊れる。代わりに**線形合同法の擬似乱数**を固定シードで回す。
 * 同じシードなら何度実行しても同じ系列になる。
 */

import type { LineSeries, PieSlice, RadarSeries } from './charts';

/**
 * 線形合同法 (Numerical Recipes のパラメータ)。
 * 暗号用途ではない — 再現可能な「それらしいばらつき」を作るためだけのもの。
 */
export function seededRandom(seed: number): () => number {
  let state = Math.abs(Math.trunc(seed)) % 2147483647;
  if (state === 0) state = 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * 基準値のまわりを揺らした系列を作る。
 *
 * @param seed   固定シード (同じ値なら同じ系列)
 * @param length 長さ
 * @param base   中心値
 * @param swing  振れ幅 (base に対する比率, 0..1)
 * @param trend  1 期あたりの増加率 (0.02 なら +2%/期)
 */
export function syntheticSeries(
  seed: number,
  length: number,
  base: number,
  swing: number,
  trend = 0,
): number[] {
  const rand = seededRandom(seed);
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const drift = base * trend * i;
    const noise = base * swing * (rand() * 2 - 1);
    out.push(Math.round((base + drift + noise) * 10) / 10);
  }
  return out;
}

export const MONTH_LABELS: readonly string[] = [
  '4月', '5月', '6月', '7月', '8月', '9月',
  '10月', '11月', '12月', '1月', '2月', '3月',
];

/**
 * 1 つの題材につき折れ線・円・レーダーの 3 形を揃えたデータセット。
 * 3 種すべてを同じ画面で試せるようにするための構造。
 */
export interface ChartDataset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** 折れ線用の系列。 */
  readonly line: readonly LineSeries[];
  /** 折れ線の横軸ラベル。 */
  readonly xLabels: readonly string[];
  /** 円グラフ用の内訳。 */
  readonly pie: readonly PieSlice[];
  /** レーダーの軸名。 */
  readonly radarAxes: readonly string[];
  /** レーダー用の系列 (値は radarAxes と同じ順・同じ長さ)。 */
  readonly radar: readonly RadarSeries[];
  /** 値の単位 (軸ラベルの補助表示用)。 */
  readonly unit: string;
}

/**
 * 動作確認用データセット。
 *
 * 題材はこのシステムが実際に扱う数値の型を代表させてある
 * (金額 / 件数 / 比率 / スコア)。**桁も符号も意図的にばらしてある** —
 * 大きい数と小さい数、正と負が混じったときに軸や 0 線が壊れないかを
 * 目で確かめられるようにするため。
 */
export const CHART_DATASETS: readonly ChartDataset[] = [
  {
    id: 'finance',
    label: '財務 (月次)',
    description: '売上・粗利・営業利益の月次推移。営業利益は赤字月を含むので 0 線の描画を確認できる。',
    unit: '万円',
    xLabels: MONTH_LABELS,
    line: [
      { label: '売上', values: syntheticSeries(101, 12, 1200, 0.12, 0.02) },
      { label: '粗利', values: syntheticSeries(202, 12, 480, 0.15, 0.02) },
      { label: '営業利益', values: syntheticSeries(303, 12, 60, 1.6, 0.03) },
    ],
    pie: [
      { label: '原価', value: 720 },
      { label: '人件費', value: 260 },
      { label: '販管費', value: 140 },
      { label: '営業利益', value: 80 },
    ],
    radarAxes: ['収益性', '安全性', '成長性', '効率性', '生産性'],
    radar: [
      { label: '自社', values: [62, 78, 55, 47, 68] },
      { label: '業界平均', values: [55, 60, 50, 58, 52] },
    ],
  },
  {
    id: 'knowledge',
    label: '知識コーパス',
    description: '検証済み知識の分野別件数と出典の充足度。件数は 4 桁で、金額と桁が違っても軸が潰れないかを見る。',
    unit: '件',
    xLabels: ['第1週', '第2週', '第3週', '第4週', '第5週', '第6週', '第7週', '第8週'],
    line: [
      { label: '学術', values: syntheticSeries(404, 8, 3500, 0.02, 0.005) },
      { label: 'コンプラ', values: syntheticSeries(505, 8, 390, 0.04, 0.01) },
      { label: '補助金', values: syntheticSeries(606, 8, 140, 0.06, 0.008) },
    ],
    pie: [
      { label: '学術', value: 3519 },
      { label: 'コンプライアンス', value: 393 },
      { label: '補助金', value: 140 },
      { label: '経済史', value: 86 },
      { label: '相談窓口', value: 3 },
    ],
    radarAxes: ['出典数', '権威出典', '鮮度', '一意性', 'リンク健全性'],
    radar: [
      { label: '現在', values: [88, 92, 75, 96, 70] },
      { label: '目標', values: [90, 95, 90, 98, 95] },
    ],
  },
  {
    id: 'quality',
    label: '品質ゲート',
    description: 'テスト数とゲート通過の推移。1 系列だけの円グラフ (100%) も含み、SVG の 360°円弧の扱いを確認できる。',
    unit: '件',
    xLabels: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
    line: [
      { label: 'テスト', values: [6473, 6575, 6633, 6748, 6791, 6791] },
      { label: '未解決の矛盾', values: [134, 100, 74, 47, 18, 18] },
    ],
    pie: [{ label: '通過したゲート', value: 16 }],
    radarAxes: ['型検査', '単体テスト', '変異テスト', '静的検査', '出典検証', 'E2E'],
    radar: [{ label: '達成度', values: [100, 100, 100, 100, 86, 92] }],
  },
  {
    id: 'edge',
    label: '境界値 (検証用)',
    description: '空・単一点・全値同一・負値のみ・合計 0 を集めた退化ケース。図が壊れず「データなし」を出せるかを確かめる。',
    unit: '—',
    xLabels: ['a', 'b', 'c', 'd'],
    line: [
      { label: '全値同一', values: [50, 50, 50, 50] },
      { label: '単一点', values: [20] },
      { label: '負値のみ', values: [-10, -30, -20, -40] },
    ],
    pie: [
      { label: '正の値', value: 10 },
      { label: 'ゼロ (無視される)', value: 0 },
      { label: '負の値 (無視される)', value: -5 },
    ],
    radarAxes: ['軸1', '軸2', '軸3'],
    radar: [
      { label: '全ゼロ', values: [0, 0, 0] },
      { label: '値が足りない', values: [80] },
    ],
  },
];

/** id からデータセットを引く。未知の id なら null。 */
export function findDataset(id: string): ChartDataset | null {
  return CHART_DATASETS.find((d) => d.id === id) ?? null;
}

/**
 * 系列の色。**データセットの内容ではなく index で決める**ので、
 * 同じ位置の系列は常に同じ色になる (凡例と図の対応がぶれない)。
 */
export const SERIES_COLORS: readonly string[] = [
  '#4f9cf9',
  '#f2994a',
  '#27ae60',
  '#eb5757',
  '#9b51e0',
  '#00b8d9',
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0]!;
}
