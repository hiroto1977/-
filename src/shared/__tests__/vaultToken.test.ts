/**
 * 保存された資格情報 → Bearer 文字列 の検査。
 *
 * ここで守りたいのは **「送ってはいけないものを送らない」** ことである。
 * 2026-08-20 の監査時点で、ブラウザ版は JSON として読めるのに `accessToken` が
 * 無い値を**そのまま Bearer に載せて**いた。TokenSet には `refreshToken` が
 * 入るので、アクセストークンより強い資格情報が相手 (と利用者のプロキシの
 * 運用者) へ出ていた。しかも JSON の塊は Bearer として通らないので、
 * 漏らす代償だけ払って認証は必ず失敗していた。
 */
import { describe, expect, it } from 'vitest';
import { bearerFromStoredToken, hasUsableAccessToken } from '../vaultToken';

describe('hasUsableAccessToken', () => {
  it('非空の accessToken を持つオブジェクトだけ true', () => {
    expect(hasUsableAccessToken({ accessToken: 'tok' })).toBe(true);
    expect(hasUsableAccessToken({ accessToken: 'tok', refreshToken: 'r' })).toBe(true);
  });

  it('空文字の accessToken は使えない', () => {
    // Bearer に載せても相手は必ず 401 を返す。「未設定」として扱うほうが
    // 利用者に正しく伝わる。
    expect(hasUsableAccessToken({ accessToken: '' })).toBe(false);
  });

  it('accessToken が文字列でなければ false', () => {
    expect(hasUsableAccessToken({ accessToken: null })).toBe(false);
    expect(hasUsableAccessToken({ accessToken: 123 })).toBe(false);
    expect(hasUsableAccessToken({ accessToken: { nested: 'x' } })).toBe(false);
    expect(hasUsableAccessToken({ refreshToken: 'r' })).toBe(false);
    expect(hasUsableAccessToken({})).toBe(false);
  });

  it('オブジェクトでなければ false', () => {
    expect(hasUsableAccessToken(null)).toBe(false);
    expect(hasUsableAccessToken(undefined)).toBe(false);
    expect(hasUsableAccessToken('accessToken')).toBe(false);
    expect(hasUsableAccessToken(42)).toBe(false);
    expect(hasUsableAccessToken(true)).toBe(false);
  });

  it('配列は TokenSet ではない', () => {
    expect(hasUsableAccessToken([])).toBe(false);
    expect(hasUsableAccessToken(['tok'])).toBe(false);
  });
});

describe('bearerFromStoredToken — 生のトークン', () => {
  it('JSON として読めない値はそのまま返す', () => {
    expect(bearerFromStoredToken('ghp_abcdefghijklmnop')).toBe('ghp_abcdefghijklmnop');
    expect(bearerFromStoredToken('sk-ant-api03-xxxx')).toBe('sk-ant-api03-xxxx');
    expect(bearerFromStoredToken('')).toBe('');
  });

  it('JSON だがオブジェクトでない値もそのまま返す', () => {
    // 数字だけの API キーは JSON の数値として読めてしまう。TokenSet ではない
    // ので、貼り付けられたとおりに返す。
    expect(bearerFromStoredToken('12345')).toBe('12345');
    expect(bearerFromStoredToken('true')).toBe('true');
    expect(bearerFromStoredToken('null')).toBe('null');
    expect(bearerFromStoredToken('"quoted"')).toBe('"quoted"');
  });
});

describe('bearerFromStoredToken — TokenSet', () => {
  it('accessToken を取り出す', () => {
    const raw = JSON.stringify({ accessToken: 'ya29.at', refreshToken: 'r', expiresAt: 1 });
    expect(bearerFromStoredToken(raw)).toBe('ya29.at');
  });

  it('取り出すのは accessToken だけ (他の項目を混ぜない)', () => {
    const raw = JSON.stringify({ accessToken: 'at', refreshToken: 'rt', scope: 'drive' });
    const got = bearerFromStoredToken(raw);
    expect(got).toBe('at');
    expect(got).not.toContain('rt');
    expect(got).not.toContain('drive');
  });
});

describe('bearerFromStoredToken — 壊れた TokenSet は送らない', () => {
  /*
   * ここが本題。JSON として読めるのに accessToken が無い値を raw のまま返すと、
   * その JSON 丸ごとが Authorization ヘッダに載る。
   */
  it('accessToken が無ければ null (refresh token を道連れにしない)', () => {
    const raw = JSON.stringify({ refreshToken: 'REFRESH-SECRET', expiresAt: 123 });
    const got = bearerFromStoredToken(raw);
    expect(got).toBeNull();
    // 「null を返す」だけでなく「秘密が返り値に現れない」ことを直接見る。
    expect(String(got)).not.toContain('REFRESH-SECRET');
  });

  it('accessToken が空文字でも null', () => {
    expect(bearerFromStoredToken(JSON.stringify({ accessToken: '', refreshToken: 'r' }))).toBeNull();
  });

  it('accessToken が文字列でなければ null', () => {
    expect(bearerFromStoredToken(JSON.stringify({ accessToken: null, refreshToken: 'r' }))).toBeNull();
    expect(bearerFromStoredToken(JSON.stringify({ accessToken: 42 }))).toBeNull();
  });

  it('空オブジェクト・配列も null', () => {
    expect(bearerFromStoredToken('{}')).toBeNull();
    expect(bearerFromStoredToken('[]')).toBeNull();
    expect(bearerFromStoredToken('["tok"]')).toBeNull();
  });

  it('入れ子に accessToken があっても拾わない (形が違えば送らない)', () => {
    const raw = JSON.stringify({ data: { accessToken: 'deep' }, refreshToken: 'r' });
    expect(bearerFromStoredToken(raw)).toBeNull();
  });
});
