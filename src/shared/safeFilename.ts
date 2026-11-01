// 生成物 —— src/shared/safeFilename.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * ファイル名として受け取ってよい文字列か —— アプリ全体で 1 つだけ持つ。
 *
 * ## Mamori で書いてある (2026-11-01 · MG-011)
 *
 * 元は TypeScript で、Mamori 0.10 で書き直した。足りなかったのは non-null (`s.split('.')[0]!`) と
 * template (`filenameFromTitle` の組み立て) で、どちらも判定を変えずに書き直した ——
 * 最初の `.` より前を `indexOf` + `slice` で取り、組み立ては文字列の連結 (`String(nowMs)`) にした。
 * 書き出し先のファイル名の関門が、`as`・`.constructor`・宣言していない外の名前を**書けない**言語へ移った。
 */

/**
 * ファイル名として受け取ってよい文字列か —— アプリ全体で 1 つだけ持つ。
 *
 * 同じ判断が `renderer/library/library.ts` と `renderer/fs/fsa.ts` に
 * **別々の規則で** 書かれていた (2026-08-22 に判明):
 *
 * ```
 *                  library.ts      fsa.ts
 *   '.' / '..'      通す           弾く
 *   '\'             通す           弾く
 *   '/' NUL CR LF   弾く           弾く
 *   長さ            1..256         1..256
 * ```
 *
 * 危ないのは、**この 2 つが同じ入力を並んで受け取っている**こと ——
 * `web-shim.ts` の `saveToLibrary` は 1 つの `filename` を
 * `library.put()` と `writeBlobToFolder()` の両方へ渡す。今日は実ファイルに
 * 触る側 (fsa) が厳しいので外へは出ないが、**入口が出口より緩い**状態は、
 * 「新しい書き出し経路が再検査を忘れた瞬間」に穴になる。
 *
 * 厳しい側に寄せて 1 つにした。緩める方向の統合はしない ——
 * `..` や `\` を含む正当なファイル名はこのアプリには無い。
 *
 * ## 何を弾くか
 *
 * - `.` と `..` ちょうど —— ディレクトリ自身を指す。書き込み先として渡ると
 *   「ファイル名」ではなくなる
 * - `/` と `\` —— パス区切り。1 階層ぶんの名前しか受け取らない契約を守る
 *   (Windows は `\` も区切りなので、POSIX だけを見て通すと片方だけ抜ける)
 * - NUL / CR / LF —— 名前の分断に使われうる
 * - 空と 256 字超 —— 大半のファイルシステムの上限
 *
 * 先頭ドット (`.hidden`) は**通す**。隠しファイルは書き出し先の中に作れて
 * 構わないし、弾くと `.gitignore` のような正当な名前まで落ちる。
 *
 * ## 「利用者入力ではない」は誤りだった (2026-08-23)
 *
 * ここには長らく「渡ってくる名前はアプリが組み立てたもの (`service-hub-…`)
 * で利用者入力ではないため、これは多層防御」と書いてあった。**teamradar の
 * SVG 書き出しだけは違う** —— `web-shim.ts` の `export-svg` は payload の
 * `title` (画面で利用者が打つ) から名前を組み立てる。
 *
 * 実測では危険な名前は出ない (下の `filenameFromTitle` が区切りも制御文字も
 * 落とし、時刻の接尾辞が付くので `.` / `..` そのものにもならない)。だが
 * **「入力は安全だからここは飾り」という説明のまま**にしておくと、次に
 * この関門を緩める判断の根拠が嘘になる。組み立ての規則をここへ引き上げ、
 * 敵性の題名で固定した。
 */
export const MAX_FILENAME_LENGTH = 256;

