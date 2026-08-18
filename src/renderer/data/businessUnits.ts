/**
 * 事業（ビジネスユニット）の登録 — 利用者が任意に足せる。
 *
 * このアプリの数値は「会社ひとつ」を前提に組み立ててある。実務では
 * 物販と受託、店舗 A と店舗 B のように**事業が複数あり**、どの数字が
 * どの事業のものかを分けたい。事業の一覧をアプリ側で決め打ちにすると
 * 必ず足りないので、**利用者が自由に足せる登録簿**として持つ。
 *
 * ここに登録した事業は、手入力した数値 (`manualData.ts`) の付け先として
 * 使える。事業を消しても数値は消さない — 消えた事業に紐づく数値は
 * 「事業の指定なし」として扱う。数字は帳簿であり、分類を変えたからといって
 * 勝手に消えてよいものではない。
 */

import { hasControlChar } from '../../shared/controlChars';

export const BUSINESS_UNITS_COLLECTION = 'business-units';

export const BUSINESS_NAME_MAX = 60;
export const BUSINESS_CATEGORY_MAX = 30;
export const BUSINESS_NOTE_MAX = 200;

/**
 * 金額の上限 (円)。1 兆円。
 *
 * 桁を打ち間違えた入力を弾くための位置であって、実在の事業規模を否定する
 * ものではない。ここを超える事業を扱うなら上げてよい。**丸めない** —
 * 黙って上限に丸めると、利用者が打った数と画面の数が食い違う。
 */
export const BUSINESS_AMOUNT_MAX = 1e13;

/** 保存する事業 1 件。id はレコードストアが採番する。 */
export interface BusinessUnitInput extends Record<string, unknown> {
  readonly name: string;
  /** 業種・区分など。任意。 */
  readonly category?: string;
  /** 開始年月 `YYYY-MM` または開始日 `YYYY-MM-DD`。任意。 */
  readonly startedOn?: string;
  readonly note?: string;
  /**
   * 月次の売上高 (円)。任意。
   *
   * **これがある事業だけが事業間比較のグラフに出る。** 売上が分からない事業は
   * 名前だけの登録として使える (数値の付け先としては機能する)。比較に出すには
   * 売上が要る — 利益率も原価率も売上を分母に取るため、売上なしでは何も比べられない。
   */
  readonly revenue?: number;
  /** 月次の変動費 (円)。任意。売上があって未入力なら 0 として扱う。 */
  readonly variableCost?: number;
  /** 月次の固定費 (円)。任意。売上があって未入力なら 0 として扱う。 */
  readonly fixedCost?: number;
}

export type BusinessUnitResult =
  | { ok: true; entry: BusinessUnitInput }
  | { ok: false; reason: string };

/**
 * 開始年月の形。`YYYY-MM` と `YYYY-MM-DD` の 2 つだけ受ける。
 *
 * 月だけで足りる場面が多いので日付を必須にしない。曖昧な表記
 * (`2026/4`・`令和8年4月`) は受けずに言い直してもらう —
 * 解釈を推測すると、後で並べ替えたときに黙って順序が狂う。
 */
const STARTED_ON_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

