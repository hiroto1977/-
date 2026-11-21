/**
 * 台帳 (`parameters.ts`) の**欄と欄の関係**を検査する。2 種類ある:
 *
 *   1. **順序** (`PARAMETER_ORDERS`) —— 昇順でなければならない帯の下限。
 *   2. **相違** (`PARAMETER_DISTINCT`) —— 等しいと値が使えなくなり、**別の値が
 *      黙って代わりに使われる**組。等しくても矛盾しない組 (段が空になるだけ・
 *      届かない格付けができるだけ) はここに載せない —— 載せる規準は
 *      「等しいと計算が定まらず、誰かが黙って別の値に差し替える」こと。
 *
 * `parameterIssue` は 1 欄ずつしか見ない (min / max / integer)。それは桁誤りを
 * 止めるための幅で、**2 つの欄が互いに矛盾する組み合わせは 1 件も止まらない**。
 * 2026-09-13 の実測 (パス 221) — 順序を崩した 12 件の上書きは
 * `sanitizeParameterOverrides` を 12/12 そのまま通り、こう答えた:
 *
 *   - 「良好」の下限 40 / 「注意」の下限 60 → **45 点の軸が「良好」**
 *     (「注意」の帯が空になり、利用者が要改善と決めた水準が強みとして刷られる)
 *   - 格付け S の下限 30 / A の下限 70 → **35 点の会社が格付け S**
 *     (この格付けは金融機関へ渡す書面に刷られる)
 *   - 法人事業税の段の境目を下 800 万 / 上 400 万 → 所得 500 万円の所得割が
 *     **33,000 円** (正しい並びなら約 175,000 円)。第 2 段の課税標準が
 *     **−4,000,000 円**になり、第 3 段が第 1 段と同じ所得を二重に数えていた
 *   - 中間申告の境目を逆に → 画面が「**50,000 万円超 100 万円以下** — 年1回」と刷る
 *
 * ## 方針
 * - **順序は保存の前に断る。** どちらを捨てるかは機械には決められない
 *   (`sanitizeParameterOverrides` は 1 欄ずつしか見えない) ので、画面が
 *   「この値だと隣の欄と矛盾する」と言って保存させない。
 * - **すでに壊れている保存も言う。** 古い版で置いた上書きは残っているので、
 *   画面は現在の有効値に対しても同じ検査を出す。
 * - **計算の側でも守る。** 画面を通らない経路 (復元した上書き・古い保存) が
 *   在りうるので、帯を使う計算は使う前に順序へ畳む (`taxCorporate.ts` の
 *   `orderedBusinessTaxLimits`)。順序の検査は「気付く道」で、計算の防御ではない。
 * - **順序が要らない組は、要らない理由を書いて台帳に載せる。** 名前が
 *   Min/Max/Limit/Threshold/Tier/Bad/Good で終わる欄は 73 件あり、そのうち
 *   順序が要るのは下の 6 家系だけ。残りを「見ていない」のか「見なくてよい」のか
 *   は読まないと決まらないので、`ORDER_NOT_REQUIRED` に理由ごと置き、
 *   `parameterOrder.test.ts` が母集団を両方向から突き合わせる。
 */
import { RADAR_AXIS_KEYS } from './financialHealthBands';
import { PARAMETER_BY_ID, toDisplayValue, type ParameterId, type ParameterValues } from './parameters';

/** 昇順 (前 ≤ 次) でなければならない欄の並び。 */
export interface ParameterOrder {
  /** 小さい方から並べた id。隣り合う組ごとに検査する。 */
  readonly ids: readonly ParameterId[];
  /** 何のための順序か (断りの文に入れる)。 */
  readonly why: string;
}

/**
 * 順序が要る家系。**昇順**で書く (前の id の値 ≤ 次の id の値)。
 * 逆向きの関係 (大きい方が先) は、並べ替えて昇順にしてから載せる。
 */
