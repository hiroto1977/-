/**
 * 減価償却 (定額法 / 定率法) と少額減価償却資産の判定 — 概算試算。
 *
 * **重要 — 概算であり税務助言ではありません。** 償却率は耐用年数の逆数 (定額法) /
 * その定数倍 (定率法 既定 200%) を用いた簡便計算で、国税庁の償却率表とは端数処理が
 * 異なる場合があります。定率法は償却保証額・改定償却率の代わりに「定率額が残存簿価の
 * 均等償却額を下回ったら均等償却へ切替える」近似で、耐用年数内に備忘価額 1 円まで
 * 償却します。正確な税額は税理士・国税庁ツールでご確認ください。
 */

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
  if (acquisitionCost <= 0 || usefulLife <= 0) return 0;
  return yen(acquisitionCost / usefulLife);
}

/** 定額法の償却スケジュール (最終年に備忘価額 1 円を残す)。 */
export function straightLineSchedule(acquisitionCost: number, usefulLife: number): DepreciationYear[] {
  if (acquisitionCost <= 0 || usefulLife <= 0) return [];
  const annual = yen(acquisitionCost / usefulLife);
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  for (let y = 1; y <= usefulLife; y += 1) {
    let dep = y === usefulLife ? book - 1 : Math.min(annual, book - 1);
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
  if (acquisitionCost <= 0 || usefulLife <= 0) return [];
  const rate = multiplier / usefulLife;
  const rows: DepreciationYear[] = [];
  let book = acquisitionCost;
  let switched = false;
  for (let y = 1; y <= usefulLife; y += 1) {
    const remainingYears = usefulLife - y + 1;
    let dep: number;
    if (y === usefulLife) {
      dep = book - 1; // 最終年: 備忘価額 1 円を残す
    } else {
      const declining = book * rate;
      const evenRemaining = book / remainingYears;
      if (!switched && declining < evenRemaining) switched = true;
      dep = yen(switched ? evenRemaining : declining);
      if (dep > book - 1) dep = book - 1;
    }
    if (dep < 0) dep = 0;
    book -= dep;
    rows.push({ year: y, depreciation: dep, bookValue: book });
  }
  return rows;
}

/** 少額減価償却資産の取扱い区分。 */
export type SmallAssetTreatment = 'immediate' | 'lump-3year' | 'sme-special' | 'normal';

/**
 * 取得価額から少額減価償却資産の取扱いを判定する (簡便)。
 * - 10万円未満: 全額損金算入 (即時)。
 * - 10万円以上20万円未満: 一括償却資産 (3年均等償却) も選択可。
 * - 20万円以上30万円未満: 中小企業者等の少額減価償却資産の特例 (即時、年300万円上限)。
 * - 30万円以上: 通常の減価償却。
 */
export function classifySmallAsset(acquisitionCost: number): SmallAssetTreatment {
  if (acquisitionCost < 100_000) return 'immediate';
  if (acquisitionCost < 200_000) return 'lump-3year';
  if (acquisitionCost < 300_000) return 'sme-special';
  return 'normal';
}
