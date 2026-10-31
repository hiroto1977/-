import type { ReactElement } from 'react';
import { changedLatestNote } from '../data/readCollectionNow';

/**
 * 「最新の 1 件を採用する」設定の欄の 2 つの部品 (2026-09-28 · パス 500)。
 *
 * 欄の状態は `data/useLatestForm.ts` が持ち、ここは見せるだけ。
 */

/**
 * **欄を開いた後に別の画面で保存し直されていた**ので、保存を断ったときの断り。
 *
 * 入力は残っている (`useLatestForm` は断っても欄を捨てない)。次の一手を 2 つ並べる ——
 * もう一度押して上書きする (`then` がその画面の押す所を名指しする) か、保存されている内容から
 * 始め直す (このボタン)。どちらが正しいかはアプリには分からない (別の画面で保存したのは
 * 利用者本人でありうる) ので、選ばせる。
 */
export function ChangedLatestNote({
  changed,
  what,
  then,
  onLoadSaved,
}: {
  changed: boolean;
  what: string;
  then: string;
  onLoadSaved: () => void;
}): ReactElement | null {
  if (!changed) return null;
  return (
    <div
      role="alert"
      data-changed-latest
      style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--danger)', margin: '8px 0' }}
    >
      {changedLatestNote(what, then)}{' '}
      <button type="button" onClick={onLoadSaved} style={{ fontSize: 12 }}>
        保存した内容を読み込む
      </button>
    </div>
  );
}

/**
 * 保管層が答えるまで、欄の代わりに出す 1 行。
 *
 * **既定値の欄は出さない** —— 出した時点で「保存値はこれです」と主張する。直す前は既定値の欄が
 * 先に開き、保存値が届いても開き直さず、1 欄だけ直して保存すると保存していた他の欄を既定値で
 * 覆った (実測は `useLatestForm.ts` の docblock)。
 */
export function LatestFormLoading({ collection, what }: { collection: string; what: string }): ReactElement {
  return (
    <p data-latest-form-loading={collection} style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>
      保存した{what}を読み込んでいます…
    </p>
  );
}
