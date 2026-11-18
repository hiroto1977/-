/**
 * 品目の一覧 (養蜂の産物・養殖の魚種) —— 利用者が足したり消したりするための純粋な処理 (2026-11-18)。
 *
 * 水耕栽培の品目一覧 (`hydroponicCrops.ts`) と同じ 3 つの不変条件を守る:
 *   1. **一覧は空にならない** —— 最後の 1 件は消せず、保存が壊れていれば参考の一覧へ戻る。
 *   2. **id は一覧の中で一意** —— 利用者は id を打たない。`custom-<n>` を機械が振る。
 *   3. **数値は範囲に収める** —— 見るのは桁と形だけで、値の正しさ (この魚は本当に 1 年で育つか) は見ない。
 *
 * 養蜂と養殖で欄が違うので、欄の並び・見出し・範囲は {@link FarmListSpec} として渡す。
 * 名前の長さ・件数・id の形の天井は水耕栽培の品目と同じ定数を読む (数を 2 度書かない)。
 */
import { countChars } from './inputCeiling';
import { hasControlChar } from './controlChars';
import { CROP_ID_RE, CUSTOM_CROP_ID_PREFIX, MAX_CROPS, MAX_CROP_LABEL_CHARS } from './hydroponicCrops';

/** どの一覧の品目も持つ欄。 */
export interface FarmItemBase {
  readonly id: string;
  readonly label: string;
}

/** 品目 1 件。`F` は数値の欄の名前、`X` は数値でない欄 (養殖の水の種類)。 */
export type FarmItem<F extends string, X> = FarmItemBase & Readonly<Record<F, number>> & X;

export interface FarmFieldBound {
  readonly min: number;
  readonly max: number;
  /** 整数しか意味を持たない欄 (日数)。 */
  readonly integer: boolean;
}

/** 下限 ≦ 上限の組。両方が範囲内のときだけ見る。 */
export interface FarmFieldOrder<F extends string> {
  readonly low: F;
  readonly high: F;
  readonly message: string;
}

/** 数値でない欄の検査と写し。欄を持たない一覧は {@link NO_EXTRA_FIELDS} を渡す。 */
export interface FarmExtraFields<X> {
  /** 直すべき点 (利用者向けの文)。無ければ空。 */
  readonly issues: (raw: Readonly<Record<string, unknown>>) => readonly string[];
  /** `issues` が空のときだけ呼ばれる。既知の欄だけを写す。 */
  readonly pick: (raw: Readonly<Record<string, unknown>>) => X;
}

/** 数値でない欄を持たない一覧用。 */
export const NO_EXTRA_FIELDS: FarmExtraFields<object> = {
  issues: () => [],
  pick: () => ({}),
};

/** 1 つの一覧の決まり。 */
export interface FarmListSpec<F extends string, X> {
  /** 利用者向けの呼び名 (「品目」「魚種」)。 */
  readonly noun: string;
  readonly numericFields: readonly F[];
  readonly labels: Readonly<Record<F, string>>;
  readonly bounds: Readonly<Record<F, FarmFieldBound>>;
  readonly orders: readonly FarmFieldOrder<F>[];
  readonly extra: FarmExtraFields<X>;
  /** 参考の一覧 (保存が無いときの出発点)。空にしない。 */
  readonly builtins: readonly FarmItem<F, X>[];
}

/** 品目 1 件の形を検査し、直すべき点を利用者向けの文で返す。空なら通る。 */
export function farmItemIssues<F extends string, X>(spec: FarmListSpec<F, X>, raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [`${spec.noun}の形が不正です`];
  const r = raw as Readonly<Record<string, unknown>>;
  const issues: string[] = [];
  if (typeof r.id !== 'string' || !CROP_ID_RE.test(r.id)) issues.push(`${spec.noun}の id が不正です`);
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (label === '') issues.push(`${spec.noun}の名前を入力してください`);
  else if (countChars(label) > MAX_CROP_LABEL_CHARS) issues.push(`${spec.noun}の名前は ${MAX_CROP_LABEL_CHARS} 文字までです`);
  else if (hasControlChar(label)) issues.push(`${spec.noun}の名前に改行や制御文字は使えません`);
  const valid = new Set<F>();
  for (const field of spec.numericFields) {
    const bound = spec.bounds[field];
    const v = r[field];
    // 数値は `typeof` で見る —— `'5' >= 0` は true なので、文字列を通すと掛け算が文字列連結になる。
    // NaN / ±Infinity は範囲の比較で落ちる。
    const ok = typeof v === 'number' && v >= bound.min && v <= bound.max && (!bound.integer || Number.isInteger(v));
    if (ok) valid.add(field);
    else {
      issues.push(
        `${spec.labels[field]} は ${bound.min}〜${bound.max} の${bound.integer ? '整数' : '数値'}で入力してください`,
      );
    }
  }
  for (const order of spec.orders) {
    if (valid.has(order.low) && valid.has(order.high) && (r[order.low] as number) > (r[order.high] as number)) {
      issues.push(order.message);
    }
  }
  issues.push(...spec.extra.issues(r));
  return issues;
}

/** 形の通った品目だけを、**既知の欄だけ**写して返す。通らなければ null。 */
export function sanitizeFarmItem<F extends string, X>(spec: FarmListSpec<F, X>, raw: unknown): FarmItem<F, X> | null {
  if (farmItemIssues(spec, raw).length > 0) return null;
  const r = raw as Readonly<Record<string, unknown>>;
  const numbers = Object.fromEntries(spec.numericFields.map((f) => [f, r[f] as number])) as Record<F, number>;
  return { id: r.id as string, label: (r.label as string).trim(), ...numbers, ...spec.extra.pick(r) };
}

