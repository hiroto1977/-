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
import {
  bearerFromStoredToken, checkTokenSetForStorage, hasUsableAccessToken,
} from '../vaultToken';
import { hasControlChars, MAX_TOKEN_INPUT_CHARS } from '../tokenInput';
import { countChars } from '../inputCeiling';

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


/**
 * **包んだ TokenSet を保存する前に見る** (2026-09-14 ・ パス 259)。
 *
 * この関門がないと何が起きるかは、下の「床は包みの中を見られない」が
 * 标本で示す —— `secrets.setToken` の制御文字の床 (パス 245) は
 * `JSON.stringify` した後の文字列を見るので、エスケープ列になった
 * 制御文字を拾えない。
 */
describe('checkTokenSetForStorage', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const NUL = String.fromCharCode(0);

  it('普通の TokenSet は通り、測った文字列をそのまま返す', () => {
    const tokens = { accessToken: 'ya29.ok', refreshToken: '1//r', expiresAt: 1, scope: 'a b' };
    const r = checkTokenSetForStorage(tokens);
    expect(r.ok).toBe(true);
    // ★ 測った物と書く物が同じ (パス 57 の形を作らない)。
    expect(r.ok && r.serialized).toBe(JSON.stringify(tokens));
  });

  it('★ 床は包みの中を見られない (この関門が要る理由の标本)', () => {
    const bad = 'ab' + CR + LF + 'cd';
    expect(hasControlChars(bad)).toBe(true);
    // 包んだ後はエスケープ列なので床には見えない。
    expect(hasControlChars(JSON.stringify({ accessToken: bad }))).toBe(false);
    // 読み戻すと本物に戻る。
    const back = JSON.parse(JSON.stringify({ accessToken: bad })) as { accessToken: string };
    expect(hasControlChars(back.accessToken)).toBe(true);
    // だから包む側で断る。
    const r = checkTokenSetForStorage({ accessToken: bad });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('control-char');
  });

  it('★ 制御文字はどの欄でも断り、欄名を言う', () => {
    for (const [key, value] of [
      ['accessToken', 'a' + NUL + 'b'],
      ['refreshToken', 'r' + CR + LF + 'Z'],
      ['scope', 's' + LF + 'Z'],
      ['tokenType', 'Bearer' + CR],
    ] as const) {
      const r = checkTokenSetForStorage({ accessToken: 'ok', [key]: value });
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('control-char');
      expect(r.ok === false && r.message).toContain(key);
    }
  });

  it('★ 使えるアクセストークンが無ければ断る (`as TokenResponse` が通してしまう形)', () => {
    for (const tokens of [
      { access_token: 'wrong-key' },   // スナークケースのまま
      { accessToken: '' },
      { accessToken: 12345 },
      { accessToken: { nested: 'x' } },
      { accessToken: null },
      {},
      null,
      'a string',
      42,
    ]) {
      const r = checkTokenSetForStorage(tokens);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('no-access-token');
    }
  });

  it('★ 天井はハンドラと同じ定数を読む (3 つ目の数を作らない)', () => {
    // 包んだ後の文字数で測る —— ファイルへ行くのはこれだから。
    const fits = { accessToken: 'x'.repeat(MAX_TOKEN_INPUT_CHARS - 20) };
    expect(countChars(JSON.stringify(fits))).toBeLessThanOrEqual(MAX_TOKEN_INPUT_CHARS);
    expect(checkTokenSetForStorage(fits).ok).toBe(true);

    const over = { accessToken: 'x'.repeat(MAX_TOKEN_INPUT_CHARS) };
    expect(countChars(JSON.stringify(over))).toBeGreaterThan(MAX_TOKEN_INPUT_CHARS);
    const r = checkTokenSetForStorage(over);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('too-long');
    // 文面には定数そのものが現れる (数を写していない)。
    expect(r.ok === false && r.message).toContain(String(MAX_TOKEN_INPUT_CHARS));
  });

  it('★ 欄が多い応答も包んだ後の長さで測る (欄数を数えなくてよい)', () => {
      const many: Record<string, unknown> = { accessToken: 'ok' };
      for (let i = 0; i < 20000; i += 1) many['pad' + String(i)] = 'yyyy';
      const r = checkTokenSetForStorage(many);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('too-long');
  });

  it('包めない物は投げずに断る (実の呼び出し側 2 つはここへ到達しない)', () => {
    const circular: Record<string, unknown> = { accessToken: 'ok' };
    circular['self'] = circular;
    const r = checkTokenSetForStorage(circular);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('unserializable');
  });
});