/** 入力を検証して、保存する形にする。 */
export function parseBusinessUnit(input: {
  name?: string;
  category?: string;
  startedOn?: string;
  note?: string;
  revenue?: string;
  variableCost?: string;
  fixedCost?: string;
}): BusinessUnitResult {
  const name = (input.name ?? '').trim();
  if (name.length === 0) return { ok: false, reason: '事業名を入力してください。' };
  if (name.length > BUSINESS_NAME_MAX) {
    return { ok: false, reason: `事業名は ${BUSINESS_NAME_MAX} 文字までです。` };
  }
  if (hasControlChar(name)) return { ok: false, reason: '事業名に制御文字は使えません。' };

  const category = (input.category ?? '').trim();
  if (category.length > BUSINESS_CATEGORY_MAX) {
    return { ok: false, reason: `区分は ${BUSINESS_CATEGORY_MAX} 文字までです。` };
  }

  const startedOn = (input.startedOn ?? '').trim();
  if (startedOn.length > 0 && !STARTED_ON_RE.test(startedOn)) {
    return { ok: false, reason: '開始時期は YYYY-MM か YYYY-MM-DD で入力してください。' };
  }

  const note = (input.note ?? '').trim();
  if (note.length > BUSINESS_NOTE_MAX) {
    return { ok: false, reason: `メモは ${BUSINESS_NOTE_MAX} 文字までです。` };
  }

  const money = parseAmounts(input);
  if (!money.ok) return money;

  // 空の項目は持たせない。空文字を保存すると「未入力」と「空と入力した」の
  // 区別が付かなくなり、表示側で両方を書き分けることになる。
  const entry: Record<string, unknown> = { name };
  if (category.length > 0) entry['category'] = category;
  if (startedOn.length > 0) entry['startedOn'] = startedOn;
  if (note.length > 0) entry['note'] = note;
  for (const [key, value] of money.amounts) entry[key] = value;
  return { ok: true, entry: entry as unknown as BusinessUnitInput };
}

/** 金額欄のラベル。エラー文で「どの欄か」を言うために持つ。 */
const AMOUNT_LABEL: Record<'revenue' | 'variableCost' | 'fixedCost', string> = {
  revenue: '売上高',
  variableCost: '変動費',
  fixedCost: '固定費',
};

type AmountResult =
  | { ok: true; amounts: ReadonlyArray<readonly [string, number]> }
  | { ok: false; reason: string };

/**
 * 月次の金額 3 欄を読む。3 つとも任意。
 *
 * **売上が無いのに費用だけ入れる形は受けない。** 費用しか無い事業は比較の
 * どの指標にも乗らない (すべて売上を分母に取る) ので、保存できても行き場が無く、
 * 「入れたのにグラフに出ない」という分かりにくい状態になる。入口で断る。
 */
function parseAmounts(input: {
  revenue?: string;
  variableCost?: string;
  fixedCost?: string;
}): AmountResult {
  const out: [string, number][] = [];
  let hasRevenue = false;
  for (const key of ['revenue', 'variableCost', 'fixedCost'] as const) {
    const raw = (input[key] ?? '').trim();
    if (raw.length === 0) continue;
    // 桁区切りと全角数字は日常的に貼り付けられるので受ける。
    const normalized = raw.replace(/,/g, '').replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    );
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `${AMOUNT_LABEL[key]}は数値で入力してください。` };
    }
    if (value < 0) {
      return { ok: false, reason: `${AMOUNT_LABEL[key]}にマイナスは指定できません。` };
    }
    if (value > BUSINESS_AMOUNT_MAX) {
      return {
        ok: false,
        reason: `${AMOUNT_LABEL[key]}が大きすぎます (上限 ${BUSINESS_AMOUNT_MAX.toLocaleString()} 円)。`,
      };
    }
    if (key === 'revenue') hasRevenue = true;
    out.push([key, value]);
  }
  if (out.length > 0 && !hasRevenue) {
    return { ok: false, reason: '費用だけでは比較できません。売上高も入力してください。' };
  }
  return { ok: true, amounts: out };
}

/** 画面に出す 1 行。id はレコードストアのもの。 */
export interface BusinessUnitRecord {
  readonly id: string;
  readonly data: BusinessUnitInput;
}

/**
 * 事業名を引く。消えた事業 / 指定なしは null。
 *
 * 「消えた事業に紐づく数値」を落とさないための入口でもある。呼び出し側は
 * null を「事業の指定なし」として出せばよく、数値そのものは残る。
 */
export function findBusinessName(
  units: readonly BusinessUnitRecord[],
  businessId: string | undefined,
): string | null {
  // `businessId === undefined` の早期 return は要らない。id が undefined の
  // レコードは存在しないので `find` がそのまま見つからない側へ落ちる。
  const hit = units.find((u) => u.id === businessId);
  return hit === undefined ? null : hit.data.name;
}

