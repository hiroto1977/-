/**
 * `record-entry` / `advise` を持つ 4 サービスの一覧と型の門 (2026-09-09 · パス 117)。
 *
 * ブラウザ版の振り分け (`web-shim.ts`) と台帳 (`shared/actionData.ts` の
 * `${RecordEntryServiceId}/record-entry`) が同じ一覧を読む。
 */
import { describe, expect, it } from 'vitest';
import { RECORD_ENTRY_SERVICE_IDS, isRecordEntryServiceId } from '../recordEntryLimits';
import { SERVICE_IDS } from '../serviceId';

describe('RECORD_ENTRY_SERVICE_IDS / isRecordEntryServiceId', () => {
  it('4 サービスで、すべて実在する ServiceId', () => {
    expect([...RECORD_ENTRY_SERVICE_IDS].sort()).toEqual(['demae-can', 'mutual-funds', 'real-estate', 'uber-eats']);
    for (const id of RECORD_ENTRY_SERVICE_IDS) expect(SERVICE_IDS as readonly string[], id).toContain(id);
  });

  it('一覧の id は通り、それ以外は通らない', () => {
    for (const id of RECORD_ENTRY_SERVICE_IDS) expect(isRecordEntryServiceId(id), id).toBe(true);
    for (const v of ['stocks', 'emotions', '', 'UBER-EATS', 'constructor', 42, null, undefined, {}]) {
      expect(isRecordEntryServiceId(v), String(v)).toBe(false);
    }
  });
});
