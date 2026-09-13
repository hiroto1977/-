/**
 * 減価償却 (定額法 / 定率法) と少額減価償却資産の判定 — 概算試算。
 *
 * **重要 — 概算であり税務助言ではありません。** 償却率は耐用年数の逆数 (定額法) /
 * その定数倍 (定率法 既定 200%) を用いた簡便計算で、国税庁の償却率表とは端数処理が
 * 異なる場合があります。定率法は償却保証額・改定償却率の代わりに「定率額が残存簿価の
 * 均等償却額を下回ったら均等償却へ切替える」近似で、耐用年数内に備忘価額 1 円まで
 * 償却します。正確な税額は税理士・国税庁ツールでご確認ください。
 */

import { isCalendarDate } from './isoDate';

const yen = (n: number): number => Math.round(n);

/** 償却スケジュールの 1 年分。 */
export interface DepreciationYear {
  readonly year: number;
  /** その年の償却費。 */
  readonly depreciation: number;
  /** 期末の帳簿価額 (備忘価額 1 円を最終年に残す)。 */
  readonly bookValue: number;
}

/** 定額法の年間償却費 = 取得価額 ÷ 耐用年数 (償却率 = 1/n の簡便)。 */
export function straightLineAnnual(acquisitionCost: number, usefulLife: number): number {
  // acquisitionCost===0 は yen(0/life)=0 と計算経路も一致するため <=→< は equivalent。
  // Stryker disable next-line EqualityOperator
  if (acquisitionCost <= 0) return 0;
  if (usefulLife <= 0) return 0;
  return yen(acquisitionCost / usefulLife);
}

/**
 * スケジュールを組み立てる年数の上限。
 *
 * 2026-08 監査で見つけた形: 呼び出し元 (`RealEstatePage` の 耐用年数 欄) は
 * `GuardedNumber` で `max: 100` を宣言しているが、`GuardedNumber` は**入力を
 * 書き換えない** (黙って 0 や上限に丸めない、という意図的な設計)。そのため
 * 利用者が 99999999 と打つと、この関数が 1 億行の配列を `useMemo` の中で
 * 組み立てていた。**実測 1,000 万行で 2.4 秒 / ヒープ 777 MB** — 描画スレッドが
 * 固まり、モバイル (LITE 版) では落ちる。しかも 1 文字打つたびに再計算される。
 *
 * 日本の法定耐用年数で最長は 50 年 (鉄骨鉄筋コンクリート造の事務所)。100 年は
 * その倍の余裕で、実在の償却計算では当たらない位置。
 *
 * 上限を超えた入力は `[]` を返す — `usefulLife <= 0` と同じ既存の契約に揃えた。
 * **黙って切り詰めない**のが要点で、途中まで作った表を出すと「100 年で償却し
 * 終わる」という誤った内容になる。呼び出し元は `guardNumber` の判定を見て、
 * なぜ表が出ないのかを利用者に説明する責任がある。
 */
export const MAX_SCHEDULE_YEARS = 100;

/** 償却スケジュールを組み立てられる年数か (上限は {@link MAX_SCHEDULE_YEARS})。 */
export function isSchedulableLife(usefulLife: number): boolean {
  return Number.isFinite(usefulLife) && usefulLife > 0 && usefulLife <= MAX_SCHEDULE_YEARS;
}

