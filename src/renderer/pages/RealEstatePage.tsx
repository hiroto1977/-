import { useMemo, useState } from 'react';
import {
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  type ManualOverrideEntry,
} from '../data/manualData';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat, positiveIfKnown } from '../components/Stat';
import { ServiceActionPanel } from '../components/ServiceActionPanel';
import { tableStyle, thStyle, thNum, tdStyle, tdNum } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import {
  PROPERTIES_COLLECTION,
  normalizeProperty,
  PROPERTY_TYPES,
  parsePropertyEntry,
  PROPERTY_FORM_SPECS,
  propertyToForm,
  computeRealEstatePortfolio,
  demoMixNote,
  occupiedWithoutRentNote,
  yieldScopeNote,
  type PropertyEntry,
} from '../data/investments';
import { DASH, jpy, pctOrDash } from '../../shared/formatters';
import { GuardedNumber } from '../components/GuardedNumber';
import { refusalLabels, refusalNote, refusedFields, readNumberOr0, readNumberOrNull, type NumSpec } from '../data/inputGuards';
import { useParameters } from '../data/parameterOverrides';
import { advisorThresholds, dscrThresholds, effluentStandards, zoningRules } from '../../shared/parameters';
import type { RealEstateAdviceInput } from '../../shared/serviceAdvisor';
import {
  calcRealEstateYield,
  calcRealEstateLeverage,
  calcNoiYield,
  calcDscr,
  calcBreakEvenOccupancyPct,
  calcNpv,
  calcIrr,
  fullLeverageNote,
  missingPriceNote,
} from '../../shared/realEstateMetrics';
import { isSchedulableLife, straightLineAnnual } from '../../shared/depreciation';
import {
  planSite,
  planFactory,
  NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP,
  type RoadMultiplierCategory,
  planRoadSlope,
  planShadowRegulation,
  planSetbackTradeoff,
  SHADOW_HEIGHT_THRESHOLD_M,
} from '../../shared/zoningPlanner';
import { buildSchematic } from '../../shared/buildingIso';

/** しきい値の表示: 1 → 1.0、1.2 → 1.2、1.25 → 1.25 (末尾の 0 を 1 つだけ落とす)。 */
function fmtDscr(x: number): string {
  return x.toFixed(2).replace(/0$/, '');
}
import { BuildingIso } from '../components/BuildingIso';
import { RefusedFieldsNote } from '../components/RefusedFieldsNote';
import {
  planWaterBalance,
  planRoSizing,
  planNitrification,
  planAeration,
  checkEffluent,
  EFFLUENT_TN_DAILY_AVG_MG_L,
  EFFLUENT_TP_DAILY_AVG_MG_L,
} from '../../shared/waterCyclePlanner';

/**
 * 都市計画プランナーの入力欄の仕様。**JSX と関門が同じ宣言を読む** (パス 206)。
 *
 * 以前はこの仕様が JSX の中にリテラルで散っており、`guardNumber` は
 * `level: 'fatal'` の赤い文面を出すのに、**計算側にはその判定が届いていなかった**
 * —— `RealEstatePage` には `guardAll` の呼び出しが 1 件も無く、
 * `reNum(zpHeightStr)` が断られた値をそのまま読んで道路斜線・日影規制・
 * 後退のトレードオフの判定を作っていた (実測・パス 206)。
 * 上限の文面は「0 m として計算されています」と違って**何を計算したかを言わない**
 * ので、利用者は ⛔ と一緒にその値で作られた都市計画上の判定を読むことになる。
 *
 * **同じファイルのパス 77 が同じ形を直している** —— 「空欄の敷地寸法から
 * 『この敷地には 0 ㎡しか建てられない』という判定を作る」。その関門
 * (`reNumOrNull` +「未入力なら描かない」) は今も在り、コメントに
 * 「未入力から作った図である」と書かれている。**未入力を断るのに、宣言した
 * 上限を超えた値は断っていなかった。**
 *
 * ## 上限の性質 (パス 206 で欄ごとに確かめた)
 *
 * | 欄 | 上限 | 性質 |
 * | --- | --- | --- |
 * | 建ぺい率 | 100% | **定義上の上限** (建築面積 ÷ 敷地面積) |
 * | 容積率 | 1300% | もっともらしさ (商業地域の指定容積率の最大) |
 * | 前面道路幅員 / 後退 | 100 m | もっともらしさ |
 * | 側面の後退 合計 | 200 m | もっともらしさ |
 * | 計画する最高高さ / 日影規制の対象高さ | 300 m | もっともらしさ |
 * | 敷地の奥行 / 間口 | 2000 m | もっともらしさ |
 *
 * **どれも「計算に使う法定値」ではない**ので `parameters.ts` の台帳には載せない
 * (CLAUDE.md: 安全上限は台帳に載せない)。置き場所はここ 1 か所。
 */
const ZONING_SPECS = {
  site: { label: '敷地面積 (㎡)', kind: 'area' },
  coverage: { label: '建ぺい率 (%)', kind: 'percent', min: 1, max: 100 },
  // `sane` を天井に合わせて**桁の問い合わせを消している**。`percent` の既定は
  // `sane: 100` なので、容積率は 100% を超えるだけで「桁を間違えていないか確認して
  // ください」と言われていた —— プリセット 3 つ (200 / 400 / 200%) とページの初期値が
  // すべてこれに当たり、**画面は自分が入れた既定値に⚠️を付けて開いていた** (実測・パス 206)。
  // 容積率に「通るが疑わしい」帯は無い: 1〜1300% はどれも都市計画の指定値で、
  // それを超えるものは上の `max` が ⛔ で断る。
  far: { label: '容積率 (%)', kind: 'percent', min: 1, max: 1300, sane: 1300 },
  road: { label: '前面道路幅員 (m)', kind: 'length', max: 100 },
  height: { label: '計画する最高高さ (m)', kind: 'length', max: 300 },
  setback: { label: '道路境界からの後退 (m)', kind: 'length', allowZero: true, max: 100 },
  shadowThreshold: { label: '日影規制の対象高さ (m)', kind: 'length', max: 300 },
  siteDepth: { label: '敷地の奥行 (m)', kind: 'length', max: 2000 },
  siteWidth: { label: '敷地の間口 (m)', kind: 'length', max: 2000 },
  rear: { label: '背面の後退 (m)', kind: 'length', allowZero: true, max: 100 },
  side: { label: '側面の後退 合計 (m)', kind: 'length', allowZero: true, max: 200 },
  // **工場プランの 2 欄** (パス 216 で表に足した)。パス 206 がこの表を手で書いたときに
  // 落としており、`GuardedNumber` ではなく素の `<input>` だったので ⛔ が 1 度も
  // 出ず、常設の走査 (`input[data-guard]` を踏む) からも外れていた。
  // 実測: `作業場の法定上限 = −9999` で `作業場 (栽培室等) 150 ㎡ → 0 ㎡`・
  // `1階の残り 90 ㎡ → 240 ㎡` ——**負の法定上限から都市計画上の答えが出ていた**。
  // どちらも空欄に意味が在る (上限=制限なし / 希望=上限まで) ので `allowEmpty`、
  // 0 にも意味が在る (作業場を建てられない用途地域 / 作業場を置かない) ので `allowZero`。
  workshopCap: { label: '作業場の法定上限 (㎡・空欄=制限なし)', kind: 'area', allowEmpty: true, allowZero: true },
  workshopDesired: { label: '希望する作業場面積 (㎡・空欄=上限まで)', kind: 'area', allowEmpty: true, allowZero: true },
} as const satisfies Record<string, NumSpec>;

export type ZoningField = keyof typeof ZONING_SPECS;

/** 画面が ⛔ を出している敷地の欄の一覧。 */
export function refusedZoningFields(values: Readonly<Record<ZoningField, string>>): readonly ZoningField[] {
  return refusedFields(ZONING_SPECS, values);
}

/** 敷地の段が読んでいる欄のうち ⛔ の物の表示名。 */
export function zoningRefusalLabels(
  refused: readonly ZoningField[],
  reads: readonly ZoningField[],
): readonly string[] {
  return refusalLabels(ZONING_SPECS, refused, reads);
}

/** 敷地の断りの文面 (`refusalNote` の別名 —— 文面は 1 か所で持つ)。 */
export const zoningRefusalNote = refusalNote;

/**
 * 判定の段ごとに「どの欄を読んでいるか」。**この表と `useMemo` の引数が対応する。**
 *
 * ⛔ が 1 つ在るからといって画面全体を黙らせるのは、**読んでいない欄のせいで
 * 正しい判定を消す**ことになる (間口が範囲外でも `適用建ぺい率` は正しい)。
 * 逆に、読んでいる欄が ⛔ なのに判定を出すのが欠陥そのもの。
 * だから対応は表に書いて 1 か所で持ち、段をまたぐ依存は**合成で書く** ——
 * トレードオフは敷地の段の `maxFootprint` を受け取るので、敷地の欄も読んでいる。
 */
const ZONING_READS_SITE = ['site', 'coverage', 'far', 'road'] as const;
const ZONING_READS_HEIGHT = ['road', 'setback', 'height', 'shadowThreshold'] as const;
const ZONING_READS_TRADEOFF = [
  ...ZONING_READS_SITE, 'height', 'rear', 'side', 'siteDepth', 'siteWidth',
] as const;
export const ZONING_READS = {
  site: ZONING_READS_SITE,
  height: ZONING_READS_HEIGHT,
  tradeoff: ZONING_READS_TRADEOFF,
  // 工場プランは敷地の段の `maxTotalFloor` を配り、**上限と希望の 2 欄も読む**
  // (パス 216)。立体プレビューはトレードオフの寸法と工場プランの面積の両方で
  // 組むので、和集合になる。
  factory: [...ZONING_READS_SITE, 'workshopCap', 'workshopDesired'] as const,
  iso: [...ZONING_READS_TRADEOFF, 'workshopCap', 'workshopDesired'] as const,
} as const satisfies Record<string, readonly ZoningField[]>;

