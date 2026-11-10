/**
 * 乗っ取り防止 (ai-phishing の穴): リンクの見かけと行き先の食い違い・似た文字のドメインを押す前に見せる。
 * 文面は肯定形で留める (警告の文に行き先のホストが載ること)。警告が出ない側も標本で留める
 * (偽陽性で日常になれば誰も読まなくなる)。
 */
import { describe, expect, it } from 'vitest';
import { linkSpoofWarning } from '../linkSpoof';

describe('linkSpoofWarning', () => {
  it('★ 似た文字のドメイン (punycode) は行き先のホストを名乗って警告する', () => {
    // キリル文字で作った似たドメイン (下の escape) は URL の解析で xn-- へ畳まれる
    const w = linkSpoofWarning('https://xn--80aa4aa.com/login', null);
    expect(w?.kind).toBe('lookalike-host');
    expect(w?.message).toContain('xn--80aa4aa.com');
    const real = linkSpoofWarning('https://\u0440\u0430\u0443\u0440\u0430l.com/', null);
    expect(real?.kind).toBe('lookalike-host');
  });

  it('★ 表示に書いたドメインと行き先が違えば、両方のホストを名乗って警告する', () => {
    const w = linkSpoofWarning('https://evil.example/x', '国税庁 nta.go.jp の手引き');
    expect(w?.kind).toBe('label-mismatch');
    expect(w?.message).toBe('表示は nta.go.jp ですが、行き先は evil.example です。');
  });

  it('★ scheme 付きの表示 (https://…) も読む', () => {
    expect(linkSpoofWarning('https://evil.example/', 'https://www.mhlw.go.jp/stf/')?.kind).toBe('label-mismatch');
  });

  it('同じホスト・サブドメインの違いは警告しない', () => {
    expect(linkSpoofWarning('https://www.mhlw.go.jp/a', 'mhlw.go.jp')).toBeNull();
    expect(linkSpoofWarning('https://mhlw.go.jp/a', 'www.mhlw.go.jp')).toBeNull();
    expect(linkSpoofWarning('https://www.nta.go.jp/', '国税庁 (www.nta.go.jp)')).toBeNull();
  });

  it('表示にドメインが無ければ何も言わない (日常の「手引きを開く」で偽陽性にしない)', () => {
    for (const label of ['手引きを開く', '出典', 'Vol.1', '2026.11', 'e.g. 例', '']) {
      expect(linkSpoofWarning('https://www.nta.go.jp/', label)).toBeNull();
    }
  });

  it('表示が文字列でない (画像など) なら食い違いは判定しない (punycode だけ見る)', () => {
    expect(linkSpoofWarning('https://www.nta.go.jp/', null)).toBeNull();
  });

  it('行き先が解析できなければ null (その場合は関門が既に断っている)', () => {
    expect(linkSpoofWarning('not a url', '国税庁 nta.go.jp')).toBeNull();
  });

  it('警告の文に path・クエリ・資格情報を載せない (ホストだけを名乗る)', () => {
    const w = linkSpoofWarning('https://evil.example/secret?token=abc#frag', '国税庁 nta.go.jp');
    expect(w?.message).not.toContain('secret');
    expect(w?.message).not.toContain('token');
  });

  it('対照: 標本が的に当たる (食い違いの標本は表示と行き先の host が実際に違う)', () => {
    expect(new URL('https://evil.example/x').hostname).not.toContain('nta.go.jp');
  });
});
