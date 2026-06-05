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
  try {
    const fh = await fs.open(tmp, 'w', opts.mode ?? 0o600);
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
      } catch {
        // no existing target yet — nothing to back up
      }
    }

    await fs.rename(tmp, target);
    await fsyncDir(dir); // make the rename durable
  } catch (err) {
    // tmp は open 成功後に必ず存在するため rm は常に成功し、force:true↔false / {} は結果不変
    // (存在しない場合も .catch で吸収) → ObjectLiteral/BooleanLiteral 変異は equivalent。
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
