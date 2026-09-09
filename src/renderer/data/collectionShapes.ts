/**
 * record store の各 collection が持つ**中身の形** —— バックアップの復元が封筒しか見ていなかった穴。
 *
 * `store.importAll()` は `isValidStoredRecord` で封筒 (id / collection / createdAt / updatedAt /
 * data がオブジェクト) だけを確かめ、`data` の中身はどの collection でも素通しだった (2026-09-05 実測)。
 * SHA-256 は破損を検知するが、手で直した・別の版のアプリが書いた・別の道具が作ったバックアップは
 * 検査数字が合った上で `amount: "abc"` や `channel: 5` を持ち込める。読む側は `useCollection<SalesEntry>`
 * の型を信じるので、合計が NaN になる・並べ替えで `localeCompare` が投げる (画面の境界が受けるが、
 * その画面はレコードを消すまで開けない)。localStorage の読み取りで塞いだのと同じ穴が IndexedDB の
 * 入口にもあった。
 *
 * ## 方針
 * - **挙げた欄だけ見る。知らない欄は通す** (新しい版が足した欄を古い版の復元で落とさない)。
 * - **必須 (`req`) は最初からある中核の欄だけ。** 後から足された欄・読む側が既定値で補う欄は
 *   `opt` (無ければ通す・在るなら型を見る)。落とし過ぎは復元の欠落 = 別の事故になる。
 * - 列挙値の一覧は**書く側の 1 つ**を参照する (写さない)。参照は関数の中で解決する —— この
 *   モジュールは `store.ts` から読まれ、`store.ts` は多くのデータモジュールから読まれるので、
 *   モジュール評価時に他モジュールの定数へ触ると読み込み順で TDZ になり得る。
 * - 知らない collection は通す (前方互換)。既知の collection が漏れていないことは
 *   `collectionShapes.test.ts` が `*_COLLECTION` 定数の走査で留める。
 * - 封緘済み (`__enc`) の中身は見られないので、呼び出し側が先に除ける。
 */
import { SALES_CHANNELS } from './sales';
import { CONSULTATION_STATUSES } from './shigyoDirectory';
import { METRIC_UNITS } from './overviewOverrides';
import { ROLE_ORDER } from '../../shared/team';
import { isCalendarDate, isCalendarDateOrMonth } from '../../shared/isoDate';

type Rec = Record<string, unknown>;
type Check = (v: unknown) => boolean;

const str: Check = (v) => typeof v === 'string';
/** 数値。`Number.isFinite` は数値以外・NaN・±Infinity に false (typeof は要らない)。 */
const num: Check = (v) => Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const rec: Check = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr: Check = (v) => Array.isArray(v);
const any: Check = () => true;
/** 無ければ通す (古い版の記録)。在るなら型を見る。null は「在るのに違う」。 */
const opt =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);
/**
 * 在るなら「null か型どおり」。**null を値として書く欄だけ**に使う —— 年初来リターン (パス 122) と
 * 取得額 (パス 123) の未入力 (`investments.ts`)。他の欄の null は今までどおり「在るのに違う」。
 */
const orNull =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
/**
 * 列挙値。一覧は呼ばれた時に解く (モジュール評価時に他モジュールへ触らない)。
 * `includes` は === で照合するので、文字列以外は typeof を挟まなくても落ちる (挟むと等価変異が残る)。
 */
const oneOf =
  (values: () => readonly string[]): Check =>
  (v) =>
    (values() as readonly unknown[]).includes(v);
/** 値がすべて数値の辞書 (`parameter-overrides.values`)。 */
const numRec: Check = (v) => rec(v) && Object.values(v as Rec).every((n) => num(n));
/** 暦に在る `YYYY-MM-DD` (判定は `shared/isoDate.ts`)。型だけ見て `2026-02-30` を通していた (パス 115)。 */
const calendarDate: Check = (v) => isCalendarDate(v);
/** 未入力 ('') か、暦に在る `YYYY-MM-DD` / `YYYY-MM`。 */
const blankOrCalendar: Check = (v) => v === '' || isCalendarDateOrMonth(v);

