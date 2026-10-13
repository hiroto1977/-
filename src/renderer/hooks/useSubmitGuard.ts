import { useCallback, useRef, useState } from 'react';

/**
 * **押しただけの操作を、1 度に 1 つしか走らせない。** (2026-09-09 · パス 124)
 *
 * 保存の入口 (`useCollection.add` → `RecordStore.insert`) は暗号化と IndexedDB の
 * トランザクションを await する。その間にボタンをもう 1 度押す (ダブルクリック) と、
 * **同じ入力から 2 件が保存される** —— `insert` は毎回新しい id を振り、画面の
 * フォームは `await add()` の**後**でしか空にならないので、2 度目も同じ値で走る。
 *
 * 実測 (2026-09-09): 保有銘柄・物件・販売記録・KPI 実績・予算・貸借対照表・
 * メンバー・計算値の置き換え・士業の連絡先と相談・Shopify の記録・バックアップ の
 * **12 の入口**に、押している間の守りが無かった。KPI 実績は期ごとに**合算**される
 * ので、二重の 1 件は売上高を 2 倍にして金融機関等提出用の書面まで届く。
 *
 * `run` は前の実行が終わるまで 2 度目以降を**黙って落とす** (戻り値 false)。
 * 実行した task の拒否は握り潰さない —— 呼び手の try/catch か `fireReported` が
 * 従来どおり受ける。`busy` はボタンの `disabled` へ渡す (押せない見た目も揃える)。
 *
 * 母集団は `renderer/__tests__/submitGuardCensus.test.ts` が**実装から**数える
 * (async の handler を onClick から呼ぶ所は、この関門を通っていること)。
 */
export interface SubmitGuard {
  /** いま 1 つ走っているか。ボタンの `disabled` に渡す。 */
  readonly busy: boolean;
  /**
   * task を走らせる。前の task が終わるまで、次の呼び出しは何もせず `false` を返す。
   * task が投げれば、その拒否をそのまま返す (関門は握り潰さない)。
   */
  readonly run: (task: () => Promise<unknown> | unknown) => Promise<boolean>;
}

export function useSubmitGuard(): SubmitGuard {
  const [busy, setBusy] = useState(false);
  // 判定は ref で持つ —— state は次の描画まで古い値なので、同じ tick の 2 度目を止められない。
  const inFlight = useRef(false);
  const run = useCallback(async (task: () => Promise<unknown> | unknown): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      await task();
      return true;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
