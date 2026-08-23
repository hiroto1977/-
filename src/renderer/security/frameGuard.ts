/**
 * 枠 (iframe) に入れられた状態では描画しない — クリックジャッキング対策。
 *
 * ## なぜ CSP では守れないのか
 *
 * 枠入れを止める指定は `frame-ancestors` だが、これは **`<meta>` で配ると
 * ブラウザに無視される** (CSP3: `frame-ancestors` / `report-uri` / `sandbox`
 * は meta 経由では効かない)。実測 (2026-08-23・実 chromium):
 *
 *   meta に frame-ancestors 'none' を書いた頁 → 枠の中身が読める (= 効いていない)
 *   守り無しの頁                              → 同じ
 *   この関門を入れた頁                         → 中身が差し替わる
 *
 * chromium は `The Content Security Policy directive 'frame-ancestors' is
 * ignored when delivered via a <meta> element.` と console に出す。
 * つまり `buildCsp` へ 1 行足すのは**見せかけの守り**になる。
 *
 * 応答ヘッダ (`X-Frame-Options` / ヘッダ経由の CSP) なら効くが、公開先は
 * **GitHub Pages** で静的配信のヘッダを足せない。`file://` で配る単一ファイル
 * 版も同じ。だから頁の側で断るしかない。
 *
 * ## 何を守るのか
 *
 * 別オリジンの頁からは中身を読めないので、危ないのは**押させる**方である。
 * ブラウザ版は保管庫が開いた状態で、記録の削除・暗号化の解除・書き出し・
 * 連携先への書き込み (Slack 送信 / Issue 作成 / 記事公開) がどれも
 * 1 クリックで動く。透明にした枠を重ねて狙った位置を押させる形が成立する。
 *
 * ## 枠外し (top を書き換える) はしない
 *
 * `window.top.location = …` は別オリジンなので操作できず、利用者の操作を
 * 伴わない上位フレームの遷移は今のブラウザが止める。できるのは
 * 「描かないこと」までで、それで十分である (描かなければ押す対象が無い)。
 *
 * Electron 版では `window.top === window.self` なので何も起きない。
 */

/** 上位フレームの中に居るか。判定できないときは「居る」に倒す (fail-closed)。 */
export function isFramed(w: Window = window): boolean {
  try {
    // 別オリジンの親でも `top` 自体は読める (中身が読めないだけ) が、
    // 環境によっては例外になる。読めない = 誰かに囲まれている、と見なす。
    return w.top !== w.self;
  } catch {
    return true;
  }
}

/** 枠に入れられていることを伝える文面。 */
export const FRAMED_MESSAGE =
  'Service Hub は他のサイトの枠 (iframe) の中では動きません。' +
  'なりすましたページに操作を押させる手口を防ぐためです。' +
  '下のリンクからこのページを単独で開いてください。';

/**
 * 描画の代わりに断りを出す。
 *
 * `innerHTML` は使わない (この repo では禁止指定でもある)。組み立ては
 * `createElement` + `textContent` だけで行うので、文面に何が入っても
 * markup にはならない。
 */
export function renderFrameRefusal(doc: Document, href: string): HTMLElement {
  const root = doc.getElementById('root') ?? doc.body;
  while (root.firstChild !== null) root.removeChild(root.firstChild);

  const box = doc.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'padding:24px;font-family:system-ui,sans-serif;line-height:1.7;max-width:36em';

  const title = doc.createElement('h1');
  title.textContent = '枠の中では開けません';
  title.style.cssText = 'font-size:1.2rem;margin:0 0 12px';

  const body = doc.createElement('p');
  body.textContent = FRAMED_MESSAGE;
  body.style.cssText = 'margin:0 0 16px';

  const link = doc.createElement('a');
  link.href = href;
  // `_top` は「この枠を含む一番上」を置き換える = 利用者が押したときだけ動く。
  link.target = '_top';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Service Hub を単独で開く';

  box.appendChild(title);
  box.appendChild(body);
  box.appendChild(link);
  root.appendChild(box);
  return box;
}
