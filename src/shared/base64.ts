/**
 * **UTF-8 → base64 / base64url。両ビルドが同じ 1 つを読む** (2026-09-19 · パス 321)。
 *
 * それまで写しが 4 つ在った —— main は `Buffer.from(s, 'utf8')` で 2 つ
 * (`clients/gmail.ts` の `base64url` / `clients/shopify.ts` の `toBase64Url`)、
 * ブラウザ版は `btoa` で 1 つ (`saasWriteWeb.ts` の `utf8ToBase64Url`)、
 * VirusTotal の id 用にもう 1 つ (`vtBase64`)。どれも同じ 3 置換で、
 * 2026-08-22 には写しのうち 1 つだけが `To:` の CR/LF 検査を落としていた
 * (rfc2822 の側の話だが、家系は同じ「写しは 1 つだけ緩む」)。
 *
 * `btoa` は Latin-1 しか受けないので、先に UTF-8 のバイト列へ落としてから
 * 1 バイトずつ文字に写す。Node 20 も `btoa` / `TextEncoder` を global に持つ
 * ので、shared に置いても両ビルドが同じ道を通る (Buffer は使わない ——
 * shared は node を import できない)。
 */

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** RFC 4648 §5 の base64url、パディング無し (Gmail の `raw` / VirusTotal の URL id が要る形)。 */
export function utf8ToBase64Url(s: string): string {
  return utf8ToBase64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
