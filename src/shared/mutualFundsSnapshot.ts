/**
 * 投資信託画面の土台。
 *
 * 保有銘柄の実データは renderer の record store (collection
 * `mutualfunds-holdings`) に在り、ページが自分の保有だけから集計する
 * (見出しの数字は `renderer/data/investments.ts` の `computeFundPortfolio` が
 * 純関数で導く)。基準価額は利用者の手入力で、証券会社 API は使わない
 * (パートナー認証が前提のため)。主プロセスとブラウザ版が返すのは
 * **見本を持たない空の土台**だけで、架空の銘柄・評価額は 1 件も持たない。
 *
 * **組み立てはここに 1 つだけ置く** —— 主プロセスの fetcher
 * (`main/clients/mutual-funds.ts`) とブラウザ版の `web-shim.ts`、renderer の
 * `SNAPSHOT` が同じ関数を呼ぶ (水耕栽培 `shared/hydroponicsControl.ts` と
 * 同じ形・パス 118 の教訓)。
 *
 * 2026-11-19 (ローカル完結バッチ 3) に 'sample' から 'local' へ移した。
 * それまで画面は同梱の見本 4 銘柄と自分の保有を混ぜて集計し、混ざっている
 * ことの断り (`fundDemoMixNote`) を並べていた。
 */

export interface MutualFundsSnapshot {
  readonly holdings: ReadonlyArray<{
    readonly code: string;
    readonly name: string;
    readonly units: number;
    readonly navPerUnit: number;
    readonly valuation: number;
    readonly ytdReturnPct: number;
    /** ユーザーが手動で付けたタグ (任意。`undefined` の銘柄ではバッジ非表示)。 */
    readonly userTag?: string;
  }>;
  readonly portfolio: {
    readonly totalValuation: number;
    readonly totalCostBasis: number;
    readonly unrealizedGain: number;
    readonly unrealizedGainPct: number;
  };
  readonly recentDividends: ReadonlyArray<{
    readonly code: string;
    readonly amount: number;
    readonly paidAt: string;
  }>;
}

export function buildMutualFundsSnapshot(): MutualFundsSnapshot {
  return {
    holdings: [],
    portfolio: { totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 },
    recentDividends: [],
  };
}
