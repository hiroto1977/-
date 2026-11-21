/**
 * 事業カテゴリ id の一覧と型の門 (2026-09-09 · パス 117)。
 *
 * 一覧は main の表 (`BUSINESS_CATEGORIES`) とブラウザ版の許可集合が読む唯一の物。
 * 表との一致は `main/clients/__tests__/business.test.ts` が留める (main を import できるのはあちら)。
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_CATEGORY_IDS, isBusinessCategoryId } from '../businessAdvisor';

describe('BUSINESS_CATEGORY_IDS / isBusinessCategoryId', () => {
  it('10 の id で、重複が無い', () => {
    expect(BUSINESS_CATEGORY_IDS).toHaveLength(10);
    expect(new Set(BUSINESS_CATEGORY_IDS).size).toBe(BUSINESS_CATEGORY_IDS.length);
  });

  it('一覧の id はすべて通る', () => {
    for (const id of BUSINESS_CATEGORY_IDS) expect(isBusinessCategoryId(id), id).toBe(true);
  });

  it('一覧の外は通らない (文字列でない物・プロトタイプ鎖の名前も)', () => {
    // 2026-08-22 に main の判定が `in` でプロトタイプ鎖の名前を 8 個通していた形 —— `includes` は辿らない。
    for (const v of ['unknown', '', 'EC', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 42, null, undefined, {}, ['ec']]) {
      expect(isBusinessCategoryId(v), String(v)).toBe(false);
    }
  });
});
