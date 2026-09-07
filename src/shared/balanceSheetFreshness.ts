/**
 * 貸借対照表の基準日が、実績の期からどれだけ離れているかを測る。純粋。
 *
 * `src/shared/` に置いてあるのは `src/shared/parameters.ts` の台帳が既定値を
 * **写さずに参照**するため (`shared` は `shared` しか import できない)。
 * 呼び出しは今は renderer だけだが、日付の算術に process 依存は無い。
 */

/**
 * **基準日と実績の期の隔たり。** (2026-09-07)
 *
 * ## なぜ要るのか (実測)
 *
 * `asOf` は保存も表示もされていたが (画面の札と金融機関等提出用の書面のヘッダ
 * 「貸借対照表 基準日」)、**どの計算にも入っていなかった**。実測 —— KPI 実績を
 * 2026-01〜2026-08 にしたまま基準日だけを振ると:
 *
 * | 基準日 | 総資産回転率 | CCC / DSO | 自己資本比率 | 総合 | 基準日に触れる所見 |
 * | --- | --- | --- | --- | --- | --- |
 * | 2026-08-31 | 80 点 | 34.3 / 91.3 日 | 50% | 76 (good) | 無し |
 * | 2024-03-31 | 80 点 | 34.3 / 91.3 日 | 50% | 76 (good) | 無し |
 * | **2019-03-31** | **80 点** | **34.3 / 91.3 日** | **50%** | **76 (good)** | **無し** |
 *
 * **7 年古い貸借対照表が、当月のものと 1 バイトも変わらない出力になる。**
 *
 * ## なぜ効くのか —— 流れ ÷ 溜まり
 *
 * 溜まり (BS の時点値) を流れ (KPI や会計連携の期間値) で割る指標が 3 つある:
 * 総資産回転率 (年換算売上 ÷ 総資産)・CCC の DSO / DIO (売掛金・棚卸資産 ÷ 売上・原価)・
 * 資金ランウェイ (現預金 ÷ 月次の純流出)。両辺が別の期に属していれば、
 * 出てくる数字はどの期のものでもない。
 *
 * これは `overviewScorecard.ts` が書き留めた規則 ——
 * **「流れ ÷ 溜まりの比率は、両辺の期を揃えてから作る」** —— の未履行分である。
 * パス 28 は分子の**長さ**を揃えた (年換算) が、**日付**は揃えていなかった。
 *
 * なお ROA / ROE は当期純利益を**貸借対照表のレコード自身**から取るので両辺の期が
 * 揃っており、ここでは古さの問題しか残らない (パス 28 で確認済み)。
 *
 * ## 何をするか
 *
 * ここは**測るだけ**。数字を勝手に捨てない (利用者が期中の試算表を見ている場合も
 * ある) —— 隔たりを返し、所見と書面の断り書きがそれを述べる。
 */
export interface BalanceSheetFreshness {
  /** 基準日の月 (`YYYY-MM`)。読めなければ null。 */
  readonly asOfMonth: string | null;
  /** 実績の最新の期 (`YYYY-MM`)。無ければ null。 */
  readonly latestPeriod: string | null;
  /**
   * 基準日が実績の最新期より何か月**古い**か。負なら基準日のほうが新しい。
   * どちらかが読めなければ null。
   */
  readonly monthsBehind: number | null;
  /** しきい値を超えて古いか (`monthsBehind > staleAfterMonths`)。 */
  readonly stale: boolean;
}

/**
 * 基準日が実績よりこれだけ古ければ「別の期の数字」として扱う (か月)。
 * 12 か月 = 1 事業年度。台帳 (`src/shared/parameters.ts`) から上書きできる。
 */
export const BALANCE_SHEET_STALE_AFTER_MONTHS = 12;

/**
 * `YYYY-MM` (以降の文字は無視) を読み、比較用の月数と正規化した月を返す。読めなければ null。
 *
 * 月の文字列は**一致した部分から作る** —— `slice(0, 7)` で切ると、切る位置と
 * 正規表現の 2 か所が同じ書式を知ることになる。前後の空白は許す。
 */
function readMonth(value: string | null | undefined): { idx: number; month: string } | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(value.trim());
  if (m === null) return null;
  return { idx: Number(m[1]) * 12 + Number(m[2]), month: `${m[1]}-${m[2]}` };
}

/**
 * 基準日と実績の最新期の隔たりを測る。純粋。
 *
 * `asOf` は `YYYY-MM-DD` でも `YYYY-MM` でも読む (先頭 7 字だけ見る)。
 */
export function balanceSheetFreshness(
  asOf: string | null | undefined,
  latestPeriod: string | null | undefined,
  staleAfterMonths: number = BALANCE_SHEET_STALE_AFTER_MONTHS,
): BalanceSheetFreshness {
  const a = readMonth(asOf);
  const b = readMonth(latestPeriod);
  if (a === null || b === null) {
    // 片方が読めなければ隔たりは測れない。**測れないときに「新しい」と言わない。**
    return {
      asOfMonth: a === null ? null : a.month,
      latestPeriod: b === null ? null : b.month,
      monthsBehind: null,
      stale: false,
    };
  }
  const monthsBehind = b.idx - a.idx;
  // **`monthsBehind` が非 null なら、両方の月も必ず非 null** —— 文面を作る側が
  // 「読めない月」の枝を持たなくて済むように、この不変条件は検査で留めてある。
  return { asOfMonth: a.month, latestPeriod: b.month, monthsBehind, stale: monthsBehind > staleAfterMonths };
}
