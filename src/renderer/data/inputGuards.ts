/**
 * 数値入力のガード — 「黙って 0 として計算される」を潰す。
 *
 * このアプリの試算画面は、入力を `Number(x) || 0` や「数字以外を除去して
 * Number()」で読んでいた。どちらも読めない入力を静かに 0 に落とすため、
 * 打ち間違いがそのまま自信のある間違った答えになる。しかも画面ごとに
 * パーサが違い、`Number('30,000')` は NaN → 0、桁区切りを消す方は 30000 と、
 * 同じ入力で結果が食い違っていた。
 *
 * ここでは
 *   1. 読み取りを `readNumber()` 1 本に統一し（計算も警告も同じ関数を使う）、
 *   2. 読めなかった / 単位付き / 範囲外を `guardNumber()` が指摘する。
 * 警告と計算が同じ関数から出るので、「警告は出ないのに 0 で計算されていた」
 * が構造的に起きない。
 *
 * 単位（万・億）は**解釈しない**。`4200万` を 42,000,000 と読み替えるのは
 * 親切に見えて、読み替えを誤ったときに気づけない。読み取れないものは
 * 読み取れないと言い、円単位での入力を促す方が安全と判断した。
 *
 * 同じ理由で、飾り（通貨記号・単位・桁区切り）は**位置**まで見る。
 * 位置を見ずに落としていた 2026-09-06 までは `100m2` が 1002、
 * `2024年12月31日` が 20241231 と読めてしまい、**読めている以上
 * 指摘も出なかった** —— 詳細は `shared/readNumeric.ts` の `NUMBER_SHAPE` の注記。
 */

import { byIssueLevel, type IssueLevel } from '../../shared/issueLevel';
import { hasInteriorNoise, hasUnitWord, readNumeric } from '../../shared/readNumeric';
import { MAX_DEPENDENTS_PER_KIND } from '../../shared/taxDeductions';

// 読み取り自体は `shared/readNumeric.ts` が 1 つだけ持つ (画面と共有検査で
// 同じ文字列が別の数にならないように)。ここは「読めなかったときに何と言うか」。
export { hasInteriorNoise, hasUnitWord };
export { readNumeric as readNumber };

/** 重大度はアプリ全体で 1 つ（`shared/issueLevel.ts`）。 */
export type GuardLevel = IssueLevel;

/**
 * **関門の文が述べた「結果」** (2026-09-27 · パス 493l)。
 *
 * それまで読めない値の 3 枝と空欄の枝は、欄を問わず「0 X として計算されています」と
 * 述べていた。実測 (2026-09-27 · 全画面の関門つき 91 欄に `abc` / 空欄 / `0` を打って
 * 画面を比べる): `abc` で**76 欄**、空欄で**38 欄**がその文と違うことをしていた ——
 * 読む段ごと断る (不動産・水循環・敷地・給与・投資信託・貿易の 6 表と保存の 2 表)、
 * 「無い」として読み「—」を出す (敷地の奥行・間口)、既定へ倒す (決算書の法人税の欄)。
 * 関門は読む側を知らないので、**読む側の扱いは宣言が持ち** (`NumSpec.refusedBy` /
 * `NumSpec.absent`)、関門はそれに従って結果を 1 つ選ぶ。選んだ結果は文と一緒に返し、
 * 画面 (`GuardSummary`) と断りの表 (`refusedFields`) は**文ではなくこの値**を読む。
 *
 *   computedAsZero … 0 として計算に入る (「0 X として計算されています」)
 *   savedAsZero    … 保存すると 0 として記録される (保存の欄の空欄)
 *   refused        … この欄を読む判定・保存を出さない (段ごと断る)
 *   notComputed    … この欄を使う値は算定しない (「—」を出す)
 *   asIfEmpty      … 空欄と同じ扱いで計算する (「無い」なら既定へ倒す読み手)
 */
export type GuardOutcome = 'computedAsZero' | 'savedAsZero' | 'refused' | 'notComputed' | 'asIfEmpty';