/**
 * 試算の段の入力欄の仕様。**JSX と関門が同じ宣言を読む** (パス 209)。
 *
 * パス 206 は敷地プランナーの `max`（上限）超過を断ったが、`guardNumber` が
 * `fatal` を返すもう一つの道 **`negativeIsFatal`** —— 「マイナスの値（−9999）は
 * 指定できません」—— は誰も読んでいなかった。`percent` 以外のすべての kind が
 * 既定で負値を `fatal` にするので、試算の欄はほぼ全部この道を持つ。
 *
 * 実測（直す前・−9999 を入れた時）。**★ は「より good な方向」へ動く** ——
 * これが一番危ない: 明らかに変な値ではなく**より安心させる答え**が出る。
 *
 * | 欄 | 出ていた物 |
 * | --- | --- |
 * | ★ 年間経費 | `実質利回り 3.37% → **4.80%**`・**`DSCR 0.88 → 1.28`**（危険水域から目安超えへ）・`損益分岐入居率 104% → 74.4%`・`返済後CF −84,000 → +516,000` |
 * | ★ 年間返済額 | `返済後CF −84,000 → **+1,416,000**`・`CCR −0.84% → 14.16%`・`IRR 12.84% → 22.62%` |
 * | ★ 保有年数 | `IRR 12.84% → **249.16%**` |
 * | 月額賃料 | `NOI ¥-600,000`・**`DSCR -0.40`**・`CCR -21.00%` |
 * | 物件価格 / 自己資金 / 売却ネット手取り | 一部が `—`、一部が符号反転（`NPV ¥12.9M → ¥-10.6M`） |
 * | 耐用年数 | `年間減価償却費 ¥0`（後述） |
 *
 * **`nonNeg` を足すだけでは足りない** —— 0 に倒すと「経費 0 円の物件」「返済 0 円の
 * 借入」という**別の判定**になる（パス 205 の「天井を床にした」の裏返し）。
 * だからパス 206 と同じ形を採る: **段ごとに ⛔ の欄を名指しして算定しない。**
 *
 * `ローン金利(%)` / `想定入居率 (%)` / `割引率(%)` は `percent` なので
 * `negativeIsFatal: false`（負の金利・負の入居率は ⛔ にならない）。上限超過だけが
 * この 3 欄の ⛔ で、それも同じ関門が受ける。
 */
const RE_SPECS = {
  rent: { label: '月額賃料', kind: 'money' },
  price: { label: '物件価格', kind: 'money', allowZero: false },
  expense: { label: '年間経費', kind: 'money', allowZero: true },
  equity: { label: '自己資金', kind: 'money', allowZero: true },
  debt: { label: '年間返済額', kind: 'money', allowZero: true },
  loanRate: { label: 'ローン金利(%)', kind: 'percent', allowZero: true, max: 30 },
  occupancy: { label: '想定入居率 (%)', kind: 'percent', min: 1, max: 100 },
  discount: { label: '割引率(%)', kind: 'percent', allowZero: true, max: 30 },
  holdYears: { label: '保有年数', kind: 'years', allowZero: false, max: 50 },
  saleNet: { label: '売却ネット手取り', kind: 'money', allowZero: true },
  bldgCost: { label: '建物取得価額 (円)', kind: 'money', allowZero: false },
  bldgLife: { label: '耐用年数 (年)', kind: 'years', min: 1, max: 100 },
} as const satisfies Record<string, NumSpec>;

export type ReField = keyof typeof RE_SPECS;

/**
 * 試算の段ごとに「どの欄を読んでいるか」。**`useMemo` の引数と対応する。**
 *
 * 段をまたぐ依存は**合成で書く** —— 精緻化指標はレバレッジ試算と同じ入力を
 * 読み直し、NPV/IRR はレバレッジ試算の `annualCashflow` を受け取る。
 * 減価償却は独立なので、ほかの欄が ⛔ でも黙らせない（パス 206 と同じ約束）。
 */
const RE_READS_LEVERAGE = ['rent', 'price', 'expense', 'equity', 'debt', 'loanRate'] as const;
const RE_READS_REFINED = ['rent', 'price', 'expense', 'debt', 'occupancy'] as const;
const RE_READS_DCF = [...RE_READS_LEVERAGE, 'discount', 'holdYears', 'saleNet'] as const;
const RE_READS_DEPRECIATION = ['bldgCost', 'bldgLife'] as const;
export const RE_READS = {
  leverage: RE_READS_LEVERAGE,
  refined: RE_READS_REFINED,
  dcf: RE_READS_DCF,
  depreciation: RE_READS_DEPRECIATION,
} as const satisfies Record<string, readonly ReField[]>;

/**
 * **水循環プランナーの入力欄** (パス 210 で JSX のリテラルから引き上げた)。
 *
 * ここは `GuardedNumber` を 10 欄に使いながら、⛔ (`level: 'fatal'`) を 1 度も
 * 読んでいなかった —— パス 209 は `RE_SPECS` / `ZONING_SPECS` という**自分の書いた
 * 表**から欄を数えたので、この節ごと母集団から落ちていた (パス 85 / 95 / 107 と
 * 同じ誤り —— 母集団は走査で採る)。`input[data-guard]` を総当たりして初めて出た:
 *
 * | 欄 | 出ていた物 |
 * | --- | --- |
 * | 濃縮液の全窒素 = −9999 | **`地下水基準比 (硝酸性N) 40倍 → 0倍`** ——「環境基準の 0 倍」= 完全に清浄 |
 * | RO 回収率 = −9999 / 上限超 | **`濃縮倍率 4倍 → ∞ (排出口なし)`**・`実際の水回収率 75% → 100%` |
 * | RO 塩除去率 = 上限超 | `透過水の EC 持ち越し 10.0% → 0.0%` —— 塩が 1 つも抜けてこない |
 * | 交換周期 = 上限超 | `連続止水日数 13.7 日 → 9,999,999,998.7 日` (約 2,700 万年) |
 * | 曝気タンク容量 = −9999 | `曝気タンク HRT 504 h → 0 h`・上限超で 359,999,999,964 h |
 * | 循環量 / 硝化する N 濃度 / 全りん = −9999 | 節水量・排出量・窒素・りん・アルカリ度・酸素要求量が**すべて 0** |
 *
 * **これは「より good な方向」の家系で、しかも環境規制の判定である** ——
 * 「年間 窒素排出 0 kg」「地下水基準比 0 倍」は、放流の可否を考える人に
 * 「問題なし」と読ませる。この節は**未入力**は丁寧に扱っていた
 * (`data-recovery-unset` / `data-rejection-unset` / `data-wpcl-undetermined`・
 * パス 76 / 153) が、**範囲外**は素通りしていた。
 *
 * 天井はどれも計算に使う法定値ではない (`max: 365` は暦・`max: 99` は物質収支上
 * 100% が成立しないこと・`max: 24` は 1 日) ので `parameters.ts` には載せない
 * (CLAUDE.md の規約・パス 206 と同じ判断)。
 */
const WC_SPECS = {
  vol: { label: '循環量 (L)', kind: 'ratio', allowZero: false, sane: 1e6 },
  cycle: { label: '交換周期 (日)', kind: 'count', allowZero: false, max: 365 },
  recovery: { label: 'RO 回収率 (%)', kind: 'percent', min: 1, max: 99 },
  rejection: { label: 'RO 塩除去率 (%)', kind: 'percent', min: 1, max: 100 },
  window: { label: 'RO 処理目標 (h)', kind: 'count', allowZero: false, max: 24 },
  roCap: { label: 'RO 機の日産 (L/日・空欄可)', kind: 'ratio', allowEmpty: true, allowZero: true, sane: 1e6 },
  tank: { label: '曝気タンク容量 (L)', kind: 'ratio', allowZero: false, sane: 1e6 },
  n: { label: '硝化する N 濃度 (mg/L)', kind: 'ppm', allowZero: true },
  concN: { label: '濃縮液の全窒素 (mg/L)', kind: 'ppm', allowZero: true },
  concP: { label: '濃縮液の全りん (mg/L)', kind: 'ppm', allowZero: true },
} as const satisfies Record<string, NumSpec>;

type WcField = keyof typeof WC_SPECS;

/**
 * **どの段がどの欄を読むか** (パス 206 の `ZONING_READS` / パス 209 の `RE_READS` と同じ形)。
 *
 * 段をまたぐ依存は合成で書く —— 排出量の 3 タイルは濃度だけでなく
 * `balance.annualDischargeL` を通すので、水収支の欄も読んでいる。
 * 逆に**地下水基準比は濃度だけで決まる** (画面のコメントが以前からそう述べている)
 * ので、回収率が ⛔ でもこのタイルは出し続ける —— ⛔ 1 件で節全体を黙らせない。
 */
const WC_READS_BALANCE = ['vol', 'cycle', 'recovery', 'rejection'] as const;
export const WC_READS = {
  balance: WC_READS_BALANCE,
  ro: ['vol', 'window', 'cycle', 'roCap'] as const,
  // 硝化 (n, vol) と曝気 (tank, vol, cycle) は 1 つの grid に並ぶので和を採る。
  nitriAeration: ['n', 'vol', 'tank', 'cycle'] as const,
  effluentDischarge: [...WC_READS_BALANCE, 'concN', 'concP'] as const,
  effluentConcentration: ['concN'] as const,
} as const satisfies Record<string, readonly WcField[]>;

const reInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 140,
};
// 読み取りは inputGuards に統一。警告 (GuardedNumber) と計算が同じ関数を使うので、
// 「警告は出ないのに 0 で計算されていた」が起きない。
const reNum = readNumberOr0;
/** `allowZero` を持たない欄 (0 は fatal) はこちらで読む —— 空欄と 0 は別。 */
const reNumOrNull = readNumberOrNull;

const jpyM = (n: number) => `¥${(n / 1_000_000).toFixed(1)}M`;
/**
 * 比率。**算定不能 (null) は「—」** —— `0.0%` は「その比率が 0 である」という
 * 主張であり、「割れない」とは別のこと (経緯は `data/investments.ts` の
 * `portfolioYield`)。
 */
// **綴りは `shared/formatters.ts` の `pctOrDash` が 1 つ持つ** (パス 229・理由は同ファイル)。
const pct1OrDash = (n: number | null, digits = 1) => pctOrDash(n, digits);
/**
 * L 表記。**算定不能 (null) は「—」** —— 未入力から「0 L」という測定値を作らない。
 * (RO 回収率を空にすると「年間節水量 0 L」= 循環設備が何も回収していない、に見えた。)
 */
