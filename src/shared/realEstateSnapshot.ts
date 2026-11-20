/**
 * 不動産投資画面の土台。
 *
 * 物件の実データは renderer の record store (collection `realestate-properties`)
 * に在り、ページが自分の物件だけから集計する (見出しの数字は
 * `renderer/data/investments.ts` の `computeRealEstatePortfolio` が純関数で導く)。
 * 主プロセスとブラウザ版が返すのは**見本を持たない空の土台**だけで、
 * 架空の物件・家賃・利回りは 1 件も持たない。
 *
 * **組み立てはここに 1 つだけ置く** —— 主プロセスの fetcher
 * (`main/clients/real-estate.ts`) とブラウザ版の `web-shim.ts`、renderer の
 * `SNAPSHOT` が同じ関数を呼ぶ (水耕栽培 `shared/hydroponicsControl.ts` と
 * 同じ形・パス 118 の教訓)。
 *
 * 2026-11-19 (ローカル完結バッチ 3) に 'sample' から 'local' へ移した。
 * それまで画面は同梱の見本 4 件と自分の物件を混ぜて集計し、混ざっている
 * ことの断り (`demoMixNote`) を並べていた。
 */

export interface RealEstateSnapshot {
  readonly properties: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly monthlyRent: number;
    readonly occupied: boolean;
    readonly yieldPct: number;
    readonly purchasePrice: number;
  }>;
  readonly monthlyCashflow: {
    readonly grossRent: number;
    readonly operatingExpenses: number;
    readonly mortgagePayment: number;
    readonly netCashflow: number;
  };
  readonly portfolioYield: number;
  readonly occupancyRate: number;
}

export function buildRealEstateSnapshot(): RealEstateSnapshot {
  return {
    properties: [],
    monthlyCashflow: { grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 },
    portfolioYield: 0,
    occupancyRate: 0,
  };
}
