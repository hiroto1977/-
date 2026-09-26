/**
 * **記録ストアを本当に空にする 1 か所** (2026-09-12 · パス 170)。
 *
 * ## `_resetRecordStoreForTests()` は隔離ではない
 *
 * 名前は「リセット」だが、中身は **singleton を捨てるだけ**である:
 *
 * ```ts
 * export function _resetRecordStoreForTests(): void {
 *   singleton = null;
 * }
 * ```
 *
 * **IndexedDB は残る。** 次に開いた store は同じ `business-hub-data` を読むので、
 * 前の `it()` が UI から足したレコードがそのまま見える。`localStorage.clear()` も
 * IndexedDB には効かない。
 *
 * ## 実測 (2026-09-12)
 *
 * `ManualDataSection` を駆動する検査を書いたら、**3 本が落ちた**:
 *
 * | 検査 | 期待 | 実際 |
 * | --- | --- | --- |
 * | 事業名が空なら 1 件も足さない | 0 行 | **1 行** (前の `it()` が足した「第二工場」) |
 * | 開始時期が不正なら足さない | 0 行 | **1 行** (同じ) |
 * | 見出しの件数 == 行数 | 2 | **3** (前の `it()` の数値が残っていた) |
 *
 * つまり「0 件であること」「件数が N であること」を見る検査は、
 * **その前に何が走ったかで結果が変わる**。単独では通り、並べると落ちる
 * (あるいは逆に、**落ちるべき欠陥を見逃す**)。パス 169 の固定 `settle` と同じ形 ——
 * **隔離しているつもりの仕掛けが、実は隔離していない。**
 *
 * ## 母集団 (走査で数えた)
 *
 * `_resetRecordStoreForTests` を呼ぶ検査は **67 ファイル**。うち
 * **49 は自分で `indexedDB.deleteDatabase('business-hub-data')` も呼んでいる**
 * (同じ 6 行を 49 回書き写している)。**18 は呼んでいない。**
 *
 * 「書くファイルだけ直す」は成り立たない —— 書き込みは UI の click から起きるので
 * 静的には数えられない (`.add(` を探すと `container.remove()` に当たる)。
 * だから**呼ぶなら必ず隔離する**にして、空の DB を消す無駄は受け入れる
 * (消すのは数 ms で、隔離していない検査は静かに順序に依存する)。
 */
import { _resetRecordStoreForTests } from '../data/store';

/** 記録ストアが使う IndexedDB の名前 (`store.ts` の `openDb` と同じ物)。 */
export const RECORD_DB_NAME = 'business-hub-data';

/**
 * IndexedDB のデータベースを消す。
 *
 * **`onerror` / `onblocked` でも解決する** —— ここで投げると「掃除に失敗した」
 * ことが検査の失敗として出てしまい、本題と見分けが付かない。消せなかった場合は
 * 次の検査が前の残りを見るが、それは元の (隔離していない) 状態と同じである。
 */
export function deleteRecordDb(): Promise<void> {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(RECORD_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * **記録ストアを本当に空にする。** `beforeEach` で `await` して使う。
 *
 * singleton を捨ててから DB を消す順序が要る —— 逆にすると、生きている
 * singleton が握った接続で `deleteDatabase` が `blocked` になりうる。
 */
export async function resetRecordStore(): Promise<void> {
  _resetRecordStoreForTests();
  await deleteRecordDb();
}
