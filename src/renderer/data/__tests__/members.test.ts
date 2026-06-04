import { describe, expect, it } from 'vitest';
import { parseMember, countOwners, MEMBERS_COLLECTION, type Member } from '../members';

describe('parseMember', () => {
  const base = { name: '山田太郎', email: 'taro@example.com', role: 'member' };

  it('exposes the team-members collection key', () => {
    expect(MEMBERS_COLLECTION).toBe('team-members');
  });

  it('rejects an email with internal whitespace or trailing junk (anchored regex)', () => {
    // ^/$ アンカーを外す Regex mutant は部分一致で受理してしまうため、これらを reject。
    expect(() => parseMember({ ...base, email: 'a b@c.d' })).toThrow('メールアドレスの形式が正しくありません');
    expect(() => parseMember({ ...base, email: 'a@b.c d' })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('accepts an email of exactly 254 chars but rejects 255 (length boundary)', () => {
    const at254 = 'a'.repeat(249) + '@b.cd'; // 254 文字, 形式は妥当
    const at255 = 'a'.repeat(250) + '@b.cd'; // 255 文字
    expect(parseMember({ ...base, email: at254 }).email).toBe(at254);
    expect(() => parseMember({ ...base, email: at255 })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('accepts a name of exactly 64 chars (> strict)', () => {
    expect(parseMember({ ...base, name: 'x'.repeat(64) }).name).toBe('x'.repeat(64));
  });

  it('reports the field error (not a TypeError) when name/email are non-strings', () => {
    // typeof ガードを true 固定する mutant は .trim() で TypeError を投げるため、
    // 期待する日本語メッセージで殺せる。
    expect(() => parseMember({ ...base, name: 123 })).toThrow('氏名は 1〜64 文字で入力してください');
    expect(() => parseMember({ ...base, email: 123 })).toThrow('メールアドレスの形式が正しくありません');
  });

  it('trims a padded email before validating (trim must run)', () => {
    // .trim() を外す mutant は前後空白付きを invalid にするため、受理+整形結果で殺す。
    expect(parseMember({ ...base, email: '  ok@example.com  ' }).email).toBe('ok@example.com');
  });

  it('trims and accepts a valid member', () => {
    expect(parseMember({ ...base, name: '  山田太郎  ' })).toEqual({
      name: '山田太郎',
      email: 'taro@example.com',
      role: 'member',
    });
  });

  it('rejects an empty or oversized name', () => {
    expect(() => parseMember({ ...base, name: '  ' })).toThrow(/氏名/);
    expect(() => parseMember({ ...base, name: 'x'.repeat(65) })).toThrow(/氏名/);
  });

  it('rejects a malformed email', () => {
    expect(() => parseMember({ ...base, email: 'not-an-email' })).toThrow(/メール/);
    expect(() => parseMember({ ...base, email: 'a@b' })).toThrow(/メール/);
  });

  it('rejects an invalid role', () => {
    expect(() => parseMember({ ...base, role: 'superuser' })).toThrow(/役割/);
  });
});

describe('countOwners', () => {
  it('counts owners in a list', () => {
    const members: Member[] = [
      { name: 'A', email: 'a@x.com', role: 'owner' },
      { name: 'B', email: 'b@x.com', role: 'admin' },
      { name: 'C', email: 'c@x.com', role: 'owner' },
    ];
    expect(countOwners(members)).toBe(2);
    expect(countOwners([])).toBe(0);
  });
});
