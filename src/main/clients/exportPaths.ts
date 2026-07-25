/**
 * exportPaths — one path-traversal guard for every renderer-supplied export
 * path, and the single definition of where exports may live.
 *
 * Why this exists (2026-07 security audit):
 * `business.ts` / `stocks.ts` / `templates.ts` / `teamradar.ts` each carried a
 * copy of the same guard, and every copy accepted **any** path under `$HOME`.
 * Those actions are reachable from the renderer via `action:invoke`, so a
 * compromised renderer could create or overwrite an `.html` / `.md` / `.svg`
 * file anywhere in the user's home tree (clobbering notes, dropping files into
 * `~/.config/**`, or planting a file for `app:openPath` to launch). No UI ever
 * sends a custom path — every export call site relies on the default — so
 * narrowing the guard to the export root removes an attacker-only capability
 * with zero functional loss.
 *
 * Rules enforced here:
 *   - resolved path must sit strictly under `~/.local/business-hub/`
 *   - extension must match exactly (`.html` / `.md` / `.svg` — never executable)
 *   - no NUL / CR / LF (header- and shell-injection hygiene)
 *   - length cap 1024 (pathological inputs)
 *   - symlinks are NOT followed here: `path.resolve` is lexical, so callers that
 *     want realpath semantics must add it. Writing through a symlink planted
 *     inside the export dir would require prior write access to that dir.
 */

import os from 'node:os';
import path from 'node:path';

/** Root of every on-disk export. Nothing outside this tree is writable. */
export function exportRoot(home: string = os.homedir()): string {
  return path.join(path.resolve(home), '.local', 'business-hub');
}

/**
 * True when `filePath` is a legal export target with the given extension.
 * `home` stays a parameter (not `os.homedir()`) so tests can point it at a
 * temp dir, matching the pre-existing guard signatures.
 */
// Stryker disable ConditionalExpression,EqualityOperator,LogicalOperator,BooleanLiteral
export function isSafeExportPath(filePath: string, home: string, ext: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.length > 1024) return false;
  if (/[\0\r\n]/.test(filePath)) return false;
  if (!filePath.endsWith(ext)) return false;
  const resolved = path.resolve(filePath);
  const root = exportRoot(home);
  // Strict containment: the root itself is a directory, never a file target.
  return resolved.startsWith(root + path.sep);
}
// Stryker restore ConditionalExpression,EqualityOperator,LogicalOperator,BooleanLiteral
