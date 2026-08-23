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
 *   - symlinks are NOT followed here: `path.resolve` is lexical. **これは
 *     意図した判断で、読み出し側 (`skills.ts` / `devEnv.ts` / `shellOpenGate.ts`)
 *     とは扱いが違う。** 実際どの呼び出し元も realpath を足していない
 *     (2026-08-23 に 4 つ全部を確認: templates / stocks / business / teamradar)。
 *     以前ここには「realpath が要る呼び出し元は自分で足すこと」と書いてあったが、
 *     **足している呼び出し元は 1 つも無く**、読んだ人に「誰かが見ている」と
 *     思わせるだけだった。足す必要が無い理由を書く方が正しい:
 *
 *     1. **書き出し先はまだ存在しない。** 実測 (2026-08-23) —— 未作成のパスに
 *        `realpath` すると `ENOENT` で失敗する。読み側と同じ直し方は
 *        **原理的に当たらない**。当てるなら「実在する最深の親を解決する」形になり、
 *        判定の意味が変わる。
 *     2. **symlink を置ける相手は、既に書きたい所へ書ける。** 書き出し根
 *        (`~/.local/business-hub/`) に symlink を作るには、そのディレクトリへの
 *        書き込み権が要る。それを持つのは利用者として動くローカルのプロセスで、
 *        `~/.bashrc` などへ直接書ける —— symlink を経由しても**権限は増えない**。
 *        レンダラーが乗っ取られても、レンダラー自身は symlink を作れない
 *        (fs に触れない) ので、この経路は成立しない。
 *
 *     **開く側は事情が違うので realpath している** (`shellOpenGate.ts`) ——
 *     あちらは既に在るファイルを OS に渡すため、実体が根の外なら意味が変わる。
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
export function isSafeExportPath(filePath: string, home: string, ext: string): boolean {
  if (typeof filePath !== 'string') return false;
  // 空文字はいまの並びだと後段の拡張子検査でも弾かれる (空文字は `.svg` で
  // 終われない) ため、ここを変異させても観測できる差が出ない。消さずに残すのは
  // 拡張子検査が将来ゆるくなったときの保険 — ここが「空でないこと」の唯一の
  // 根拠になる。1 行に分けてあるのは、上の typeof 判定まで巻き添えで
  // 測定から外れないようにするため (無効化は行単位でしか効かない)。
  // Stryker disable next-line ConditionalExpression: 後段と重なる保険 (単独では観測不能)
  if (filePath.length === 0) return false;
  if (filePath.length > 1024) return false;
  if (/[\0\r\n]/.test(filePath)) return false;
  if (!filePath.endsWith(ext)) return false;
  const resolved = path.resolve(filePath);
  const root = exportRoot(home);
  // Strict containment: the root itself is a directory, never a file target.
  return resolved.startsWith(root + path.sep);
}
