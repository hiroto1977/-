import { describe, expect, it } from 'vitest';
import { parseMember, countOwners, type Member } from '../members';

describe('parseMember', () => {
  const base = { name: '山田太郎', email: 'taro@example.com', role: 'member' };

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
