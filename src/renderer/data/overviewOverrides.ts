/**
 * 経営サマリーの数値を手入力で上書きする / 任意の項目を足す。
 *
 * `overview.ts` は売上・KPI・BS・会計連携から**自動で**数値を出す。実務では
 * そこに載らない数字がある（会計ソフト未連携、締め前の速報値、事業計画上の
 * 目標値など）ので、**表示されるどの数値も手で置ける**ようにする。
 *
 * ## 上書きは「表示の置き換え」であって再計算ではない
 *
 * 売上を手で置いても営業利益率は自動値のままである。どの派生値を
 * どう直したいかは利用者にしか決められないためで、**黙って辻褄を合わせない**。
 * 代わりに {@link applyOverviewOverrides} が `staleDerived` として
 * 「上書きした数値から計算されているのに、自動値のままの指標」を返すので、
 * 画面はそれを注意として出せる。
 *
 * ## 置ける場所は allowlist
 *
 * パスは {@link OVERRIDABLE_FIELDS} に列挙したものだけを受け付ける。
 * 任意のパスを書き込めるようにすると `__proto__` のような区間を渡された
 * ときに困る（CSV 取り込みで実際に踏んだ形）。列挙にしておけば
 * 「置ける数値の一覧」がそのまま画面の入力欄にもなる。
 */

/** 数値の種類。入力の検証と表示単位に使う。 */
export type MetricUnit = 'yen' | 'pct' | 'count' | 'days' | 'months';

export interface OverridableField {
  /** `kpi.revenue` のようなドット区切りパス。 */
  readonly path: string;
  readonly label: string;
  /** 画面のまとまり。 */
  readonly section: string;
  readonly unit: MetricUnit;
  /**
   * この数値の計算元。上書きしたときに「ここから計算される指標は
   * 自動値のまま」と伝えるために持つ。
   */
  readonly derivedFrom?: readonly string[];
}

