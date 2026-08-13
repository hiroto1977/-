import { describe, expect, it } from 'vitest';
import { parseAtlassianToken } from '../atlassian';
import { normalizeAtlassianSite } from '../../../shared/api/atlassian';
import { normalizeAtlassianSiteResult } from '../../../shared/atlassianSite';

/**
 * main と shared の Atlassian site 検証が**同じ**であることを固定する。
 *
 * shared 側の説明文には「`src/main/clients/atlassian.ts` と同じ防御を張って
 * いる」と書いてあったが、事実ではなかった。main 側は元の文字列から末尾の
 * `/` を落とすだけで、パス・クエリ・フラグメント・ポート・userinfo を
 * 残していた。実装を 1 か所に寄せたので、次は説明ではなくテストで固定する。
 *
 * (試した範囲では、その差から資格情報を外へ逃がす経路は作れなかった。
 *  CR/LF は `new URL` が弾き、タブはホスト名を壊して許可判定で落ちる。
 *  穴ではなく、説明が嘘だったのと貼り付け事故が壊れた要求になる話。)
 */

const ACCEPTED = [
  ['https://x.atlassian.net', 'https://x.atlassian.net'],
  ['https://x.atlassian.net/', 'https://x.atlassian.net'],
  ['https://x.atlassian.net//', 'https://x.atlassian.net'],
  // 以下は main 側が元の文字列を使い回していたため、かつて差が出ていた形。
  ['https://x.atlassian.net/wiki', 'https://x.atlassian.net'],
  ['https://x.atlassian.net?q=1', 'https://x.atlassian.net'],
  ['https://x.atlassian.net#frag', 'https://x.atlassian.net'],
  ['https://x.atlassian.net:8443', 'https://x.atlassian.net'],
  ['https://evil.com@x.atlassian.net', 'https://x.atlassian.net'],
] as const;

const REJECTED = [
  'http://x.atlassian.net',            // 平文は Basic 認証を裸で流す
  'https://evil.com',                  // ホスト名の許可外
  'https://x.atlassian.net.evil.com',  // 接尾辞の偽装
  'https://atlassian.net',             // ドットが無い = 別ホスト
  'javascript:alert(1)',
  'not a url',
  '',
  'https://x.atlassian.net\tfoo',      // タブはホスト名を壊す
  'https://x.atlassian.net\r\nX: y',   // CR/LF は URL パーサが弾く
];

function mainSite(site: string): string {
  return parseAtlassianToken(JSON.stringify({ email: 'a@b.c', token: 't', site })).site;
}

describe('Atlassian site 検証 — main と shared が同じであること', () => {
  it.each(ACCEPTED)('%s を両方が %s に正規化する', (input, expected) => {
    expect(normalizeAtlassianSiteResult(input)).toEqual({ ok: true, site: expected });
    expect(normalizeAtlassianSite(input)).toBe(expected);
    expect(mainSite(input)).toBe(expected);
  });

  it.each(REJECTED)('%s を両方が拒否する', (input) => {
    expect(normalizeAtlassianSiteResult(input).ok).toBe(false);
    expect(() => normalizeAtlassianSite(input)).toThrow();
    expect(() => mainSite(input)).toThrow();
  });

  // ネガティブコントロール: 「全部拒否する」実装になっていないこと。
  it('正規の site は通る', () => {
    expect(mainSite('https://acme.atlassian.net')).toBe('https://acme.atlassian.net');
  });

  // 文言は呼び出し側ごとに違ってよい (main は「token の site」、shared は
  // 「baseUrl」と呼んでいる)。揃えるのは判定であって文言ではない。
  it('拒否の文言は呼び出し側ごとの言い回しを保つ', () => {
    expect(() => mainSite('http://x.atlassian.net')).toThrow(/token の site/);
    expect(() => normalizeAtlassianSite('http://x.atlassian.net')).toThrow(/baseUrl/);
  });

  // どの理由で断ったかまで見る。理由が 4 つあるのに文言が 1 つに潰れていても
  // 「throw した」だけの検査は通ってしまう。
  it('断った理由ごとに違う文言を出す', () => {
    expect(() => mainSite('https://x.atlassian.net\tfoo')).toThrow(/制御文字/);
    expect(() => mainSite('http://x.atlassian.net')).toThrow(/https:\/\//);
    expect(() => mainSite('https://evil.com')).toThrow(/atlassian\.net/);
    expect(() => mainSite('not a url')).toThrow(/URL として解釈/);
    expect(() => normalizeAtlassianSite('https://x.atlassian.net\tfoo')).toThrow(/制御文字/);
  });
});