export interface GuardIssue {
  readonly level: GuardLevel;
  readonly label: string;
  readonly message: string;
  /** 文が述べた結果。`null` は**結果を述べていない** (範囲の断り・桁の問い・整数の問い)。 */
  readonly outcome: GuardOutcome | null;
}

/** ⛔ の間、読む側が何を断るか。語彙は `RefusedFieldsNote` の `kind` と同じ。 */
export type RefusalKind = 'judgement' | 'save';

/** 入力欄の性質。既定の範囲チェックがこれで決まる。 */
export type NumKind =
  | 'money' // 円
  | 'percent' // %
  | 'years' // 年
  | 'months' // か月
  | 'people' // 人数（整数）—— 単位語「人」(パス 493k)
  // ★ 2026-09-27 (パス 493n) まで、ここには `count` (件) と `ratio` (倍) が在った。実測すると
  // **2 つとも使う欄が 1 つも正しくなかった** —— `count` の 9 欄は 日・h・段・回・団体・戸・月・年・人、
  // `ratio` の 7 欄は L と外貨と円で、断りは「31 件 は想定の範囲を超えています」(棚の段数) や
  // 「0 倍 では計算できません」(外貨額) と**嘘の単位**を言っていた。単位語が総称の種類は
  // 「近い kind」として借りられる (パス 373 / 493k が 1 つずつ直した形) ので、種類ごと消した。
  // 欄の単位は下の種類から選び、無ければ単位語つきの種類を足す。
  | 'hours' // h（小数を許す —— 8.5 時間は正当）
  | 'tiers' // 段（整数）
  | 'times' // 回（整数）
  | 'municipalities' // 団体（整数）—— ふるさと納税の寄附先の数え方 (ワンストップ特例は「5 団体以内」)
  | 'dwellings' // 戸（整数）
  | 'calendarMonth' // 月（整数）—— 暦の月。期間の「か月」(`months`) とは別
  | 'calendarYear' // 年（整数）—— 暦の年 (西暦)。期間の「年」(`years`) は 100 を超えると桁を尋ねるので借りない
  | 'currencyUnits' // 通貨 —— 外貨の額 (「1 万通貨」の数え方)
  | 'area' // ㎡
  | 'length' // m
  | 'ppm' // mg/L・ppm など濃度
  | 'days' // 日数（整数）
  | 'energy' // kWh/kg（電力原単位）
  | 'mgPer100g' // mg/100g（食品成分）
  | 'km' // 距離 (km)
  // 水耕栽培の運転設定 (2026-09-21 · パス 373)。
  | 'celsius' // ℃ (氷点下が正当なので負を断らない)
  | 'liters' // L
  | 'ppmAir' // ppm (空気中の CO₂ —— `ppm` は単位語が mg/L なので借りない)
  | 'normality' // N (規定度)
  | 'ecRise' // mS/cm (原液 1 mL/L あたりの EC 上昇)
  // 経営サマリーの養液の点検と、受給判定の年齢が足した 3 種 (2026-09-27 · パス 493q)。
  | 'ec' // mS/cm (養液そのものの EC —— 上の `ecRise` とは桁の尋ねが違う)
  | 'ph' // pH (単位ではないが、断りの文に出る語として「pH」を置く)
  | 'age'; // 歳（整数）

export interface NumSpec {
  readonly label: string;
  readonly kind: NumKind;
  /** 未入力を許す（省略時は「未入力＝0 として計算」を warn で知らせる）。 */
  readonly allowEmpty?: boolean;
  /** 0 を許す（既定は kind ごと。area / length は 0 を fatal にする）。 */
  readonly allowZero?: boolean;
  readonly min?: number;
  readonly max?: number;
  /** この値を超えたら「桁を間違えていないか」を尋ねる。 */
  readonly sane?: number;
  /**
   * **⛔ の間、この欄を読む側が断る物** (パス 493l)。`'judgement'` は段ごとの判定、
   * `'save'` は保存。無ければ断らない (値は `absent` のとおりに読まれて計算に入る)。
   * `refusedFields` に渡す表は型でこれを要求する (`refusingSpecs` で付ける) ——
   * 断る表の欄が「0 として計算されています」と言うと、段の断りと食い違う。
   */
  readonly refusedBy?: RefusalKind;
  /**
   * 読めない値・空欄を読む側がどう読むか (パス 493l)。既定 `'zero'` (`readNumberOr0`)。
   * `'null'` は `readNumberOrNull` —— 「無い」として読み、0 を計算に入れない。
   * 読みが 0 でも、**計算がその 0 を「未入力」として扱い算定しない**なら `'null'` と宣言する
   * (物件価格・RO 回収率 / 塩除去率) —— 述べた「算定していません」が真かは
   * `guardClaimsOnScreen.test.ts` が画面で確かめる。
   */
  readonly absent?: 'zero' | 'null';
}