/** collection の中身の形 —— 判定関数に、挙げた欄の名前を添える (個人情報の欄の走査に使う · パス 130)。 */
export interface CollectionShape {
  (data: Rec): boolean;
  /** 挙げた欄の名前 (判定の対象)。 */
  readonly fields: readonly string[];
}

/** 欄ごとの判定を並べた形。挙げた欄だけ見る。 */
function shape(fields: Readonly<Record<string, Check>>): CollectionShape {
  const check = (data: Rec): boolean => Object.entries(fields).every(([key, c]) => c(data[key]));
  return Object.assign(check, { fields: Object.keys(fields) });
}

const KPI_SHAPE = shape({
  period: str,
  unit: str,
  revenue: num,
  cogs: num,
  advertising: num,
  sga: num,
  depreciation: num,
  laborCost: opt(num),
});

/** collection 名 → 中身の判定。名前は各モジュールの `*_COLLECTION` 定数と同じ文字列。 */
export const COLLECTION_SHAPES: Readonly<Record<string, CollectionShape>> = {
  'sales-entries': shape({ date: calendarDate, channel: oneOf(() => SALES_CHANNELS), amount: num, orders: num, note: opt(str) }),
  'kpi-actuals': KPI_SHAPE,
  'kpi-budgets': KPI_SHAPE,
  'balance-sheet': shape({
    asOf: blankOrCalendar,
    currentAssets: num,
    cash: opt(num),
    inventory: opt(num),
    accountsReceivable: opt(num),
    fixedAssets: num,
    currentLiabilities: num,
    accountsPayable: opt(num),
    fixedLiabilities: num,
    interestBearingDebt: opt(num),
    netIncome: num,
  }),
  'team-members': shape({ name: str, email: str, role: oneOf(() => ROLE_ORDER) }),
  'business-units': shape({
    name: str,
    category: opt(str),
    startedOn: opt(blankOrCalendar),
    note: opt(str),
    revenue: opt(num),
    variableCost: opt(num),
    fixedCost: opt(num),
  }),
  // 読む側 (`settingsFromRecord`) が欄ごとに既定へ倒すので、ここは入れ物の形だけ。
  'bank-submission-settings': shape({ profile: opt(rec), format: opt(rec) }),
  'shigyo-contacts': shape({ serviceId: str, name: str, firm: opt(str), phone: opt(str), email: opt(str) }),
  'shigyo-consultations': shape({ serviceId: str, date: calendarDate, topic: str, status: oneOf(() => CONSULTATION_STATUSES) }),
  'realestate-properties': shape({
    name: str,
    type: str,
    monthlyRent: num,
    purchasePrice: num,
    occupied: bool,
    monthlyExpenses: opt(num),
    monthlyLoan: opt(num),
  }),
  'mutualfund-holdings': shape({
    code: opt(str),
    name: str,
    units: num,
    navPerUnit: num,
    valuation: num,
    valuationMode: opt(oneOf(() => ['auto', 'manual'])),
    // 未入力は null で書かれる (パス 123 —— 年初来リターン (パス 122) と同じ)。
    acquisitionCost: opt(orNull(num)),
    // 未入力は null で書かれる (パス 122)。num だけだと、空欄で足した控えが復元で丸ごと落ちる。
    ytdReturnPct: opt(orNull(num)),
  }),
  // 読む側 (`sanitizeParameterOverrides`) が値ごとに落とすので、辞書であることと値が数値であることだけ。
  'parameter-overrides': shape({ values: opt(numRec) }),
  'manual-metrics': shape({ scope: str, label: str, value: num, unit: oneOf(() => METRIC_UNITS), note: opt(str), businessId: opt(str) }),
  'manual-overrides': shape({ scope: str, path: str, value: num }),
  'hydroponics-setup': shape({
    floorAreaSqm: num,
    tiers: num,
    usableRatioPct: num,
    cropId: str,
    yieldRatePct: opt(num),
    unitPriceYen: opt(num),
    electricityYenPerKwh: opt(num),
    energyIntensityKwhPerKg: opt(num),
    seedYenPerPlant: opt(num),
    nutrientYenPerPlant: opt(num),
    packagingYenPerPlant: opt(num),
    laborYenPerMonth: opt(num),
    depreciationYenPerMonth: opt(num),
    rentYenPerMonth: opt(num),
    otherFixedYenPerMonth: opt(num),
    // 低カリウム栽培 —— 実測値の欄が数値以外だと「低カリウム」の表示の根拠が壊れる。在るなら数値。
    lowPotassium: opt(bool),
    switchDaysBeforeHarvest: opt(num),
    measuredPotassiumMgPer100g: opt(num),
    measuredSodiumMgPer100g: opt(num),
  }),
  // 品目の 1 件ずつは読む側 (`sanitizeCropList`) が落とす。ここは配列であることだけ。
  'hydroponics-crops': shape({ crops: opt(arr) }),
  // 読む側 (`parseHighlightSettings`) が欄ごとに既定へ倒す。在るなら数値。
  'highlight-settings': shape({
    declineWarnStreak: opt(num),
    declineCriticalStreak: opt(num),
    laborShareWarnPct: opt(num),
    singleChannelWarnPct: opt(num),
  }),
  'overview-overrides': shape({ path: str, value: num, note: opt(str) }),
  'overview-custom-metrics': shape({ label: str, value: num, unit: oneOf(() => METRIC_UNITS), note: opt(str) }),
  // コネクタの出力は payload の形が実行計画ごとに違う。宛先と鍵だけ。
  'connector-output': shape({ connectorId: str, key: str, payload: any }),
};

