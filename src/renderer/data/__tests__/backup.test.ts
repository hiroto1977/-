import { describe, expect, it } from 'vitest';
import { serializeBackup, parseBackup, sha256Hex, BACKUP_VERSION } from '../backup';
import type { StoredRecord } from '../store';

const RECORDS: StoredRecord[] = [
  { id: 'a', collection: 'sales', createdAt: 2, updatedAt: 2, data: { amount: 100 } },
  { id: 'b', collection: 'kpi-actuals', createdAt: 1, updatedAt: 1, data: { revenue: 50 } },
];

describe('sha256Hex', () => {
  it('produces a stable 64-char hex digest', async () => {
    const h = await sha256Hex('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('serializeBackup', () => {
  it('wraps records in a versioned envelope with a timestamp + checksum', async () => {
    const json = await serializeBackup(RECORDS, new Date('2026-05-29T00:00:00Z'));
    const obj = JSON.parse(json);
    expect(obj.app).toBe('service-hub');
    expect(obj.version).toBe(BACKUP_VERSION);
    expect(obj.exportedAt).toBe('2026-05-29T00:00:00.000Z');
    expect(obj.records).toHaveLength(2);
    expect(obj.checksum).toBe(await sha256Hex(JSON.stringify(RECORDS)));
  });
});

describe('parseBackup', () => {
  it('round-trips serialize → parse', async () => {
    expect(await parseBackup(await serializeBackup(RECORDS))).toEqual(RECORDS);
  });

  it('rejects non-JSON', async () => {
    await expect(parseBackup('not json')).rejects.toThrow(/JSON/);
  });

  it('rejects a foreign app envelope', async () => {
    await expect(parseBackup(JSON.stringify({ app: 'other', version: 1, records: [] }))).rejects.toThrow(/アプリ/);
  });

  it('rejects a newer version', async () => {
    await expect(
      parseBackup(JSON.stringify({ app: 'service-hub', version: BACKUP_VERSION + 1, records: [] })),
    ).rejects.toThrow(/版数/);
  });

  it('rejects a missing records array', async () => {
    await expect(parseBackup(JSON.stringify({ app: 'service-hub', version: 1 }))).rejects.toThrow(/records/);
  });

  it('detects tampering when records are altered but checksum is stale', async () => {
    const json = await serializeBackup(RECORDS);
    const obj = JSON.parse(json);
    // tamper: change an amount, keep the old checksum
    obj.records[0].data.amount = 999999;
    await expect(parseBackup(JSON.stringify(obj))).rejects.toThrow(/改ざん|破損|チェックサム/);
  });

  it('is robust to reformatting (whitespace-only changes still verify)', async () => {
    const json = await serializeBackup(RECORDS);
    const reformatted = JSON.stringify(JSON.parse(json)); // collapse pretty-print
    expect(await parseBackup(reformatted)).toEqual(RECORDS);
  });

  it('accepts a legacy backup without a checksum', async () => {
    const legacy = JSON.stringify({ app: 'service-hub', version: 1, records: RECORDS });
    expect(await parseBackup(legacy)).toEqual(RECORDS);
  });
});
