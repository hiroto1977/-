import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_CLOCK_SKEW_MS,
  CREDENTIAL_TTL_HOURS,
  CREDENTIAL_TTL_MS,
  expiredStoredCredentialMessage,
  isRefreshableTokenSetJson,
  storedCredentialExpired,
} from '../credentialTtl';

/**
 * 保存した資格情報の有効時間 (threat: T-213)。両ビルドの保管層が読む判定を、境界ごとに値で留める。
 */
describe('storedCredentialExpired — 保存した資格情報の有効時間 (threat: T-213)', () => {
  const NOW = 1_800_000_000_000;
  it('★ 有効時間は 8 時間 (使い捨てに近づける側に倒した値)', () => {
    expect(CREDENTIAL_TTL_HOURS).toBe(8);
    expect(CREDENTIAL_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });
  it.each([
    ['保存した直後', NOW, false],
    ['ちょうど有効時間 (境界は生きている側)', NOW - CREDENTIAL_TTL_MS, false],
    ['有効時間 + 1 ms は期限切れ', NOW - CREDENTIAL_TTL_MS - 1, true],
    ['時計の揺れの範囲の未来は生きている', NOW + CREDENTIAL_CLOCK_SKEW_MS, false],
    ['揺れを超えた未来は期限切れ (書き換えられた物)', NOW + CREDENTIAL_CLOCK_SKEW_MS + 1, true],
  ])('★ %s', (_label, storedAt, expired) => {
    expect(storedCredentialExpired(storedAt, NOW)).toBe(expired);
  });
  it.each([
    ['undefined (日付が無い)', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['文字列の数字', String(NOW)],
  ])('★ 読めない時刻は期限切れ (fail closed): %s', (_label, storedAt) => {
    expect(storedCredentialExpired(storedAt, NOW)).toBe(true);
  });
});

describe('isRefreshableTokenSetJson — 有効時間の外に置く OAuth の TokenSet', () => {
  it('★ accessToken と refreshToken を持つ JSON だけが true', () => {
    expect(isRefreshableTokenSetJson(JSON.stringify({ accessToken: 'a', refreshToken: 'r' }))).toBe(true);
  });
  it.each([
    ['refreshToken が無い (貼り付け式 PKCE の形)', JSON.stringify({ accessToken: 'a' })],
    ['refreshToken が空', JSON.stringify({ accessToken: 'a', refreshToken: '' })],
    ['accessToken が無い', JSON.stringify({ refreshToken: 'r' })],
    ['JSON ですらない生の鍵', 'ghp_abcdefghijklmnop'],
    ['JSON の鍵束 (assistant の形)', JSON.stringify({ anthropic: 'sk-ant-x', openai: 'sk-y' })],
    ['配列', '[1]'],
  ])('★ false: %s', (_label, raw) => {
    expect(isRefreshableTokenSetJson(raw)).toBe(false);
  });
});

describe('expiredStoredCredentialMessage', () => {
  it('★ 原因 (時間) と直す手 (登録し直す) を名指しする', () => {
    expect(expiredStoredCredentialMessage('github')).toBe(
      'github の保存された資格情報は、保存から 8 時間が経ったので無効にして消しました。設定から登録し直してください',
    );
  });
});
