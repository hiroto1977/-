/**
 * ライブラリ項目のプレビュー方式を決める純ロジック。
 *
 * 以前は `window.open(URL.createObjectURL(blob))` で新しいタブに開いていた。
 * これには 2 つの問題があった。
 *
 * 1. **blob: の文書は生成元と同一オリジンになる。** ライブラリに入るのは
 *    書き出した SVG や HTML なので、そこにスクリプトが 1 つでも残れば
 *    アプリ自身のオリジンで走る。同一オリジンということは、そのまま
 *    IndexedDB (ライブラリ本体と保管庫) と localStorage に手が届く。
 *    生成側は現状すべてエスケープしているが、「生成側が完璧である限り
 *    安全」という配置に依存を作るのは避ける。同じ理由で
 *    `TemplatesPage` のプレビューは `<img src=data:>` を使っている。
 * 2. **デスクトップ版では何も起きなかった。** `setWindowOpenHandler` が
 *    http/https 以外を落とすので、Electron では `blob:` が握り潰され、
 *    「開く」ボタンが無反応だった。
 *
 * そこでアプリ内で表示する方式に変える。CSP は `frame-src 'none'` なので
 * サンドボックス iframe は使えない。使えるのは次の 2 つ:
 *
 * - **画像** (SVG を含む) → `<img src="data:...">`。`<img>` 経由で読み込んだ
 *   SVG は secure static mode になり、スクリプトも外部参照も動かない。
 *   `data:` は Electron 版・ブラウザ版の双方の `img-src` に元から入っている
 *   ので、CSP を緩めずに済む。
 * - **テキスト** → 文字列として読み、`<pre>` にテキストノードで置く。
 *   React がエスケープする。
 *
 * `text/html` もテキスト扱い、つまり**ソース表示**になる。`frame-src 'none'`
 * の下で HTML を描画する安全な入れ物が無い以上、描画できるふりをするより
 * ソースを見せる方が正しい。見た目の確認はダウンロードして
 * ブラウザで開いてもらう。
 */

export type PreviewKind = 'image' | 'text' | 'none';

/**
 * 画像プレビューの上限。data: URL は base64 で約 4/3 に膨らむ。
 *
 * MB を先に持ってバイト数を導く。逆にすると表示のたびに 1024 で 2 回割る
 * ことになり、その割り算はどう間違えてもメッセージの数字が変わるだけで
 * 判定は変わらない = テストで殺せない変異体になる。定数の持ち方を
 * 変えれば割り算ごと消える。
 */
export const MAX_IMAGE_PREVIEW_MB = 8;
export const MAX_IMAGE_PREVIEW_BYTES = MAX_IMAGE_PREVIEW_MB * 1024 * 1024;
/** テキストプレビューの上限。超えた分は切り詰めて、切った旨を出す。 */
export const MAX_TEXT_PREVIEW_CHARS = 200_000;

/**
 * テキストを **読む前に切る** バイト数。
 *
 * `MAX_TEXT_PREVIEW_CHARS` は「見せる量」しか縛らない —— `blob.text()` で
 * 全体を文字列にしてから切っていたので、**読む量は縛られていなかった**。
 * `library.put()` の 1 件上限は 50 MB なので、実測 (2026-08-23):
 *
 * ```
 *   50 MB を全部読む      158ms / 5240 万文字 (約 105 MB のメモリ)
 *   先に切ってから読む      9ms /   80 万文字
 * ```
 *
 * 20 万文字を見せるために 5240 万文字を作っていた (**262 倍**)。画像側は
 * `previewBlocker` が読む前に 8 MB で断っているのに、テキスト側だけ
 * 読んでから切っていた —— **同じ意図が片側にしか掛かっていない**形。
 *
 * 値は `文字数 × 4 + 8`。UTF-8 の 1 文字は最大 4 バイトなので、このバイト数を
 * 復号すれば **必ず `MAX_TEXT_PREVIEW_CHARS` 文字より多く** 得られる
 * (4 バイト文字は JS の `.length` では 2 を数えるので、実際は更に余裕がある)。
 * 余分に読むのは、境界で切れた文字が `U+FFFD` になっても、その後の
 * `truncateForPreview` で**必ず切り落とされる**ようにするため。
 */
export const MAX_TEXT_PREVIEW_BYTES = MAX_TEXT_PREVIEW_CHARS * 4 + 8;

/**
 * テキストとして読める `text/*` 以外の唯一の型。
 *
 * コネクタ実行の書き出し (`data/connectorSinks.ts`) が使う。**アプリが実際に
 * 書き出す型だけ**を挙げる。「あり得そうな型」を並べると、誰も作らない
 * 分岐にテストが書けず、意味のない許容が増えるだけになる。
 */
const JSON_MIME_TYPE = 'application/json';

/**
 * `image/svg+xml; charset=utf-8` のようなパラメータ付きを素の型に落とす。
 *
 * 保存時の mime は素の文字列だが、`library.put()` は呼び出し側の文字列を
 * そのまま受けるので、パラメータ付きで入ってくる経路を想定しておく。
 */
export function baseMimeType(mime: string): string {
  const semicolon = mime.indexOf(';');
  const head = semicolon === -1 ? mime : mime.slice(0, semicolon);
  return head.trim().toLowerCase();
}

export function previewKind(mime: string): PreviewKind {
  const base = baseMimeType(mime);
  if (base.startsWith('image/')) return 'image';
  if (base.startsWith('text/')) return 'text';
  if (base === JSON_MIME_TYPE) return 'text';
  return 'none';
}

export interface TruncatedText {
  readonly text: string;
  readonly truncated: boolean;
}

export function truncateForPreview(text: string, limit = MAX_TEXT_PREVIEW_CHARS): TruncatedText {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

/**
 * テキストプレビュー用に blob を読む —— **切ってから読む**。
 *
 * 「先に切る」を呼び出し側 (`LibraryPage`) に書くと、消されたことを
 * 留める術が無い。`truncateForPreview` を呼んでいる限り**見た目は正しく**
 * 動くので、検査も気づけない (実測: 先に切る 1 行を消しても、切り詰めの
 * 検査は全部通った)。読む所と切る所を 1 つの関数にすれば、
 * 「どれだけ読んだか」を振る舞いで留められる。
 */
export async function readTextForPreview(blob: Blob): Promise<TruncatedText> {
  const head = blob.slice(0, MAX_TEXT_PREVIEW_BYTES);
  return truncateForPreview(await head.text());
}

/**
 * プレビューできない理由。表示できるなら null。
 *
 * 「開けません」だけ出して終わらせず、型が理由なのか大きさが理由なのかを
 * 区別する。利用者が次に何をすればいいか (ダウンロードする) が変わる。
 */
export function previewBlocker(mime: string, size: number): string | null {
  const kind = previewKind(mime);
  if (kind === 'none') {
    return `${baseMimeType(mime)} はアプリ内で表示できません。ダウンロードしてお使いください。`;
  }
  if (kind === 'image' && size > MAX_IMAGE_PREVIEW_BYTES) {
    return `画像が大きすぎます (上限 ${MAX_IMAGE_PREVIEW_MB} MB)。ダウンロードしてお使いください。`;
  }
  return null;
}