export const PARAMETER_ORDERS: readonly ParameterOrder[] = [
  {
    ids: ['financeHealth.levelWarnMin', 'financeHealth.levelGoodMin'],
    why: '「注意」の下限が「良好」の下限を超えると、注意の帯が空になり、要改善の水準が良好として刷られます',
  },
  {
    ids: [
      'financeHealth.gradeCMin',
      'financeHealth.gradeBMin',
      'financeHealth.gradeAMin',
      'financeHealth.gradeSMin',
    ],
    why: '格付けの下限が D→C→B→A→S の順に上がっていないと、届かない段ができ、低い点数に高い格付けが付きます',
  },
  {
    ids: ['corporate.businessTaxTier1Limit', 'corporate.businessTaxTier2Limit'],
    why: '法人事業税の段の境目が逆だと、第 2 段の課税標準がマイナスになり所得割を過少に計算します',
  },
  {
    ids: [
      'consumptionSchedule.interimTier1',
      'consumptionSchedule.interimTier2',
      'consumptionSchedule.interimTier3',
    ],
    why: '中間申告の境目が逆だと、申告回数の判定と画面が刷る金額の範囲が食い違います',
  },
  {
    ids: ['realEstate.dscrDangerThreshold', 'realEstate.dscrCautionThreshold'],
    why: 'DSCR の危険水域が注意水域を超えると、注意の帯が空になり、注意で済む物件が危険として刷られます',
  },
  {
    ids: ['hydroponics.lowKSwitchDaysMin', 'hydroponics.lowKSwitchDaysMax'],
    why: '切替の目安の下限が上限を超えると、どの日数を入れても「範囲外」と警告します',
  },
];

/** 等しくてはならない欄の組。 */
export interface ParameterDistinct {
  readonly ids: readonly [ParameterId, ParameterId];
  /** 等しいと何が起きるか (断りの文に入れる)。 */
  readonly why: string;
}

/**
 * 0 点の水準と 100 点の水準 (`financeHealth.<軸>Bad` / `Good`) は、**等しくては
 * ならない**。
 *
 * `financialRatios.linScore` は `(raw - bad) / (good - bad)` で点数を作るので、
 * 幅 0 の帯では 0 除算になる。`financialRatios.axisBand` はそれを避けるために
 * **既定の帯へ黙って倒していた** —— 2026-09-13 の実測 (パス 222):
 *
 *     'financeHealth.equityRatioBad': 50 / 'financeHealth.equityRatioGood': 50
 *       sanitize          4/4 そのまま通る (min -1000 / max 1000)
 *       台帳が出す帯       { bad: 50, good: 50 }
 *       axisBand が使う帯  { bad: 0, good: 50 }   ← 既定
 *       順序の検査         [] (等しいのは順序違反ではない)
 *       スコア            上書きあり 60 / 上書きなし 60  ← 完全に同じ
 *
 * 設定画面は両方の欄に「上書き中」と出したまま、**上書きは 1 度も効いていない**。
 * 台帳の設計文が「設定できるのに効かない項目は、画面が嘘をつく最悪の形」と
 * 呼んでいるものそのもの。倒し込み自体は正しい防御なので残し (0 除算は作れない)、
 * **効いていないことを画面が言う**ようにした。
 *
 * **大小の向きは軸ごとに違う** (自己資本比率は高い方が良い / CCC は低い方が良い) ので
 * 順序は要らないが、**等しくないことは全軸に要る**。軸の一覧は写さず
 * `RADAR_AXIS_KEYS` から導く —— 軸を足したら制約も自動で付く。
 */
export const PARAMETER_DISTINCT: readonly ParameterDistinct[] = RADAR_AXIS_KEYS.map((axis) => ({
  ids: [`financeHealth.${axis}Bad`, `financeHealth.${axis}Good`] as [ParameterId, ParameterId],
  why: '0 点の水準と 100 点の水準が同じだと点数が決まらないため、この軸は既定の水準で採点されます (上書きが効きません)',
}));

