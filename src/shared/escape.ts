// 生成物 —— src/shared/escape.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * マークアップ / Markdown / 画面の 1 行へ文字列を埋めるときのエスケープと色の関門。
 *
 * ## Mamori で書いてある (2026-10-31 · パス 571 · MG-004)
 *
 * 元は TypeScript で、Mamori 0.3 で書き直した。足りなかったのは template 文字列 1 つだけ
 * (`escapeUnits` の `\\uXXXX` の組み立て) で、文字列の連結へ書き直した —— 組み上がる文字列は
 * 1 字も変えていない。出力側の関門 (HTML / XML / Markdown に第三者の文を埋める所・色を属性へ埋める所) から、
 * Mamori の M0 と M6 が効く —— `as` (型の書き換え)・`.constructor` (文字列をコードとして走らせる道)・
 * テンプレート文字列 (補間でコードを運ぶ道)・宣言していない外の名前が**書けない**。判定は 1 つも変えていない。
 */

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
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

/**
 * Markdown に文字列を埋めるときのエスケープ — **1 行に収まる場所用**。
 *
 * ## なぜ要るか
 *
 * 2026-08-20 の監査で、Markdown 書き出しが 3 箇所あり、守り方が 3 通りに
 * 割れていた:
 *
 * | 書き出し | 守り |
 * |---|---|
 * | `main/clients/stocks.ts` | 関数内に `escMd = s => s.replace(/\|/g,'\\|')` |
 * | `renderer/data/stocksAnalysisWeb.ts` | **何もしていない** |
 * | `main/clients/business.ts` | **何もしていない** |
 *
 * `escape.ts` の冒頭が「アプリ全体で 1 つだけ持つ」と言い、`lint:forbidden` の
 * #11 が写経を落としているのに素通りしていたのは、#11 の検出が
 * **HTML/XML のエスケープしか見ていなかった**から (`&amp;` の実体参照と
 * `[&<>]` の文字クラス)。`|` を落とすだけの Markdown 用は形が違うので
 * 網に掛からず、しかも「1 箇所にしかない」ので写経とも気付かれなかった。
 *
 * ## 何が起きるか
 *
 * 埋まる値は利用者が打った銘柄名だけではない。**AI アドバイザーの応答**
 * (`rationale` / `riskFactors` / `actionItems`) がそのまま入る。検証は
 * `typeof === 'string' && length > 0` だけなので、中身は何でも通る。
 *
 * - `|` 1 つで表の桁がずれる。日本語の散文に `|` は普通に出る (「A|B」)。
 * - **改行があると行が終わる。** 続きは新しい Markdown の構造として読まれ、
 *   `|---|` を書けば表そのものを作り直せる。「壊れる」ではなく「差し替わる」。
 *
 * ## どこに使うか
 *
 * 表のセルだけではない。**1 行で終わらなければならない場所すべて**である —
 * 見出し (`### …`)、箇条書きの 1 項目 (`- …`)、引用の 1 行 (`> …`)。
 * どれも改行 1 つでその構造から抜けてしまう。段落には使わない (下の
 * `escapeMarkdownText`)。
 *
 * ## 落とす文字
 *
 * - `\` → `\\` — **最初に**。エスケープ文字自身を先に逃がさないと、末尾が
 *   `\` の値が後続の区切りを打ち消す。
 * - `|` → `\|` — セルの区切り。
 * - CR / LF → 空白 — 行の終わり (上記)。
 * - `<` → `&lt;` — 生 HTML の入口。Markdown の描画系はたいてい生 HTML を
 *   通すので、ここが唯一のスクリプト実行経路になる。実体参照は CommonMark
 *   §2.5 で「文字として扱う」と決まっており、markup にはならない。
 */
export function escapeMarkdownInline(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ').replace(/</g, '&lt;').replace(MD_LINK_OPENERS, mdLinkNeutralizer);
}

/**
 * 画像とリンクの**入口**だけを無効にする (2026-10-16 · パス 524 · threat: T-087)。
 * `![t](https://remote/pixel)` は Obsidian / GitHub 系の描画で**開いただけで外へ取りに行く**
 * (閲覧者の IP を第三者へ知らせる)・`[x](javascript:…)` は押せるリンクになる。AI の応答
 * (乗っ取られた提供元・proxy が書ける) と第三者の文字列がここへ入る。`<` と同じく
 * **能力が増える**形なので、地の文でも落とす。`![` は `!\[`、`](` は `]\(` にするだけで、
 * 普通の文 (`[` 単独・`(` 単独) は 1 字も変わらない。
 */
