import { describe, expect, it } from 'vitest';
import {
  MAX_SCAN_URL_LENGTH,
  SECRET_PARAM_NAMES,
  describeScanUrlRisk,
  validateScanUrl,
} from '../scanTarget';

describe('validateScanUrl', () => {
  it('http / https を通す', () => {
    expect(validateScanUrl('https://example.com/a')).toEqual({ ok: true, url: 'https://example.com/a' });
    expect(validateScanUrl('http://example.com')).toEqual({ ok: true, url: 'http://example.com' });
  });

  it('前後の空白を落として通す', () => {
    expect(validateScanUrl('  https://example.com  ')).toEqual({ ok: true, url: 'https://example.com' });
  });

  it('空 / 非文字列を断る', () => {
    expect(validateScanUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl(undefined)).toEqual({ ok: false, reason: 'empty' });
    expect(validateScanUrl(42)).toEqual({ ok: false, reason: 'empty' });
  });

  it('URL として読めないものを断る', () => {
    expect(validateScanUrl('not a url')).toEqual({ ok: false, reason: 'not-a-url' });
  });

  // 送っても意味が無いのに手元の情報を明かすだけの形。
  it('http/https 以外のスキームを断る', () => {
    expect(validateScanUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'not-web' });
    expect(validateScanUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'not-web' });
    expect(validateScanUrl('ftp://example.com')).toEqual({ ok: false, reason: 'not-web' });
  });

  it('長さの上限で断る (境界も見る)', () => {
    const base = 'https://example.com/';
    const atLimit = base + 'a'.repeat(MAX_SCAN_URL_LENGTH - base.length);
    expect(atLimit).toHaveLength(MAX_SCAN_URL_LENGTH);
    expect(validateScanUrl(atLimit).ok).toBe(true);
    expect(validateScanUrl(atLimit + 'a')).toEqual({ ok: false, reason: 'too-long' });
  });
});

describe('describeScanUrlRisk', () => {
  // 警告は出す回数を絞るほど効く。普通の URL では出さない。
  it('普通の URL では何も言わない', () => {
    expect(describeScanUrlRisk('https://example.com/page')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/search?q=cat&page=2')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/#section')).toBeNull();
  });

  it('URL に埋め込まれた利用者名/パスワードを指摘する', () => {
    const msg = describeScanUrlRisk('https://user:pw@example.com/');
    expect(msg).toContain('パスワード');
  });

  // 片方だけでも指摘する。`||` を `&&` にする変異体は、両方揃った例しか
  // 無いと生き残る。
  it('利用者名だけ・パスワードだけでも指摘する', () => {
    expect(describeScanUrlRisk('https://user@example.com/')).toContain('パスワード');
    expect(describeScanUrlRisk('https://:pw@example.com/')).toContain('パスワード');
  });

  it('資格情報らしき名前のクエリを名指しで指摘する', () => {
    const msg = describeScanUrlRisk('https://example.com/d?access_token=abc&page=2');
    expect(msg).toContain('access_token');
    expect(msg).not.toContain('page');
  });

  // OAuth の暗黙フローはフラグメントに載る。クエリだけ見ていると見逃す。
  it('フラグメントに載った資格情報も拾う', () => {
    const msg = describeScanUrlRisk('https://example.com/cb#access_token=abc&state=x');
    expect(msg).toContain('access_token');
  });

  it('署名付きリンクの sig / signature を拾う', () => {
    expect(describeScanUrlRisk('https://cdn.example.com/f.zip?sig=abc')).toContain('sig');
    expect(describeScanUrlRisk('https://cdn.example.com/f.zip?Signature=abc')).toContain('Signature');
  });

  it('複数見つかったら区切って並べる', () => {
    const msg = describeScanUrlRisk('https://example.com/?access_token=a&signature=b') ?? '';
    expect(msg).toContain('access_token / signature');
  });

  it('同じ名前を重ねて挙げない', () => {
    const msg = describeScanUrlRisk('https://example.com/?token=a&token=b') ?? '';
    expect(msg.match(/token/g)).toHaveLength(1);
  });

  it('検証を通らない入力では何も言わない (先に検証側が断る)', () => {
    expect(describeScanUrlRisk('not a url')).toBeNull();
    expect(describeScanUrlRisk('')).toBeNull();
  });
});

describe('資格情報らしき名前の一覧', () => {
  // 一覧そのものが挙動なので、1 件ずつ固定する。**名前は実装から読まず
  // 直書きする** — 実装の配列を回して確かめると、名前を書き換える変異と
  // 期待値が一緒に動いてしまい、何も確かめていないことになる。
  const NAMES = [
    'token', 'access_token', 'id_token', 'refresh_token',
    'key', 'api_key', 'apikey',
    'secret', 'password', 'passwd', 'pwd',
    'auth', 'authorization',
    'session', 'sessionid',
    'sig', 'signature', 'code', 'credential',
  ];

  it.each(NAMES)('%s を資格情報として拾う', (name) => {
    expect(describeScanUrlRisk(`https://example.com/?${name}=x`)).toContain(name);
  });

  it.each(NAMES)('%s は大文字小文字を問わず拾う', (name) => {
    expect(describeScanUrlRisk(`https://example.com/?${name.toUpperCase()}=x`)).not.toBeNull();
  });

  // 名前を足したらテストも足す。数が合わなくなった時点で気付けるようにする。
  it('一覧に載っている名前をすべて検査している', () => {
    expect([...SECRET_PARAM_NAMES].sort()).toEqual([...NAMES].sort());
  });

  it('似ているが別物の名前は拾わない (警告を薄めない)', () => {
    expect(describeScanUrlRisk('https://example.com/?tokens=x')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/?keyword=x')).toBeNull();
    expect(describeScanUrlRisk('https://example.com/?author=x')).toBeNull();
  });
});
