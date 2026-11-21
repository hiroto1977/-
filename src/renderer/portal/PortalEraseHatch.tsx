/**
 * この端末に残した入力を消す口 (パートナーポータル · 2026-11-11)。
 *
 * パートナーポータルの「書類スタジオ」は、入力をその端末の localStorage (`servicehub.docstudio.v1`) へ
 * 自動で残す (書きかけが消えないため)。配る HTML には社内版の設定画面 (すべてのデータを削除) が無いので、
 * **残した物を消す手段をこの HTML の中に置く** —— 無いと、受け取った人は自分の入力を消せない
 * (配る 3 本の maker で 2026-09-21 に直した形 · パス 364)。
 *
 * 消すのは**このポータルが書く鍵だけ**。同じ場所 (オリジン) の他の保存先には触らない。
 * 消したら読み直して確かめ、頁を再読込する (画面が古い入力を持ったまま書き戻さないように)。
 *
 * カスタマーポータルはこの部品を取り込まない (端末に何も残さない)。
 */
import { useState } from 'react';
import { readLocalString } from '../data/localWrite';

/** パートナーポータルが端末に残す鍵 (書類スタジオの下書き)。`DocstudioPage` の保存先と同じ綴り。 */
const DOCSTUDIO_DRAFT_KEY = 'servicehub.docstudio.v1';

export const PORTAL_ERASE_CONFIRM =
  'この端末に残した「書類スタジオ」の入力を消します。元に戻せません。よろしいですか？';
export const PORTAL_ERASE_FAILED = '消せませんでした。ブラウザの設定で、この頁のサイトデータを削除してください。';

/** 鍵を消し、消えたことを読み直して確かめる。 */
export function erasePortalDrafts(): boolean {
  try {
    localStorage.removeItem(DOCSTUDIO_DRAFT_KEY);
  } catch {
    return false;
  }
  const after = readLocalString(DOCSTUDIO_DRAFT_KEY);
  return after.readable && after.value === null;
}

export function PortalEraseHatch({ reload = () => location.reload() }: { reload?: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <div data-portal-erase>
      <button
        type="button"
        onClick={() => {
          if (!window.confirm(PORTAL_ERASE_CONFIRM)) return;
          if (erasePortalDrafts()) reload();
          else setFailed(true);
        }}
      >
        🗑 この端末に残した入力を消す
      </button>
      <span style={{ marginLeft: 8 }}>書類スタジオの入力は、この端末のブラウザの中にだけ残っています。</span>
      {failed && (
        <p role="alert" style={{ margin: '6px 0 0' }}>
          {PORTAL_ERASE_FAILED}
        </p>
      )}
    </div>
  );
}