const MD_LINK_OPENERS = /!\[|\]\(/g;

function mdLinkNeutralizer(match: string): string {
  return match === '![' ? '!\\[' : ']\\(';
}

/**
 * Markdown に文字列を埋めるときのエスケープ — **地の文用**。
 *
 * 表のセルと違って改行は落とさない。段落や箇条書きは地の文に正当に現れる
 * ので、消すと読めなくなる。
 *
 * **したがって「見出しや引用を後から足される」ことは防いでいない。**
 * 埋め込まれた側が `\n\n## 見出し` を書けば、書き出した文書に節が 1 つ
 * 増えたように見える。これは承知のうえで通している — 防ぐには行頭の
 * 記号を全部潰すことになり、まともな体裁の文章が書けなくなる。
 *
 * 落とすのは `<` と、画像・リンクの入口 `![` / `](` (T-087) だけ。**能力が増える**のはここだけだからで、見た目が
 * 変わるだけの構造とは重みが違う。書き出した `.md` はライブラリに保存され、
 * ダウンロードして人に渡る (このリポジトリ自身が Obsidian の保管庫を
 * 持っている)。開いた人の環境でスクリプトが走る形は残せない —
 * `safeColor` が SVG について言っているのと同じ理由である。
 */
export function escapeMarkdownText(input: string): string {
  return input.replace(/</g, '&lt;').replace(MD_LINK_OPENERS, mdLinkNeutralizer);
}

/**
 * **見えない字** —— 制御 (Cc)・書式 (Cf: 双方向制御・ZWSP・BOM ほか)・行 / 段落区切り (Zl / Zp)。
 * 画面の 1 行に素で置くと、うしろに在るアプリの文の見え方を入れ替えうる (U+202E は
 * Trojan Source と同じ仕組み)。`lint:charset` の `INVISIBLE_RANGES` が原文について
 * 鳴らす当の字で、ここは**実行時に第三者の文を画面へ出す側**の規則である。
 *
 * 逃がす群 (配列の項の順):
 * 1. 制御・書式・行 / 段落区切り。
 * 2. 「見える字なのに何も描かれない」字 (T-205): Hangul フィラー・点字空白・CGJ・Khmer の
 * 固有母音。\p{Cf} ではないので上の群に入らず、`#general` と `#general\u3164` が
 * 画面では同じに見えた。字の本体 (文字・記号・結合記号) なので個別に挙げる。
 * 3. 異体字選択子は基底の漢字・仮名に付くのが正当な使い方 (葛飾の IVS など)。
 * それ以外の位置に在る物 (先頭・ASCII の後・選択子の連なり) は何も変えない飾りなので逃がす。
 * 4. 絵文字の表示切替 (U+FE0E / U+FE0F) は絵文字の基底の後なら正当 (❤️)。それ以外は逃がす。
 */
export const INVISIBLE_UNITS = new RegExp(['[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]', '\\u034F|\\u115F|\\u1160|\\u17B4|\\u17B5|\\u2800|\\u3164|\\uFFA0', '(?<![\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}])[\\uFE00-\\uFE0D\\u180B-\\u180D\\u180F\\u{E0100}-\\u{E01EF}]', '(?<!\\p{Emoji})[\\uFE0E\\uFE0F]'].join('|'), 'gu');

/** 1 字を UTF-16 の単位ごとに `\uXXXX` へ (JSON が C0 を逃がすのと同じ綴り)。 */
export function escapeUnits(c: string): string {
  return c.split('').map((unit) => '\\u' + unit.charCodeAt(0).toString(16).padStart(4, '0')).join('');
}

/**
 * **利用者へ「これを送る」と見せる文から、見えない字を見える綴りへ逃がす** (2026-10-14 · パス 519 ·
 * threat: T-034)。
 *
 * 書き込みの確認 (`voiceWritePreview`) は送る欄と値を並べるが、値に U+202E (右から左へ) が
 * 1 字在るだけで、**それ以後の字が画面では逆順に見える** —— 実測: 「送金を中止\u202Eを承認 →
 * 口座 999 へ送金」は、送る物は字面どおりなのに、確認には「送金を中止」のあとが
 * 裏返って読める。見せた物と送る物が違えば、確認は確認ではない。
 *
 * 逃がすのは見える形 (`\u202E`) で、文そのものは消さない —— パス 487 が `quoteModelText` に
 * 置いた判断と同じ (チャットの Markdown は逃がしの記法を持たない)。あちらの
 * `assistantMarkdown.ts` が持っていた同じ関数をここへ出して、renderer はこれを読む
 * (法則 `center-then-count-callers`)。
 */
export function escapeInvisibleUnits(text: string): string {
  return text.replace(INVISIBLE_UNITS, escapeUnits);
}
