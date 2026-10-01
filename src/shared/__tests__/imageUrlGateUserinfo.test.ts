/**
 * **画像 URL の関門は、パスワードだけの認証情報も落とす** (2026-09-30 · パス 502)。
 *
 * `safeImageSrc` は authority に資格情報を持つ URL を「本当の送り先を見せかけで隠す形」として
 * 落とす (`externalUrlGate` と同じ判断)。条件は `username !== '' || password !== ''` の 2 つで、
 * 全掃引 #179 は**パスワードの側**を生存させた —— 既存の標本は `user:pw@` の形で、
 * ユーザー名が在れば右辺を見ずに落ちるため。`https://:pw@host/` は username が空で
 * password だけが在る (WHATWG の解析)。
 */
import { describe, expect, it } from 'vitest';
import { safeCssUrl, safeImageSrc, safeRemoteImageSrc } from '../imageUrlGate';

describe('safeImageSrc — authority の認証情報', () => {
  it.each([
    ['パスワードだけ', 'https://:secret@example.com/a.png'],
    ['ユーザー名だけ', 'https://user@example.com/a.png'],
    ['両方', 'https://user:secret@example.com/a.png'],
  ])('★ %s は落とす', (_label, url) => {
    expect(safeImageSrc(url)).toBeUndefined();
    expect(safeRemoteImageSrc(url)).toBeUndefined();
    expect(safeCssUrl(url)).toBeUndefined();
  });

  it('対照: 認証情報の無い同じ形は通る (針が的に当たる標本)', () => {
    expect(safeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
    // 解析器がパスワードだけの形を本当に「パスワードあり」と読むこと (落とす理由の前提)
    const parsed = new URL('https://:secret@example.com/a.png');
    expect(parsed.username).toBe('');
    expect(parsed.password).toBe('secret');
  });
});
