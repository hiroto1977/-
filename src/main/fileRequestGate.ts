/**
 * レンダラーが `file://` で読んでよいのは、同梱した `dist/` の中だけ (2026-10-20 · パス 543 · threat: T-140)。
 *
 * 実 Electron の実測 (監査役): fuse `grantFileProtocolExtraPrivileges` が既定の ON のままだと、乗っ取られた
 * レンダラーは CSP (`connect-src 'self'`) の下でも `fetch('file:///etc/passwd')` や保管ファイル
 * (`service-hub-secrets.json`) を読めた。fuse を OFF にすると asar からの読み込みごと失敗して窓が白くなる
 * (ERR_FILE_NOT_FOUND) ので、出荷の fuse の形に依らず効くよう、要求の側で閉じる。
 *
 * 判定は純関数 (`session.webRequest.onBeforeRequest` の中身)。`file:` 以外のスキームはここの関心外 (通す)。
 * ホスト名つきの `file://host/…` (UNC) は断る —— 同梱物は常にホスト無し。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `win32` は大文字小文字を区別しないので畳んで比べる。 */
function fold(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

export function fileRequestAllowed(url: string, distRoot: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'file:') return true;
  if (parsed.hostname !== '' && parsed.hostname !== 'localhost') return false;
  let target: string;
  try {
    target = path.resolve(fileURLToPath(parsed));
  } catch {
    return false;
  }
  const root = path.resolve(distRoot);
  return fold(target).startsWith(fold(root) + path.sep);
}
