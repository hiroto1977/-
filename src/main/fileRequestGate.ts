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
function fold(p: string, platform: string): string {
  // Stryker disable next-line MethodExpression: 両辺を同じ関数で畳むので toUpperCase でも答えは同じ (等価変異)
  return platform === 'win32' ? p.toLowerCase() : p;
}

export function fileRequestAllowed(
  url: string,
  distRoot: string,
  platform: string = process.platform,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'file:') return true;
  // WHATWG の URL は file://localhost/… のホストを '' へ正規化する —— 空でなければ UNC (他ホストの共有)。
  // Stryker disable next-line ConditionalExpression: POSIX の fileURLToPath は非空ホストを自分で投げて下の catch が断るので、この行は Windows (UNC) のためだけに効く (等価変異)
  if (parsed.hostname !== '') return false;
  let target: string;
  try {
    target = path.resolve(fileURLToPath(parsed));
  } catch {
    return false;
  }
  const root = path.resolve(distRoot);
  return fold(target, platform).startsWith(fold(root, platform) + path.sep);
}

/**
 * 窓の session に file:// の門を付ける。`main.ts` にこの綴りを置かないための薄い口
 * (`openExternal` を呼ぶファイルに `file://` の URL を置かない規則 · localFileOpenPolicy)。
 */
export function installFileRequestGate(
  session: {
    webRequest: {
      onBeforeRequest(
        filter: { urls: string[] },
        listener: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void,
      ): void;
    };
  },
  distRoot: string,
  /** 断ったことの知らせ (警戒態勢の元・T-155)。URL の中身は渡さず、`file:` と判るだけの短い印を渡す。 */
  onDenied?: (where: string) => void,
): void {
  session.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
    const allowed = fileRequestAllowed(details.url, distRoot);
    if (!allowed) onDenied?.('file-request');
    callback({ cancel: !allowed });
  });
}