/**
 * サーバ側で**実行される**拡張子と、サーバの挙動を書き換える設定ファイル (2026-10-22 · threat: T-163)。
 *
 * 書き出し先に選ぶフォルダが PHP サイトの公開ディレクトリだと、そこへ置いた名前が実行の入口になる:
 *  - `x.php` `x.phtml` `x.phar` ほか —— そのまま実行される
 *  - **`x.php.svg` のような二重拡張子** —— 古い Apache の `AddHandler` は名前の**途中**の `.php` でも実行する
 *  - `.htaccess` / `.user.ini` / `web.config` —— 任意の拡張子を PHP として動かす・前置きの実行を足す
 * このアプリが書き出す名前はどれも固定の拡張子 (.svg .md .html ほか) で終わるので、これらは正当な名前ではない。
 * 拡張子の**セグメント**で見る (`php入門.pdf` や `phpinfo.txt` は通す)。
 */
const SERVER_SCRIPT_SEGMENT = /(^|\.)(php[0-9]?|phtml|pht|phps|phar)(\.|$)/i;

const SERVER_CONFIG_NAME = /^(\.htaccess|\.user\.ini|web\.config)$/i;

/**
 * Windows で別の意味になる名前 (2026-10-24 · threat: T-177)。書き出し先は利用者の選んだフォルダ・
 * 同期フォルダ・USB で、Windows でも使われる。
 *  - **予約された装置名** (`CON` `PRN` `AUX` `NUL` `COM1-9` `LPT1-9`、**拡張子が付いても同じ** —— `nul.svg` は装置)。
 *    書き出しがファイルを作らず消える・装置へ出力される。
 *  - **`:`** —— NTFS の代替データストリーム (`a.txt:evil.html`) とドライブの指定。本体は 0 バイトのまま裏に載る。
 *  - **末尾の `.` と空白** —— Windows は黙って落とすので、検査した名前と作られる名前が別になる。
 * どれも正当な名前ではない (アプリが組み立てる名前は固定の語 + 時刻 + 固定の拡張子)。Linux でも断るのは、
 * 同じ関門を 2 つの OS で別々に持たない (Linux で作った名前が Windows の同期先で別物になる) ため。
 */
const WINDOWS_RESERVED_DEVICE = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;

export function isSafeFilename(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s.length === 0 || s.length > MAX_FILENAME_LENGTH) return false;
  if (/[\0\r\n/\\]/.test(s)) return false;
  if (s.includes(':') || /[. ]$/.test(s)) return false;
  // 予約名は**最初の `.` より前**で見る (`nul.svg` も `CON.tar.gz` も装置)。前後の空白は Windows が落とす。
  const head = s.split('.', 1).join('');
  if (WINDOWS_RESERVED_DEVICE.test(head.trim())) return false;
  return !SERVER_SCRIPT_SEGMENT.test(s) && !SERVER_CONFIG_NAME.test(s);
}

/**
 * 題名から書き出し用のファイル名を組み立てる (ブラウザ版の SVG 書き出し)。
 *
 * `\w` (= `[A-Za-z0-9_]`) と `-` だけを残し (`.` も落とす —— 二重拡張子を作らせない)、それ以外の連なりを `-` へ畳む。
 * ここで落ちるもの: パス区切り (`/` `\`)、NUL / 改行、空白、シェルの記号、
 * 日本語などの多バイト文字 (名前としては読めなくなるが、**書き出し先の
 * 安全のほうを取る**)。
 *
 * 時刻の接尾辞は飾りではなく**不変条件**である: これが付くので、
 * 題名が空・`.`・`..` でも結果がそれらになることはない。
 */
export function filenameFromTitle(title: string, nowMs: number, ext: string): string {
  // `.` も落とす (2026-10-22 · T-163): 題名の `a.php.b` が名前に残ると `a.php.b-<時刻>.svg` の**途中**に
  // 実行される拡張子が現れる。ドットは最後の拡張子の 1 つだけにして、二重拡張子を作れなくする。
  return title.replace(/[^\w-]+/g, '-').slice(0, 64) + '-' + String(nowMs) + ext;
}
