/**
 * どの画面でも数値を手で足せる / 置ける層。
 *
 * 経営サマリーだけに付けていた「手入力」を**全画面へ広げる**ための土台。
 * 画面ごとにモジュールを増やすと、必ずどれか 1 つが取り残される
 * (このリポジトリで繰り返し起きている形) ので、**保存先は 1 つにして
 * レコード側が `scope` を持つ**。新しいサービスが増えても、この層は
 * 何もしなくてよい。
 *
 * ## 2 種類ある
 *
 * - **任意項目 (`manual-metrics`)** — アプリが計算しない数字を足す。
 *   どの画面でも使える。一覧 (catalog) は要らない。
 * - **上書き (`manual-overrides`)** — アプリが計算した数字を手で置き換える。
 *   置ける場所を allowlist で持つ画面だけで使える。任意のパスを書けると
 *   `__proto__` のような区間を渡されて困るため。
 *
 * つまり「足す」はどの画面でもでき、「置き換える」はアプリ自身が数字を
 * 計算している画面でできる。外部 API の値は置き換えではなく**足す**側で
 * 表す — 取得元の値を書き換えたことにすると、次の取得で黙って戻る。
 *
 * ## 事業の指定
 *
 * 任意項目には事業 (`businessUnits.ts`) を紐づけられる。事業を消しても
 * 数値は消さない。消えた事業の id が残っていたら「事業の指定なし」として
 * 表示する — 分類を変えただけで帳簿が消えるのはおかしい。
 */

import {
  applyOverrides,
  groupFieldsBySection,
  parseCustomMetric,
  type AppliedOverviewOverrides,
  type CustomMetricInput,
  type MetricUnit,
  type OverridableField,
  type OverrideEntry,
  OVERRIDABLE_FIELDS,
} from './overviewOverrides';

/** 保存先。画面ごとに分けず、レコードが `scope` を持つ。 */
export const MANUAL_METRICS_COLLECTION = 'manual-metrics';
export const MANUAL_OVERRIDES_COLLECTION = 'manual-overrides';

/** どの画面のものか。サービス id をそのまま使う。 */
export type ManualScope = string;

/** 保存する任意項目 1 件。id はレコードストアが採番する。 */
export interface ManualMetricEntry extends Record<string, unknown> {
  readonly scope: ManualScope;
  readonly label: string;
  readonly value: number;
  readonly unit: MetricUnit;
  readonly note?: string;
  /** 紐づける事業。未指定なら全体。 */
  readonly businessId?: string;
}

/** 保存する上書き 1 件。 */
export interface ManualOverrideEntry extends Record<string, unknown> {
  readonly scope: ManualScope;
  readonly path: string;
  readonly value: number;
}

/**
 * 画面ごとの「置ける数値」の一覧。
 *
 * ここに無い画面は**足す側だけ**が使える。外部 API から来た数字は
 * 置き換えの対象にしない (次の取得で戻るため) ので、載せるのは
 * アプリ自身が計算している画面だけである。
 */
const CATALOGS: Readonly<Record<string, readonly OverridableField[]>> = {
  overview: OVERRIDABLE_FIELDS,
  sales: [
    { path: 'totalAmount', label: '売上合計', section: '売上', unit: 'yen' },
    { path: 'totalOrders', label: '受注件数', section: '売上', unit: 'count' },
    {
      path: 'aov',
      label: '平均単価',
      section: '売上',
      unit: 'yen',
      derivedFrom: ['totalAmount', 'totalOrders'],
    },
  ],
};

/** 一覧を持たない画面が返すもの。毎回作らず同じ配列を返す。 */
const NO_FIELDS: readonly OverridableField[] = [];

/**
 * その画面で置ける数値の一覧。無い画面は空。
 *
 * `CATALOGS[scope] ?? []` と書くと、`scope` が `__proto__` や `constructor`
 * のときに**プロトタイプ側の値**が返る（`Object.prototype` や関数が
 * 一覧として出てくる）。画面 id は URL のハッシュから来るので、
 * 自分の持ち物かどうかを `Object.hasOwn` で確かめてから引く。
 */
export function catalogFor(scope: ManualScope): readonly OverridableField[] {
  if (!Object.hasOwn(CATALOGS, scope)) return NO_FIELDS;
  return CATALOGS[scope] ?? NO_FIELDS;
}

/** 置ける数値がある画面か。画面が上書き欄を出すかの判断に使う。 */
export function hasCatalog(scope: ManualScope): boolean {
  return catalogFor(scope).length > 0;
}

/**
 * 一覧を持つ画面の id を**宣言順**で返す。ドキュメントとテストが実体と
 * ずれないように公開する。
 *
 * 並べ替えない。宣言順そのものが「どの画面に一覧を用意したか」の記録で、
 * 並べ替えると `CATALOGS` を書き換えても出力が変わらない場合が出る
 * （＝順序を壊してもテストが気付けない）。
 */
export function scopesWithCatalog(): readonly string[] {
  return Object.keys(CATALOGS);
}

/** その画面のまとまりごとの一覧。 */
export function sectionsFor(
  scope: ManualScope,
): readonly { section: string; fields: readonly OverridableField[] }[] {
  return groupFieldsBySection(catalogFor(scope));
}

/** レコードの中から、その画面のものだけを取り出す。 */
export function metricsForScope(
  scope: ManualScope,
  records: readonly ManualMetricEntry[],
): readonly ManualMetricEntry[] {
  return records.filter((r) => r.scope === scope);
}

/** 同上（上書き）。 */
export function overridesForScope(
  scope: ManualScope,
  records: readonly ManualOverrideEntry[],
): readonly ManualOverrideEntry[] {
  return records.filter((r) => r.scope === scope);
}

/**
 * その画面の上書きを適用する。
 *
 * 一覧を持たない画面では**何も起きない** — 一覧が空なので、どのパスも
 * allowlist に無いものとして無視される。呼び出し側で分岐を書かなくてよい。
 */
export function applyManualOverrides<T>(
  scope: ManualScope,
  base: T,
  records: readonly ManualOverrideEntry[],
): AppliedOverviewOverrides<T> {
  const scoped = overridesForScope(scope, records);
  const asOverrides: OverrideEntry[] = scoped.map((r) => ({ path: r.path, value: r.value }));
  return applyOverrides(catalogFor(scope), base, asOverrides);
}

export type ManualMetricResult =
  | { ok: true; entry: Omit<ManualMetricEntry, 'scope'> }
  | { ok: false; reason: string };

/**
 * 任意項目の入力を検証する。値の規則は上書きと同じ (`parseOverrideValue`)。
 *
 * `scope` はここでは付けない — 保存する側が「いまどの画面か」を知っていて、
 * 入力欄の値ではないため。入力の検証と、どこへ保存するかを混ぜない。
 */
export function parseManualMetric(input: {
  label?: string;
  value?: string;
  unit?: string;
  note?: string;
  businessId?: string;
}): ManualMetricResult {
  const parsed = parseCustomMetric(input);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const businessId = (input.businessId ?? '').trim();
  const base: CustomMetricInput = parsed.entry;
  if (businessId.length === 0) return { ok: true, entry: { ...base } };
  return { ok: true, entry: { ...base, businessId } };
}
