import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  BACKUP_COLLECTION_RECORD_LIMITS,
  MAX_BACKUP_IMPORT_RECORDS,
  backupRecordLimitError,
} from '../importFile';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

/**
 * 復元に件数の天井が無く、窓を掛けていない一覧が細工した控え 1 つで使えなくなる
 * (2026-10-20 · パス 544 · threat: T-141)。実測: team-members 20,000 行 (3.2 MB) で画面 9.7 秒・
 * 50,000 行で 27.8 秒、business-units 200,000 行で手入力パネルが 32 秒固まった。
 */
const rows = (collection: string, n: number) => Array.from({ length: n }, () => ({ collection }));

describe('復元の件数の天井 (threat: T-141)', () => {
  it('★ 全体の天井を超える控えは断る (切らずに全部やめる)', () => {
    expect(backupRecordLimitError(rows('sales-entries', MAX_BACKUP_IMPORT_RECORDS))).toBeNull();
    expect(backupRecordLimitError(rows('sales-entries', MAX_BACKUP_IMPORT_RECORDS + 1))).toMatch(/多すぎます/);
  });

  it('★ 窓を掛けていない一覧の collection は、少ない数で断る', () => {
    for (const [collection, limit] of Object.entries(BACKUP_COLLECTION_RECORD_LIMITS)) {
      expect(backupRecordLimitError(rows(collection, limit)), collection).toBeNull();
      const msg = backupRecordLimitError(rows(collection, limit + 1));
      expect(msg, collection).toContain(collection);
      expect(msg, collection).toMatch(/復元はしていません/);
    }
  });

  it('対照: 通常の控え (数百件) と、他の collection の多さは断らない', () => {
    expect(backupRecordLimitError([...rows('team-members', 25), ...rows('sales-entries', 50_000)])).toBeNull();
    expect(backupRecordLimitError([])).toBeNull();
  });

  it('★ 復元の画面は計画の前に天井を見て、チームの一覧は窓を通す', () => {
    const panel = stripComments(readOriginalSource(path.join(__dirname, '../../components/BackupPanel.tsx')));
    const iLimit = panel.indexOf('backupRecordLimitError(parsed.records)');
    expect(iLimit).toBeGreaterThan(0);
    expect(iLimit).toBeLessThan(panel.indexOf('planRestore('));
    const team = stripComments(readOriginalSource(path.join(__dirname, '../../pages/TeamPage.tsx')));
    expect(team).toContain('useRowWindow(records)');
    expect(team).toContain('rowWindow.visible.map');
    expect(team).not.toMatch(/\{records\.map\(/);
  });
});

/**
 * 窓を掛けていない 7 つの collection も天井を持つ (2026-10-24 · threat: T-175)。T-141 の天井は 4 collection だけで、
 * 細工したバックアップ 1 本を「マージ復元」(確認なし) させると、投資信託・不動産・士業・水耕・KPI の一覧が全行を描いて固まった
 * (実 Chromium で 20,000 行が 5〜25 秒・100,000 行が 123 秒)。
 */
describe('復元の件数の天井は、全行を描く一覧すべてに在る (threat: T-175)', () => {
  const NAMES = [
    'mutualfund-holdings',
    'realestate-properties',
    'shigyo-contacts',
    'shigyo-consultations',
    'hydroponics-batches',
    'kpi-budgets',
    'kpi-actuals',
  ];

  it('★ 7 つとも台帳にあり、実在する collection 名である', async () => {
    const { COLLECTION_SHAPES } = await import('../collectionShapes');
    for (const c of NAMES) {
      expect(BACKUP_COLLECTION_RECORD_LIMITS[c], c).toBeGreaterThan(0);
      expect(Object.hasOwn(COLLECTION_SHAPES, c), `${c} は形の表に無い (綴り違いで天井が効かない)`).toBe(true);
    }
  });

  it('★ 天井の 1 件超えで断る (投資信託 2,001 件)', () => {
    expect(backupRecordLimitError(rows('mutualfund-holdings', 2_000))).toBeNull();
    expect(backupRecordLimitError(rows('mutualfund-holdings', 2_001))).toContain('mutualfund-holdings');
  });
});