/**
 * 順序を見なくてよい欄と、その理由。`parameterOrder.test.ts` が
 * 「Min/Max/Limit/Threshold/Tier/Bad/Good で終わる欄はすべて
 * `PARAMETER_ORDERS` かここに載っている」を両方向から確かめる。
 */
export const ORDER_NOT_REQUIRED: Readonly<Record<string, string>> = {
  'deduction.spouseSpecialIncomeLimit': '配偶者特別控除の所得要件。他の欄とは別の量',
  'deduction.dependentIncomeLimit': '扶養親族の所得要件。他の欄とは別の量',
  'deduction.selfMedicationThreshold':
    'セルフメディケーションの足切り。上限を超えても控除は cap で頭打ち・0 で床打ちになり矛盾しない',
  'deduction.selfMedicationCap': 'セルフメディケーションの上限。足切りとは独立に頭打ちとして効く',
  'deduction.smallBizMutualAnnualCap': '小規模企業共済の年間上限。単独の天井',
  'deduction.donationFloor': '寄附金控除の足切り。上限は所得に対する率で別に持つ',
  'deduction.casualtyDisasterFloor': '雑損控除の足切り。上限は所得に対する率で別に持つ',
  'credit.mortgageIncomeLimit': '住宅ローン控除の所得要件。控除額の上限とは別の量',
  'credit.mortgageResidentCapMax': '住民税からの控除の上限額。所得要件とは別の量',
  'fixedAsset.landThreshold': '土地の免税点。家屋・償却資産の免税点とは資産の種類が違う',
  'fixedAsset.houseThreshold': '家屋の免税点。土地・償却資産とは資産の種類が違う',
  'fixedAsset.depreciableThreshold': '償却資産の免税点。土地・家屋とは資産の種類が違う',
  'acquisition.landThreshold': '不動産取得税の土地の免税点。建物とは課税対象が違う',
  'acquisition.newBuildingThreshold': '新築建物の免税点。土地・中古建物とは課税対象が違う',
  'acquisition.otherBuildingThreshold': '中古建物の免税点。土地・新築建物とは課税対象が違う',
  'corporate.reducedThreshold': '法人税の軽減税率の所得上限。事業税の段とは別の税目',
  'corporate.perCapitaEmployeeThreshold': '均等割の従業者数の境目。金額の欄とは単位が違う',
  'corporate.businessTaxRateTier1':
    '段ごとの率。累進でない率表 (定率・逆進) も表現でき、それ自体は矛盾しない',
  'corporate.businessTaxRateTier2': '同上 (段ごとの率。累進でない率表も表現できる)',
  'corporate.businessTaxRateTier3': '同上 (段ごとの率。累進でない率表も表現できる)',
  'corporate.largeCorpCapitalThreshold': '大法人の資本金の境目。所得の段とは別の量',
  'consumptionBusiness.exemptionThreshold':
    '免税事業者の水準。簡易課税を選べる水準より高くても「税がかからない」ので矛盾しない',
  'consumptionBusiness.simplifiedEligibilityThreshold': '簡易課税を選べる水準。免税の水準とは別の判定として効く',
  'consumptionBusiness.fullCreditRatioThreshold': '全額控除の課税売上割合 (%)。金額の欄とは単位が違う',
  'consumptionBusiness.fullCreditSalesThreshold': '全額控除の課税売上高。割合の欄とは単位が違う',
  'payroll.commutePublicTransportCap': '通勤手当の非課税限度 (月額)。相方の欄を持たない単独の天井',
  'capitalGains.residentialReducedRateCap':
    '軽減税率の分かれ目。min / max(0, …) で分けるので、どの値でも「軽減分 + 超過分 = 課税譲渡所得」が成り立つ',
  'trade.smallValueLimit': '少額輸入貨物の免税基準。相方の欄を持たない単独の境目',
};