const litersOrDash = (n: number | null) => (n === null ? '—' : `${Math.round(n).toLocaleString()} L`);
/** 長さ・面積。**算定不能 (null) は「—」** —— `0 m` / `0 ㎡` は「そこには何も建てられない」
 *  という都市計画上の主張で、寸法を知らないまま述べられない。 */
const metresOrDash = (n: number | null) => (n === null ? '—' : `${n.toLocaleString()} m`);
const sqmOrDash = (n: number | null) => (n === null ? '—' : `${n.toLocaleString()} ㎡`);

/** 敷地プランナーの用途地域プリセット (指定値は土地ごとに異なるため編集可)。 */
const ZONE_PRESETS = [
  { key: 'kinsho', label: '近隣商業地域', cov: '80', far: '200', workshopCap: String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP) },
  { key: 'shogyo', label: '商業地域', cov: '80', far: '400', workshopCap: String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP) },
  { key: 'custom', label: 'その他 (手入力)', cov: '60', far: '200', workshopCap: '' },
] as const;

const EMPTY_PROPERTY_FORM = {
  name: '',
  type: PROPERTY_TYPES[0] as string,
  monthlyRent: '',
  purchasePrice: '',
  monthlyExpenses: '',
  monthlyLoan: '',
  occupied: true,
};

