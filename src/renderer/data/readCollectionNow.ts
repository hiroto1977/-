/**
 * **判定の相手は、購読の写しではなく保管層から読み直す。** (2026-09-21 · パス 384)
 *
 * 画面は `useCollection(c)` の `records` を持つが、これは**購読の写し**であって
 * 「今そこに在る物」ではない:
 *
 * - 一覧が IndexedDB から届く**前**は空である (`useState([])` で始まる)。
 * - 読みが**失敗**しても `loading` は落ち (「読み込み中…」を永遠に出さないため)
 *   `records` は空のまま残る —— つまり画面からは**「空」と「読めなかった」が
 *   区別できない**。
 *
 * 表示にはそれで構わない (届いたら描き直される)。**壊れるのは判定のほう**で、
 * 「この行は既に在るか」を空の写しに尋ねると答えは必ず「無い」になる。
 *
 * ## 実測した害 (2026-09-21)
 *
 * 売上集計の CSV 取り込みは `salesFromCsv(text, entries)` に写しを渡していた。
 * 一覧が届く前に CSV を選ぶと重複の検出が**丸ごと働かず**、画面は
 * 「2 件を取り込みました」だけを出し、**総売上は重複を含んだ額**になった
 * (対照で戻すと ￥500 の記録が ￥1,000 になる)。断りも拒否も 1 文も出ない ——
 * パス 126 が直した「同じ CSV を 2 度読むと売上高と受注件数が 2 倍になり、
 * 金融機関等提出用の書面 §2『売上高（販売記録）』まで届く」が、
 * **読み込み順の窓から戻っていた**。
 *
 * ## `null` は「読めなかった」で、「0 件」ではない
 *
 * 呼び手はこれを「重複が無い」と混ぜずに**断ること** —— 判定は出し直せるが、
 * 書き込んだ行は残り、以後すべての集計がそれを読む (パス 214 と同じ理由)。
 * 「読めなかった」を「無い」に畳まないのはパス 313 / 352 と同じ規則である。
 */
import { getRecordStore, type StoredRecord } from './store';

export async function readCollectionNow<T extends Record<string, unknown>>(
  collection: string,
): Promise<readonly T[] | null> {
  const rows = await readRecordsNow<T>(collection);
  return rows === null ? null : rows.map((r) => r.data);
}

/**
 * **行ごと** (id と `createdAt` つき) に読み直す (2026-09-27 · パス 497)。
 *
 * 判定が「どの行を書き換えるか」「最新の 1 件はどれか」を決めるときに要る ——
 * `readCollectionNow` は中身だけを返すので、書き換える行の id も、
 * 「最新の 1 件を採用する」collection (水耕の品目一覧) の最新も選べない。
 * 読めなければ `null` (「0 件」ではない —— 上の docblock と同じ規則)。
 */
export async function readRecordsNow<T extends Record<string, unknown>>(
  collection: string,
): Promise<readonly StoredRecord<T>[] | null> {
  try {
    return await getRecordStore().list<T>(collection);
  } catch {
    return null;
  }
}

/**
 * 読めなかったときに画面へ出す断り。**何を確かめられないか**を名指しする。
 *
 * `unchecked` は「読めないと何が決められないか」—— 既定は重複の判定 (パス 384) だが、
 * パス 497 で寄せた判定には重複ではない物が在る (オーナーが何人か・今の品目の一覧)。
 * 重複の判定でない所で「同じ記録が在るか」と言うと、**原因を取り違えた断り**になる
 * (パス 388 の家系)。
 */
export function unreadableForJudgementNote(what: string, unchecked = '既に同じ記録が在るか'): string {
  return `${what}を読めなかったため、処理を中止しました（${unchecked}を確かめられません）。画面を開き直してから、もう一度お試しください。`;
}