/** 上書きできる数値の一覧。ここに無いパスは受け付けない。 */
export const OVERRIDABLE_FIELDS: readonly OverridableField[] = [
  // --- 売上 ---
  { path: 'sales.totalAmount', label: '売上合計', section: '売上', unit: 'yen' },
  { path: 'sales.totalOrders', label: '受注件数', section: '売上', unit: 'count' },
  { path: 'sales.aov', label: '平均単価', section: '売上', unit: 'yen', derivedFrom: ['sales.totalAmount', 'sales.totalOrders'] },
  { path: 'sales.channelCount', label: 'チャネル数', section: '売上', unit: 'count' },

  // --- 損益 ---
  { path: 'kpi.revenue', label: '売上高', section: '損益', unit: 'yen' },
  { path: 'kpi.grossProfit', label: '売上総利益', section: '損益', unit: 'yen', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.operatingProfit', label: '営業利益', section: '損益', unit: 'yen', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.ebitda', label: 'EBITDA', section: '損益', unit: 'yen', derivedFrom: ['kpi.operatingProfit'] },
  { path: 'kpi.bep', label: '損益分岐点売上高', section: '損益', unit: 'yen' },
  { path: 'kpi.safetyMargin', label: '安全余裕率', section: '損益', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.bep'] },

  // --- 比率 ---
  { path: 'kpi.grossMarginPct', label: '売上総利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.grossProfit'] },
  { path: 'kpi.operatingMarginPct', label: '営業利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.operatingProfit'] },
  { path: 'kpi.ebitdaMarginPct', label: 'EBITDA マージン', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue', 'kpi.ebitda'] },
  { path: 'kpi.cogsRatioPct', label: '原価率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.sgaRatioPct', label: '販管費率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.advertisingRatioPct', label: '広告費比率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.contributionRatio', label: '限界利益率', section: '比率', unit: 'pct', derivedFrom: ['kpi.revenue'] },

  // --- 成長 ---
  { path: 'kpi.revenueGrowthPct', label: '売上高成長率', section: '成長', unit: 'pct', derivedFrom: ['kpi.revenue'] },
  { path: 'kpi.revenueCagrPct', label: '期間平均成長率', section: '成長', unit: 'pct', derivedFrom: ['kpi.revenue'] },

  // --- 体制 ---
  { path: 'team.members', label: 'メンバー数', section: '体制', unit: 'count' },
  { path: 'team.seatLimit', label: '席数上限', section: '体制', unit: 'count' },
  { path: 'productivity.revenuePerCapita', label: '一人当たり売上', section: '体制', unit: 'yen', derivedFrom: ['kpi.revenue', 'team.members'] },
  { path: 'productivity.operatingProfitPerCapita', label: '一人当たり営業利益', section: '体制', unit: 'yen', derivedFrom: ['kpi.operatingProfit', 'team.members'] },
  { path: 'productivity.labor.laborCost', label: '人件費', section: '体制', unit: 'yen' },
  { path: 'productivity.labor.laborSharePct', label: '労働分配率', section: '体制', unit: 'pct', derivedFrom: ['productivity.labor.laborCost'] },
  { path: 'productivity.labor.laborToRevenuePct', label: '人件費率', section: '体制', unit: 'pct', derivedFrom: ['kpi.revenue', 'productivity.labor.laborCost'] },
  { path: 'productivity.labor.laborPerCapita', label: '一人当たり人件費', section: '体制', unit: 'yen', derivedFrom: ['team.members', 'productivity.labor.laborCost'] },

  // --- 財政状態 ---
  { path: 'financialPosition.totalAssets', label: '総資産', section: '財政状態', unit: 'yen' },
  { path: 'financialPosition.totalLiabilities', label: '負債合計', section: '財政状態', unit: 'yen' },
  { path: 'financialPosition.netAssets', label: '純資産', section: '財政状態', unit: 'yen', derivedFrom: ['financialPosition.totalAssets', 'financialPosition.totalLiabilities'] },
  { path: 'financialPosition.equityRatioPct', label: '自己資本比率', section: '財政状態', unit: 'pct', derivedFrom: ['financialPosition.totalAssets', 'financialPosition.netAssets'] },
  { path: 'financialPosition.currentRatioPct', label: '流動比率', section: '財政状態', unit: 'pct' },
  { path: 'financialPosition.quickRatioPct', label: '当座比率', section: '財政状態', unit: 'pct' },
  { path: 'financialPosition.roaPct', label: 'ROA', section: '財政状態', unit: 'pct', derivedFrom: ['kpi.operatingProfit', 'financialPosition.totalAssets'] },
  { path: 'financialPosition.roePct', label: 'ROE', section: '財政状態', unit: 'pct', derivedFrom: ['kpi.operatingProfit', 'financialPosition.netAssets'] },

  // --- 運転資金 ---
  { path: 'workingCapital.dso', label: '売上債権回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.dio', label: '棚卸資産回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.dpo', label: '仕入債務回転日数', section: '運転資金', unit: 'days' },
  { path: 'workingCapital.ccc', label: 'キャッシュ化速度 (CCC)', section: '運転資金', unit: 'days', derivedFrom: ['workingCapital.dso', 'workingCapital.dio', 'workingCapital.dpo'] },
  { path: 'workingCapital.workingCapital', label: '運転資金', section: '運転資金', unit: 'yen' },

  // --- 資金繰り ---
  { path: 'accounting.latestNet', label: '直近月の収支', section: '資金繰り', unit: 'yen' },
  { path: 'accounting.avgMonthlyNet', label: '月平均の収支', section: '資金繰り', unit: 'yen' },
  { path: 'runwayMonths', label: '資金ランウェイ', section: '資金繰り', unit: 'months', derivedFrom: ['accounting.avgMonthlyNet'] },
  { path: 'cashForecast.openingBalance', label: '期首現預金', section: '資金繰り', unit: 'yen' },
  { path: 'cashForecast.minBalance', label: '最低現預金 (予測)', section: '資金繰り', unit: 'yen', derivedFrom: ['cashForecast.openingBalance', 'accounting.avgMonthlyNet'] },
];

/**
 * パスから定義を引く。一覧に無ければ null。
 *
 * 索引の Map をモジュールの初期化で作らないのは、初期化で例外を投げる
 * 壊れ方をしたときにテストが「失敗」ではなく「収集できない」で落ちてしまい、
 * 壊れていることに気付けないため。45 件の線形探索で十分に速い。
 */
export function findOverridableField(path: string): OverridableField | null {
  return OVERRIDABLE_FIELDS.find((f) => f.path === path) ?? null;
}

