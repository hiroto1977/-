/**
 * **書き出しが収まらなかった先は、画面に出る文になる。**
 *
 * ★ を付けた検査が、2026-09-06 まで**存在しなかった報せ**を留めている
 * (ライブラリと PC のフォルダの失敗は `catch {}`、ダウンロードの成否は
 * `downloaded` として結果に載っていたのに読む画面が 1 つも無かった)。
 *
 * 対照は「収まったときは黙る」——「未設定 (off)」で警告を出すと、フォルダ連携を
 * していない大多数に毎回警告が出てしまい、本当の失敗が埋もれる。
 */
import { describe, expect, it } from 'vitest';
import {
  DOWNLOAD_FAILED_TEXT,
  FOLDER_FAILED_TEXT,
  FOLDER_PERMISSION_TEXT,
  LIBRARY_FAILED_TEXT,
  exportWarning,
} from '../exportOutcome';

describe('exportWarning', () => {
  it('★ 許可が切れてフォルダに書けていないことを、次の手つきで報せる', () => {
    const w = exportWarning({ downloaded: true, libraryCopy: 'saved', folderCopy: 'permission' });
    expect(w).toBe(FOLDER_PERMISSION_TEXT);
    // 「次にどうするか」まで書いてあること (文面が短くなる方向の変更で消えやすい)
    expect(w).toContain('権限を再取得');
  });

  it('★ フォルダへの書き込みが失敗したことを報せる', () => {
    expect(exportWarning({ downloaded: true, libraryCopy: 'saved', folderCopy: 'failed' })).toBe(
      FOLDER_FAILED_TEXT,
    );
  });

  it('★ ライブラリに残せなかったことを報せる', () => {
    expect(exportWarning({ downloaded: true, libraryCopy: 'failed', folderCopy: 'off' })).toBe(
      LIBRARY_FAILED_TEXT,
    );
  });

  it('★ 端末へのダウンロードができなかったことを報せる (downloaded を読む画面が無かった)', () => {
    expect(exportWarning({ downloaded: false, libraryCopy: 'saved', folderCopy: 'off' })).toBe(
      DOWNLOAD_FAILED_TEXT,
    );
  });

  it('★ 3 か所とも収まらなかったら 3 つ並べる (空白で継ぐ)', () => {
    const w = exportWarning({ downloaded: false, libraryCopy: 'failed', folderCopy: 'failed' });
    expect(w).toBe(`${DOWNLOAD_FAILED_TEXT} ${LIBRARY_FAILED_TEXT} ${FOLDER_FAILED_TEXT}`);
  });

  it('対照: 全部収まったら何も言わない', () => {
    expect(exportWarning({ downloaded: true, libraryCopy: 'saved', folderCopy: 'saved' })).toBeUndefined();
  });

  it('対照: フォルダ未設定 (off) は失敗ではないので黙る', () => {
    expect(exportWarning({ downloaded: true, libraryCopy: 'saved', folderCopy: 'off' })).toBeUndefined();
  });

  it('対照: 欄が無い結果 (デスクトップ版の同じ action) では何も言わない', () => {
    expect(exportWarning({ path: 'a.svg', bytes: 12 })).toBeUndefined();
  });

  it('対照: オブジェクトでない値でも投げずに黙る', () => {
    expect(exportWarning(null)).toBeUndefined();
    expect(exportWarning('failed')).toBeUndefined();
    expect(exportWarning(undefined)).toBeUndefined();
  });

  it('知らない値は無視する (綴り違い・古い版が返す別の語)', () => {
    expect(exportWarning({ downloaded: 'no', libraryCopy: 'FAILED', folderCopy: 'refused' })).toBeUndefined();
  });

  it('permission と failed は同じ欄なので混ざらない', () => {
    // folderCopy は 1 つの値しか採らない。permission のときに「書き込めませんでした」
    // まで出すと、利用者は無いフォルダを探しに行く。
    expect(exportWarning({ folderCopy: 'permission' })).not.toContain('移動・削除');
  });
});