/**
 * 表示用に並べる。開始時期のあるものを古い順、その後に未設定を名前順。
 *
 * 並べ替えの鍵を先に取り出してから比べる。`filter` の後で
 * `u.data.startedOn ?? ''` と書くと、型の上では省略可のままなので
 * **到達しない既定値**が残り、その既定値を壊しても差が出ない。
 * 鍵を取り出す形にすると、その分岐ごと消える。
 */
export function sortBusinessUnits(
  units: readonly BusinessUnitRecord[],
): readonly BusinessUnitRecord[] {
  const dated: { rec: BusinessUnitRecord; key: string }[] = [];
  const undated: BusinessUnitRecord[] = [];
  for (const u of units) {
    const started = u.data.startedOn;
    if (typeof started === 'string') dated.push({ rec: u, key: started });
    else undated.push(u);
  }
  dated.sort((a, b) => a.key.localeCompare(b.key));
  // ロケールは指定しない。表示するのは利用者の画面なので、並び順も
  // 利用者のロケールに従うのが正しい。ここだけ 'ja' を固定すると、
  // アプリの他の一覧と並びが食い違う（ひらがな・カタカナの順序は
  // 既定のロケールでも日本語の五十音順になる）。
  undated.sort((a, b) => a.data.name.localeCompare(b.data.name));
  return [...dated.map((d) => d.rec), ...undated];
}

/**
 * 事業間比較 (`FinancialAnalysis`) に渡せる形。`components/FinancialAnalysis.tsx`
 * の `FinancialUnit` と同じ形だが、**renderer/data から components を import
 * しない**ため構造で合わせている (依存の向きを一方向に保つ)。
 */
export interface BusinessFinancialUnit {
  readonly id: string;
  readonly label: string;
  readonly current: {
    readonly revenue: number;
    readonly variableCost: number;
    readonly fixedCost: number;
    readonly profit: number;
    readonly profitMargin: number;
  };
  readonly history: readonly { readonly revenue: number; readonly profit: number }[];
}

/** 営業利益率 (%) を小数第 1 位で。売上 0 は率が定義できないので 0 とする。 */
function marginPct(revenue: number, profit: number): number {
  if (revenue <= 0) return 0;
  return Math.round((profit / revenue) * 1000) / 10;
}

/**
 * 登録した事業のうち **売上を入れたものだけ**を比較グラフ用に変換する。
 *
 * 売上が無い事業を 0 として並べると、グラフ上は「利益率 0% の事業」に見える。
 * 実際は「まだ入力していない」であって 0 ではない。**未入力と 0 を区別する**
 * ため、売上の無い事業は行ごと出さない (名前だけの登録としては有効なまま)。
 *
 * 履歴は空にする。手入力で分かるのは当月の 1 点だけで、そこから傾向は出せない。
 * 1 点を履歴として渡すと折れ線が「横ばい」に見え、**測っていないものを
 * 測ったように見せて**しまう (`analyzeMarginTrend` は 2 点未満で傾向を返さない)。
 */
export function financialUnitsFromBusinessUnits(
  units: readonly BusinessUnitRecord[],
): readonly BusinessFinancialUnit[] {
  const out: BusinessFinancialUnit[] = [];
  for (const u of units) {
    const revenue = u.data.revenue;
    if (typeof revenue !== 'number') continue;
    const variableCost = typeof u.data.variableCost === 'number' ? u.data.variableCost : 0;
    const fixedCost = typeof u.data.fixedCost === 'number' ? u.data.fixedCost : 0;
    const profit = revenue - variableCost - fixedCost;
    out.push({
      id: u.id,
      label: u.data.name,
      current: { revenue, variableCost, fixedCost, profit, profitMargin: marginPct(revenue, profit) },
      history: [],
    });
  }
  return out;
}
