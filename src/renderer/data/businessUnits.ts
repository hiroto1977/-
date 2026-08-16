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

/** 保存する事業 1 件。id はレコードストアが採番する。 */
export interface BusinessUnitInput extends Record<string, unknown> {
  readonly name: string;
  /** 業種・区分など。任意。 */
  readonly category?: string;
  /** 開始年月 `YYYY-MM` または開始日 `YYYY-MM-DD`。任意。 */
  readonly startedOn?: string;
  readonly note?: string;
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

  // 空の項目は持たせない。空文字を保存すると「未入力」と「空と入力した」の
  // 区別が付かなくなり、表示側で両方を書き分けることになる。
  const entry: Record<string, unknown> = { name };
  if (category.length > 0) entry['category'] = category;
  if (startedOn.length > 0) entry['startedOn'] = startedOn;
  if (note.length > 0) entry['note'] = note;
  return { ok: true, entry: entry as unknown as BusinessUnitInput };
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