/** 断る表の欄。`refusedFields` / `refusalLabels` はこれしか受け取らない。 */
export type RefusingSpec = NumSpec & { readonly refusedBy: RefusalKind };

/**
 * **表の欄すべてに「⛔ の間は断る」を付ける** (パス 493l)。断る表は宣言をこれで包む ——
 * 欄ごとに書くと、表に 1 欄足したときに書き忘れた欄だけが「0 として計算されています」と言う。
 */
export function refusingSpecs<K extends string>(
  by: RefusalKind,
  specs: Readonly<Record<K, NumSpec>>,
): Readonly<Record<K, RefusingSpec>> {
  const out = {} as Record<K, RefusingSpec>;
  for (const k of Object.keys(specs) as K[]) out[k] = { ...specs[k], refusedBy: by };
  return out;
}

/**
 * **扶養親族の人数の欄の関門** —— 税金ページと福利厚生カードが同じ問いに同じ答えを返すための 1 つ
 * (2026-09-27 · パス 493k)。天井は並びを作る側 (`dependentsFromCounts`) と同じ定数。
 */
export function dependentCountSpec(label: string): NumSpec {
  return { label, kind: 'people', allowEmpty: true, allowZero: true, max: MAX_DEPENDENTS_PER_KIND };
}

/** 読めなければ 0。計算側はこれを使い、警告側は guardNumber を使う。 */
export function readNumberOr0(raw: string | undefined | null): number {
  return readNumeric(raw) ?? 0;
}

/**
 * 読めなければ `null`。**「未入力」と「0 と入力された」を区別したい欄**で使う。
 *
 * `readNumberOr0` は空欄を 0 に倒すので、0 を断る欄
 * (`allowZero: false` の欄と、既定で断る `area` / `length`) では**画面が受け付けない値**が
 * 計算に入り、算定できていない結果が「0 という測定値」として出る。
 * 0 が意味を持つ欄 (`allowZero: true`) は従来どおり `readNumberOr0` でよい。
 */
export function readNumberOrNull(raw: string | undefined | null): number | null {
  return readNumeric(raw);
}

interface KindRule {
  readonly unit: string;
  readonly zeroIsFatal?: boolean;
  readonly negativeIsFatal?: boolean;
  readonly integer?: boolean;
  readonly max?: number;
  readonly sane?: number;
}

