/**
 * 株主名簿の可変行。
 *
 * 元は `s1`〜`s3` の 3 人固定だった。株主が 4 人以上いる会社では書けず、
 * 1 人の会社では空行が 2 本残る。会社法121条は株主全員の記載を求めるので、
 * **3 人で足りるという前提そのものが誤り**だった。
 *
 * ## キーの持ち方
 *
 * `s{n}{field}`（`s1name` / `s2shares` …）という**既存の命名をそのまま
 * 使う**。ここを作り直すと、すでに保存されている入力が全部読めなくなる。
 * 行数だけを別のキー (`shCount`) に持たせて増減する。
 *
 * ## 行数が保存されていないとき
 *
 * 既存の保存データには `shCount` が無い。0 人として描くと**入力済みの
 * 株主が画面から消える**ので、「実際に何か入っている最大の行」と既定の
 * 3 のうち大きい方を採る。こうすると、これまで 3 行で使っていた人には
 * 何も変わらず、4 人目まで入っていたデータは 4 行で開く。
 */

export type Values = Record<string, string>;

export const SHAREHOLDER_COUNT_KEY = 'shCount';

/** 名簿である以上、行を 0 にはできない。 */
export const MIN_SHAREHOLDERS = 1;

/**
 * 行数の上限。
 *
 * 印刷物として現実的な範囲に収めるための歯止めで、法令上の制限ではない。
 * **超えたときは黙って無視せず、画面で上限に達したと伝える**（押したのに
 * 増えない状態が一番分かりにくい）。
 */
export const MAX_SHAREHOLDERS = 100;

/** 既存の書式が 3 行だったので、初期表示は 3 行のままにする。 */
export const DEFAULT_SHAREHOLDERS = 3;

export const SHAREHOLDER_FIELDS = ['name', 'addr', 'shares', 'date'] as const;
export type ShareholderField = (typeof SHAREHOLDER_FIELDS)[number];

export interface Shareholder {
  /** 1 始まりの行番号（キーの `s{n}` と一致する）。 */
  readonly index: number;
  readonly name: string;
  readonly addr: string;
  readonly shares: string;
  readonly date: string;
}

/** `s1name` のようなキーを組み立てる。 */
export function shareholderKey(index: number, field: ShareholderField): string {
  return `s${index}${field}`;
}

function clampCount(n: number): number {
  // `if (n < MIN) return MIN` と書くと、n === MIN のとき両方が同じ値を返すため
  // 比較演算子を変えても結果が変わらない（＝テストで殺せない分岐が残る）。
  return Math.min(MAX_SHAREHOLDERS, Math.max(MIN_SHAREHOLDERS, n));
}

/**
 * 入力が入っている最も後ろの行番号。無ければ 0。
 *
 * `shCount` が無い保存データを開くときに、既に書かれた株主を落とさない
 * ために使う。
 */
const ROW_KEY_RE = /^s(\d+)(?:name|addr|shares|date)$/;

export function highestFilledRow(values: Values): number {
  let last = 0;
  // 1..MAX を総なめすると、上限の 1 行だけを見落とす off-by-one が
  // 等価変異になって残る。実際に入っている鍵の方を見る。
  for (const [k, v] of Object.entries(values)) {
    if (v.trim() === '') continue;
    const m = ROW_KEY_RE.exec(k);
    if (m === null) continue;
    last = Math.max(last, Number(m[1]));
  }
  return last;
}

/** 現在の行数。保存されていなければ入力状況から復元する。 */
export function readShareholderCount(values: Values): number {
  // 未設定は Number(undefined) === NaN、空文字と空白だけは Number → 0 に
  // なるので、`isInteger && >= MIN` の 1 本で全部ふるい落とせる。
  // (trim や `raw !== ''` を足しても結果が変わらず、等価変異になるだけ)
  const parsed = Number(values[SHAREHOLDER_COUNT_KEY]);
  if (Number.isInteger(parsed) && parsed >= MIN_SHAREHOLDERS) {
    return clampCount(parsed);
  }
  return clampCount(Math.max(DEFAULT_SHAREHOLDERS, highestFilledRow(values)));
}

/** 表示・印刷に使う行の一覧。 */
export function listShareholders(values: Values, count = readShareholderCount(values)): Shareholder[] {
  const n = clampCount(count);
  const out: Shareholder[] = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      index: i,
      name: values[shareholderKey(i, 'name')] ?? '',
      addr: values[shareholderKey(i, 'addr')] ?? '',
      shares: values[shareholderKey(i, 'shares')] ?? '',
      date: values[shareholderKey(i, 'date')] ?? '',
    });
  }
  return out;
}

/** 数値として読めた株式数だけを合計する。 */
export function totalHeldShares(values: Values, count = readShareholderCount(values)): number {
  let sum = 0;
  for (const s of listShareholders(values, count)) {
    const n = Number(s.shares.replace(/[,，\s]/g, ''));
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/** 名前が入っている行数（「株主が 1 人もいない」を検出するため）。 */
export function namedShareholderCount(values: Values, count = readShareholderCount(values)): number {
  return listShareholders(values, count).filter((s) => s.name.trim() !== '').length;
}

/**
 * 行を 1 つ増やす。返すのは `values` へ当てる差分。
 *
 * 上限に達していたら**空の差分**を返す。呼び出し側は `canAdd` で先に
 * 判断して、押せない理由を画面に出すこと。
 */
export function addShareholder(values: Values): Values {
  const count = readShareholderCount(values);
  if (count >= MAX_SHAREHOLDERS) return {};
  return { [SHAREHOLDER_COUNT_KEY]: String(count + 1) };
}

export function canAddShareholder(values: Values): boolean {
  return readShareholderCount(values) < MAX_SHAREHOLDERS;
}

export function canRemoveShareholder(values: Values): boolean {
  return readShareholderCount(values) > MIN_SHAREHOLDERS;
}

/**
 * 指定した行を消す。返すのは `values` へ当てる差分。
 *
 * **後ろの行を前へ詰める。** 消した行だけを空にすると名簿の途中に空行が
 * 残り、印刷物に穴が空く。最後の行は差分で明示的に空文字にしておく
 * （詰めたあとの余りが残らないように）。
 */
export function removeShareholder(values: Values, index: number): Values {
  const count = readShareholderCount(values);
  if (count <= MIN_SHAREHOLDERS) return {};
  if (index < 1 || index > count) return {};

  const patch: Values = {};
  // `i <= count` まで回すと、最後の行は存在しない次の行（= 空）で上書きされる。
  // 「詰める」と「最後を空にする」を別々のループにすると、片方を消しても
  // もう片方が同じ結果を作ってしまい、テストで殺せない分岐になる。
  for (let i = index; i <= count; i++) {
    for (const f of SHAREHOLDER_FIELDS) {
      patch[shareholderKey(i, f)] = values[shareholderKey(i + 1, f)] ?? '';
    }
  }
  patch[SHAREHOLDER_COUNT_KEY] = String(count - 1);
  return patch;
}