/** 画面のまとまりごとに並べ替える（一覧の順序を保つ）。 */
export function fieldsBySection(): readonly { section: string; fields: readonly OverridableField[] }[] {
  const out: { section: string; fields: OverridableField[] }[] = [];
  for (const f of OVERRIDABLE_FIELDS) {
    const last = out[out.length - 1];
    if (last !== undefined && last.section === f.section) last.fields.push(f);
    else out.push({ section: f.section, fields: [f] });
  }
  return out;
}

/** 単位ごとの入力の範囲。桁を打ち間違えたときに気付けるだけの広さにする。 */
const LIMITS: Record<MetricUnit, { min: number; max: number; integer: boolean }> = {
  yen: { min: -1e15, max: 1e15, integer: false },
  pct: { min: -100_000, max: 100_000, integer: false },
  count: { min: 0, max: 1e9, integer: true },
  days: { min: -100_000, max: 100_000, integer: false },
  months: { min: 0, max: 12_000, integer: false },
};

export type OverrideValueResult = { ok: true; value: number } | { ok: false; reason: string };

/**
 * 入力文字列を数値にする。全角・カンマ・単位語は受けない
 * （`inputGuards` と同じ方針で、曖昧な入力は通さず言い直してもらう）。
 */
export function parseOverrideValue(raw: string, unit: MetricUnit): OverrideValueResult {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: '数値を入力してください。' };
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, reason: '半角数字で入力してください（カンマ・単位・記号は入れない）。' };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: '数値として読めません。' };
  const limit = LIMITS[unit];
  if (limit.integer && !Number.isInteger(value)) return { ok: false, reason: '整数で入力してください。' };
  if (value < limit.min) return { ok: false, reason: `${limit.min} 以上で入力してください。` };
  if (value > limit.max) return { ok: false, reason: `${limit.max} 以下で入力してください。` };
  return { ok: true, value };
}

export const OVERVIEW_OVERRIDES_COLLECTION = 'overview-overrides';

/**
 * 保存する上書き 1 件。**id は持たない** — レコードストアが採番した id が
 * 別に付くので、中身にも持つと 2 か所を合わせ続けることになる。
 */
export interface OverrideEntry extends Record<string, unknown> {
  readonly path: string;
  readonly value: number;
  readonly note?: string;
}

export interface AppliedOverviewOverrides<T> {
  /** 上書き後の経営概況。 */
  readonly overview: T;
  /** 手入力に置き換わったパス。画面で「手入力」と示すために使う。 */
  readonly overridden: readonly string[];
  /** 一覧に無い / 値が不正で無視したもの。 */
  readonly ignored: readonly string[];
  /**
   * 上書きした数値から計算されているのに、自動値のままになっている指標。
   * 「売上だけ手で置いて利益率は自動のまま」を黙って通さないための出力。
   */
  readonly staleDerived: readonly { path: string; label: string; because: readonly string[] }[];
}

/**
 * 素のオブジェクトか。null・配列・関数・プリミティブをまとめて外す。
 *
 * `typeof v === 'object' && v !== null && !Array.isArray(v)` と枝を分けると、
 * どの枝も単独では観測できる差にならない（関数は typeof で落ち、null は
 * その先の `Object.hasOwn` で落ちる）。判定を 1 本にすると分岐自体が消える。
 */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/**
 * パスの位置へ値を書いた**複製**を返す。書けなければ null
 * （途中の階層が無い / オブジェクトでない）。
 *
 * `{ changed, next }` の対で返すと、書けなかったときの `next` を誰も見ないため
 * その返り値を壊しても差が出ない。書けなかったことは null 1 つで表す。
 */
function setAtPath<T>(root: T, path: string, value: number): T | null {
  const segments = path.split('.');
  const clone = (node: Record<string, unknown>, depth: number): Record<string, unknown> | null => {
    const key = segments[depth]!;
    if (!Object.hasOwn(node, key)) return null;
    if (depth === segments.length - 1) return { ...node, [key]: value };
    const child = node[key];
    if (!isPlainRecord(child)) return null;
    const inner = clone(child, depth + 1);
    if (inner === null) return null;
    return { ...node, [key]: inner };
  };
  if (!isPlainRecord(root)) return null;
  return clone(root, 0) as T | null;
}

