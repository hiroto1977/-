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

/**
 * **編集の相手が保管層に無かった**ときの断り (2026-09-27 · パス 498)。
 *
 * `useCollection` の `edit` は、相手の行が無ければ何も書かずに `false` を返す。画面はそれを
 * 黙って「保存した」形にしてはいけない —— 直す前は編集の欄を空にし、読み直した一覧から行も
 * 消えたので、**打ち込んだ値は痕跡なく失われた** (別のタブで消された行を編集して保存した場合)。
 *
 * `what` は主語 (「編集していた銘柄」)、`then` は画面ごとの次の一手 (入力を残したか・一覧を
 * 読み直したか)。**消された行を黙って作り直さない** —— 足すかどうかは利用者が決める。
 */
export function vanishedRecordNote(what: string, then: string): string {
  return `${what}は既に一覧にありません（別の画面で削除された可能性があります）。${then}`;
}

/**
 * **欄を開いた後に、同じ行が別の画面で書き換えられていた**ときの断り (2026-09-27 · パス 499)。
 *
 * `useCollection` の `editIfUnchanged` は、欄を開いた時の中身と今の中身が違えば何も書かずに
 * `changed` を返す。直す前は `edit` で全部の欄を書いており、**別のタブが直した欄まで、
 * 欄を開いた時の値へ黙って戻していた** (lost update —— 実測は `useCollection.ts` の
 * `editIfUnchanged` の docblock)。
 *
 * 文は 3 つのことを言う: ① 何が起きたか (書き換えられていた・**保存していない**)
 * ② 今の中身はどこで見えるか (一覧の行) ③ `then` —— 画面ごとの次の一手。
 * 次の一手は 2 つで、**どちらも利用者が選ぶ**: そのまま上書きする (もう一度押す) か、
 * 書き換えられた内容から始め直す (一覧の「編集」)。黙ってどちらかに決めない。
 */
export function changedRecordNote(what: string, then: string): string {
  return `${what}は、編集を始めた後に別の画面で書き換えられています（一覧の行が今の内容です）。保存していません。${then}`;
}

/**
 * **最新の 1 件を採用する設定の欄を開いた後に、別の画面で保存し直されていた**ときの断り (パス 500)。
 *
 * `useLatestForm` の保存は、欄を開いた時の最新がまだ最新のときだけ書く。違えば何も書かずに断る ——
 * 直す前は欄の値で全部の欄を書き、別のタブの保存を黙って覆っていた (欄が保管層より先に開いていた頃は、
 * 自分の保存値まで既定値で覆った —— 実測は `useLatestForm.ts` の docblock)。
 *
 * 次の一手は 2 つで、どちらも利用者が選ぶ: そのまま上書きする (もう一度押す) か、保存されている内容から
 * 始め直す (「保存した内容を読み込む」—— `ChangedLatestNote` が並べる)。`then` はその画面の押す所を名指しする。
 */
export function changedLatestNote(what: string, then: string): string {
  return `${what}は、この欄を開いた後に別の画面で保存し直されています。保存していません。${then}`;
}

/**
 * 今の最新に当てて足すたびに別の保存が挟まった (上限 `MAX_LATEST_ATTEMPTS` まで) ときの断り (パス 500)。
 * 何も書いていない —— 回り続けずに止め、もう一度押してもらう。
 */
export function busyLatestNote(what: string): string {
  return `${what}を保存できませんでした（別の画面の保存と重なり続けました）。もう一度お試しください。`;
}
