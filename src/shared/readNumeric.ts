/**
 * **数字の読み取り —— アプリで 1 つの方針。**
 *
 * 入力欄の文字列を数にする口は 4 つあり、**全部ここを通す**:
 *
 * ```
 *   renderer/data/inputGuards.ts        画面の番人 (readNumber / guardNumber)
 *   shared/hydroponicCrops.ts           品目の数値 (EC / pH / 株数 / 収穫重量)
 *   renderer/data/investments.ts        物件・保有銘柄の金額
 *   renderer/data/businessUnits.ts      事業の売上・変動費・固定費
 * ```
 *
 * かつては口ごとにパーサが違い、同じ入力で結果が食い違っていた
 * (`renderer/data/inputGuards.ts` 冒頭の経緯と、2026-09-06 の
 * `numberReadingParity.test.ts`)。読み取りを 1 か所に置く理由は、
 * **同じ文字列が場所によって別の数になる**のを構造的に起こさないため。
 *
 * 方針:
 *  - 全角英数記号は半角化する (`１，０００` → `1,000`)
 *  - 飾り (通貨記号・単位・桁区切り) は落とすが、**位置**を見る
 *  - 単位語 (万・億・兆・千 と数字直後の k/m/b) は**解釈しない**
 *  - 読めないものは読めないと言う (0 や別の数に倒さない)
 *
 * 読めなかったときに何と言うか (未入力・単位付き・位置) は
 * `renderer/data/inputGuards.ts` の `guardNumber` が持つ。
 */
const FULLWIDTH = /[！-～]/g;
const toHalfWidth = (s: string) => s.replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 単位語を含むか（含む場合は数値として読み替えず、指摘に回す）。 */
const UNIT_WORD = /[万億兆千]|[０-９0-9]\s*[kKmMbB]\b/;

/** 読み取りで無視してよい飾り（通貨記号・単位・区切り）。 */
const DECORATION = /[¥￥$,\s円％%人年月日個株㎡ｍm]/g;

/**
 * 飾りを置いてよい**位置**。
 *
 *     [符号][通貨記号] 整数部[.小数部] [単位]
 *
 * 整数部は素の数字列か、3 桁区切りが正しい数字列のどちらか。
 *
 * ## なぜ位置まで見るのか (2026-09-06 実測)
 *
 * それまでは飾りを**どこからでも**落として連結していた。飾りが数字の**間**に
 * あると、離れた桁がつながって**別の数**になり、しかも読めているので
 * `guardNumber` は何も言わない —— このモジュールが潰したはずの
 * 「黙って間違った数で計算する」が、0 ではなく**別の数**の形で残っていた:
 *
 * ```
 *   '100m2'        → 1002        面積 100 ㎡ が 1002 ㎡ (建蔽率・容積率・利回りへ)
 *   '0.5m3'        → 0.53        小数が壊れる
 *   '2024年12月31日' → 20241231    日付を金額欄に貼ると 2,024 万円
 *   '1,23'         → 123         桁区切りの位置が違っても通っていた
 *   '1,000,00'     → 100000      同上
 *   '30 000'       → 30000       空白区切りは受けていた ('1 2 3' → 123 も)
 *   '3年6月'        → 36          3 年 6 か月 が 36 年
 * ```
 *
 * 台帳 (`parameters.ts`) の編集欄もこの読み取りを使うので、法定値が
 * 黙って別の数で保存されうる経路だった。
 *
 * **空白区切りの桁 (`30 000`) も読まない。** 「桁区切りの空白」と
 * 「2 つの数が続いている」を区別する手立てが無く、区別できない物を
 * 当てにいくのは、このモジュールが避けている誤解釈そのものである。
 */
const NUMBER_SHAPE =
  /^(?:[+-]?[¥￥$]?|[¥￥$][+-])\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*[円％%人年月日個株㎡ｍm]*$/;

/**
 * 入力文字列を数値として読む。読めなければ null。
 *
 * - 全角英数記号を半角化
 * - 通貨記号・単位・桁区切り・空白を除去 (**位置が正しいときだけ** —— `NUMBER_SHAPE`)
 * - 空文字は null（「未入力」は呼び出し側で 0 に倒す）
 * - `1e3` `0x10` `Infinity` `NaN` `1..2` `++5` は読まない
 * - `万` `億` などの単位語を含むものは読まない（誤解釈より未読を選ぶ）
 */
export function readNumeric(raw: string | undefined | null): number | null {
  // null / undefined / 空文字を早期 return しないのは、下の厳格な正規表現が
  // 'undefined' 'null' '' をいずれも弾くため。分岐を足しても結果は変わらない。
  const half = toHalfWidth(String(raw)).trim();
  if (UNIT_WORD.test(half)) return null;
  // 飾りの**位置**を見る (NUMBER_SHAPE)。位置を見ずに落とすと、数字の間の
  // 飾りで桁がつながって別の数になる (2026-09-06 実測。同モジュール上部)。
  if (!NUMBER_SHAPE.test(half)) return null;
  // 形が通っているので、飾りを落とした残りは必ず `[+-]?\d+(\.\d+)?`。
  // 桁があふれて Infinity になる入力 (9 が 309 個) だけがここで落ちる。
  const n = Number(half.replace(DECORATION, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 飾りを**全部**落とせば数値になる入力 —— つまり 2026-09-06 まで
 * そのまま連結して読んでいた形。`hasInteriorNoise` の判定に使う。
 */
function readIgnoringPosition(half: string): number | null {
  const bare = half.replace(DECORATION, '');
  if (!/^[+-]?\d+(\.\d+)?$/.test(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? n : null;
}

/**
 * 数字の**間**に単位や区切りが入っているか (`100m2` `3年6月` `1,23` `30 000`)。
 *
 * 「読めない」の理由を分けるために使う。旧実装がこれらを**別の数として
 * 読んでいた**ので、指摘の文面も「数値ではない」ではなく
 * 「位置が違う」と言えるほうが直せる。
 */
export function hasInteriorNoise(raw: string | undefined | null): boolean {
  // 万・億は「位置」の話ではない (専用の文面がある)。`5m` のように
  // **飾りとしても読める単位語**があるので、この門は外せない。
  if (hasUnitWord(raw)) return false;
  // 読める入力は noise ではない。判定を `readNumeric` に委ねる —— 同じ形の
  // 検査を 2 つ持つと、片方だけ緩んだときに文面が入れ替わる。
  if (readNumeric(raw) !== null) return false;
  return readIgnoringPosition(toHalfWidth(String(raw))) !== null;
}

/** 単位語（万・億）が含まれているか。指摘の文面を変えるために使う。 */
export function hasUnitWord(raw: string | undefined | null): boolean {
  // 空・null・undefined を早期 return しないのは、'undefined' 'null' '' の
  // いずれも UNIT_WORD に当たらず false になるため（分岐を足しても同じ）。
  return UNIT_WORD.test(toHalfWidth(String(raw)));
}
