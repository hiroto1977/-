import { describe, expect, it } from 'vitest';
import { isServiceId, SERVICE_IDS } from '../serviceId';

describe('isServiceId', () => {
  it('returns true for every registered service id', () => {
    for (const id of SERVICE_IDS) {
      expect(isServiceId(id)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isServiceId('not-a-service')).toBe(false);
    expect(isServiceId('')).toBe(false);
    expect(isServiceId('GITHUB')).toBe(false); // case-sensitive
  });

  it('rejects prototype-chain lookups (P1-1 defense)', () => {
    // These are the strings an attacker would pass to a confused
    // ipcMain.handle that did `map[serviceId]` without validation.
    expect(isServiceId('__proto__')).toBe(false);
    expect(isServiceId('constructor')).toBe(false);
    expect(isServiceId('hasOwnProperty')).toBe(false);
    expect(isServiceId('toString')).toBe(false);
    expect(isServiceId('valueOf')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isServiceId(undefined)).toBe(false);
    expect(isServiceId(null)).toBe(false);
    expect(isServiceId(0)).toBe(false);
    expect(isServiceId(true)).toBe(false);
    expect(isServiceId({})).toBe(false);
    expect(isServiceId([])).toBe(false);
    expect(isServiceId(Symbol('github'))).toBe(false);
  });
});