const KIND: Record<NumKind, KindRule> = {
  money: { unit: '円', sane: 1e13 },
  percent: { unit: '%', negativeIsFatal: false, max: 1000, sane: 100 },
  years: { unit: '年', negativeIsFatal: true, sane: 100 },
  months: { unit: 'か月', negativeIsFatal: true, sane: 1200 },
  // 扶養親族の人数・従業者数 (パス 493k / 493n)。単位語は「人」——
  // 「20 件 以下で入力してください」を人数の欄に出さない (下の days / energy と同じ理由)。
  people: { unit: '人', negativeIsFatal: true, integer: true, sane: 100000 },
  // パス 493n で `count` / `ratio` の代わりに足した 8 種。**規則はどれも借りた種類と同じ**
  // (マイナスは断る・整数の欄は整数を求める) で、単位語だけが欄の実物に合う。上限は欄の
  // spec が持つ (決算月 1〜12・終了年 2000〜2100 ほか) ので、種類には桁の尋ね (sane) だけを置く。
  hours: { unit: 'h', negativeIsFatal: true, sane: 8760 }, // 1 年ぶんの時間
  tiers: { unit: '段', negativeIsFatal: true, integer: true, sane: 100 },
  times: { unit: '回', negativeIsFatal: true, integer: true, sane: 1000 },
  municipalities: { unit: '団体', negativeIsFatal: true, integer: true },
  dwellings: { unit: '戸', negativeIsFatal: true, integer: true },
  calendarMonth: { unit: '月', negativeIsFatal: true, integer: true },
  calendarYear: { unit: '年', negativeIsFatal: true, integer: true },
  currencyUnits: { unit: '通貨', negativeIsFatal: true, sane: 1e13 },
  area: { unit: '㎡', negativeIsFatal: true, zeroIsFatal: true, sane: 1e6 },
  length: { unit: 'm', negativeIsFatal: true, zeroIsFatal: true, sane: 1000 },
  ppm: { unit: 'mg/L', negativeIsFatal: true, sane: 100000 },
  // 水耕栽培の入力欄が足した 3 種。単位語は「0 X として計算されています」の
  // 文面にそのまま出るので、近い kind を借りると (倍・mg/L) 嘘の単位を言う。
  days: { unit: '日', negativeIsFatal: true, integer: true, sane: 3650 },
  energy: { unit: 'kWh/kg', negativeIsFatal: true, sane: 100 },
  mgPer100g: { unit: 'mg/100g', negativeIsFatal: true, sane: 10000 },
  // 通勤距離 (片道 km)。`length` は m で 0 を断るが、マイカー通勤なし = 0 km は正当。
  km: { unit: 'km', negativeIsFatal: true, sane: 1000 },
  // 水耕栽培の運転設定が足した 5 種 (2026-09-21 · パス 373)。**近い kind を借りない** ——
  // 単位語は「0 X として計算されています」「X 以下で入力してください」の文面に
  // そのまま出るので、借りると嘘の単位を言う (上の days / energy / mgPer100g と同じ理由)。
  // 温度だけ負を断らない —— 氷点下の室温は正当な入力である。
  // ★ **`false` と書く** (パス 493k)。それまでここは「立てない」= 欄を書かないで表していたが、
  // `guardNumber` の判定は `negativeIsFatal !== false` なので**書かないことは「断る」と同じ**だった
  // (spec が `min` を持たない温度の欄では -5 ℃ が ⛔「マイナスの値は指定できません」になる)。
  // 実物の温度の欄は下限 (-5 / -20) を必ず持つので画面の答えは変わらない —— 直したのは既定の意味。
  celsius: { unit: '℃', negativeIsFatal: false, sane: 60 },
  liters: { unit: 'L', negativeIsFatal: true, sane: 100000 },
  ppmAir: { unit: 'ppm', negativeIsFatal: true, sane: 50000 },
  normality: { unit: 'N', negativeIsFatal: true, sane: 40 },
  ecRise: { unit: 'mS/cm', negativeIsFatal: true, sane: 5 },
  // パス 493q で足した 3 種。**上限は欄の spec が持つ** —— 養液の EC / pH は測定の妥当範囲
  // (`READING_FIELD_SPECS` の `plausibleMin/Max`) をそのまま使うので、種類に桁の尋ね (sane) を
  // 置くと、妥当範囲の内側の正当な測定値 (EC 6 mS/cm ほか) に「桁を間違えていないか」と問う。
  // `ecRise` を借りない理由もそれ (単位語は同じ mS/cm だが、あちらは 5 を超えると尋ねる)。
  ec: { unit: 'mS/cm', negativeIsFatal: true },
  ph: { unit: 'pH', negativeIsFatal: true },
  age: { unit: '歳', negativeIsFatal: true, integer: true, sane: 120 },
};

/**
 * その種類が名乗る単位語。**台帳の単位と突き合わせるため**に公開する ——
 * 近い kind を借りると「0 倍として計算されています」のように嘘の単位を言うので、
 * 台帳を持つ側 (`CONTROL_FIELD_BOUNDS` など) が一致を検査できる必要がある。
 */