/** 定額法の償却スケジュール (最終年に備忘価額 1 円を残す)。 */
export function straightLineSchedule(acquisitionCost: number, usefulLife: number): DepreciationYear[] {
  // usefulLife <= 0 はループ条件 (y <= usefulLife) が 1 度も回らず [] を返すため
  // ここでは判定不要 (冗長)。acquisitionCost のみ早期 return する。
  if (acquisitionCost <= 0) return [];
  // 上限超えは組み立てない (描画スレッドが固まる)。理由は MAX_SCHEDULE_YEARS 参照。
  if (usefulLife > MAX_SCHEDULE_YEARS) return [];
  const annual = yen(acquisitionCost / usefulLife);
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  for (let y = 1; y <= usefulLife; y += 1) {
    let dep: number;
    if (y === usefulLife) {
      dep = book - 1; // 最終年: 備忘価額 1 円を残す
    } else {
      // book-1 の cap は均等償却では最終年まで効かない (annual ≤ book-1) 防御値のため、
      // その ArithmeticOperator は無効化する (Math.min→Math.max は既存テストで kill)。
      // Stryker disable next-line ArithmeticOperator
      dep = Math.min(annual, book - 1);
    }
    // dep は book≥1 のため常に ≥0。負値クランプは防御で到達不能。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/**
 * 定率法の償却スケジュール (既定 200% 定率法)。
 * 償却率 = multiplier ÷ 耐用年数。期首簿価 × 償却率を基本とし、それが残存簿価の
 * 均等償却額を下回った年から均等償却へ切替える (改定償却率の近似)。
 */
export function decliningBalanceSchedule(
  acquisitionCost: number,
  usefulLife: number,
  multiplier = 2,
): DepreciationYear[] {
  // usefulLife <= 0 はループ条件で空配列になるため冗長。acquisitionCost のみ判定。
  if (acquisitionCost <= 0) return [];
  // 定額法と同じ上限。理由は MAX_SCHEDULE_YEARS 参照。
  if (usefulLife > MAX_SCHEDULE_YEARS) return [];
  const rate = multiplier / usefulLife;
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  let switched = false;
  for (let y = 1; y <= usefulLife; y += 1) {
    const remainingYears = usefulLife - y + 1;
    let dep: number;
    // 最終年の特例 (book-1) は、有効入力では切替済みのため else 側でも even=book →
    // Math.min で book-1 に丸まり同値。安全のため特例は残すが ConditionalExpression は
    // equivalent のため無効化する。
    // Stryker disable next-line ConditionalExpression
    if (y === usefulLife) {
      dep = book - 1; // 最終年: 備忘価額 1 円を残す
    } else {
      const declining = book * rate;
      const evenRemaining = book / remainingYears;
      // declining===evenRemaining の同値時は切替えても dep が変わらず以降も同一 (equivalent)。
      // Stryker disable next-line EqualityOperator
      if (!switched && declining < evenRemaining) switched = true;
      dep = yen(switched ? evenRemaining : declining);
      // 残存簿価が備忘 1 円を割らないよう book-1 で頭打ち (Math.min は if より mutation 堅牢)。
      dep = Math.min(dep, book - 1);
    }
    // dep は上で book-1 に頭打ちされ book≥1 のため常に ≥0。負値クランプは到達不能。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 少額減価償却資産の取扱い区分。 */
export type SmallAssetTreatment = 'immediate' | 'lump-3year' | 'sme-special' | 'normal';

/**
 * 取得価額と**取得日**から少額減価償却資産の取扱いを判定する (簡便)。
 * - 10万円未満: 全額損金算入 (即時)。
 * - 10万円以上20万円未満: 一括償却資産 (3年均等償却) も選択可。
 * - 20万円以上・特例の上限未満: 中小企業者等の少額減価償却資産の特例 (即時、年300万円上限)。
 *   **上限は取得日で決まる** ({@link smeMeasureWindow}: 2026-03-31 までの取得は 30 万円未満、
 *   2026-04-01 以後は 40 万円未満。適用期限 {@link SME_MEASURE_END} の後の取得には特例が無い)。
 * - それ以上: 通常の減価償却。
 *
 * 取得日が `YYYY-MM-DD` で読めなければ、特例の判定が要る帯 (20 万円以上) は **null** (判定できない)。
 * 10 万円未満・20 万円未満の帯は取得日に依らないので、その場合も区分を返す。
 *
 * 2026-09-09 まで取得日を取らず 30 万円で切っていた —— 令和 8 年度税制改正 (2026-04-01 施行) で
 * 上限が 40 万円になった後も 5 か月間、30 万円のまま答えていた (パス 140)。
 */
export function classifySmallAsset(acquisitionCost: number, acquiredOn: string): SmallAssetTreatment | null {
  if (acquisitionCost < 100_000) return 'immediate';
  if (acquisitionCost < 200_000) return 'lump-3year';
  const measure = smeMeasureWindow(acquiredOn);
  if (measure.status === 'unreadable-date') return null;
  // Stryker disable next-line ConditionalExpression: 期限後は unitLimit が null で、正の取得価額は null (= 0) 未満になりえないので、この分岐を外しても答えは同じ (型が守る等価変異体・2026-09-09 実測)
  if (measure.status !== 'applies') return 'normal';
  return acquisitionCost < measure.unitLimit ? 'sme-special' : 'normal';
}

// ===========================================================================
// Round 66 追加 — より精緻な償却計算 (加算的 / 既存関数は不変)
//
// **重要 — いずれも概算であり税務助言ではありません。** 200% 定率法の正規ロジック
// (償却率・改定償却率・保証率) を提供しますが、各率は国税庁「減価償却資産の償却率表」を
// 引数として与える前提で、引数省略時は耐用年数からの簡便概算 (償却率 = 2/n) を用います。
// 端数処理・特例 (リース・特別償却・即時償却の年上限管理) は実務と異なる場合があります。
// 正確な税額は税理士・国税庁ツールでご確認ください。
// ===========================================================================

/** 有限な正の数かを判定する内部ヘルパ。 */
function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * 200% 定率法の償却率の概算 = multiplier ÷ 耐用年数。
 * 国税庁の償却率表が手元に無い場合の簡便値。耐用年数 ≤ 0 / 非有限は null。
 */
export function decliningBalanceRate(usefulLife: number, multiplier = 2): number | null {
  if (!isPositiveFinite(usefulLife)) return null;
  if (!isPositiveFinite(multiplier)) return null;
  return multiplier / usefulLife;
}

/** 中古資産の見積耐用年数 (簡便法) の結果。 */
export interface UsedAssetUsefulLifeResult {
  /** 見積耐用年数 (年, 1年未満切捨て・最低2年)。 */
  readonly usefulLife: number;
  /** 法定耐用年数を全て経過していたか (その場合 法定×0.2 を適用)。 */
  readonly fullyElapsed: boolean;
}

/**
 * 中古資産の見積耐用年数 (簡便法)。
 * - 法定耐用年数の一部を経過: (法定耐用年数 − 経過年数) + 経過年数 × 0.2
 * - 法定耐用年数の全部を経過: 法定耐用年数 × 0.2
 * - いずれも 1 年未満の端数は切捨て、最低 2 年。
 *
 * statutoryLife ≤ 0 / 非有限、elapsedYears が負 / 非有限なら null。
 */
export function usedAssetUsefulLife(
  statutoryLife: number,
  elapsedYears: number,
): UsedAssetUsefulLifeResult | null {
  if (!isPositiveFinite(statutoryLife)) return null;
  if (!Number.isFinite(elapsedYears) || elapsedYears < 0) return null;
  const fullyElapsed = elapsedYears >= statutoryLife;
  const raw = fullyElapsed
    ? statutoryLife * 0.2
    : statutoryLife - elapsedYears + elapsedYears * 0.2;
  // 1年未満は切捨て、最低 2 年。
  const floored = Math.floor(raw);
  return { usefulLife: Math.max(2, floored), fullyElapsed };
}

/**
 * 月割償却額 = 年間償却額 × 事業供用月数 ÷ 12。
 * 取得・事業供用が期中の場合に使用。年間額は呼び出し側で算定したもの。
 * monthsInService は 12 を上限にクランプ。年間額が非有限 / 非正、月数が非有限 / 非正なら 0。
 */
export function proratedDepreciation(annualDepreciation: number, monthsInService: number): number {
  // annualDepreciation===0 は <=→< でも yen(0*months/12)=0 と計算経路が一致するため equivalent。
  // Stryker disable next-line EqualityOperator
  if (!Number.isFinite(annualDepreciation) || annualDepreciation <= 0) return 0;
  // monthsInService===0 も <=→< で Math.min(12,0)=0 → yen(annual*0/12)=0 と一致するため equivalent。
  // Stryker disable next-line EqualityOperator
  if (!Number.isFinite(monthsInService) || monthsInService <= 0) return 0;
  const months = Math.min(12, monthsInService);
  return yen((annualDepreciation * months) / 12);
}

/** 正規の 200% 定率法を構成する各率 (国税庁 償却率表)。 */
export interface DecliningBalanceFactors {
  /** 償却率 (省略時 multiplier ÷ 耐用年数)。 */
  readonly rate?: number;
  /** 改定償却率 (省略時 rate を流用)。 */
  readonly revisedRate?: number;
  /** 保証率 (省略時 0 = 保証額の制約なし)。 */
  readonly guaranteeRate?: number;
  /** multiplier (省略時 2 = 200% 定率法)。 */
  readonly multiplier?: number;
}

/**
 * 200% 定率法の償却スケジュール (正規ロジック)。
 *
 * 各年の「調整前償却額」= 期首帳簿価額 × 償却率。これが「償却保証額」
 * (取得価額 × 保証率) を**下回った最初の年**から、その年の期首帳簿価額を
 * 「改定取得価額」として固定し、以後は 改定取得価額 × 改定償却率 で均等償却する。
 * 最終年は備忘価額 1 円を残す。
 *
 * 既存の {@link decliningBalanceSchedule} (均等償却近似) とは別関数。
 * acquisitionCost ≤ 0 / 非有限、rate ≤ 0 / 非有限なら []。usefulLife は
 * {@link isSchedulableLife} (1〜{@link MAX_SCHEDULE_YEARS}) を満たさなければ [] —— 黙って切り詰めない。
 */
export function decliningBalanceScheduleStrict(
  acquisitionCost: number,
  usefulLife: number,
  factors: DecliningBalanceFactors = {},
): DepreciationYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  // 年数の上限も含めて 1 か所で判定する。**上限判定はこの 2 関数だけ
  // 抜けていた** —— 兄弟の straightLineSchedule / decliningBalanceSchedule は
  // 2026-08 の「描画スレッドを固めない」修正で既に持っている。
  if (!isSchedulableLife(usefulLife)) return [];
  const multiplier = factors.multiplier ?? 2;
  const rate = factors.rate ?? multiplier / usefulLife;
  const revisedRate = factors.revisedRate ?? rate;
  const guaranteeRate = factors.guaranteeRate ?? 0;
  if (!isPositiveFinite(rate)) return [];

  const guaranteedAmount = acquisitionCost * guaranteeRate;
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  let revisedBase = 0; // 改定取得価額 (切替時に期首簿価で固定)
  let switched = false;

  /*
   * ループ上限を**構造的に有限**にする。上の `isSchedulableLife` が既に
   * `usefulLife <= MAX_SCHEDULE_YEARS` を保証しているので、この頭打ちは
   * 到達しない防御である (同ファイルの `if (dep < 0) dep = 0;` と同じ性格)。
   *
   * 置く理由は、年数ガードを 1 つ落としたときの壊れ方が「間違った答え」では
   * なく**プロセスの死**だったから。テストが `usefulLife = Infinity` を渡すので、
   * ガードを外した変異体は行を push し続けてメモリを食い尽くし、Stryker は
   * それを Killed ではなく RuntimeError (= 評価不成立) と分類する ——
   * RuntimeError はスコアの分母から外れるため、総合 100.00% のまま 2 件が
   * 数えられていなかった (2026-09-01 に判明)。頭打ちにしておけば同じ変異体は
   * 100 行を返し、普通に「答えが違う」で落ちる。
   */
  const years = Math.min(usefulLife, MAX_SCHEDULE_YEARS);
  for (let y = 1; y <= years; y += 1) {
    let dep: number;
    if (!switched) {
      const beforeAdjust = book * rate;
      // 調整前償却額 < 償却保証額 → 改定取得価額 × 改定償却率 へ切替。
      if (beforeAdjust < guaranteedAmount) {
        switched = true;
        revisedBase = book;
        dep = yen(revisedBase * revisedRate);
      } else {
        dep = yen(beforeAdjust);
      }
    } else {
      dep = yen(revisedBase * revisedRate);
    }
    // 残存簿価が備忘 1 円を割らないよう book-1 で頭打ち。
    dep = Math.min(dep, book - 1);
    // dep は book≥1 のため常に ≥0。負値クランプは到達不能の防御。
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 定額法 vs 定率法の 1 年分の比較行。 */
export interface MethodComparisonYear {
  readonly year: number;
  /** 定額法のその年の償却費。 */
  readonly straightLine: number;
  /** 定額法の期末帳簿価額。 */
  readonly straightLineBookValue: number;
  /** 定率法のその年の償却費。 */
  readonly decliningBalance: number;
  /** 定率法の期末帳簿価額。 */
  readonly decliningBalanceBookValue: number;
}

/**
 * 同一資産について定額法と定率法 (200% 既定) の各年償却額・帳簿価額を並べて比較する。
 * 定率法は既存の {@link decliningBalanceSchedule} (均等償却近似) を用いる。
 * acquisitionCost ≤ 0 / 非有限なら []。usefulLife は {@link isSchedulableLife}
 * (1〜{@link MAX_SCHEDULE_YEARS}) を満たさなければ [] —— 黙って切り詰めない。
 */
export function compareMethods(
  acquisitionCost: number,
  usefulLife: number,
  multiplier = 2,
): MethodComparisonYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  // 年数の上限も含めて 1 か所で判定する。**上限判定はこの 2 関数だけ
  // 抜けていた** —— 兄弟の straightLineSchedule / decliningBalanceSchedule は
  // 2026-08 の「描画スレッドを固めない」修正で既に持っている。
  if (!isSchedulableLife(usefulLife)) return [];
  const sl = straightLineSchedule(acquisitionCost, usefulLife);
  const db = decliningBalanceSchedule(acquisitionCost, usefulLife, multiplier);
  const rows: MethodComparisonYear[] = [];
  /*
   * ループ上限を**構造的に有限**にする。上の `isSchedulableLife` が既に
   * `usefulLife <= MAX_SCHEDULE_YEARS` を保証しているので、この頭打ちは
   * 到達しない防御である (同ファイルの `if (dep < 0) dep = 0;` と同じ性格)。
   *
   * 置く理由は、年数ガードを 1 つ落としたときの壊れ方が「間違った答え」では
   * なく**プロセスの死**だったから。テストが `usefulLife = Infinity` を渡すので、
   * ガードを外した変異体は行を push し続けてメモリを食い尽くし、Stryker は
   * それを Killed ではなく RuntimeError (= 評価不成立) と分類する ——
   * RuntimeError はスコアの分母から外れるため、総合 100.00% のまま 2 件が
   * 数えられていなかった (2026-09-01 に判明)。頭打ちにしておけば同じ変異体は
   * 100 行を返し、普通に「答えが違う」で落ちる。
   */
  const years = Math.min(usefulLife, MAX_SCHEDULE_YEARS);
  for (let y = 1; y <= years; y += 1) {
    const slRow = sl[y - 1];
    const dbRow = db[y - 1];
    rows.push({
      year: y,
      straightLine: slRow ? slRow.depreciation : 0,
      straightLineBookValue: slRow ? slRow.bookValue : acquisitionCost,
      decliningBalance: dbRow ? dbRow.depreciation : 0,
      decliningBalanceBookValue: dbRow ? dbRow.bookValue : acquisitionCost,
    });
  }
  return rows;
}

/**
 * 一括償却資産 (取得価額 20 万円未満) の 3 年均等償却スケジュール。
 * 残存簿価・備忘価額の概念は無く、3 年で全額 (取得価額) を均等償却する。
 * 端数は最終年で調整 (合計 = 取得価額)。
 * acquisitionCost ≤ 0 / 非有限、または 20 万円以上なら [] (対象外)。
 */
export function lumpSum3YearSchedule(acquisitionCost: number): DepreciationYear[] {
  if (!isPositiveFinite(acquisitionCost)) return [];
  if (acquisitionCost >= 200_000) return [];
  const perYear = yen(acquisitionCost / 3);
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  for (let y = 1; y <= 3; y += 1) {
    // 最終年は端数調整で残額を全額償却 (備忘価額なし → bookValue 0)。
    const dep = y === 3 ? book : perYear;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 中小企業者等の少額減価償却資産の特例 (即時償却) の判定結果。 */
export interface SmeImmediateResult {
  /** この資産が即時償却の対象か (取得日に当てはまる上限未満 かつ 年上限の残枠あり)。 */
  readonly eligible: boolean;
  /** 即時償却できる金額 (対象なら残枠まで、対象外なら 0)。 */
  readonly deductible: number;
  /** この資産適用後の年間累計額。 */
  readonly cumulativeAfter: number;
  /** 年 300 万円上限を超過し即時償却できなかった金額 (通常償却へ回る)。 */
  readonly excludedOverCap: number;
  /** 取得日に当てはまる 1 資産あたりの上限。特例の期限後・取得日が読めなければ null。 */
  readonly unitLimit: number | null;
  /**
   * 対象外の理由 (対象なら 'applied')。
   * - 'invalid-cost': 取得価額が正の有限数でない
   * - 'unreadable-date': 取得日が `YYYY-MM-DD` (暦に在る日) で読めない
   * - 'measure-ended': 取得日が特例の適用期限 ({@link SME_MEASURE_END}) の後
   * - 'over-unit-limit': 取得価額が取得日の上限以上
   * - 'cap-exhausted': 年間上限 300 万円を既に使い切っている
   */
  readonly status: 'applied' | 'invalid-cost' | 'unreadable-date' | 'measure-ended' | 'over-unit-limit' | 'cap-exhausted';
}

/*
 * **特例の上限と期限は日付つき** (2026-09-09 · パス 140)。
 *
 * 令和 8 年度税制改正 (2026-04-01 施行) で、中小企業者等の少額減価償却資産の特例 (措法 67 の 5) は
 *  - 1 資産あたりの取得価額の上限: 30 万円未満 → **40 万円未満** (2026-04-01 以後の取得分)
 *  - 対象の従業員規模: 常時使用する従業員 500 人以下 → **400 人以下**
 *  - 適用期限: 2026-03-31 → **2029-03-31** (3 年延長)
 * になった。年間合計 300 万円の上限は変わらない。本モジュールは 2026-09-09 まで 30 万円のまま、取得日も
 * 期限も持たなかった —— 改正から 5 か月、正しかった数字が黙って古くなっていた。日付の無い法定値が黙って
 * 古くなる形は `lint:rate-freshness` が料率 (2 年度分) と 2割特例 (期限) で見つけたものと同じ。
 *
 * 出所: 財務省「令和 8 年度税制改正の大綱」(2025-12-19)・国税庁タックスアンサー No.5408 (一次情報はこの
 * 環境から届かず、弥生・税理士法人の改正解説 4 本で突き合わせた)。`complianceKnowledge.ts` の
 * `tax-small-amount-depreciation` (asOf 2026-06) が同じ内容を先に持っており、
 * `smallAssetMeasureConsistency.test.ts` が**数字の一致**を留める。期限は `lint:rate-freshness` の台帳
 * (`SME_MEASURE_END`) が 180 日前から鳴らす —— 2 年・3 年おきに延長されてきた措置なので、期限が来たら
 * 延長の有無を確かめて日付と上限を進める (延長されなければ {@link smeMeasureWindow} が `measure-ended`
 * を返し、特例を勧めなくなる)。
 */
/** 上限が 30 万円 → 40 万円に変わる取得日 (この日以後の取得に新しい上限)。 */
export const SME_UNIT_LIMIT_STEP_DATE = '2026-04-01';
/** 2026-03-31 までに取得した資産の 1 資産あたりの上限 (30 万円未満)。 */
export const SME_UNIT_LIMIT_BEFORE_STEP = 300_000;
/** 中小企業者等の少額減価償却資産の特例 — 1 資産あたりの取得価額上限 (40 万円未満・2026-04-01 以後の取得)。 */
export const SME_UNIT_LIMIT = 400_000;
/** 中小企業者等の少額減価償却資産の特例 — 年間取得価額の合計上限 (300 万円)。 */
export const SME_ANNUAL_CAP = 3_000_000;
/**
 * 対象となる中小企業者等の常時使用する従業員数の上限 (400 人以下。2026-03-31 までは 500 人以下)。
 * 判定関数は使わない (入力に従業員数が無い) —— 台帳と画面の文言が読む。
 */
export const SME_EMPLOYEE_CAP = 400;
/**
 * 特例の適用期限 (この日までに取得した資産が対象。令和 8 年度改正で 3 年延長)。
 * `lint:rate-freshness` の台帳が 180 日前から鳴らす。
 */
export const SME_MEASURE_END = '2029-03-31';

/** 取得日に当てはまる特例の窓。 */
export type SmeMeasureWindow =
  | { readonly status: 'applies'; readonly unitLimit: number; readonly until: string }
  | { readonly status: 'measure-ended'; readonly unitLimit: null; readonly endedOn: string }
  | { readonly status: 'unreadable-date'; readonly unitLimit: null };

/**
 * 取得日から特例の窓 (上限と期限) を引く。取得日は `YYYY-MM-DD` (暦に在る日) に限る。
 * 日付の比較は綴りの比較 —— `YYYY-MM-DD` はゼロ埋めなので辞書順が時系列に一致する。
 */
export function smeMeasureWindow(acquiredOn: string): SmeMeasureWindow {
  if (!isCalendarDate(acquiredOn)) return { status: 'unreadable-date', unitLimit: null };
  if (acquiredOn > SME_MEASURE_END) return { status: 'measure-ended', unitLimit: null, endedOn: SME_MEASURE_END };
  const unitLimit = acquiredOn < SME_UNIT_LIMIT_STEP_DATE ? SME_UNIT_LIMIT_BEFORE_STEP : SME_UNIT_LIMIT;
  return { status: 'applies', unitLimit, until: SME_MEASURE_END };
}

/**
 * 中小企業者等の少額減価償却資産の特例 (措法 67 の 5)。
 * - 取得日の上限 ({@link smeMeasureWindow}) 未満が対象、年間累計 300 万円が上限。
 * - acquisitionCost ≤ 0 / 非有限、取得日が読めない・期限後、上限以上、既に上限到達なら eligible=false
 *   (理由は `status`)。
 * - 累計が上限を跨ぐ場合、上限までの残枠のみ即時償却し、超過分は excludedOverCap。
 *
 * @param acquisitionCost 当該資産の取得価額
 * @param acquiredOn 取得日 (`YYYY-MM-DD`)
 * @param cumulativeBefore 同一年度で既に即時償却した累計額 (省略時 0、負 / 非有限は 0 扱い)
 */
export function smeImmediateDeduction(
  acquisitionCost: number,
  acquiredOn: string,
  cumulativeBefore = 0,
): SmeImmediateResult {
  // cumulativeBefore===0 は >0→>=0 でも prior=0 で同値 (三項の両枝とも 0)。equivalent。
  // Stryker disable next-line EqualityOperator
  const prior = Number.isFinite(cumulativeBefore) && cumulativeBefore > 0 ? cumulativeBefore : 0;
  const measure = smeMeasureWindow(acquiredOn);
  const refused = (status: SmeImmediateResult['status'], excludedOverCap: number): SmeImmediateResult => ({
    eligible: false,
    deductible: 0,
    cumulativeAfter: prior,
    excludedOverCap,
    unitLimit: measure.unitLimit,
    status,
  });
  if (!isPositiveFinite(acquisitionCost)) return refused('invalid-cost', 0);
  if (measure.status !== 'applies') return refused(measure.status, 0);
  if (acquisitionCost >= measure.unitLimit) return refused('over-unit-limit', 0);
  const remainingCap = SME_ANNUAL_CAP - prior;
  if (remainingCap <= 0) return refused('cap-exhausted', acquisitionCost);
  const deductible = Math.min(acquisitionCost, remainingCap);
  const excludedOverCap = acquisitionCost - deductible;
  return {
    eligible: true,
    deductible,
    cumulativeAfter: prior + deductible,
    excludedOverCap,
    unitLimit: measure.unitLimit,
    status: 'applied',
  };
}