/** 保存された一覧を検証する。形の通らない品目は捨て、id の重複は先勝ち、件数は上限で打ち切る。 */
export function sanitizeFarmList<F extends string, X>(spec: FarmListSpec<F, X>, raw: unknown): FarmItem<F, X>[] {
  if (!Array.isArray(raw)) return [];
  const out: FarmItem<F, X>[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_CROPS) break;
    const one = sanitizeFarmItem(spec, item);
    if (one === null || seen.has(one.id)) continue;
    seen.add(one.id);
    out.push(one);
  }
  return out;
}

/** 保存された一覧、無ければ・壊れていれば・空なら参考の一覧 (不変条件 1)。 */
export function farmListOrDefault<F extends string, X>(
  spec: FarmListSpec<F, X>,
  raw: unknown,
): readonly FarmItem<F, X>[] {
  const list = sanitizeFarmList(spec, raw);
  return list.length > 0 ? list : spec.builtins;
}

/** 断る理由。画面は文言を、検査は理由コードを見る。 */
export type FarmListRefusal = 'invalid' | 'full' | 'duplicate-label' | 'last-item' | 'not-found';

/** 断りの文。呼び名は一覧ごとに違うので spec から組む。 */
export function farmRefusalMessage(noun: string, refusal: FarmListRefusal): string {
  switch (refusal) {
    case 'invalid':
      return `${noun}の入力に誤りがあります`;
    case 'full':
      return `${noun}は ${MAX_CROPS} 件までです。使わない${noun}を消してから足してください`;
    case 'duplicate-label':
      return `同じ名前の${noun}が既にあります`;
    case 'last-item':
      return `最後の 1 件は消せません (一覧は空にできません)`;
    case 'not-found':
      return `その${noun}は一覧にありません`;
  }
}

/** 一覧の増減の結果。断るときは理由と利用者向けの文を返す (投げない)。 */
export type FarmListChange<T> =
  | { readonly ok: true; readonly items: readonly T[] }
  | { readonly ok: false; readonly refusal: FarmListRefusal; readonly issues: readonly string[] };

function refuse<T>(noun: string, refusal: FarmListRefusal, details: readonly string[] = []): FarmListChange<T> {
  return { ok: false, refusal, issues: [farmRefusalMessage(noun, refusal), ...details] };
}

/** 空いている最小の `custom-<n>`。 */
export function nextCustomFarmId(list: readonly FarmItemBase[]): string {
  const ids = new Set(list.map((c) => c.id));
  let n = 1;
  while (ids.has(`${CUSTOM_CROP_ID_PREFIX}${n}`)) n += 1;
  return `${CUSTOM_CROP_ID_PREFIX}${n}`;
}

/** 品目を足す。id は機械が振り、入力の id は使わない。 */
export function addFarmItem<F extends string, X>(
  spec: FarmListSpec<F, X>,
  list: readonly FarmItem<F, X>[],
  draft: Readonly<Record<string, unknown>>,
): FarmListChange<FarmItem<F, X>> {
  if (list.length >= MAX_CROPS) return refuse(spec.noun, 'full');
  const candidate = { ...draft, id: nextCustomFarmId(list) };
  const item = sanitizeFarmItem(spec, candidate);
  if (item === null) return refuse(spec.noun, 'invalid', farmItemIssues(spec, candidate));
  if (list.some((c) => c.label === item.label)) return refuse(spec.noun, 'duplicate-label');
  return { ok: true, items: [...list, item] };
}

/** 品目を消す。最後の 1 件は消せない (不変条件 1)。 */
export function removeFarmItem<F extends string, X>(
  spec: FarmListSpec<F, X>,
  list: readonly FarmItem<F, X>[],
  id: string,
): FarmListChange<FarmItem<F, X>> {
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return refuse(spec.noun, 'not-found');
  if (list.length <= 1) return refuse(spec.noun, 'last-item');
  return { ok: true, items: list.filter((_, i) => i !== index) };
}

/** 参考の一覧のうち、今の一覧から消えているもの (「戻す」ボタンの表示条件)。 */
export function missingFarmBuiltins<F extends string, X>(
  spec: FarmListSpec<F, X>,
  list: readonly FarmItemBase[],
): readonly FarmItem<F, X>[] {
  const ids = new Set(list.map((c) => c.id));
  return spec.builtins.filter((c) => !ids.has(c.id));
}

/** 消した参考の品目を末尾に戻す。利用者が足した品目はそのまま。 */
export function restoreFarmBuiltins<F extends string, X>(
  spec: FarmListSpec<F, X>,
  list: readonly FarmItem<F, X>[],
): FarmListChange<FarmItem<F, X>> {
  const missing = missingFarmBuiltins(spec, list);
  if (list.length + missing.length > MAX_CROPS) return refuse(spec.noun, 'full');
  return { ok: true, items: [...list, ...missing] };
}

/** 参考の一覧に在る id か (画面で「参考」と印を付ける)。 */
export function isFarmBuiltinId<F extends string, X>(spec: FarmListSpec<F, X>, id: string): boolean {
  return spec.builtins.some((c) => c.id === id);
}

/** id で探す。`unknown` を受けるのは保存レコードの id が壊れていても落とさないため。 */
export function findFarmItem<T extends FarmItemBase>(list: readonly T[], id: unknown): T | undefined {
  return list.find((c) => c.id === id);
}