// 軸ごとの 0 点 / 100 点の水準 (financeHealth.<axis>Bad / Good) は、軸によって
// 高い方が良い (自己資本比率) / 低い方が良い (CCC・借入金月商倍率) が変わるため、
// 大小どちらの並びも正しい。等しいときは `financialRatios.axisBand` が既定へ倒す。
const AXIS_BAND_SUFFIX = /^financeHealth\.[A-Za-z]+(Bad|Good)$/;

/** 順序の検査から外す欄か (軸ごとの 0/100 点の水準)。 */
export function isAxisBandParameter(id: string): boolean {
  return AXIS_BAND_SUFFIX.test(id);
}

/** 順序を持ちうる欄の名前か (母集団の切り出し。走査が縮んだら検査が鳴る)。 */
export function looksOrdered(id: string): boolean {
  return /(Min|Max|Limit|Threshold|Floor|Cap|Danger|Caution|Warn)$/.test(id) || /Tier\d/.test(id);
}

/** 欄の名前と単位を「良好の下限 (70点)」の形に組む。 */
function shown(id: ParameterId, values: ParameterValues): string {
  const def = PARAMETER_BY_ID.get(id);
  // Stryker disable next-line all : id は ParameterId なので必ず在る (型で保証)。
  if (def === undefined) return id;
  return `${def.label} (${toDisplayValue(def, values[id])}${def.unit})`;
}

/**
 * 有効値が組の制約 (順序・相違) を満たしているかを見て、破れている組の文を返す。
 * 空なら矛盾なし。
 *
 * `values` は**有効値** (既定に上書きを重ねた後) を渡す。上書きだけを見ると、
 * 片方だけを置いたときに既定との関係を見落とす。
 */
function violations(values: ParameterValues): { pair: string; text: string }[] {
  const out: { pair: string; text: string }[] = [];
  for (const d of PARAMETER_DISTINCT) {
    const [a, b] = d.ids;
    if (values[a] === values[b]) {
      out.push({ pair: `${a}=${b}`, text: `${shown(a, values)} と ${shown(b, values)} が同じです — ${d.why}` });
    }
  }
  for (const order of PARAMETER_ORDERS) {
    for (let i = 0; i + 1 < order.ids.length; i++) {
      const lo = order.ids[i]!;
      const hi = order.ids[i + 1]!;
      if (values[lo] > values[hi]) {
        out.push({
          pair: `${lo}>${hi}`,
          text: `${shown(lo, values)} が ${shown(hi, values)} を超えています — ${order.why}`,
        });
      }
    }
  }
  return out;
}

export function parameterConsistencyIssues(values: ParameterValues): readonly string[] {
  return violations(values).map((v) => v.text);
}

/**
 * 1 欄を `candidate` に置いたら組の制約が破れるかを見る (保存の前の関門)。
 * 破れなければ null。`values` は置く前の有効値。
 */
export function parameterConsistencyIssueFor(
  id: ParameterId,
  candidate: number,
  values: ParameterValues,
): string | null {
  const touched =
    PARAMETER_ORDERS.some((o) => o.ids.includes(id)) ||
    PARAMETER_DISTINCT.some((d) => d.ids.includes(id));
  if (!touched) return null;
  const next = { ...values, [id]: candidate } as ParameterValues;
  // すでに破れている組を新たな断りとして出さない —— 直している途中の 1 欄を
  // 「あなたのせい」と止めると、順序を戻す道が閉じる。**組で数える**: 文には
  // 今の値が入るので、同じ組でも値が動けば文は変わる (2026-09-13 に文で
  // 数えていて、40→50 という歩み寄りの 1 手を断っていた)。
  const before = new Set(violations(values).map((v) => v.pair));
  for (const v of violations(next)) {
    if (!before.has(v.pair)) return v.text;
  }
  return null;
}