export function unitOfKind(kind: NumKind): string {
  return KIND[kind].unit;
}

/**
 * 結果の句。**文面はここ 1 か所** —— 画面は `outcome` を読み、検査はこの関数で文を作る
 * (綴りを写さない)。`until` は「直すまで」(読めない値・範囲外) と「入力するまで」(空欄)。
 */
export function outcomeSentence(
  outcome: GuardOutcome,
  unit: string,
  refusedBy: RefusalKind | undefined,
  until: '直すまで' | '入力するまで',
): string {
  switch (outcome) {
    case 'computedAsZero':
      return `0 ${unit} として計算されています。`;
    case 'savedAsZero':
      return `保存すると 0 ${unit} として記録されます。`;
    case 'refused':
      return refusedBy === 'save' ? `${until}保存できません。` : `${until}、この欄を使う判定は出していません。`;
    case 'notComputed':
      return 'この欄を使う値は算定していません。';
    case 'asIfEmpty':
      return '空欄と同じ扱いで計算しています。';
  }
}

/**
 * **0 をこの欄の値として受け付けるか** —— `0` と打ったときに ⛔ にならないか。
 * 空欄を 0 として読む欄でこれが偽なら、空欄は「計算できない値で計算する」ことになる。
 */
function zeroAccepted(spec: NumSpec, rule: KindRule): boolean {
  return (spec.allowZero ?? !rule.zeroIsFatal) && (spec.min === undefined || spec.min <= 0);
}

/**
 * 1 つの入力を検査する。問題がなければ null。
 *
 * **読めない値・空欄をどう扱ったかを必ず本文に書く** (黙って 0 にしない)。ただし扱いを
 * 決めるのは読む側で、関門ではない —— 宣言 (`refusedBy` / `absent`) のとおりの結果を 1 つ選び、
 * 文と一緒に `outcome` として返す (パス 493l)。範囲の断り (マイナス・下限・上限・0) は
 * 断る表の欄でだけ結果を述べる —— 断らない読み手 (`readNumberOr0` / `num()` ほか) が
 * 範囲外の値をどう使うかは読み手ごとに違い、この関門は保証できない (パス 493p と同じ理由)。
 */
