/**
 * 書き出しが**どこに収まったか**を利用者に返す。
 *
 * ブラウザ版の書き出しは 1 回の操作で **3 か所**へ置こうとする:
 *
 *   1. 端末のダウンロード (`<a download>`)
 *   2. アプリ内のライブラリ (IndexedDB)
 *   3. 設定で選んだ PC のフォルダ (File System Access)
 *
 * 実測 (2026-09-06): **3 か所とも失敗を捨てていた。**
 *
 *   - ライブラリと PC のフォルダは `catch {}`（`web-shim.ts` の `saveToLibrary`。
 *     コメントは "best-effort" と書いてあるが、利用者には何も届かない）。
 *   - フォルダは、保管した handle の許可が `prompt` に戻っていると
 *     **試しもせず飛ばしていた**。ブラウザを再起動すると許可は勝手に戻りうるので、
 *     これは異常時ではなく**普通に起きる**。
 *   - ダウンロードの成否は `downloaded` として結果に載っていたが、
 *     **読む画面が 1 つも無かった**（`src/` 全体で web-shim の 4 行にしか現れない）。
 *
 * 一方で設定画面は「設定すると、『ライブラリ』に加えて PC の指定フォルダにも
 * **自動保存します**」と書いてある。書けていないのに「書き出しました」と出るのは、
 * 書類スタジオの「入力は端末内に自動保存」と同じ形の嘘である。
 *
 * ここは**結果の読み方**だけを持つ（送り出す側は `fs/folderMirror.ts`）。
 * デスクトップ版の同じ action は `libraryCopy` / `folderCopy` を返さない
 * （OS のファイルへ直接書くので中継が無い）ので、**欄が無いときは何も言わない**。
 */

import { isRecord } from './persistedShape';

/** 1 か所ぶんの結末。`off` は「そこへ置く設定になっていない」で、失敗ではない。 */
export type SinkOutcome = 'saved' | 'failed' | 'off' | 'permission';

/** 書き出し action の戻り値のうち、収まった先に関する部分。 */
export interface ExportSinks {
  readonly libraryCopy: SinkOutcome;
  readonly folderCopy: SinkOutcome;
}

/**
 * 文面は「何が起きなかったか」と「次にどうするか」を必ず対で書く。
 * 画面に出る文字列なので定数にして、検査と画面が同じ物を見るようにする。
 */
export const DOWNLOAD_FAILED_TEXT =
  'この端末へのダウンロードができませんでした。ライブラリから開いて保存し直してください。';
export const LIBRARY_FAILED_TEXT =
  'アプリ内のライブラリに残せませんでした (保存領域が一杯か、ブラウザの設定で保存が禁じられています)。';
export const FOLDER_PERMISSION_TEXT =
  'PC の指定フォルダへの自動保存は、フォルダの許可が切れているため行われていません。設定の「権限を再取得」で許可し直してください。';
export const FOLDER_FAILED_TEXT =
  'PC の指定フォルダに書き込めませんでした。フォルダが移動・削除されていないか確認してください。';

/**
 * 収まらなかった先があれば 1 行の警告にする。全部収まったなら `undefined`。
 *
 * `data` は action の戻り値そのままで、欄が無い・型が違う場合がある
 * （デスクトップ版・古い版・別の action）。**知らない値は黙って無視する**
 * ——「収まった」と言い切れるのは `saved` のときだけだが、`off`（未設定）と
 * 区別せずに警告を出すと、フォルダ連携をしていない人に毎回警告が出る。
 */
export function exportWarning(data: unknown): string | undefined {
  const rec: Record<string, unknown> = isRecord(data) ? data : {};
  const parts: string[] = [];
  if (rec.downloaded === false) parts.push(DOWNLOAD_FAILED_TEXT);
  if (rec.libraryCopy === 'failed') parts.push(LIBRARY_FAILED_TEXT);
  if (rec.folderCopy === 'permission') parts.push(FOLDER_PERMISSION_TEXT);
  if (rec.folderCopy === 'failed') parts.push(FOLDER_FAILED_TEXT);
  // 空配列の join は '' なので、`|| undefined` で「言うことは無い」に落とす
  // （`length` を数える書き方だと、比較の変異が同じ結果になって残る）。
  return parts.join(' ') || undefined;
}
