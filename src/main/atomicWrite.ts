import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Durable atomic file write. Stronger than plain `writeFile + rename`:
 *
 *   1. write to a unique temp sibling, **fsync** its contents to disk,
 *   2. (optional) keep a `.prev` copy of the current file for recovery,
 *   3. atomically `rename` temp → target,
 *   4. **fsync the directory** so the rename itself is durable,
 *   5. on any error, remove the temp file (no leaked `.tmp-*` litter).
 *
 * Steps 1 & 4 close the window where a power loss / `SIGKILL` after rename
 * could otherwise leave a zero-length or stale file on some filesystems.
 * Directory fsync is best-effort (not permitted on every platform).
 *
 * Electron-free and dependency-free so it is unit-testable against a real
 * temp directory under Node.
 */
export async function atomicWriteFile(
  target: string,
  data: string | Uint8Array,
  opts: { mode?: number; keepBackup?: boolean } = {},
): Promise<void> {
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });

  // tmp 名は rename 後に消える一意な作業ファイル名で、外部から観測されない (.slice の有無は
  // 衝突確率にしか影響せず結果不変)。
  // Stryker disable next-line MethodExpression
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  /*
   * `'wx'` (O_EXCL) —— **既に在るなら開かない**。`'w'` だと 2 つのことが起きうる:
   *
   *   1. 同じ名前が既に在れば**黙って切り詰めて**上書きする。tmp 名は
   *      pid + 時刻 + 乱数なので衝突はまず無いが、起きたときの壊れ方が
   *      「片方の書き込みが消える」= 気付けない形になる。
   *   2. その名前が**シンボリックリンクだったら辿る**。置き場が userData
   *      配下 (他人が書けない) なので踏めないが、踏めない理由が
   *      「置き場の権限」だけなのは薄い。
   *
   * O_EXCL にすると、どちらも「開けずに失敗する」に倒れる。呼び出し側から
   * 見て失敗は失敗のままで、正常時の振る舞いは変わらない。
   */
  const fh = await fs.open(tmp, 'wx', opts.mode ?? 0o600);
  // **open より後ろだけを try で囲う。** 下の catch は tmp を消すので、
  // open が失敗した場合まで含めると「自分が作っていないファイルを消す」
  // ことになる (O_EXCL は「先客が居る」ときにこそ失敗する)。
  try {
    // fh.close はハンドル解放 (リソース後始末)。内容は直前の sync で永続化済みのため、close を
    // 省いても rename/読取の観測結果は変わらない (try/finally の BlockStatement 変異は equivalent)。
    // Stryker disable BlockStatement
    try {
      await fh.writeFile(data);
      await fh.sync(); // flush file contents before the rename
    } finally {
      await fh.close();
    }
    // Stryker restore BlockStatement

    // Best-effort recovery copy of the current file (skipped if none exists).
    if (opts.keepBackup) {
      try {
        await fs.copyFile(target, `${target}.prev`);
        // **控えは本体より緩くしない。** `copyFile` は**複製元の**mode を
        // 引き継ぐので、本体が過去に緩い権限で作られていると、控えもその
        // 緩さのまま同じ中身を持つことになる。実測 (2026-08-23):
        //
        //   本体 644 → rename で本体は 600 に直るが、控えは 644 のまま
        //
        // 本体だけ直して控えを緩いまま残すのは、鍵を掛けた扉の横に
        // 窓を開けておくのと同じ。**本体を作るときと同じ mode に揃える** ——
        // 上の `fs.open(tmp, 'wx', opts.mode ?? 0o600)` と同じ式なので、mode 無指定
        // でも本体は 0o600 になる。「指定があるときだけ揃える」だと、まさにその
        // 無指定の場合に本体 600 / 控え 644 という窓が開いたままになっていた。
        await fs.chmod(`${target}.prev`, opts.mode ?? 0o600);
      } catch {
        // no existing target yet — nothing to back up
      }
    }

    await fs.rename(tmp, target);
    await fsyncDir(dir); // make the rename durable
  } catch (err) {
    // この catch は **open に成功した後**にしか来ないので、tmp は必ず自分が
    // 作ったものである (open を try の外へ出したのはそのため)。rm は常に成功し、
    // force:true↔false / {} は結果不変 (存在しない場合も .catch で吸収) →
    // ObjectLiteral/BooleanLiteral 変異は equivalent。
    // Stryker disable next-line ObjectLiteral,BooleanLiteral
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** fsync a directory entry so a preceding rename is persisted. Not supported
 *  on every platform (e.g. Windows throws EPERM/EISDIR) — failures are
 *  swallowed since the rename itself already happened. */
// ディレクトリ fsync はクラッシュ/電源断耐久のための best-effort。単体テストでは観測不能
// (ファイル内容に影響せず、dir fsync 非対応プラットフォームでは元から no-op、open(dir) は
// 通常成功するので dh は定義済み)。関数本体ごと observable な差を生まないため一括無効化する。
/* Stryker disable all */
async function fsyncDir(dir: string): Promise<void> {
  let dh: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    dh = await fs.open(dir, 'r');
    await dh.sync();
  } catch {
    // platform doesn't allow directory fsync — best-effort
  } finally {
    if (dh) await dh.close().catch(() => {});
  }
}
/* Stryker restore all */

/**
 * Read a file, falling back to its `.prev` backup if the primary is missing
 * or unreadable. Returns `null` only when neither exists. Use together with
 * `atomicWriteFile(..., { keepBackup: true })`.
 */
export async function readFileWithBackup(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    try {
      return await fs.readFile(`${target}.prev`, 'utf8');
    } catch {
      return null;
    }
  }
}
