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

  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const fh = await fs.open(tmp, 'w', opts.mode ?? 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync(); // flush file contents before the rename
    } finally {
      await fh.close();
    }

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
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** fsync a directory entry so a preceding rename is persisted. Not supported
 *  on every platform (e.g. Windows throws EPERM/EISDIR) — failures are
 *  swallowed since the rename itself already happened. */
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
