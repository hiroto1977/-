/**
 * 「最新の 1 件を採用する」collection のための取り出し口。
 *
 * `RecordStore.list` は**新しい順** (createdAt の降順) に返す。ところが画面は
 * 4 か所で `records[records.length - 1]` を「最新」として読んでいた —— それは
 * **いちばん古い 1 件**である。2 回目に保存した瞬間から、経営サマリーの
 * 水耕栽培・貸借対照表・ハイライトのしきい値は**最初の保存に固定**され、
 * 入力欄には「保存しました」と出るのに数字が変わらなかった
 * (2026-09-02、品目一覧を同じ書き方で足そうとして気付いた)。
 *
 * 並び順に頼らず createdAt で選ぶ。同時刻なら先に並んでいる方 (list の
 * 順序 = 新しい順 を尊重)。空なら null。
 */
export function latestRecord<R extends { readonly createdAt: number }>(records: readonly R[]): R | null {
  let latest: R | null = null;
  for (const r of records) {
    if (latest === null || r.createdAt > latest.createdAt) latest = r;
  }
  return latest;
}