export function guardNumber(raw: string | undefined | null, spec: NumSpec): GuardIssue | null {
  const rule = KIND[spec.kind];
  const text = raw == null ? '' : String(raw).trim();
  const refusing = spec.refusedBy !== undefined;
  const issue = (level: GuardLevel, message: string, outcome: GuardOutcome | null): GuardIssue => ({
    level,
    label: spec.label,
    message,
    outcome,
  });

  if (text.length === 0) {
    if (spec.allowEmpty) return null;
    // 空欄の結果。**0 を受け付けない欄の空欄は、断る表では断る** —— 0 として計算すると、
    // 同じ関門が `0` と打たれたら「では計算できません」と断る値で判定を作ることになる
    // (実測: 積立年数を空にすると「将来評価額 ¥0」、物件価格を空にすると CCR を刷っていた)。
    const outcome: GuardOutcome =
      spec.absent === 'null'
        ? 'notComputed'
        : refusing && !zeroAccepted(spec, rule)
          ? 'refused'
          : spec.refusedBy === 'save'
            ? 'savedAsZero'
            : 'computedAsZero';
    return issue('warn', `未入力です。${outcomeSentence(outcome, rule.unit, spec.refusedBy, '入力するまで')}`, outcome);
  }

  const value = readNumeric(text);
  if (value === null) {
    const outcome: GuardOutcome = refusing ? 'refused' : spec.absent === 'null' ? 'asIfEmpty' : 'computedAsZero';
    const sentence = outcomeSentence(outcome, rule.unit, spec.refusedBy, '直すまで');
    if (hasUnitWord(text)) {
      return issue(
        'fatal',
        `「${text}」は単位付きのため読み取れません。${sentence}単位を付けず ${rule.unit} の数値だけを入力してください。`,
        outcome,
      );
    }
    if (hasInteriorNoise(text)) {
      return issue(
        'fatal',
        `「${text}」は数字の間に単位や区切りが入っているため読み取れません。${sentence}3 桁区切り以外の記号を外し、${rule.unit} の数値だけを入力してください。`,
        outcome,
      );
    }
    return issue('fatal', `「${text}」を数値として読み取れません。${sentence}`, outcome);
  }

  /** 範囲の断り。断る表の欄でだけ結果を足す (断らない読み手の扱いは保証できない)。 */
  const refuse = (message: string): GuardIssue =>
    refusing
      ? issue('fatal', `${message}${outcomeSentence('refused', rule.unit, spec.refusedBy, '直すまで')}`, 'refused')
      : issue('fatal', message, null);

  if (value < 0 && (spec.min === undefined || spec.min >= 0) && rule.negativeIsFatal !== false) {
    return refuse(`マイナスの値（${value}）は指定できません。`);
  }
  if (value === 0 && (spec.allowZero ?? !rule.zeroIsFatal) === false) {
    return refuse(`0 ${rule.unit} では計算できません。`);
  }
  // Stryker disable next-line ConditionalExpression: !== undefined を true 固定にしても
  // spec.min が undefined のとき `value < undefined` が常に false になるため結果は同じ（等価変異）。
  if (spec.min !== undefined && value < spec.min) {
    return refuse(`${spec.min} ${rule.unit} 以上で入力してください（現在 ${value}）。`);
  }
  const max = spec.max ?? rule.max;
  // Stryker disable next-line ConditionalExpression: 上と同じ理由（`value > undefined` は false）。
  if (max !== undefined && value > max) {
    return refuse(`${max} ${rule.unit} 以下で入力してください（現在 ${value}）。`);
  }
  // ★ **小数をどう扱うかは言わない** (2026-09-27 · パス 493p)。それまでこの文は「小数は切り捨てられます」と
  // 続けていたが、**扱いを決めるのは欄を読む側**で、この関門ではない。実測すると切り捨てるのは
  // 住戸数・扶養の人数だけで (賞与の回数は社会保険料の側だけが切り捨て、年収から引く賞与総額は
  // 小数のまま掛けていた —— 税金ページで 1 つの整数に揃えた)、従業者数・決算月・課税期間の終了年は `Math.round`
  // (従業者数 50.5 は 51 = 均等割の区分が変わるのに、この文は 50 と言っていた)、寄附先の自治体数・
  // 棚の段数・切替 (収穫前)・交換周期はそのまま使い (5.5 団体はワンストップ特例の 5 団体を超える扱い)、
  // 水耕の運転設定の日数は保存で断る。**この関門が保証できない結果を、この関門の文で言わない。**
  if (rule.integer && !Number.isInteger(value)) {
    return issue('warn', `整数で入力してください（現在 ${value}）。`, null);
  }
  const sane = spec.sane ?? rule.sane;
  // Stryker disable next-line ConditionalExpression: 上と同じ理由（`value > undefined` は false）。
  if (sane !== undefined && value > sane) {
    return issue(
      'warn',
      `${value.toLocaleString('ja-JP')} ${rule.unit} は想定の範囲を超えています。桁を間違えていないか確認してください。`,
      null,
    );
  }
  return null;
}

/** 複数の入力をまとめて検査し、fatal → warn → info の順に返す。 */
export function guardAll(entries: readonly (readonly [string | undefined | null, NumSpec])[]): readonly GuardIssue[] {
  const out: GuardIssue[] = [];
  for (const [raw, spec] of entries) {
    const issue = guardNumber(raw, spec);
    if (issue) out.push(issue);
  }

  // sort は ES2019 以降 安定ソートが保証されるので、同順位は検出順のまま残る。
  return [...out].sort(byIssueLevel);
}

