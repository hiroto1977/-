/*
 * 第三者由来の画像 URL の関門 — スキーム検証と、沈み先ごとの正しい包み方。
 *
 * **なぜ `src/shared/` に居るか**: 2026-08-24 に数えたら、この関門だけが
 * 変異検査の対象から外れていた。`externalUrlGate` / `httpLimits` /
 * `safeFilename` といった同種の壁はすべて単一目的のモジュールとして
 * `src/shared/` に在り `mutate` に載っているのに、これは
 * `components/DataList.tsx` の中に置かれていたため
 *
 *   - `mutate` に `.tsx` が 1 件も無い → **変異体が 1 つも作られない**
 *   - `MUST_MEASURE` (必ず測る壁の名簿) にも載りようがない
 *
 * という状態だった。**関門がコンポーネントの中に隠れていたことが、
 * 見落とされた原因そのもの**なので、壁の在る場所へ移した。
 *
 * (同じ形は `exportPaths.ts` と `frameGuard.ts` で既に踏んでいる ——
 *  どちらも「壁なのに測られていなかった」。名簿はそのために在る。)
 */

/**
 * 第三者 API 由来の画像 URL を `https:` / `http:` / `data:image/*` に限定する。
 * 許可スキーム以外は `undefined` を返し、呼び出し側は `<img>` を描画しない。
 *
 * 2026-07 セキュリティ監査（多層防御 / 予防的）: 現在の呼び出し元は `<img src>` だけで、
 * `<img src="javascript:…">` からスクリプトは実行されないため既存の実害はない。
 * ただし同じ値が将来 `<a href>` / CSS `url()` / SVG `<use href>` / `openExternal` に
 * 流れた瞬間に `javascript:` や `data:text/html` が実行プリミティブになる。検証は
 * 描画箇所ごとではなく値の入口（このヘルパー）に置き、リファクタで守りが消えないようにする。
 *
 * 実装メモ:
 *  - 空文字ではなく `undefined` を返す。`src=""` はページ自身を再取得してしまうため、
 *    「属性を付けない」ことが正しい失敗形。
 *  - HTML の URL 属性はパース前に tab/LF/CR を除去するので、検証側でも同じ正規化を
 *    しないと `java\tscript:` 型でスキーム判定を回避できる。検証した文字列をそのまま返す。
 *  - `data:image/svg+xml` は `<img>` 内ではスクリプト無効だが、`<use>` / `<object>` では
 *    有効になる。本ヘルパーは `<img>` 用であり、他要素へ流用する免罪符ではない。
 *  - 許可スキームは main / web-shim の `openExternal`（http(s) allowlist）と同じ方針。
 */
export function safeImageSrc(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const normalized = url.replace(/[\t\n\r]/g, '').trim();
  if (/^https?:\/\//i.test(normalized)) return normalized;
  // `data:image/<subtype>` のみ。`;base64,` でも `,` 直結でも可。
  if (/^data:image\/[a-z0-9.+-]+[;,]/i.test(normalized)) return normalized;
  return undefined;
}

/**
 * CSS の `url()` に入れてよい形にして返す。許可外なら `undefined`。
 *
 * `safeImageSrc` の冒頭が「同じ値が CSS `url()` へ流れた瞬間に危険」と
 * 書いているのに、**その CSS `url()` がこの関門を通っていなかった**
 * (`pages/AssistantPage.tsx` の背景画像。2026-08-24 に発見)。値は
 * localStorage の `assistant-theme` から来るので、同一オリジンの別ページや
 * 拡張から書き換えられる。検証を描画箇所ごとに書くと同じことが繰り返される。
 *
 * 引用が要る理由はスキームとは別にある —— URL に `)` や空白や引用符が
 * 入ると宣言そのものが壊れて背景が黙って出なくなる
 * (`https://example.com/a(b).png` は実在しうる形)。
 */
export function safeCssUrl(url: string | undefined | null): string | undefined {
  const src = safeImageSrc(url);
  if (src === undefined) return undefined;
  // 置換は関数形にする。文字列形だと `$&` が特別扱いされる
  // (R2-13 で同じ足元を掬われている)。
  return `url("${src.replace(/["\\]/g, (c) => `\\${c}`)}")`;
}