export function RealEstatePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'real-estate',
    SNAPSHOT.realEstate,
  );
  const { monthlyCashflow } = data;

  // ユーザー追加の物件 (record store 永続化・端末内)。
  const { records: userProps, add: addProperty, edit: editProperty, remove: removeProperty } = useCollection<PropertyEntry>(PROPERTIES_COLLECTION);
  const [propForm, setPropForm] = useState(EMPTY_PROPERTY_FORM);
  const [propError, setPropError] = useState<string>();
  /** 編集中のユーザー物件 id (null = 新規追加モード)。 */
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const submit = useSubmitGuard();

  /** デモ (snapshot) 行 + ユーザー行の結合リスト。 */
  const properties = useMemo(
    () => [
      ...data.properties.map((p) => ({ ...p, rowId: p.id, user: false as const })),
      // 欄の無い控えも 0 と読んでから使う (`normalizeProperty` の 1 か所だけで補う)。
      ...userProps.map((r) => ({ ...normalizeProperty(r.data), rowId: r.id, user: true as const })),
    ],
    [data.properties, userProps],
  );

  /*
   * ポートフォリオ集計は結合リストから再計算する (追加ゼロなら snapshot と同値)。
   *
   * **`demo` を渡す** (パス 187) —— 合計は見本を含むが、見本を除いた側も
   * 一緒に返させて画面が並べる。渡さないと「自分の物件 1 件 (家賃 9 万・
   * 経費 3 万・返済 5.5 万) の人に 家賃収入 ¥913,000・キャッシュフロー
   * +¥248,000」と出す —— 自分の分は ¥90,000 と +¥5,000 である。
   */
  const computedPortfolio = useMemo(
    () =>
      computeRealEstatePortfolio(
        properties.map((p) => ({ ...p, demo: !p.user })),
        monthlyCashflow.operatingExpenses,
        monthlyCashflow.mortgagePayment,
      ),
    [properties, monthlyCashflow.operatingExpenses, monthlyCashflow.mortgagePayment],
  );
  // 手入力の上書きを重ねる。入力欄は App が全画面共通で描くので、ここは
  // 読んで適用するだけ。
  const manualOverrides = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);

  const manualRecords = manualOverrides.records;
  const portfolio = useMemo(
    () =>
      applyManualOverrides('real-estate', computedPortfolio, manualRecords.map((r) => r.data))
        .overview,
    [computedPortfolio, manualRecords],
  );
  // 平均の分母から外した物件・家賃が読めない入居中の物件を述べる 2 文
  // (文面は `data/investments.ts` が 1 か所で持つ)。
  const yieldNote = useMemo(() => yieldScopeNote(portfolio), [portfolio]);
  const rentNote = useMemo(() => occupiedWithoutRentNote(portfolio), [portfolio]);
  /** 合計に見本が混ざっていることの断り (自分の分の数字つき · パス 187)。 */
  const mixNote = useMemo(() => demoMixNote(portfolio, jpy), [portfolio]);

  async function onSaveProperty() {
    try {
      const parsed = parsePropertyEntry(propForm);
      setPropError(undefined);
      if (editingPropId !== null) {
        await editProperty(editingPropId, parsed);
        setEditingPropId(null);
      } else {
        await addProperty(parsed);
      }
      setPropForm(EMPTY_PROPERTY_FORM);
    } catch (e) {
      setPropError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  /** ユーザー行の「編集」— フォームへ読み込み、保存で自動反映。 */
  function onStartEditProperty(rowId: string, p: PropertyEntry) {
    setPropForm(propertyToForm(p));
    setEditingPropId(rowId);
    setPropError(undefined);
  }

  function onCancelEditProperty() {
    setEditingPropId(null);
    setPropForm(EMPTY_PROPERTY_FORM);
    setPropError(undefined);
  }

  // レバレッジ試算 (CCR・イールドギャップ) — 入力はローカル。
  const [reRentStr, setReRentStr] = useState('168000');
  const [rePriceStr, setRePriceStr] = useState('42000000');
  const [reExpenseStr, setReExpenseStr] = useState('600000');
  const [reEquityStr, setReEquityStr] = useState('10000000');
  const [reDebtStr, setReDebtStr] = useState('1500000');
  const [reLoanRateStr, setReLoanRateStr] = useState('2.0');
  const leverage = useMemo(() => {
    const y = calcRealEstateYield(reNum(reRentStr), reNum(rePriceStr), 1, reNum(reExpenseStr));
    const lev = calcRealEstateLeverage(y.annualNetIncome, reNum(reEquityStr), reNum(reDebtStr), y.netYieldPct, reNum(reLoanRateStr));
    return { y, lev };
  }, [reRentStr, rePriceStr, reExpenseStr, reEquityStr, reDebtStr, reLoanRateStr]);
  // 出せなかった理由は**値を作った所**が持つ (画面が条件を書き写すと、値と関門で
  // 別々に規則を持つことになる —— パス 57 で当たった形)。
  const priceNote = useMemo(() => missingPriceNote(leverage.y), [leverage.y]);
  const leverageNote = useMemo(() => fullLeverageNote(leverage.lev), [leverage.lev]);

  // 精緻化指標 (NOI 利回り・DSCR・損益分岐入居率) — レバレッジ試算の入力を再利用。
  const [reOccStr, setReOccStr] = useState('95'); // 想定入居率 (%)
  // DSCR の判定しきい値は台帳の値 (設定画面で金融機関の要求水準に置ける)。
  const { values: params } = useParameters();
  const dscrT = useMemo(() => dscrThresholds(params), [params]);
  const zRules = useMemo(() => zoningRules(params), [params]);
  const effStd = useMemo(() => effluentStandards(params), [params]);
  // 改善提案の元になる数字 —— **画面が刷っている物をそのまま渡す** (提案が言う数字と
  // タイル・表の数字を一致させる。パス 119 までは payload を読まない固定文だった)。
  // 表面利回りは表と同じ `calcRealEstateYield` の値 (取得価格が読めない行は null = 「—」)。
  const advisorT = useMemo(() => advisorThresholds(params), [params]);
  const adviseInput = useMemo<RealEstateAdviceInput>(
    () => ({
      properties: properties.map((p) => ({
        name: p.name,
        occupied: p.occupied,
        monthlyRent: p.monthlyRent,
        grossYieldPct: calcRealEstateYield(p.monthlyRent, p.purchasePrice, p.occupied ? 1 : 0).grossYieldPct,
        demo: !p.user,
      })),
      netCashflow: portfolio.netCashflow,
      portfolioYieldPct: portfolio.portfolioYield,
      occupancyRate: portfolio.occupancyRate,
      thresholds: advisorT,
    }),
    [properties, portfolio, advisorT],
  );
  const refined = useMemo(() => {
    const annualGrossRent = reNum(reRentStr) * 12;
    const occ = Math.min(1, Math.max(0, reNum(reOccStr) / 100));
    const opex = reNum(reExpenseStr);
    const debt = reNum(reDebtStr);
    const noiY = calcNoiYield(annualGrossRent, occ, opex, reNum(rePriceStr));
    const dscr = calcDscr(noiY.noi, debt, dscrT);
    const ber = calcBreakEvenOccupancyPct(opex, debt, annualGrossRent);
    return { noiY, dscr, ber };
  }, [reRentStr, reOccStr, reExpenseStr, reDebtStr, rePriceStr, dscrT]);

  // NPV / IRR — 自己資金を初期投資 (マイナス) とし、各年の税引前CF、最終年に売却ネット手取りを加算。
  const [npvDiscountStr, setNpvDiscountStr] = useState('4.0'); // 割引率 (%)
  const [npvYearsStr, setNpvYearsStr] = useState('10'); // 保有年数
  const [npvSaleStr, setNpvSaleStr] = useState('35000000'); // 売却ネット手取り
  const dcf = useMemo(() => {
    const years = Math.max(1, Math.min(50, Math.round(reNum(npvYearsStr))));
    const annualCf = leverage.lev.annualCashflow; // 返済後の年間CF (概算)
    const sale = reNum(npvSaleStr);
    const equity = reNum(reEquityStr);
    const flows: number[] = [-equity];
    for (let t = 1; t <= years; t += 1) {
      flows.push(t === years ? annualCf + sale : annualCf);
    }
    const npv = calcNpv(flows, reNum(npvDiscountStr) / 100);
    const irr = calcIrr(flows);
    return { years, npv, irr };
  }, [npvYearsStr, npvSaleStr, reEquityStr, npvDiscountStr, leverage.lev.annualCashflow]);

  // 敷地プランナー — 用途地域の規制から建てられる規模と工場150㎡プランを試算。
  const [zoneKey, setZoneKey] = useState<(typeof ZONE_PRESETS)[number]['key']>('kinsho');
  const [zpSiteStr, setZpSiteStr] = useState('300');
  const [zpCovStr, setZpCovStr] = useState('80');
  const [zpFarStr, setZpFarStr] = useState('200');
  const [zpRoadStr, setZpRoadStr] = useState('6');
  const [zpCat, setZpCat] = useState<RoadMultiplierCategory>('other');
  const [zpCorner, setZpCorner] = useState(false);
  const [zpFireproof, setZpFireproof] = useState(false);
  const [zpCapStr, setZpCapStr] = useState(String(NEIGHBORHOOD_COMMERCIAL_WORKSHOP_CAP));
  const [zpWorkshopStr, setZpWorkshopStr] = useState('');
  // 高さ制限 — 道路斜線 (法56条1項1号) と日影規制 (法56条の2)。
  const [zpHeightStr, setZpHeightStr] = useState('12.1');
  const [zpSetbackStr, setZpSetbackStr] = useState('1.5');
  const [zpRearStr, setZpRearStr] = useState('0.5');
  const [zpSideStr, setZpSideStr] = useState('3.0');
  const [zpSiteDepthStr, setZpSiteDepthStr] = useState('20');
  const [zpSiteWidthStr, setZpSiteWidthStr] = useState('15');
  const [zpShadowThresholdStr, setZpShadowThresholdStr] = useState(String(SHADOW_HEIGHT_THRESHOLD_M));
  // 対象区域かどうかは自治体の条例指定。'unknown' を既定にして断定しない。
  const [zpShadowArea, setZpShadowArea] = useState<'unknown' | 'yes' | 'no'>('unknown');

  function onZonePreset(key: (typeof ZONE_PRESETS)[number]['key']) {
    setZoneKey(key);
    const preset = ZONE_PRESETS.find((z) => z.key === key);
    if (preset) {
      setZpCovStr(preset.cov);
      setZpFarStr(preset.far);
      setZpCapStr(preset.workshopCap);
    }
  }

  const zoning = useMemo(() => {
    const site = planSite({
      siteArea: reNum(zpSiteStr),
      coverageRatioPct: reNum(zpCovStr),
      farPct: reNum(zpFarStr),
      roadWidthM: reNum(zpRoadStr),
      category: zpCat,
      cornerLot: zpCorner,
      fireproofBonus: zpFireproof,
    }, zRules);
    const capRaw = zpCapStr.trim() === '' ? Number.POSITIVE_INFINITY : reNum(zpCapStr);
    const factory = planFactory({
      maxFootprint: site.maxFootprint,
      maxTotalFloor: site.maxTotalFloor,
      workshopCapSqm: capRaw,
      ...(zpWorkshopStr.trim() !== '' ? { desiredWorkshopSqm: reNum(zpWorkshopStr) } : {}),
    });
    const height = reNum(zpHeightStr);
    const slope = planRoadSlope({
      roadWidthM: reNum(zpRoadStr),
      setbackM: reNum(zpSetbackStr),
      category: zpCat,
      plannedHeightM: height,
    }, zRules);
    const shadow = planShadowRegulation({
      plannedHeightM: height,
      thresholdM: reNum(zpShadowThresholdStr),
      ...(zpShadowArea === 'unknown' ? {} : { designatedArea: zpShadowArea === 'yes' }),
    });
    const tradeoff = planSetbackTradeoff({
      // 欄は `kind: 'length'` (= `allowZero` 無し) なので 0 は受け付けない値。
      // `reNum` で 0 に倒すと、空欄が「建てられる面積 0 ㎡」という判定になる。
      siteDepthM: reNumOrNull(zpSiteDepthStr),
      siteWidthM: reNumOrNull(zpSiteWidthStr),
      rearSetbackM: reNum(zpRearStr),
      sideSetbackTotalM: reNum(zpSideStr),
      maxFootprint: site.maxFootprint,
      roadWidthM: reNum(zpRoadStr),
      category: zpCat,
      plannedHeightM: height,
    }, zRules);
    // 立体プレビューは「実際に建てられる寸法」で組む。トレードオフが建蔽率で
    // 頭打ちなら、幅はそのままで奥行を建蔽率上限に合わせて詰める。
    // 寸法が未入力 (null) なら**描かない** —— 0×0 の箱を描いて
    // 「間口 0 m × 奥行 0 m で…の概形」と説明するのは、未入力から作った図である。
    const isoWidth = tradeoff.buildableWidthM;
    const isoDepth =
      isoWidth === null || tradeoff.buildableDepthM === null || tradeoff.footprint === null
        ? null
        : isoWidth > 0
          ? Math.min(tradeoff.buildableDepthM, tradeoff.footprint / isoWidth)
          : 0;
    const schematic = buildSchematic({
      // 未入力は 0 として渡す (`buildSchematic` は 0 以下で階を作らない)。
      // 描画そのものは下の関門で止めるので、この 0 は画面に出ない。
      widthM: isoWidth ?? 0,
      depthM: isoDepth ?? 0,
      workshopSqm: factory.workshopArea,
      groundOtherSqm: factory.groundFloorOther,
      upperFloorsSqm: factory.upperFloorsArea,
    });
    // **画面が ⛔ で断っている値から都市計画上の判定を作らない** (パス 206)。
    // 判定そのものは上で計算してある (途中で return すると段ごとの断りが書けない)。
    // 下の画面が段ごとに `refused` を見て、数字の代わりに理由を出す ——
    // パス 77 が同じファイルで「未入力から『0 ㎡しか建てられない』を作らない」と
    // 決めたのと同じ形。**断る単位は段** で、読んでいない欄では黙らせない。
    const zoningRefused = refusedZoningFields({
      site: zpSiteStr, coverage: zpCovStr, far: zpFarStr, road: zpRoadStr,
      height: zpHeightStr, setback: zpSetbackStr, shadowThreshold: zpShadowThresholdStr,
      siteDepth: zpSiteDepthStr, siteWidth: zpSiteWidthStr, rear: zpRearStr, side: zpSideStr,
      workshopCap: zpCapStr, workshopDesired: zpWorkshopStr,
    });
    const refused = {
      site: zoningRefusalLabels(zoningRefused, ZONING_READS.site),
      height: zoningRefusalLabels(zoningRefused, ZONING_READS.height),
      tradeoff: zoningRefusalLabels(zoningRefused, ZONING_READS.tradeoff),
      factory: zoningRefusalLabels(zoningRefused, ZONING_READS.factory),
      iso: zoningRefusalLabels(zoningRefused, ZONING_READS.iso),
    };
    return {
      site, factory, slope, shadow, tradeoff, schematic,
      isoWidth, isoDepth,
      refused,
      capUnlimited: zpCapStr.trim() === '',
    };
  }, [
    zpSiteStr, zpCovStr, zpFarStr, zpRoadStr, zpCat, zpCorner, zpFireproof, zpCapStr, zpWorkshopStr,
    zpHeightStr, zpSetbackStr, zpRearStr, zpSideStr, zpSiteDepthStr, zpSiteWidthStr,
    zpShadowThresholdStr, zpShadowArea, zRules,
  ]);

  // 水循環プランナー — クローズド水耕の水収支・RO 稼働率・硝化・排水規制を試算。
  const [wcVolStr, setWcVolStr] = useState('200');
  const [wcCycleStr, setWcCycleStr] = useState('14');
  const [wcRecoveryStr, setWcRecoveryStr] = useState('75');
  const [wcRejectionStr, setWcRejectionStr] = useState('90');
  const [wcWindowStr, setWcWindowStr] = useState('8');
  const [wcRoCapStr, setWcRoCapStr] = useState('600');
  const [wcTankStr, setWcTankStr] = useState('300');
  const [wcNStr, setWcNStr] = useState('50');
  const [wcConcNStr, setWcConcNStr] = useState('400');
  const [wcConcPStr, setWcConcPStr] = useState('40');
  const [wcToPublic, setWcToPublic] = useState(false);

  const water = useMemo(() => {
    const balance = planWaterBalance({
      systemVolumeL: reNum(wcVolStr),
      exchangeCycleDays: reNum(wcCycleStr),
      roRecoveryPct: reNum(wcRecoveryStr),
      roRejectionPct: reNum(wcRejectionStr),
    });
    const ro = planRoSizing({
      batchVolumeL: reNum(wcVolStr),
      processingWindowHours: reNum(wcWindowStr),
      exchangeCycleDays: reNum(wcCycleStr),
      ...(wcRoCapStr.trim() !== '' ? { machineCapacityLPerDay: reNum(wcRoCapStr) } : {}),
    });
    const nitri = planNitrification({ ammoniacalNMgL: reNum(wcNStr), volumeL: reNum(wcVolStr) });
    // 曝気タンクへの流入は「循環量 ÷ 交換周期」= 1 日あたりの入替量。
    const cycleDays = reNum(wcCycleStr);
    const aeration = planAeration({
      tankVolumeL: reNum(wcTankStr),
      inflowLPerDay: cycleDays > 0 ? reNum(wcVolStr) / cycleDays : 0,
    });
    const effluent = checkEffluent({
      concentrateTnMgL: reNum(wcConcNStr),
      concentrateTpMgL: reNum(wcConcPStr),
      annualDischargeL: balance.annualDischargeL,
      dischargeToPublicWater: wcToPublic,
    }, effStd);
    return { balance, ro, nitri, aeration, effluent };
  }, [
    wcVolStr, wcCycleStr, wcRecoveryStr, wcRejectionStr, wcWindowStr, wcRoCapStr,
    wcTankStr, wcNStr, wcConcNStr, wcConcPStr, wcToPublic, effStd,
  ]);

  /** **水循環プランナーの段ごとの ⛔ の欄** (パス 210)。 */
  const wcRefused = useMemo(
    () =>
      refusedFields(WC_SPECS, {
        vol: wcVolStr, cycle: wcCycleStr, recovery: wcRecoveryStr, rejection: wcRejectionStr,
        window: wcWindowStr, roCap: wcRoCapStr, tank: wcTankStr, n: wcNStr,
        concN: wcConcNStr, concP: wcConcPStr,
      }),
    [
      wcVolStr, wcCycleStr, wcRecoveryStr, wcRejectionStr, wcWindowStr, wcRoCapStr,
      wcTankStr, wcNStr, wcConcNStr, wcConcPStr,
    ],
  );
  const wcRefusedBy = useMemo(
    () => ({
      balance: refusalLabels(WC_SPECS, wcRefused, WC_READS.balance),
      ro: refusalLabels(WC_SPECS, wcRefused, WC_READS.ro),
      nitriAeration: refusalLabels(WC_SPECS, wcRefused, WC_READS.nitriAeration),
      effluentDischarge: refusalLabels(WC_SPECS, wcRefused, WC_READS.effluentDischarge),
      effluentConcentration: refusalLabels(WC_SPECS, wcRefused, WC_READS.effluentConcentration),
    }),
    [wcRefused],
  );

  // 建物の減価償却 (定額法) — 取得後の建物は定額法。RC造の法定耐用年数は 47 年。
  const [bldgCostStr, setBldgCostStr] = useState('25000000');
  const [bldgLifeStr, setBldgLifeStr] = useState('47');
  const depreciation = useMemo(() => {
    const cost = reNum(bldgCostStr);
    const life = Math.round(reNum(bldgLifeStr));
    // 表は出していないので **スケジュールを組み立てない**。以前は長さを読むためだけに
    // `straightLineSchedule` を呼んでおり、耐用年数に 99999999 と打つと 1 億行を
    // `useMemo` の中で作っていた (実測 1,000 万行で 2.4 秒 / ヒープ 777 MB・1 文字ごとに再計算)。
    // `GuardedNumber` は入力を書き換えない設計なので、上限は計算側で見る。
    return {
      annual: straightLineAnnual(cost, life),
      years: isSchedulableLife(life) ? life : null,
    };
  }, [bldgCostStr, bldgLifeStr]);

  /**
   * **試算の段ごとの ⛔ の欄** (パス 209)。判定そのものは上で計算してあるが、
   * 下の画面は段ごとに「この判定は算定していません」と欄の名前を出す ——
   * 敷地プランナー (パス 206) と同じ形・同じ部品を使う。
   */
  const reRefused = useMemo(
    () =>
      refusedFields(RE_SPECS, {
        rent: reRentStr, price: rePriceStr, expense: reExpenseStr, equity: reEquityStr,
        debt: reDebtStr, loanRate: reLoanRateStr, occupancy: reOccStr,
        discount: npvDiscountStr, holdYears: npvYearsStr, saleNet: npvSaleStr,
        bldgCost: bldgCostStr, bldgLife: bldgLifeStr,
      }),
    [
      reRentStr, rePriceStr, reExpenseStr, reEquityStr, reDebtStr, reLoanRateStr, reOccStr,
      npvDiscountStr, npvYearsStr, npvSaleStr, bldgCostStr, bldgLifeStr,
    ],
  );
  const reRefusedBy = useMemo(
    () => ({
      leverage: refusalLabels(RE_SPECS, reRefused, RE_READS.leverage),
      refined: refusalLabels(RE_SPECS, reRefused, RE_READS.refined),
      dcf: refusalLabels(RE_SPECS, reRefused, RE_READS.dcf),
      depreciation: refusalLabels(RE_SPECS, reRefused, RE_READS.depreciation),
    }),
    [reRefused],
  );

  return (
    <div>
      <StatusBar
        serviceId="real-estate"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>不動産投資 · {properties.length} 物件 / 月次 CF {jpy(portfolio.netCashflow)}</>}
      />

      <Section title="ポートフォリオ KPI" count={4}>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <Stat label="月次キャッシュフロー" value={jpy(portfolio.netCashflow)} positive={portfolio.netCashflow >= 0} />
          <Stat label="ポートフォリオ利回り" value={pct1OrDash(portfolio.portfolioYield)} />
          <Stat label="入居率" value={pct1OrDash(portfolio.occupancyRate === null ? null : portfolio.occupancyRate * 100, 0)} />
          <Stat label="月次家賃収入 (実績)" value={jpy(portfolio.grossRent)} />
        </div>
        {/* **なぜ件数が合わないか**を述べる。文面は `data/investments.ts` が 1 か所で持つ
            (数字だけ直しても、読み手には物件数と平均の分母の違いが読めない)。 */}
        {(yieldNote !== null || rentNote !== null || mixNote !== null) && (
          <div
            data-portfolio-scope
            role="alert"
            style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-mute)', marginBottom: 12 }}
          >
            {/* **合計の中身**を先に言う (見本が混ざっているか・自分の分はいくらか)。 */}
            {mixNote !== null && <div data-portfolio-demo-mix>⚠ {mixNote}</div>}
            {yieldNote !== null && <div>⚠ {yieldNote}</div>}
            {rentNote !== null && <div>⚠ {rentNote}</div>}
          </div>
        )}
      </Section>

      <Section title={editingPropId !== null ? `物件を編集中 — ${propForm.name || '(無題)'}` : '物件を追加 (任意・この端末に保存)'}>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          {editingPropId !== null
            ? '値を書き換えて「保存」すると、KPI・キャッシュフロー・利回りへ即時に自動反映されます。'
            : '追加した物件は上の KPI・下の一覧とキャッシュフローに即時反映され、一覧の「編集」でいつでも入力し直せます。'}
          データはこの端末のブラウザ内 (IndexedDB) にのみ保存され、どこにも送信されません。
        </div>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            物件名
            <input type="text" value={propForm.name} placeholder="例: 福岡市アパート"
              onChange={(e) => setPropForm((f) => ({ ...f, name: e.target.value }))} style={{ ...reInputStyle, width: 180 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            種別
            <select value={propForm.type} onChange={(e) => setPropForm((f) => ({ ...f, type: e.target.value }))}
              style={{ ...reInputStyle, width: 130 }}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <GuardedNumber spec={PROPERTY_FORM_SPECS.monthlyRent} value={propForm.monthlyRent} placeholder="100000"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyRent: v }))} />
          <GuardedNumber spec={PROPERTY_FORM_SPECS.purchasePrice} value={propForm.purchasePrice} placeholder="12000000"
            onChange={(v) => setPropForm((f) => ({ ...f, purchasePrice: v }))} />
          <GuardedNumber spec={PROPERTY_FORM_SPECS.monthlyExpenses} value={propForm.monthlyExpenses} placeholder="0"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyExpenses: v }))} />
          <GuardedNumber spec={PROPERTY_FORM_SPECS.monthlyLoan} value={propForm.monthlyLoan} placeholder="0"
            onChange={(v) => setPropForm((f) => ({ ...f, monthlyLoan: v }))} />
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={propForm.occupied}
              onChange={(e) => setPropForm((f) => ({ ...f, occupied: e.target.checked }))} />
            入居中
          </label>
          <button type="button" onClick={() => void submit.run(onSaveProperty)} disabled={submit.busy}>
            {editingPropId !== null ? '保存 (自動反映)' : '＋ 物件を追加'}
          </button>
          {editingPropId !== null && (
            <button type="button" onClick={onCancelEditProperty} style={{ color: 'var(--text-mute)' }}>
              キャンセル
            </button>
          )}
        </div>
        {propError && <div style={{ color: '#f87171', fontSize: 12 }}>{propError}</div>}
      </Section>

      <Section title="保有物件" count={properties.length}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>物件名</th>
              <th style={thStyle}>種別</th>
              <th style={thNum}>家賃 (月)</th>
              <th style={thNum}>取得価格</th>
              <th style={thNum}>表面利回り</th>
              <th style={thNum}>実質利回り (入居反映)</th>
              <th style={thStyle}>入居</th>
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const y = calcRealEstateYield(p.monthlyRent, p.purchasePrice, p.occupied ? 1 : 0);
              return (
              <tr key={p.rowId}>
                <td style={tdStyle}>
                  {p.name}
                  {!p.user && (
                    <span style={{ marginLeft: 6, padding: '1px 6px', background: 'var(--bg-elev)', color: 'var(--text-mute)', borderRadius: 3, fontSize: 10 }}>
                      デモ
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{p.type}</td>
                <td style={tdNum}>{jpy(p.monthlyRent)}</td>
                <td style={tdNum}>{jpyM(p.purchasePrice)}</td>
                {/* 価格が読めない行は「—」。パス 54 は平均だけを直して**行を残していた** ——
                    平均が測れた物件だけで出るなら、行も測れなかったことを言う。 */}
                <td style={tdNum}>{pct1OrDash(y.grossYieldPct)}</td>
                <td style={tdNum}>{pct1OrDash(y.netYieldPct)}</td>
                <td style={tdStyle}>
                  <span style={{ color: p.occupied ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {p.occupied ? '● 入居中' : '○ 空室'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {p.user && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" onClick={() => onStartEditProperty(p.rowId, p)} style={{ fontSize: 11 }}>
                        編集
                      </button>
                      <button type="button" onClick={() => removeProperty(p.rowId)} style={{ fontSize: 11, color: '#f87171' }}>
                        削除
                      </button>
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <ServiceActionPanel serviceId="real-estate" serviceLabel="不動産投資" adviseInput={adviseInput} />

      <Section title="月次キャッシュフロー内訳" count={4}>
        <table style={tableStyle}>
          <tbody>
            <tr><td style={tdStyle}>家賃収入 (実績、空室除外)</td><td style={tdNum}>{jpy(portfolio.grossRent)}</td></tr>
            <tr><td style={tdStyle}>運営費用</td><td style={tdNum}>−{jpy(portfolio.operatingExpenses)}</td></tr>
            <tr><td style={tdStyle}>ローン返済</td><td style={tdNum}>−{jpy(portfolio.mortgagePayment)}</td></tr>
            <tr style={{ background: 'var(--bg-elev)' }}>
              <td style={{ ...tdStyle, fontWeight: 700 }}>純キャッシュフロー</td>
              <td style={{ ...tdNum, fontWeight: 700, color: portfolio.netCashflow >= 0 ? '#22c55e' : '#ef4444' }}>{jpy(portfolio.netCashflow)}</td>
            </tr>
          </tbody>
        </table>
        {userProps.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6, lineHeight: 1.6 }}>
            ※ 追加した {userProps.length} 物件の家賃・経費・返済を含めて再計算しています (デモ物件の経費・返済は既定値)。
          </div>
        )}
      </Section>

      <Section title="レバレッジ試算 (CCR・イールドギャップ)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金回収率 (CCR) と イールドギャップ (実質利回り − ローン金利) の目安です。
          イールドギャップがプラスなら借入が収益にプラスに働きます (正レバレッジ)。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [RE_SPECS.rent, reRentStr, setReRentStr],
            [RE_SPECS.price, rePriceStr, setRePriceStr],
            [RE_SPECS.expense, reExpenseStr, setReExpenseStr],
            [RE_SPECS.equity, reEquityStr, setReEquityStr],
            [RE_SPECS.debt, reDebtStr, setReDebtStr],
            [RE_SPECS.loanRate, reLoanRateStr, setReLoanRateStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} />
          ))}
        </div>
        {reRefusedBy.leverage.length > 0 ? (
          <RefusedFieldsNote labels={reRefusedBy.leverage} />
        ) : (
          <>
        <div className="stat-grid">
          <Stat label="実質利回り" value={pct1OrDash(leverage.y.netYieldPct, 2)} />
          <Stat label="返済後CF (年)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
          <Stat label="CCR (自己資金回収率)" value={pct1OrDash(leverage.lev.cashOnCashReturnPct, 2)} />
          {/* **算定不能から判定を作らない。** `positive` は色 (緑/赤) を決めるので、
              null に `?? 0` を当てると「ちょうど 0 = 正レバレッジ」と塗ってしまう。
              出せないときは色を付けない (undefined を渡す)。 */}
          <Stat
            label="イールドギャップ"
            value={pct1OrDash(leverage.lev.yieldGapPct, 2)}
            positive={positiveIfKnown(leverage.lev.yieldGapPct)}
          />
        </div>
        {(leverageNote !== null || priceNote !== null) && (
          <div
            data-leverage-scope
            role="alert"
            style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}
          >
            {priceNote !== null && <div>⚠ {priceNote}</div>}
            {leverageNote !== null && <div>⚠ {leverageNote}</div>}
          </div>
        )}
          </>
        )}
      </Section>

      <Section title="精緻化指標 (NOI 利回り・DSCR・損益分岐入居率)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          上の試算入力に想定入居率を加え、空室損を控除した NOI ベースで評価します。
          DSCR は NOI ÷ 年間返済額で、<strong>{fmtDscr(dscrT.danger)} 未満は危険水域</strong>、{fmtDscr(dscrT.caution)} 以上が目安。
          損益分岐入居率を実際の入居率が下回ると赤字に転じます。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={RE_SPECS.occupancy} value={reOccStr} onChange={setReOccStr} />
        </div>
        {reRefusedBy.refined.length > 0 ? (
          <RefusedFieldsNote labels={reRefusedBy.refined} />
        ) : (
        <div className="stat-grid">
          <Stat label="NOI (年)" value={jpy(refined.noiY.noi)} positive={refined.noiY.noi >= 0} />
          <Stat label="NOI 利回り" value={refined.noiY.noiYieldPct === null ? '—' : `${refined.noiY.noiYieldPct}%`} />
          <Stat
            label="DSCR"
            value={refined.dscr.dscr === null ? '—' : refined.dscr.dscr.toFixed(2)}
            positive={refined.dscr.band === 'healthy'}
          />
          <Stat label="損益分岐入居率" value={refined.ber === null ? '—' : `${refined.ber}%`} />
        </div>
        )}
      </Section>

      <Section title="NPV / IRR (割引キャッシュフロー試算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          自己資金を初期投資 (マイナス)、各年の返済後CF、最終年に売却ネット手取りを加えた
          キャッシュフロー列から NPV (割引率指定) と IRR (二分法で概算) を求めます。
          IRR は NPV がゼロになる割引率の目安です。
          <strong>※ 概算であり投資助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [RE_SPECS.discount, npvDiscountStr, setNpvDiscountStr],
            [RE_SPECS.holdYears, npvYearsStr, setNpvYearsStr],
            [RE_SPECS.saleNet, npvSaleStr, setNpvSaleStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} />
          ))}
        </div>
        {reRefusedBy.dcf.length > 0 ? (
          <RefusedFieldsNote labels={reRefusedBy.dcf} />
        ) : (
        <div className="stat-grid">
          <Stat label={`NPV (${dcf.years}年・割引後)`} value={dcf.npv === null ? '—' : jpy(dcf.npv)} positive={positiveIfKnown(dcf.npv)} />
          <Stat label="IRR (年率概算)" value={dcf.irr === null ? '—' : `${(dcf.irr * 100).toFixed(2)}%`} positive={positiveIfKnown(dcf.irr)} />
          <Stat label="返済後CF (年・前提)" value={jpy(leverage.lev.annualCashflow)} positive={leverage.lev.annualCashflow >= 0} />
        </div>
        )}
      </Section>

      <Section title="建物の減価償却 (定額法・概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          建物 (1998年4月以降取得) は定額法。法定耐用年数は構造で異なります (RC造 47年 / 重量鉄骨 34年 / 木造 22年)。
          減価償却費は会計上の費用で節税に寄与しますが、<strong>※ 概算であり税務助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={RE_SPECS.bldgCost} value={bldgCostStr} onChange={setBldgCostStr} />
          <GuardedNumber spec={RE_SPECS.bldgLife} value={bldgLifeStr} onChange={setBldgLifeStr} />
        </div>
        {reRefusedBy.depreciation.length > 0 ? (
          <RefusedFieldsNote labels={reRefusedBy.depreciation} />
        ) : (
        <div className="stat-grid">
          <Stat label="年間減価償却費 (定額法)" value={jpy(depreciation.annual)} />
          {/* **数を刷る枠に案内文を入れない** (パス 209)。`Stat` の値は「測った数」の
              置き場で、直し方は欄の ⛔ が既に述べている。算定できないなら「—」。 */}
          <Stat label="償却年数" value={depreciation.years === null ? DASH : `${depreciation.years} 年`} />
        </div>
        )}
      </Section>

      <Section title="敷地プランナー — 建てられる規模と工場150㎡プラン (概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          用途地域の建ぺい率・容積率・前面道路幅員から<strong>建築面積と延べ床面積の上限</strong>を概算し、
          近隣商業地域で植物工場などを計画する際の<strong>「作業場 150 ㎡以下 + 直売・カフェ併設」プラン</strong>を試算します。
          建ぺい率・容積率は都市計画で土地ごとに指定されるため、実際の指定値に書き換えてください。
          <strong>※ 概算であり建築・法務助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            用途地域プリセット
            <select value={zoneKey} onChange={(e) => onZonePreset(e.target.value as (typeof ZONE_PRESETS)[number]['key'])} style={{ ...reInputStyle, width: 160 }}>
              {ZONE_PRESETS.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
            </select>
          </label>
          {([
            [ZONING_SPECS.site, zpSiteStr, setZpSiteStr],
            [ZONING_SPECS.coverage, zpCovStr, setZpCovStr],
            [ZONING_SPECS.far, zpFarStr, setZpFarStr],
            [ZONING_SPECS.road, zpRoadStr, setZpRoadStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} width={110} />
          ))}
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            道路乗数の区分
            <select value={zpCat} onChange={(e) => setZpCat(e.target.value as RoadMultiplierCategory)} style={{ ...reInputStyle, width: 150 }}>
              <option value="other">商業系ほか ({zRules.roadFarMultiplierOther / 10}/10)</option>
              <option value="residential">住居系 ({zRules.roadFarMultiplierResidential / 10}/10)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={zpCorner} onChange={(e) => setZpCorner(e.target.checked)} />
            角地 (+{zRules.cornerLotBonusPct}%)
          </label>
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={zpFireproof} onChange={(e) => setZpFireproof(e.target.checked)} />
            防火地域内の耐火建築物
          </label>
        </div>
        {zoning.refused.site.length > 0 ? (
          <RefusedFieldsNote labels={zoning.refused.site} />
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 14 }}>
              <Stat label="適用建ぺい率" value={`${zoning.site.effectiveCoveragePct}%`} />
              <Stat label="建築面積の上限" value={`${zoning.site.maxFootprint.toLocaleString()} ㎡`} />
              <Stat
                label={zoning.site.roadLimitedFarPct !== null && zoning.site.roadLimitedFarPct < reNum(zpFarStr) ? '実効容積率 (道路幅員で制限)' : '実効容積率'}
                value={`${zoning.site.effectiveFarPct}%`}
              />
              <Stat label="延べ床面積の上限" value={`${zoning.site.maxTotalFloor.toLocaleString()} ㎡`} />
            </div>
            {zoning.site.floorsToUseAll !== null && zoning.site.floorsToUseAll > 1 && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12 }}>
                延べ床上限を使い切るには約 {zoning.site.floorsToUseAll} フロア相当の計画になります。
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>📐 高さ制限 (道路斜線・日影規制)</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={ZONING_SPECS.height} value={zpHeightStr} onChange={setZpHeightStr} width={130} />
          <GuardedNumber spec={ZONING_SPECS.setback} value={zpSetbackStr} onChange={setZpSetbackStr} width={130} />
          <GuardedNumber spec={ZONING_SPECS.shadowThreshold} value={zpShadowThresholdStr} onChange={setZpShadowThresholdStr} width={130} />
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            日影規制の対象区域か (条例指定)
            <select value={zpShadowArea} onChange={(e) => setZpShadowArea(e.target.value as 'unknown' | 'yes' | 'no')} style={{ ...reInputStyle, width: 180 }}>
              <option value="unknown">未確認 (自治体に照会)</option>
              <option value="yes">対象区域</option>
              <option value="no">対象外</option>
            </select>
          </label>
        </div>
        {zoning.refused.height.length > 0 ? (
          <RefusedFieldsNote labels={zoning.refused.height} />
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 10 }}>
              <Stat label="道路斜線の高さ限度" value={`${zoning.slope.limitM.toLocaleString()} m`} />
              <Stat label={zoning.slope.ok ? '余裕' : '超過'} value={`${Math.abs(zoning.slope.marginM).toLocaleString()} m`} />
              <Stat label="この高さに必要な最小後退" value={`${zoning.slope.minSetbackM.toLocaleString()} m`} />
              <Stat label="日影規制を避けられる上限" value={`${zoning.shadow.maxHeightToAvoidM.toLocaleString()} m`} />
            </div>
            {!zoning.slope.ok && (
              <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
                道路斜線を超えています — 後退を {zoning.slope.minSetbackM} m 以上取るか、高さを {zoning.slope.limitM} m 以下に抑える必要があります。
              </div>
            )}
            {zoning.shadow.regulated === null && zoning.shadow.exceedsThreshold && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>
                計画高さが {zoning.shadow.thresholdM} m を超えています。日影規制の対象区域かどうかは<strong>自治体の条例指定</strong>なのでここでは判定できません
                — 建築指導課に照会してください。対象だった場合は最高高さを {zoning.shadow.maxHeightToAvoidM} m 以下に抑えると対象から外れます。
              </div>
            )}
            {zoning.shadow.regulated === true && (
              <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
                日影規制の対象です — 最高高さを {zoning.shadow.maxHeightToAvoidM} m 以下にすると対象から外れます (現在 {Math.abs(zoning.shadow.headroomM)} m 超過)。
              </div>
            )}
          </>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>↔️ 後退と建築面積のトレードオフ</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={ZONING_SPECS.siteDepth} value={zpSiteDepthStr} onChange={setZpSiteDepthStr} width={120} />
          <GuardedNumber spec={ZONING_SPECS.siteWidth} value={zpSiteWidthStr} onChange={setZpSiteWidthStr} width={120} />
          <GuardedNumber spec={ZONING_SPECS.rear} value={zpRearStr} onChange={setZpRearStr} width={120} />
          <GuardedNumber spec={ZONING_SPECS.side} value={zpSideStr} onChange={setZpSideStr} width={120} />
        </div>
        {zoning.refused.tradeoff.length > 0 ? (
          <RefusedFieldsNote labels={zoning.refused.tradeoff} />
        ) : (
          <>
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <Stat label="斜線を通す最小後退" value={`${zoning.tradeoff.requiredSetbackM.toLocaleString()} m`} />
          <Stat label="建てられる奥行" value={metresOrDash(zoning.tradeoff.buildableDepthM)} />
          <Stat label="建てられる間口" value={metresOrDash(zoning.tradeoff.buildableWidthM)} />
          {/* **ラベルも主張である。** 「寸法で決まる」は寸法が拘束条件だと述べる文なので、
              寸法が未入力のときは何が縛っているかを名指ししない。 */}
          <Stat
            label={
              zoning.tradeoff.limitedBy === null
                ? '建築面積'
                : zoning.tradeoff.limitedBy === 'coverage'
                  ? '建築面積 (建ぺい率で頭打ち)'
                  : '建築面積 (寸法で決まる)'
            }
            value={sqmOrDash(zoning.tradeoff.footprint)}
          />
        </div>
        {/* **未入力から「建てられない敷地」を作らない。** 欄は `kind: 'length'` なので
            0 は受け付けない値であり、空欄は「まだ分からない」である。 */}
        {zoning.tradeoff.footprint === null && (
          <div data-site-dimensions-unset style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 10 }}>
            敷地の{zoning.tradeoff.buildableDepthM === null && zoning.tradeoff.buildableWidthM === null
              ? '奥行と間口'
              : zoning.tradeoff.buildableDepthM === null
                ? '奥行'
                : '間口'}が未入力のため、建てられる寸法と建築面積は算定していません（測量図の値を入力してください）。
            斜線を通す最小後退 {zoning.tradeoff.requiredSetbackM} m は道路幅員・用途区分・計画高さだけで決まるので、寸法に依らず有効です。
          </div>
        )}
          </>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 14 }}>
          高さを下げると必要な後退が減り、その分だけ奥行を使えます。建ぺい率の上限に当たるまでは、高さを削るほど建築面積が増えます。
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🧊 立体プレビュー (分解アイソメ)</div>
        {/* 寸法が未入力なら**描かない**。0×0 の箱と「間口 0 m × 奥行 0 m で…の概形」は、
            未入力から作った図であって「建てられない」の図ではない。 */}
        {zoning.refused.iso.length > 0 ? (
          <RefusedFieldsNote labels={zoning.refused.iso} />
        ) : zoning.isoWidth === null || zoning.isoDepth === null ? (
          <div data-iso-unset style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 14 }}>
            敷地の奥行と間口が未入力のため、立体プレビューは描いていません（寸法を入力すると概形が出ます）。
          </div>
        ) : (
          <>
            {/* **図が延べ床を全部載せられなかったら言う。** この図の主題は
                「上階に何層積むことになるか」なので、層を落とすことは主題を
                落とすこと (パス 104)。数字は図の値から出す — 写さない。 */}
            {zoning.schematic.unplacedSqm > 0 && (
              <div
                role="alert"
                data-iso-truncated
                style={{
                  fontSize: 12,
                  lineHeight: 1.6,
                  marginBottom: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--warn, #d97706)',
                  color: 'var(--warn, #d97706)',
                }}
              >
                ⚠ この延べ床には <b>{zoning.schematic.floorsNeeded.toLocaleString()} 階</b>{' '}
                必要ですが、立体プレビューは <b>{zoning.schematic.floors.length.toLocaleString()} 階</b>{' '}
                までしか描けません。<b>{zoning.schematic.unplacedSqm.toLocaleString()} ㎡</b>{' '}
                が図に含まれていないため、<b>図の高さと床面積を実際の計画として読まないでください</b>
                （下の「2階以上に回せる面積」が正しい数字です）。
              </div>
            )}
            <BuildingIso
              widthM={zoning.isoWidth}
              depthM={zoning.isoDepth}
              floors={zoning.schematic.floors}
              caption={`模式図です。間口 ${zoning.isoWidth.toLocaleString()} m × 奥行 ${zoning.isoDepth.toLocaleString()} m で、作業場を 1 階に敷き、残る延べ床を上階へ積んだ場合の概形。作業場を上階に置くと 150 ㎡ の合計制限を超えるため、緑は 1 階にしか出ません。`}
            />
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>🌱 工場プラン (作業場 + 直売・カフェ併設)</div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          <GuardedNumber spec={ZONING_SPECS.workshopCap} value={zpCapStr} width={150} onChange={setZpCapStr} />
          <GuardedNumber spec={ZONING_SPECS.workshopDesired} value={zpWorkshopStr} width={170} onChange={setZpWorkshopStr} />
        </div>
        {zoning.refused.factory.length > 0 ? (
          <RefusedFieldsNote labels={zoning.refused.factory} />
        ) : (
          <>
            {zoning.factory.overCap && (
              <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>
                希望の作業場面積が法定上限を超えています — この用途地域では建てられないため、面積の縮小か準工業地域などの立地見直しが必要です。
              </div>
            )}
            <div className="stat-grid" style={{ marginBottom: 10 }}>
              <Stat label="作業場 (栽培室等)" value={`${zoning.factory.workshopArea.toLocaleString()} ㎡`} />
              <Stat label="1階の残り (直売・カフェ・事務)" value={`${zoning.factory.groundFloorOther.toLocaleString()} ㎡`} />
              <Stat label="2階以上に回せる面積" value={`${zoning.factory.upperFloorsArea.toLocaleString()} ㎡`} />
              <Stat
                label="作業場の延べ床比率"
                value={zoning.factory.workshopSharePct === null ? '—' : `${zoning.factory.workshopSharePct}%`}
              />
            </div>
          </>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          ※ 近隣商業地域・商業地域では、原動機を使用する工場は<strong>作業場の床面積合計 150 ㎡以下</strong>に制限されます
          (建築基準法48条・別表第二(り)項1号・(ぬ)項2号。日刊新聞印刷所・300㎡以下の自動車修理工場は例外)。
          150 ㎡は栽培室など<strong>実際に作業する部分</strong>で判定され、事務所・直売所などは作業場に算入しない取扱いが
          一般的なため、切り分けが設計の要点です。準住居は 50 ㎡、準工業・工業に面積上限はありません。
          建ぺい率は 60/80% の二択・容積率は 100〜500% から都市計画で指定 (53条1項3号・52条1項2号)。
          角地 +{zRules.cornerLotBonusPct}%・防火地域内の耐火建築物等 +{zRules.fireproofBonusPct}% (指定 {zRules.fireproofExemptionCoveragePct}% 区域は適用除外 = 100%) は53条3項・6項、
          前面道路 {zRules.roadFarWidthThresholdM}m 未満の容積率制限 (幅員 × 住居系 {zRules.roadFarMultiplierResidential / 10}/10・その他 {zRules.roadFarMultiplierOther / 10}/10 の低い方) は52条2項、
          道路斜線の勾配 (住居系 {zRules.roadSlopeResidential}・その他 {zRules.roadSlopeOther}) は別表第三によります。
          <strong>見落としやすい規制:</strong> 近隣商業は条例指定区域で高さ 10m 超に日影規制が適用され (商業地域は対象外・法56条の2)、
          空調室外機・コンプレッサ等は騒音規制法の特定施設届出、一定規模超は駐車場附置義務条例の対象になりえます
          (工場立地法は農業 = 植物工場には不適用)。
          屋内栽培施設を「工場」としてどう扱うかは特定行政庁の個別判断です (令和2年 国住街第80号 技術的助言参照) —
          <strong>最終判断は必ず自治体の建築指導課への事前相談と建築確認で行ってください。</strong>
          LED の遮光・空調騒音・深夜搬出入への配慮は、住宅が混在しやすい近隣商業地域では特に重要です。
        </div>
      </Section>

      <Section title="水循環プランナー — クローズド水耕の水収支と機材規模 (概算)">
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 10 }}>
          有機水耕の閉ループ (生物処理 → 前処理 → RO) の<strong>水収支・RO 稼働率・硝化のアルカリ度消費・
          曝気タンクの滞留時間・排水の法規制</strong>を試算します。「排水を 100% 再利用」は物質収支上成立しない
          (濃縮廃液の排出が塩類の唯一の出口) こと、バッチ運転だと RO 膜が止水して詰まることを数値で確認できます。
          <strong>※ 概算であり設計・水処理・法務の専門助言ではありません。</strong>
        </div>
        <div className="field-grid" style={{ marginBottom: 12 }}>
          {([
            [WC_SPECS.vol, wcVolStr, setWcVolStr],
            [WC_SPECS.cycle, wcCycleStr, setWcCycleStr],
            [WC_SPECS.recovery, wcRecoveryStr, setWcRecoveryStr],
            [WC_SPECS.rejection, wcRejectionStr, setWcRejectionStr],
            [WC_SPECS.window, wcWindowStr, setWcWindowStr],
            [WC_SPECS.roCap, wcRoCapStr, setWcRoCapStr],
            [WC_SPECS.tank, wcTankStr, setWcTankStr],
            [WC_SPECS.n, wcNStr, setWcNStr],
            [WC_SPECS.concN, wcConcNStr, setWcConcNStr],
            [WC_SPECS.concP, wcConcPStr, setWcConcPStr],
          ] as const satisfies readonly (readonly [NumSpec, string, (v: string) => void])[]).map(([spec, val, setter]) => (
            <GuardedNumber key={spec.label} spec={spec} value={val} onChange={setter} width={130} />
          ))}
          <label style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
            <input type="checkbox" checked={wcToPublic} onChange={(e) => setWcToPublic(e.target.checked)} />
            濃縮液を公共用水域へ放流
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>💧 水収支 (1 バッチ)</div>
        {wcRefusedBy.balance.length > 0 ? (
          <RefusedFieldsNote labels={wcRefusedBy.balance} />
        ) : (
          <>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="再利用する透過水" value={litersOrDash(water.balance.permeatePerBatchL)} />
          <Stat label="排出する濃縮廃液" value={litersOrDash(water.balance.concentratePerBatchL)} />
          <Stat label="補給する新水" value={litersOrDash(water.balance.freshMakeupPerBatchL)} />
          <Stat
            label="濃縮倍率"
            value={water.balance.concentrationFactor === null ? '∞ (排出口なし)' : `${water.balance.concentrationFactor}倍`}
          />
        </div>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          {/* **`${null}` は型検査を素通りして "null%" を刷る。** この 2 つは
              テンプレートリテラルだったので `tsc` は何も言わなかった —— 明示的に分ける。 */}
          <Stat label="実際の水回収率" value={pct1OrDash(water.balance.recoveryPct)} />
          <Stat label="年間節水量" value={litersOrDash(water.balance.annualWaterSavedL)} />
          <Stat label="年間排出量" value={litersOrDash(water.balance.annualDischargeL)} />
          <Stat label="透過水の EC 持ち越し" value={pct1OrDash(water.balance.permeateEcCarryoverPct)} />
        </div>
        {/* **未入力を「回収率が足りない」ことにしない。** 欄は `min: 1, max: 99` なので
            0 は画面が受け付けない値であり、空欄は「まだ分からない」である。 */}
        {water.balance.recoveryPct === null && (
          <div data-recovery-unset style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
            RO 回収率が未入力のため、水収支 (透過水・濃縮廃液・節水量・排出量) は算定していません（膜の仕様値を入力してください）。
          </div>
        )}
        {water.balance.recoveryPct !== null && water.balance.recoveryPct >= 100 && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            回収率 100% は物質収支上成立しません — 排出をゼロにすると塩類が無限に蓄積します。ブリード (濃縮廃液の排出) が塩類の唯一の出口です。
          </div>
        )}
        {water.balance.accumulationRisk === true && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ RO 塩除去率が 90% 未満です — 透過水に 10% 超の塩が残り、閉ループで特定イオンが蓄積しやすくなります。
          </div>
        )}
        {/* **未入力を警告にしない。** 欄の定義は `min: 1` なので 0 は画面が
            受け付けない値であり、「除去率が低い」ではなく「まだ分からない」。 */}
        {water.balance.accumulationRisk === null && (
          <div data-rejection-unset style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
            RO 塩除去率が未入力のため、塩類蓄積の判定はしていません（膜の仕様値を入力してください）。
          </div>
        )}
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🔧 RO 稼働率と膜の保護</div>
        {wcRefusedBy.ro.length > 0 ? (
          <RefusedFieldsNote labels={wcRefusedBy.ro} />
        ) : (
          <>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="必要な RO 能力" value={`${Math.round(water.ro.requiredCapacityLPerDay).toLocaleString()} L/日`} />
          <Stat label="実処理時間" value={water.ro.actualProcessingHours === null ? '—' : `${water.ro.actualProcessingHours} h`} />
          <Stat label="稼働率 (周期比)" value={water.ro.dutyCyclePct === null ? '—' : `${water.ro.dutyCyclePct}%`} />
          <Stat label="連続止水日数" value={water.ro.idleDays === null ? '—' : `${water.ro.idleDays} 日`} />
        </div>
        {water.ro.capacityAdequate === false && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            導入予定の RO 機では目標時間内にバッチを処理しきれません。能力の大きい機種か処理時間の延長が必要です。
          </div>
        )}
        {water.ro.stagnationRisk && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ 交換周期が長く RO 膜が大半の時間止水します — バイオフィルムが育ち、この設計が防ごうとしている目詰まりを運用で作ってしまいます。
            <strong>日々少量を入れ替える連続循環</strong>に変えるか、停止中の<strong>自動フラッシュ</strong>を制御に入れてください。
          </div>
        )}
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>🧪 硝化・アルカリ度・曝気</div>
        {wcRefusedBy.nitriAeration.length > 0 ? (
          <RefusedFieldsNote labels={wcRefusedBy.nitriAeration} />
        ) : (
          <>
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          <Stat label="硝化する窒素" value={`${water.nitri.nitrogenLoadG} g`} />
          <Stat label="消費アルカリ度" value={`${water.nitri.alkalinityConsumedGCaCO3} g (CaCO₃)`} />
          <Stat label="酸素要求量" value={`${water.nitri.oxygenDemandG} g`} />
          <Stat label="曝気タンク HRT" value={water.aeration.hrtHours === null ? '—' : `${water.aeration.hrtHours} h`} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, lineHeight: 1.7 }}>
          給水は緩衝能ゼロの RO 水なので、消費したアルカリ度を戻さないと pH 制御が発振します。
          炭酸水素カリウムなら約 <strong>{water.nitri.khco3ToRedoseG} g</strong> の再付与が目安です。
          {water.aeration.adequate === false && (
            <span style={{ color: 'var(--warning)' }}>
              {' '}⚠ 曝気タンクの滞留時間 (HRT) が 24h 未満です — 有機物の無機化が不十分だと下流の膜が詰まります。
              目安タンク容量は約 {Math.round(water.aeration.requiredTankVolumeL).toLocaleString()} L。
            </span>
          )}
        </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 8px' }}>⚖️ 濃縮廃液の排出</div>
        {/* **排出「量」と排出「濃度」は依存が違うので、断りも分ける** (パス 210)。
            排出量の 3 タイルは `balance.annualDischargeL` を通すので水収支の欄も読むが、
            地下水基準比は濃度だけで決まる (下のコメントが以前からそう述べている) ——
            ⛔ 1 件で節全体を黙らせない。 */}
        {wcRefusedBy.effluentDischarge.length > 0 ? (
          <RefusedFieldsNote labels={wcRefusedBy.effluentDischarge} />
        ) : (
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          {/* **`${null}` は "null kg" を刷る。** ここも template literal なので
              `tsc` は最後まで何も言わなかった —— 明示的に分ける。 */}
          <Stat label="年間 窒素排出" value={water.effluent.annualNitrogenKg === null ? '—' : `${water.effluent.annualNitrogenKg} kg`} />
          <Stat label="年間 りん排出" value={water.effluent.annualPhosphorusKg === null ? '—' : `${water.effluent.annualPhosphorusKg} kg`} />
          <Stat label="1日あたり排出" value={water.effluent.dailyDischargeM3 === null ? '—' : `${water.effluent.dailyDischargeM3} m³`} />
        </div>
        )}
        {wcRefusedBy.effluentConcentration.length > 0 ? (
          <RefusedFieldsNote labels={wcRefusedBy.effluentConcentration} />
        ) : (
        <div className="stat-grid" style={{ marginBottom: 8 }}>
          {/* 地下水基準比は濃度だけで決まるので、排出量が不明でも算定できる。 */}
          <Stat label="地下水基準比 (硝酸性N)" value={`${water.effluent.nitrateVsGroundwaterFactor}倍`} />
        </div>
        )}
        {/* **法規制の当てはまりを「当てはまらない」に倒さない。**
            `wpclNpApplicable === null` は「排出量が分からないので判定していない」。
            falsy なので黙って消えるが、黙ると「対象外」と読まれる。 */}
        {wcRefusedBy.effluentDischarge.length === 0 && water.effluent.wpclNpApplicable === null && (
          <div data-wpcl-undetermined style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
            年間排出量が算定できていないため、水質汚濁防止法の窒素・りん規制の対象かは判定していません（RO 回収率を入力してください）。
          </div>
        )}
        {wcRefusedBy.effluentDischarge.length === 0 && water.effluent.recommendReuse && (
          <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 8 }}>
            ⚠ 濃縮廃液の窒素・りんが一律排水基準を超えています。この液は硝酸・カリ・りん酸が濃縮された<strong>液肥そのもの</strong>なので、
            放流せず<strong>露地・土耕へ希釈施用</strong>するのが技術的にも法的にも安全です (捨てれば産業廃棄物・地下水の硝酸汚染の問題になります)。
          </div>
        )}
        {wcRefusedBy.effluentDischarge.length === 0 && water.effluent.wpclNpApplicable === true && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>
            排出水量が {effStd.npApplicabilityM3PerDay} m³/日以上のため、水質汚濁防止法の窒素・りん規制の対象になりえます。届出と処理設備が必要です。
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          ※ 硝化は窒素 1mg あたり CaCO₃ 換算 7.14mg のアルカリ度を消費し、酸素 4.57mg を要します (硝化の化学量論)。
          地下水の環境基準は硝酸性窒素及び亜硝酸性窒素で {effStd.groundwaterNitrateNMgL}mg/L、公共用水域への一律排水基準は全窒素 {effStd.tnUniformMgL}mg/L・全りん {effStd.tpUniformMgL}mg/L
          (閉鎖性水域の日間平均は {EFFLUENT_TN_DAILY_AVG_MG_L} / {EFFLUENT_TP_DAILY_AVG_MG_L}mg/L) が目安です。<strong>実際の適用は自治体の上乗せ条例・地域指定・排出規模で変わる</strong>ため、
          放流を伴う場合は必ず自治体の環境部局に確認してください。濃縮廃液を捨てずに再利用すれば、これらの規制の多くを回避できます。
        </div>
      </Section>
    </div>
  );
}

