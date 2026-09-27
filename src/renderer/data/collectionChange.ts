/**
 * レコードストアが変わったことを、読んでいる画面へ知らせる仕組み (2026-09-24 · パス 448)。
 *
 * ★ **2026-09-24 まで、この仕組みは `useCollection` の中に在った** —— つまり
 * **hook を通らない書き込みは、どの画面にも届かなかった**。出荷コードに 3 本在る
 * (実測):
 *
 * | 書く所 | 何を書くか | 直す前 |
 * | --- | --- | --- |
 * | `connectorSinks.insertStorage` | コネクタ実行の結果 | 画面に出ない |
 * | `RecordShapeAuditPanel` の削除 | 形式の合わない行 | 消しても一覧が古いまま |
 * | `BackupPanel` の復元 (`importAll`) | **全 collection** | 復元しても画面が古いまま |
 *
 * いちばん重いのは 3 本目で、**同じ画面の中で起きる** —— 設定画面は
 * `BackupPanel` (SettingsPage:1125) と `ParametersPanel` (:1132) を並べて描く。
 * 実測 (2026-09-24 · 直す前 · 消費税率の上書きを 5% で置き、25% の控えを置換復元):
 *
 * ```
 * 復元の前: 有効値=0.05
 * 復元の後: 有効値=0.05   ← 画面と計算が使う値
 * 保管層:   [{"values":{"tax.consumptionStandardRate":0.25}}]
 * ```
 *
 * **保管層は 25%、画面は 5%。** 利用者はその食い違いを知らされず、税の計算は
 * 復元する前の率で回り続ける (再読込まで)。パス 384 が「購読の写しを判定に使うと
 * 一覧が届く前に働かない」を直した当の家系で、こちらは**書いた側が黙っている**形である。
 *
 * **知らせる先は collection で絞らない (理由を測って決めた)。**
 * `remove(id)` は collection を引数に持たず、`importAll(..., {replace:true})` は
 * **控えに 1 行も無い collection を空にする** —— どちらも「どの collection が
 * 変わったか」を別に計算しないと分からない。その計算を誤ると**画面が古いまま**に
 * なる、つまり**いま直している欠陥そのもの**が戻る。**失敗の形が直している欠陥と
 * 同じ最適化は採らない。** 代わりの費用は「読んでいる hook の数だけ `list()` が
 * 1 回ずつ」で、`notifyCollection` の docblock が 2026-08 に同じ天秤で同じ側を
 * 選んでいる (「読み直しは IndexedDB の 1 read なので、分岐を消すほうを採る」)。
 *
 * 購読は collection を鍵に持つ —— **それは「この hook が何を見ているか」という
 * 事実**で、解除が効いているかを数える検査が読む。配る側が絞らないだけである。
 */

/** collection ごとの購読者。鍵は「その hook が何を見ているか」を記録する。 */
const subscribers = new Map<string, Set<() => void>>();

/**
 * その collection の購読者集合。無ければ作る。
 *
 * `subscribers.get(c) ?? []` と書くと、**到達しない既定値**が残る
 * (通知は必ず購読済みの hook から来るので undefined にならない)。
 * 集合を必ず返す入口を 1 つ置けば、その分岐ごと消える。
 */
function subscriberSet(collection: string): Set<() => void> {
  const existing = subscribers.get(collection);
  if (existing !== undefined) return existing;
  const created = new Set<() => void>();
  subscribers.set(collection, created);
  return created;
}

/** 購読する。返り値を呼ぶと解除。 */
export function subscribeCollection(collection: string, fn: () => void): () => void {
  const set = subscriberSet(collection);
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/**
 * レコードストアの中身が変わった —— 読んでいる hook すべてに読み直させる。
 *
 * 書いた本人も含めて呼ぶ。「自分以外」に絞ると読み直しが 1 回減るが、
 * **観測できる差が無いぶんテストで守れない**分岐が増える。
 */
export function notifyRecordStoreChanged(): void {
  for (const set of subscribers.values()) {
    for (const fn of set) fn();
  }
}

/** テスト用: 購読者を空にする。 */
export function _resetCollectionSubscribersForTests(): void {
  subscribers.clear();
}

/** テスト用: 購読者数。解除が効いているかを見るために公開する。 */
export function _collectionSubscriberCountForTests(collection: string): number {
  return subscribers.get(collection)?.size ?? 0;
}
