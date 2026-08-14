/**
 * マークアップに文字列を埋めるときのエスケープ — アプリ全体で 1 つだけ持つ。
 *
 * 同じ実装が main の 3 モジュールと renderer の 1 画面に写経されていた。
 * この種の関数を複数持つのは危険で、片方だけ文字を足し忘れると「その画面だけ
 * エスケープが漏れている」という状態になり、しかも見た目には現れない。
 *
 * ただし 2026-08 の時点でも `business.ts` / `stocks.ts` / `stocksAnalysisWeb.ts`
 * に写経が 3 つ残っていた（この説明が実装より先に「1 つだけ」と言っていた）。
 * 実害はビルドスクリプト側で先に出ており、`gen-econ-asset-chart.cjs` だけが
 * `"` と `'` を落としていなかった。説明で 1 つだと主張するのではなく、
 * `lint:forbidden` の #11 が src 配下での再実装を落とす。
 *
 * 5 文字（& < > " '）を落とす。HTML にも XML にも同じ集合で足りる。
 * & を最初に置換するのは、後から置換した実体参照の & をもう一度置換しないため。
 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 色として SVG/HTML の属性に埋めても安全な文字列だけ通す。
 *
 * テンプレート書き出しの色は `params` 経由で入ってくる。画面は
 * `<input type="color">` なので `#rrggbb` しか作れないが、**IPC と
 * `serviceHub.invoke()` は任意の文字列を受ける**。`openExternal` で
 * 「レンダラが sandbox でも IPC は任意の文字列を受ける」として多層防御を
 * 張っているのと同じ理由で、ここも入口で絞る。
 *
 * 絞らないと `fill="{色}"` の引用符を抜けて属性を足せる。書き出した SVG は
 * ライブラリに保存され、ダウンロードして**他人に渡る**ので、
 * 開いた人の環境でスクリプトが走る形になる。
 *
 * エスケープではなく**検証して既定値に落とす**方を採る。壊れた色を
 * エスケープして残しても意味のある表示にはならないうえ、
 * 「通った＝色として妥当」と言い切れる方が後段が単純になる。
 */
export function safeColor(input: string, fallback: string): string {
  // #rgb / #rrggbb / #rrggbbaa と、CSS の名前つきの色（英字のみ）。
  // どちらも引用符・空白・山括弧を含まないので属性から抜けられない。
  // 前後のアンカーは必須。`$` が無いと `#0f5facff" onload="…` の先頭だけが
  // 一致して、後ろの属性ごと通ってしまう。
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(input)) return input;
  if (/^[a-zA-Z]{3,20}$/.test(input)) return input;
  return fallback;
}

/**
 * `#RRGGBB` ちょうどか。**テンプレート書き出しの色の唯一の判定**。
 *
 * `safeColor` と役割が違うので別に持つ。`safeColor` は「描画を止めずに
 * 危険な値だけ既定値へ落とす」ためのもので 3/6/8 桁と名前つきの色を通す。
 * こちらは書き出し API の**契約**で、`#RRGGBB` 以外は受け取らずに弾く
 * （main は throw、画面は送信前に案内を出す）。同じ判断が
 * `src/main/clients/templates.ts` と `src/renderer/pages/TemplatesPage.tsx` に
 * 1 つずつあり、片方だけ緩められる形になっていたのでここへ寄せた。
 */
export function isHexColor(input: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(input);
}