/**
 * その collection の中身として通るか。知らない collection は通す (前方互換)。
 * `Object.hasOwn` —— collection 名は `^[a-z][a-z0-9-]*$` なので `constructor` も名前として合法。
 * 素の添字だと `Object.prototype.constructor` が「判定関数」として呼ばれる。
 */
export function hasCollectionShape(collection: string, data: Rec): boolean {
  if (!Object.hasOwn(COLLECTION_SHAPES, collection)) return true;
  return COLLECTION_SHAPES[collection]!(data);
}

/**
 * 個人情報の欄の名前。**中身の形から導く** (パス 130) —— どの collection に個人情報が入るかを
 * 手で挙げると、欄を足した日に台帳が置き去りになる。欄の名前で走査し、台帳は「入れ物の形だけ
 * なので欄の名前から導けない collection」に限る (`NESTED_PERSONAL_DATA`)。
 */
export const PERSONAL_DATA_FIELDS: readonly string[] = ['email', 'phone', 'address', 'representative'];

/**
 * 欄の名前から導けない個人情報 (理由つき)。入れ物 (`rec`) の形だけを見る collection は、
 * 中の欄が走査に出ない。空の理由は認めない (検査が見る)。
 */
export const NESTED_PERSONAL_DATA: Readonly<Record<string, { readonly fields: readonly string[]; readonly why: string }>> = {
  'bank-submission-settings': {
    fields: ['representative', 'address'],
    why: '提出者情報 (`profile: opt(rec)`) は読む側が欄ごとに既定へ倒すので、形は入れ物だけ。代表者名と住所はその中に在る。',
  },
};

export interface PersonalDataCollection {
  readonly collection: string;
  /** 個人情報の欄 (走査で当たった名前、または台帳の名前)。 */
  readonly fields: readonly string[];
}

/** 個人情報を持つ collection —— 走査 (欄の名前) + 台帳 (入れ子)。同じ collection が両方に出ることはない (検査が留める)。 */
export function personalDataCollections(): readonly PersonalDataCollection[] {
  const out: PersonalDataCollection[] = [];
  for (const [collection, s] of Object.entries(COLLECTION_SHAPES)) {
    const fields = s.fields.filter((f) => PERSONAL_DATA_FIELDS.includes(f));
    if (fields.length > 0) out.push({ collection, fields });
  }
  for (const [collection, entry] of Object.entries(NESTED_PERSONAL_DATA)) {
    if (!out.some((p) => p.collection === collection)) out.push({ collection, fields: entry.fields });
  }
  return out;
}
