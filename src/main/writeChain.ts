/**
 * **モジュールごとの書き込みの鎖** (2026-10-15 · パス 522 · threat: T-055)。
 *
 * 「読む → 直す → 書く」を 2 つ同時に走らせると、両方が書く前の値を読み、
 * 後から書いた側が先の変更を黙って消す (lost update)。`secrets.ts` は
 * 2026-08 から同じ鎖 (`withWriteLock`) を持っていたが、`stocks.ts` の
 * ウォッチリストと `teamradar.ts` の評価は持っておらず、しかも**固定名の
 * `.tmp`** へ書いていたので、2 つの保存が同じ作業ファイルを切り詰め合って
 * **本体が壊れた JSON になる**ことまで在った (実測 2026-10-15: 300 回のうち
 * 49 回が壊れた JSON・`chmod` が ENOENT で投げ・ウォッチリストが消えた)。
 *
 * 鎖は完了の合図だけを持ち、前の仕事が投げても次は走る (失敗を次へ運ばない)。
 * 鎖を取る関数の中から同じ鎖を取ると待ち合わせて止まるので、鎖の中で呼ぶ
 * 側は `…Unlocked` を使う。
 */
export type WriteChain = <T>(fn: () => Promise<T>) => Promise<T>;

export function createWriteChain(): WriteChain {
  let chain: Promise<void> = Promise.resolve();
  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}
