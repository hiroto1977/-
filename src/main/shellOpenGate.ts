/**
 * shellOpenGate — レンダラーが「OS の既定アプリで開く」「ファイル管理ソフトで
 * 表示する」に渡してくるパスを検査する**唯一の関門**。
 *
 * `exportPaths.ts` が書き出し側の関門なら、こちらは**開く側**の関門である。
 * 危険度はこちらの方が高い: `shell.openPath` は OS の「開く」動詞をそのまま
 * 使うので、Windows では拡張子の関連付け次第で**そのまま実行される**。
 * 2026-07 監査の前は両ハンドラが `$HOME` 配下ならどこでも受けており、
 * 乗っ取られたレンダラーが `openPath('C:\\Users\\me\\Downloads\\installer.exe')`
 * を呼べば、確認も無しに走る状態だった。
 *
 * だから許すのは 2 つの条件を**同時に**満たすものだけにする:
 *   1. 書き出し先 (`~/.local/business-hub/`) の**中**にある
 *   2. 実行され得ない拡張子である
 *
 * ## なぜ main.ts から出したか
 *
 * 2026-08-22 の点検で、この関門が **main.ts の中の非公開関数**で、
 * テストが一本も無いことに気付いた。書き出し側の双子 (`exportPaths.ts`) は
 * 変異検査の対象で、かつ完全性チェーンの保護対象にも入っている。
 * 同じ危険度のものが、片方だけ測られていない状態だった。
 *
 * ## symlink を先に解決する理由
 *
 * `path.resolve` は字面だけの解決なので、書き出し先の中に外を指す symlink を
 * 置かれると素通りしてしまう。`realpath` で実体まで辿ってから閉じ込めを見る。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exportRoot } from './clients/exportPaths';

/**
 * OS に開かせてよい拡張子。**実行され得るものは一つも入れない。**
 * ここに `.exe` / `.bat` / `.command` / `.desktop` の類を足すと、
 * この関門の意味が無くなる。
 */
export const SHELL_OPEN_EXTS: ReadonlySet<string> = new Set([
  '.html',
  '.md',
  '.svg',
  '.png',
  '.pdf',
  '.json',
  '.csv',
  '.txt',
]);

/** パス長の上限。書き出し先のファイル名がこれを超えることは無い。 */
export const MAX_SHELL_PATH_LENGTH = 1024;

/**
 * 開いてよいなら実体パス、駄目なら null。
 *
 * `root` を引数にしているのは、テストから一時ディレクトリを指せるようにするため
 * (`exportPaths.ts` の `home` 引数と同じ考え方)。
 */
export async function shellTargetOrNull(
  filePath: unknown,
  root: string = exportRoot(),
): Promise<string | null> {
  // 空文字も別に見ていたが、`path.resolve('')` は作業ディレクトリになり、
  // それは書き出し先そのものか外側にしかならない — どちらも下の閉じ込め
  // (根そのものは `+ path.sep` で落ちる) と拡張子の検査が必ず落とす。
  // 見ても結果が変わらない番人だったので外した。
  if (typeof filePath !== 'string') return null;
  if (filePath.length > MAX_SHELL_PATH_LENGTH) return null;
  // NUL / 改行はパスの分断に使われうる。解決の前に落とす。
  if (/[\0\r\n]/.test(filePath)) return null;
  const resolved = path.resolve(filePath);
  // 閉じ込めを見る前に symlink を実体まで辿る。存在しないファイルは
  // 字面のまま残す — その場合は開く側が失敗するので、ここでは通してよい。
  const real = await fs.realpath(resolved).catch(() => resolved);
  // `+ path.sep` が要る。無いと `~/.local/business-hub-evil/x` が
  // 前方一致で通ってしまう (兄弟ディレクトリの取り違え)。
  if (!real.startsWith(root + path.sep)) return null;
  if (!SHELL_OPEN_EXTS.has(path.extname(real).toLowerCase())) return null;
  return real;
}
