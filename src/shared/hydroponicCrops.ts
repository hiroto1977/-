/**
 * 水耕栽培の品目一覧 —— 利用者が品目を足したり消したりするための純粋な処理。
 *
 * `hydroponics.ts` の `HYDROPONIC_CROPS` は参考値の 5 品目で、これは
 * **出発点であって固定の一覧ではない**。利用者は自分の品目 (ミズナ、
 * 実測値を持つ自前のレタス…) を足し、使わない品目を消せる。一覧は
 * `hydroponics-crops` collection に 1 レコードで保存する (画面側の責務)。
 *
 * ここで守る不変条件は 3 つ:
 *   1. **一覧は空にならない** —— 最後の 1 品目は消せず、保存が壊れていれば
 *      参考値の一覧へ戻る。空になると試算の品目が選べず、経営サマリーの
 *      水耕栽培の節が丸ごと消える。
 *   2. **id は一覧の中で一意** —— 利用者は id を打たない。`custom-<n>` を
 *      機械が振り、空いている最小の n を使う。設定レコードは id で品目を
 *      指すので、消した番号を再利用すると古い設定が別の品目を指し得るが、
 *      設定は最新の 1 件しか使わず画面に品目名が出るので黙って入れ替わらない。
 *   3. **数値は範囲に収める** —— 定植後日数 0 は 0 除算、pH 99 は桁誤り。
 *      `estimateProduction` は `nonNeg` で守っているが、意味の無い値を
 *      「保存できてしまう」こと自体が誤りの温床なので、足す前に断る。
 *
 * 値の正しさ (この品目は本当に 12 日で採れるか) はここでは見ない ——
 * 利用者の実測が最も正しい。見るのは**桁と形**だけ。
 */
import { hasControlChar } from './controlChars';
import { readNumeric } from './readNumeric';
import { HYDROPONIC_CROPS, type HydroponicCrop } from './hydroponics';

/** 品目名の上限 (文字数)。select の 1 行に収まる長さ。 */
export const MAX_CROP_LABEL_CHARS = 40;

/** 一覧の上限。壊れた保存や取り込みで select が何千行にもならないための砦。 */
export const MAX_CROPS = 50;

/** id の形。参考値の id (`leaf-lettuce`) も `custom-12` もこれに収まる。 */
export const CROP_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** 利用者が足した品目の id の接頭辞。 */
export const CUSTOM_CROP_ID_PREFIX = 'custom-';

/** 数値の欄。画面の入力欄・検査・保存の 3 か所が同じ並びを使う。 */
export const CROP_NUMERIC_FIELDS = [
  'nurseryDays',
  'growOutDays',
  'harvestWeightG',
  'ecLow',
  'ecHigh',
  'phLow',
  'phHigh',
  'plantsPerPanel',
] as const;
export type CropNumericField = (typeof CROP_NUMERIC_FIELDS)[number];

/** 入力欄の見出し。画面と指摘文が同じ語を使うようにここで 1 度だけ持つ。 */
export const CROP_FIELD_LABELS: Readonly<Record<CropNumericField, string>> = {
  nurseryDays: '育苗日数 (日)',
  growOutDays: '定植後日数 (日)',
  harvestWeightG: '収穫重量 (g/株)',
  ecLow: '養液 EC 下限 (mS/cm)',
  ecHigh: '養液 EC 上限 (mS/cm)',
  phLow: '養液 pH 下限',
  phHigh: '養液 pH 上限',
  plantsPerPanel: 'パネル穴数 (株/枚)',
};

export interface CropFieldBound {
  readonly min: number;
  readonly max: number;
  /** 整数しか意味を持たない欄 (日数・穴数)。 */
  readonly integer: boolean;
}

/**
 * 欄ごとの範囲。**桁誤りを止める幅**であって、栽培上の適正範囲ではない
 * (適正範囲は品目ごとに違い、それを決めるのが利用者の実測)。
 * - 育苗日数: 0〜365。直播 (育苗しない) は 0。試算には使わない。
 * - 定植後日数: 1〜365。0 は 0 除算 (年回転数 = 365 ÷ 定植後日数)。
 * - 収穫重量: 1〜10,000 g。ベビーリーフ 30g から結球野菜まで。
 * - EC: 0〜10 mS/cm。葉物は 0.8〜1.8、果菜でも 3 前後。10 を超える養液は無い。
 * - pH: 0〜14 (定義域)。
 * - パネル穴数: 1〜1,000。60cm×90cm のパネルに 1,000 穴は密植の極限。
 */
export const HYDROPONIC_CROP_BOUNDS: Readonly<Record<CropNumericField, CropFieldBound>> = {
  nurseryDays: { min: 0, max: 365, integer: true },
  growOutDays: { min: 1, max: 365, integer: true },
  harvestWeightG: { min: 1, max: 10_000, integer: false },
  ecLow: { min: 0, max: 10, integer: false },
  ecHigh: { min: 0, max: 10, integer: false },
  phLow: { min: 0, max: 14, integer: false },
  phHigh: { min: 0, max: 14, integer: false },
  plantsPerPanel: { min: 1, max: 1_000, integer: true },
};

