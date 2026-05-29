import { describe, expect, it } from 'vitest';
import { serializeBackup, parseBackup, BACKUP_VERSION } from '../backup';
import type { StoredRecord } from '../store';

const RECORDS: StoredRecord[] = [
  { id: 'a', collection: 'sales', createdAt: 2, updatedAt: 2, data: { amount: 100 } },
  { id: 'b', collection: 'kpi-actuals', createdAt: 1, updatedAt: 1, data: { revenue: 50 } },
];

describe('serializeBackup', () => {
  it('wraps records in a versioned envelope with a timestamp', () => {
    const json = serializeBackup(RECORDS, new Date('2026-05-29T00:00:00Z'));
    const obj = JSON.parse(json);
    expect(obj.app).toBe('service-hub');
    expect(obj.version).toBe(BACKUP_VERSION);
    expect(obj.exportedAt).toBe('2026-05-29T00:00:00.000Z');
    expect(obj.records).toHaveLength(2);
  });
});

describe('parseBackup', () => {
  it('round-trips serialize → parse', () => {
    expect(parseBackup(serializeBackup(RECORDS))).toEqual(RECORDS);
  });

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json')).toThrow(/JSON/);
  });

  it('rejects a foreign app envelope', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, records: [] }))).toThrow(/アプリ/);
  });

  it('rejects a newer version', () => {
    expect(() =>
      parseBackup(JSON.stringify({ app: 'service-hub', version: BACKUP_VERSION + 1, records: [] })),
    ).toThrow(/版数/);
  });

  it('rejects a missing records array', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'service-hub', version: 1 }))).toThrow(/records/);
  });
});
