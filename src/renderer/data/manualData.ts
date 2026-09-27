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
  findFieldIn,
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
  kpi: [
    { path: 'variableCost', label: '変動費', section: '費用', unit: 'yen' },
    { path: 'fixedCost', label: '固定費', section: '費用', unit: 'yen' },
    { path: 'contribution', label: '限界利益', section: '損益', unit: 'yen', derivedFrom: ['variableCost'] },
    {
      path: 'contributionRatio',
      label: '限界利益率',
      section: '損益',
      unit: 'pct',
      derivedFrom: ['contribution'],
    },
    {
      path: 'operatingProfit',
      label: '営業利益',
      section: '損益',
      unit: 'yen',
      derivedFrom: ['contribution', 'fixedCost'],
    },
    {
      path: 'bep',
      label: '損益分岐点 (BEP)',
      section: '分岐点',
      unit: 'yen',
      derivedFrom: ['fixedCost', 'contribution'],
    },
    { path: 'bepRatio', label: 'BEP 比率', section: '分岐点', unit: 'pct', derivedFrom: ['bep'] },
    {
      path: 'safetyMargin',
      label: '安全余裕率',
      section: '分岐点',
      unit: 'pct',
      derivedFrom: ['bepRatio'],
    },
  ],
  // 入居率 (occupancyRate) は載せない。**保存している尺度 (0〜1) と画面に出す
  // 尺度 (%) が違う**ので、そのまま置き換え欄に出すと利用者は画面の数字
  // (例: 80) を打ち、保存側は 80 倍の値として受け取ってしまう。
  // 単位を増やして誤魔化すより、置けないものは置けないままにする。
  'real-estate': [
    { path: 'grossRent', label: '賃料収入 (月)', section: '収支', unit: 'yen' },
    { path: 'operatingExpenses', label: '運営費用 (月)', section: '収支', unit: 'yen' },
    { path: 'mortgagePayment', label: 'ローン返済 (月)', section: '収支', unit: 'yen' },
    {
      path: 'netCashflow',
      label: '手残り (月)',
      section: '収支',
      unit: 'yen',
      derivedFrom: ['grossRent', 'operatingExpenses', 'mortgagePayment'],
    },
    { path: 'portfolioYield', label: 'ポートフォリオ利回り', section: '利回り', unit: 'pct' },
  ],
  'mutual-funds': [
    { path: 'totalValuation', label: '評価額', section: '評価', unit: 'yen' },
    { path: 'totalCostBasis', label: '取得原価', section: '評価', unit: 'yen' },
    {
      path: 'unrealizedGain',
      label: '評価損益',
      section: '評価',
      unit: 'yen',
      derivedFrom: ['totalValuation', 'totalCostBasis'],
    },
    {
      path: 'unrealizedGainPct',
      label: '評価損益率',
      section: '評価',
      unit: 'pct',
      derivedFrom: ['unrealizedGain', 'totalCostBasis'],
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

/**
 * その画面のものか。**scope の判定はここだけに置く。**
 *
 * 2026-09-12 (パス 170) まで `ManualDataSection` は見出しの件数を
 * `metricsForScope` で数え、並べる行を `records.filter((r) => r.data.scope === scope)`
 * と**書き直して**いた。今日は一致するが、片方だけを直すと
 * **「3 件」と書いてあるのに 2 行しか出ない**形になる (パス 61 の家系)。
 * レコード (`{ id, data }`) からでも中身からでも、通る道はこの 1 本にする。
 */
export function belongsToScope(scope: ManualScope, entry: { readonly scope: string }): boolean {
  return entry.scope === scope;
}

/** レコードの中から、その画面のものだけを取り出す。 */
export function metricsForScope(
  scope: ManualScope,
  records: readonly ManualMetricEntry[],
): readonly ManualMetricEntry[] {
  return records.filter((r) => belongsToScope(scope, r));
}

/** 同上（上書き）。 */
export function overridesForScope(
  scope: ManualScope,
  records: readonly ManualOverrideEntry[],
): readonly ManualOverrideEntry[] {
  return records.filter((r) => belongsToScope(scope, r));
}

/**
 * 保存されているのに**効かない**上書きの原因。
 *
 * - `no-field` — その画面の一覧 (allowlist) にそのパスが無い。欄の名前を変えた・
 *   欄を無くした後に、前に保存した行が残るとこうなる。
 * - `bad-value` — 値が数として読めない (`NaN` / `±Infinity` / 非数)。
 */
export type InertOverrideCause = 'no-field' | 'bad-value';

/** 効かない上書き 1 件。消せるように id を持つ。 */
export interface InertOverride {
  readonly id: string;
  readonly path: string;
  readonly value: number;
  readonly cause: InertOverrideCause;
}

/**
 * その上書きが効かない原因。効くなら `null`。
 *
 * ★ **2026-09-24 (パス 447) まで、この判定はどこにも無かった。**
 * `applyOverrides` は捨てた物を `ignored` で返すが、**出荷コードにその読み手は
 * 0 件**だった (走査で確認)。実測 (直す前・`kpi` の画面に、一覧に在る 1 件と
 * 一覧に無い 1 件を保存する):
 *
 * | 見るもの | 直す前 |
 * | --- | --- |
 * | 見出しの件数 | **置き換え 2 件** |
 * | 一覧に出る行 | **1 行** |
 * | 「自動に戻す」 | **1 件** |
 * | 孤児のパスの綴り | **画面に 1 字も無い** |
 *
 * 並べているのは `myOverrides` ではなく**一覧 (catalog)** なので、一覧に無いパスは
 * 行そのものが生えない —— **数えるのに出さない**形で、
 * `belongsToScope` の docblock が名指しする パス 61 / 170 の家系
 * (「3 件」と書いてあるのに 2 行しか出ない) が別の戸から戻っていた。
 * しかも `hasCatalog(scope)` が false の画面 (実測 `linux`) では欄ごと出ないので、
 * その行は**数えられるだけで、見ることも消すこともできない** ——
 * 逃げ口が「すべてのデータを削除」しか無い (法則 `escape-hatch-stays-open`)。
 *
 * **点検パネルは孤児を見つけない** (実測: 形の表は `path: str` なので通る)。
 * 値が数でない側は形の表が拒むので点検パネルが見つけるが、**画面の札は
 * 緑で「手入力 NaN 円」と出る** —— 適用されていないのに適用されたと名乗る。
 *
 * **順序は `applyOverrides` と同じ** —— 一覧を先に引き、それから値を見る。
 * 逆にすると、パスも値も壊れている行について
 * 「計算が使った理由」と「画面が述べる理由」が食い違う (パス 401 の形)。
 *
 * ★ **3 つ目の原因はここからは見えない** —— `applyOverrides` は
 * 「一覧に在るが土台のオブジェクトにその階層が無い」ときも捨てる。これは
 * 保存された記録ではなく**一覧と土台の食い違い**で、しかもその行は一覧に
 * 在るので画面に出ており「自動に戻す」で消せる (逃げ口は開いている)。
 */
export function overrideCause(
  scope: ManualScope,
  entry: { readonly path: string; readonly value: number },
): InertOverrideCause | null {
  if (findFieldIn(catalogFor(scope), entry.path) === null) return 'no-field';
  if (!Number.isFinite(entry.value)) return 'bad-value';
  return null;
}

/**
 * その画面の上書きのうち、保存されているのに効かないもの。
 *
 * 画面はこれを並べて「削除」を出し、逆に**効く行だけ**を置き換え欄の札に使う ——
 * 判定を 2 度書かず、同じ `overrideCause` の答えで分ける。
 */
export function inertOverrides(
  scope: ManualScope,
  records: readonly { readonly id: string; readonly data: ManualOverrideEntry }[],
): readonly InertOverride[] {
  const out: InertOverride[] = [];
  for (const r of records) {
    if (!belongsToScope(scope, r.data)) continue;
    const cause = overrideCause(scope, r.data);
    if (cause === null) continue;
    out.push({ id: r.id, path: r.data.path, value: r.data.value, cause });
  }
  return out;
}

/**
 * 効かない上書きについての断り。無ければ `null`。
 *
 * **原因ごとに別の文**にする —— 直す手が違うためで、片方の文で両方を述べると
 * その人がしていない失敗を告げることになる (パス 388 / 443 / 446 と同じ規則)。
 * 逃げ口はどちらも同じ行の「削除」なので、**その綴りで名指しする**
 * (法則 `escape-hatch-stays-open`・パス 426 の「名指しした操作子は画面に在る」)。
 *
 * 文は data 層が持つ —— `.tsx` は変異検査の母集団の外なので、画面側に置くと
 * 「どちらの文が出るか」を誰も測らない (パス 386 / 445 と同じ判断)。
 */
export function inertOverrideNote(rows: readonly InertOverride[]): string | null {
  if (rows.length === 0) return null;
  const noField = rows.filter((r) => r.cause === 'no-field').length;
  const badValue = rows.filter((r) => r.cause === 'bad-value').length;
  const said: string[] = [];
  if (noField > 0) {
    said.push(
      `${noField} 件は、この画面の置き換えられる欄にそのパスがありません（欄の名前が変わった・欄が無くなった）。`,
    );
  }
  if (badValue > 0) {
    said.push(`${badValue} 件は、値が数として読めません。`);
  }
  return `${said.join('')}下の数値は保存されていますが計算には使われていません。要らなければ各行の「削除」で消せます。`;
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