const BUILTIN_IDS: ReadonlySet<string> = new Set(Object.keys(HYDROPONIC_CROPS));

/** 参考値の品目か (画面で「参考値」と印を付け、「戻す」の対象にする)。 */
export function isBuiltinCropId(id: string): boolean {
  return BUILTIN_IDS.has(id);
}

/** 参考値の一覧 (順序は `HYDROPONIC_CROPS` のまま)。保存が無いときの出発点。 */
export const DEFAULT_CROP_LIST: readonly HydroponicCrop[] = Object.freeze(Object.values(HYDROPONIC_CROPS));

/**
 * 品目 1 件の形を検査し、直すべき点を利用者向けの文で返す。空なら通る。
 * `unknown` を受けるのは、保存レコード (壊れているかもしれない) と入力欄
 * (文字列を数に直した直後) の両方から呼ばれるため。
 *
 * 数値は `typeof` で見る —— `'5' >= 0` は true になるので、文字列を通すと
 * 保存レコードに文字列が混ざり、試算の掛け算が文字列連結になる。
 * `Number.isFinite` は置かない: NaN / ±Infinity はどれも範囲の比較で落ちる。
 */
export function cropIssues(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return ['品目の形が不正です'];
  const r = raw as Record<string, unknown>;
  const issues: string[] = [];
  if (typeof r.id !== 'string' || !CROP_ID_RE.test(r.id)) issues.push('品目の id が不正です');
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (label === '') issues.push('品目名を入力してください');
  else if (label.length > MAX_CROP_LABEL_CHARS) issues.push(`品目名は ${MAX_CROP_LABEL_CHARS} 文字までです`);
  // 改行やタブが select の 1 行に入ると崩れる。判定はアプリで 1 つの `hasControlChar`。
  else if (hasControlChar(label)) issues.push('品目名に改行や制御文字は使えません');
  const valid = new Set<CropNumericField>();
  for (const field of CROP_NUMERIC_FIELDS) {
    const bound = HYDROPONIC_CROP_BOUNDS[field];
    const v = r[field];
    const ok =
      typeof v === 'number' &&
      v >= bound.min &&
      v <= bound.max &&
      (!bound.integer || Number.isInteger(v));
    if (ok) valid.add(field);
    else {
      issues.push(
        `${CROP_FIELD_LABELS[field]} は ${bound.min}〜${bound.max} の${bound.integer ? '整数' : '数値'}で入力してください`,
      );
    }
  }
  // 下限 ≦ 上限は、両方が範囲内のときだけ見る (範囲外の指摘と重ねない)。
  if (valid.has('ecLow') && valid.has('ecHigh') && (r.ecLow as number) > (r.ecHigh as number)) {
    issues.push('養液 EC は下限 ≦ 上限にしてください');
  }
  if (valid.has('phLow') && valid.has('phHigh') && (r.phLow as number) > (r.phHigh as number)) {
    issues.push('養液 pH は下限 ≦ 上限にしてください');
  }
  return issues;
}

/**
 * 形の通った品目だけを、**既知の欄だけ**写して返す (保存レコードに紛れた
 * 余分なキーを持ち込まない)。通らなければ null。
 */
export function sanitizeCrop(raw: unknown): HydroponicCrop | null {
  if (cropIssues(raw).length > 0) return null;
  const r = raw as Record<CropNumericField | 'id' | 'label', unknown>;
  return {
    id: r.id as string,
    label: (r.label as string).trim(),
    nurseryDays: r.nurseryDays as number,
    growOutDays: r.growOutDays as number,
    harvestWeightG: r.harvestWeightG as number,
    ecLow: r.ecLow as number,
    ecHigh: r.ecHigh as number,
    phLow: r.phLow as number,
    phHigh: r.phHigh as number,
    plantsPerPanel: r.plantsPerPanel as number,
  };
}

/**
 * 保存された一覧を検証する。形の通らない品目は捨て、id の重複は先勝ち、
 * 件数は `MAX_CROPS` で打ち切る。配列でなければ空。
 */
export function sanitizeCropList(raw: unknown): HydroponicCrop[] {
  if (!Array.isArray(raw)) return [];
  const out: HydroponicCrop[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_CROPS) break;
    const crop = sanitizeCrop(item);
    if (crop === null || seen.has(crop.id)) continue;
    seen.add(crop.id);
    out.push(crop);
  }
  return out;
}

/** 保存された一覧、無ければ・壊れていれば・空なら参考値の一覧 (不変条件 1)。 */
export function cropListOrDefault(raw: unknown): readonly HydroponicCrop[] {
  const list = sanitizeCropList(raw);
  return list.length > 0 ? list : DEFAULT_CROP_LIST;
}

/** 断る理由。画面は文言を、検査は理由コードを見る。 */
export type CropRefusal = 'invalid' | 'full' | 'duplicate-label' | 'last-crop' | 'not-found';

