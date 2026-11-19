/**
 * A8.net 画面の土台。
 *
 * A8.net の成果レポートは管理画面と CSV だけで、メディア会員向けの公開 REST API は無い。
 * だからこのアプリは A8.net へつながず、**成果は利用者が自分で記録する** ——
 * 記録は renderer の record store (collection `a8net-rewards`) に在り、ページが
 * 自分の記録だけから確定・未確定の合計を導く (`renderer/data/a8netRewards.ts` の
 * `summarizeA8netRewards`)。主プロセスとブラウザ版が返すのは**見本を持たない空の土台**
 * だけで、架空の成果は 1 件も持たない。
 *
 * **組み立てはここに 1 つだけ置く** —— 主プロセスの fetcher (`main/clients/a8net.ts`) と
 * ブラウザ版の `web-shim.ts`、renderer の `SNAPSHOT` が同じ関数を呼ぶ
 * (投資信託 `shared/mutualFundsSnapshot.ts` と同じ形)。
 *
 * 2026-11-19 に 'sample' から 'local' へ移した。それまで画面は同梱の見本 3 件
 * (「[確定] 動画配信サービス 登録」ほか) を「内蔵サンプル」として並べるだけで、
 * 利用者の成果を 1 件も扱えなかった。
 */

export interface A8netSnapshot {
  /** 同梱の一覧は持たない (常に空)。成果は record store の記録を画面が読む。 */
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}

export function buildA8netSnapshot(): A8netSnapshot {
  return { items: [] };
}