/**
 * **断る欄を、宣言の集合から数える。** (パス 206 で敷地用に作り、
 * パス 209 で試算の段・投資信託にも使うので guard の側へ移した)
 *
 * 数えるのは関門が**「断る」と述べた欄** (`outcome: 'refused'`) —— ⛔ の欄と、
 * **0 を受け付けない欄の空欄** (パス 493l)。それまでは `level === 'fatal'` を数えており、
 * 空欄は ⚠️ なので素通りして 0 で計算されていた (実測: 積立年数を空にすると「将来評価額 ¥0」・
 * 床面積を空にすると `0 ㎡` で保存できた —— 同じ関門が `0` と打たれたら断る値である)。
 * 0 を受け付ける欄の空欄は今までどおり 0 として計算し、断らない。
 *
 * **型が断る表を要求する** (`RefusingSpec`) —— 表を `refusingSpecs` で包まずに渡すと、
 * 欄の文は「0 として計算されています」と言い、段の断りと食い違う。
 */
export function refusedFields<K extends string>(
  specs: Readonly<Record<K, RefusingSpec>>,
  values: Readonly<Record<K, string>>,
): readonly K[] {
  // `Object.keys` は `string[]` を返すので、総称の `K` へは 1 段挟まないと通らない
  // (`K` が `string` の部分型に具体化されうるため tsc が狭めを拒む)。鍵は `specs`
  // そのものから採っているので、この主張は宣言と同じ集合である。
  const keys = Object.keys(specs) as unknown as readonly K[];
  return keys.filter((k) => guardNumber(values[k], specs[k])?.outcome === 'refused');
}

/**
 * その段が読んでいる欄のうち断る物の**表示名**。
 *
 * 名前は**宣言から採る** —— 画面が文字列を写すと、欄の名前を直したときに断りの
 * 文面だけが古くなる (パス 101 で当たった形)。
 */
export function refusalLabels<K extends string>(
  specs: Readonly<Record<K, RefusingSpec>>,
  refused: readonly K[],
  reads: readonly K[],
): readonly string[] {
  return reads.filter((k) => refused.includes(k)).map((k) => specs[k].label);
}

/**
 * 断る欄が在るときに判定の代わりに出す文 (欄の名前を必ず名指しする)。
 * 空なら `null` —— 呼び手が「出すかどうか」を分岐しなくていい。
 *
 * ★ **原因は言わない** (パス 493l)。それまでこの文は「…が入力できる範囲の外なので」
 * 「赤い欄を範囲内に直すと」と言っていたが、断る原因は範囲外だけではない —— 読めない値
 * (`abc`) は範囲の外ではなく、0 を受け付けない欄の空欄は ⚠️ (赤ではない) で断る。
 * 原因と直し方は欄の下の文が 1 つずつ言うので、ここは結果だけを述べる。
 */
export function refusalNote(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return `${labels.join('・')}を直すまで、この判定は算定していません（欄の下の指摘どおりに直すと判定が出ます）。`;
}

/**
 * **断る欄が在るときに「書かなかった」ことを述べる文** (パス 214)。
 *
 * `refusalNote` は**判定**を算定しなかったと述べる。保存はそれとは別の事柄で、
 * 同じ文面を流用すると嘘になる —— 判定は出し直せるが、**保存した値は残り、
 * 以後すべての集計・書面がそれを読む**。実測 (パス 214): 経営サマリーの
 * 水耕栽培は `床面積 = −9999` を ⛔ と表示したまま保存でき、画面は
 * 「保存しました。経営サマリーに反映されています。」と述べ、そのあと
 * 営業利益 −￥6,000,000 を出していた (金融機関等提出用の書面まで届く)。
 * 原因を言わないのは `refusalNote` と同じ理由 (パス 493l)。
 */
export function saveRefusalNote(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return `${labels.join('・')}を直すまで、保存していません（欄の下の指摘どおりに直すと保存できます）。`;
}

/** 画面のバッジ表示用の件数。 */
export function guardCounts(issues: readonly GuardIssue[]): { fatal: number; warn: number } {
  return {
    fatal: issues.filter((i) => i.level === 'fatal').length,
    warn: issues.filter((i) => i.level === 'warn').length,
  };
}
