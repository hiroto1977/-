import { RFC2822_HEADER_UNSAFE } from './writeFieldLimits';
import { utf8ToBase64 } from './base64';

/**
 * **RFC 2822 のメッセージの組み立て —— 正典は 1 つ** (2026-09-19 · パス 321)。
 *
 * 2026-08-22 に `clients/shopify.ts` が 3 つ目の写しを持っていて、そこだけ
 * `To:` の CR/LF 検査が抜けていた。そのとき `lint:forbidden` に「ヘッダ行の
 * 手組み」の規則を足して 3 つ目を禁じ、残る 2 つ (main / ブラウザ版) は
 * `rfc2822Parity.test.ts` が同じ答えを返すことで守っていた。
 *
 * 2 つ在った理由は「renderer は main を import できない」だったが、
 * shared は両方が import できる。パリティ検査は「両方に在る穴」を見つけられない
 * (0-a-16) —— 1 つにすれば穴も 1 つで、検査は実装そのものに当たる。
 */

/**
 * RFC 2822 のヘッダ行へ連結する値に CR / LF / NUL が無いこと。
 * 無いと `"victim@example.com\r\nBcc: attacker@evil.com"` が Bcc を注ぎ込む。
 * Subject は base64 に包まれるので構造上安全で、生のまま連結する欄だけがこれを要る。
 */
export function isSafeHeaderValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return !/[\r\n\0]/.test(value);
}

/** UTF-8 の件名を RFC 2047 (`=?UTF-8?B?…?=`) に包んだ text/plain のメッセージ。 */
export function buildRfc2822(to: string, subject: string, body: string): string {
  if (!isSafeHeaderValue(to)) {
    throw new Error(RFC2822_HEADER_UNSAFE);
  }
  const utf8Subject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
  return [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
}