/**
 * 上書きを適用する。**allowlist に無いパスと不正な値は無視**し、
 * 何を無視したかを返す（黙って捨てない）。
 */
export function applyOverviewOverrides<T>(
  base: T,
  overrides: readonly OverrideEntry[],
): AppliedOverviewOverrides<T> {
  let overview = base;
  const overridden: string[] = [];
  const ignored: string[] = [];

  for (const o of overrides) {
    const field = findOverridableField(String(o.path));
    if (field === null) {
      ignored.push(String(o.path));
      continue;
    }
    // typeof の判定は要らない: Number.isFinite は数値以外を型変換せずに false にする。
    if (!Number.isFinite(o.value)) {
      ignored.push(field.path);
      continue;
    }
    const next = setAtPath(overview, field.path, o.value);
    if (next === null) {
      ignored.push(field.path);
      continue;
    }
    overview = next;
    if (!overridden.includes(field.path)) overridden.push(field.path);
  }

  const staleDerived: { path: string; label: string; because: readonly string[] }[] = [];
  for (const f of OVERRIDABLE_FIELDS) {
    if (f.derivedFrom === undefined) continue;
    if (overridden.includes(f.path)) continue;
    const because = f.derivedFrom.filter((src) => overridden.includes(src));
    if (because.length > 0) staleDerived.push({ path: f.path, label: f.label, because });
  }

  return { overview, overridden, ignored, staleDerived };
}

// ---------------------------------------------------------------------------
// 任意項目（自動計算に無い数字を足す）
// ---------------------------------------------------------------------------

export const OVERVIEW_CUSTOM_METRICS_COLLECTION = 'overview-custom-metrics';

export const CUSTOM_METRIC_MAX_LABEL = 40;
export const CUSTOM_METRIC_MAX_NOTE = 200;

/** 入力から作る中身（保存時に id を足す）。 */
export interface CustomMetricInput {
  readonly label: string;
  readonly value: number;
  readonly unit: MetricUnit;
  readonly note?: string;
}

/** 保存する任意項目 1 件。id はレコードストア側が持つ。 */
export type CustomMetricEntry = CustomMetricInput & Record<string, unknown>;

export type CustomMetricResult = { ok: true; entry: CustomMetricInput } | { ok: false; reason: string };

const UNITS: readonly MetricUnit[] = ['yen', 'pct', 'count', 'days', 'months'];

export function isMetricUnit(v: unknown): v is MetricUnit {
  // typeof の判定を足しても、非文字列は includes が false にするので差が出ない。
  return (UNITS as readonly unknown[]).includes(v);
}

/** 任意項目の入力を検証する。ラベルは必須・単位は既知のもののみ。 */
export function parseCustomMetric(input: {
  label?: string;
  value?: string;
  unit?: string;
  note?: string;
}): CustomMetricResult {
  const label = (input.label ?? '').trim();
  if (label.length === 0) return { ok: false, reason: '項目名を入力してください。' };
  if (label.length > CUSTOM_METRIC_MAX_LABEL) {
    return { ok: false, reason: `項目名は ${CUSTOM_METRIC_MAX_LABEL} 文字までです。` };
  }
  if (!isMetricUnit(input.unit)) return { ok: false, reason: '単位を選んでください。' };
  const parsed = parseOverrideValue(input.value ?? '', input.unit);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const note = (input.note ?? '').trim();
  if (note.length > CUSTOM_METRIC_MAX_NOTE) {
    return { ok: false, reason: `メモは ${CUSTOM_METRIC_MAX_NOTE} 文字までです。` };
  }
  const entry: CustomMetricInput = note.length > 0
    ? { label, value: parsed.value, unit: input.unit, note }
    : { label, value: parsed.value, unit: input.unit };
  return { ok: true, entry };
}

/** 表示用の整形。単位を数値の意味に合わせて付ける。 */
export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'yen':
      return `${Math.round(value).toLocaleString('ja-JP')} 円`;
    case 'pct':
      return `${value.toFixed(1)} %`;
    case 'count':
      return `${Math.round(value).toLocaleString('ja-JP')} 件`;
    case 'days':
      return `${value.toFixed(1)} 日`;
    case 'months':
      return `${value.toFixed(1)} か月`;
  }
}