export const CROP_REFUSAL_MESSAGES: Readonly<Record<CropRefusal, string>> = {
  invalid: '品目の入力に誤りがあります',
  full: `品目は ${MAX_CROPS} 件までです。使わない品目を消してから足してください`,
  'duplicate-label': '同じ名前の品目が既にあります',
  'last-crop': '最後の 1 品目は消せません (一覧は空にできません)',
  'not-found': 'その品目は一覧にありません',
};

/** 一覧の増減の結果。断るときは理由と利用者向けの文を返す (投げない)。 */
export type CropListChange =
  | { readonly ok: true; readonly crops: readonly HydroponicCrop[] }
  | { readonly ok: false; readonly refusal: CropRefusal; readonly issues: readonly string[] };

function refuse(refusal: CropRefusal, details: readonly string[] = []): CropListChange {
  return { ok: false, refusal, issues: [CROP_REFUSAL_MESSAGES[refusal], ...details] };
}

/** 空いている最小の `custom-<n>`。 */
export function nextCustomCropId(list: readonly HydroponicCrop[]): string {
  const ids = new Set(list.map((c) => c.id));
  let n = 1;
  while (ids.has(`${CUSTOM_CROP_ID_PREFIX}${n}`)) n += 1;
  return `${CUSTOM_CROP_ID_PREFIX}${n}`;
}

/** 入力欄から来る品目。数値の欄は `parseCropNumber` を通した後の数 (NaN もあり得る)。 */
export type CropDraft = Readonly<Record<'label' | CropNumericField, unknown>>;

/**
 * 入力欄の文字列を数へ。空欄は NaN —— 0 に落とすと EC 0 や pH 0 が
 * 「入力した値」として通ってしまう。
 *
 * 読み取りは画面と同じ `readNumeric` に任せる (2026-09-06)。それまでは
 * ここだけ `Number(カンマを外した文字列)` で読んでいて、**同じ入力が
 * 画面と別の数になった**:
 *
 * ```
 *   '1,2'   → 12      (画面は「区切りの位置が違う」と断る)
 *              pH 1.2 と打ったつもりの値が pH 12 として範囲を通る
 *   '2,4'   → 24      整数の欄 (株数) では 2.4 の指摘が出ずに 24 になる
 *   '0x10'  → 16
 *   '1e3'   → 1000
 * ```
 *
 * `readNumeric` は読めなければ null を返すので、ここは NaN に直して
 * `cropIssues` の範囲検査に落とす (契約は変えない)。
 */
export function parseCropNumber(raw: string): number {
  return readNumeric(raw) ?? NaN;
}

/** 品目を足す。id は機械が振り、入力の id は使わない。 */
export function addCrop(list: readonly HydroponicCrop[], draft: CropDraft): CropListChange {
  if (list.length >= MAX_CROPS) return refuse('full');
  const candidate = { ...draft, id: nextCustomCropId(list) };
  const crop = sanitizeCrop(candidate);
  if (crop === null) return refuse('invalid', cropIssues(candidate));
  if (list.some((c) => c.label === crop.label)) return refuse('duplicate-label');
  return { ok: true, crops: [...list, crop] };
}

/** 品目を消す。最後の 1 件は消せない (不変条件 1)。 */
export function removeCrop(list: readonly HydroponicCrop[], id: string): CropListChange {
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) return refuse('not-found');
  if (list.length <= 1) return refuse('last-crop');
  return { ok: true, crops: list.filter((_, i) => i !== index) };
}

/** 参考値の品目のうち、一覧から消えているもの (「戻す」ボタンの表示条件)。 */
export function missingBuiltinCrops(list: readonly HydroponicCrop[]): readonly HydroponicCrop[] {
  const ids = new Set(list.map((c) => c.id));
  return DEFAULT_CROP_LIST.filter((c) => !ids.has(c.id));
}

/** 消した参考値の品目を末尾に戻す。利用者が足した品目はそのまま。 */
export function restoreBuiltinCrops(list: readonly HydroponicCrop[]): CropListChange {
  const missing = missingBuiltinCrops(list);
  if (list.length + missing.length > MAX_CROPS) return refuse('full');
  return { ok: true, crops: [...list, ...missing] };
}

/** id で探す。`unknown` を受けるのは保存レコードの id が壊れていても落とさないため。 */
export function findCrop(list: readonly HydroponicCrop[], id: unknown): HydroponicCrop | undefined {
  return list.find((c) => c.id === id);
}

/**
 * id を一覧の中の品目へ寄せる。無ければ一覧の先頭、一覧が空なら参考値の
 * 先頭 (一覧は空にならないはずだが、呼び出し側の誤りで落とさない)。
 */
export function resolveCropFrom(list: readonly HydroponicCrop[], id: unknown): HydroponicCrop {
  return findCrop(list, id) ?? list[0] ?? DEFAULT_CROP_LIST[0]!;
}
