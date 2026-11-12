/**
 * **id の型の門は、文字列でない値を必ず落とす** (2026-09-30 · パス 502)。
 *
 * `isBusinessCategoryId` / `isRecordEntryServiceId` は `typeof value === 'string' && 一覧.includes(value)` から
 * **`typeof` の側を消した**形 (`includes` は SameValueZero なので、文字列でない値は一覧のどの項目とも
 * 等しくならない)。変異検査は `typeof` の側を「`true && …`」という**等価変異**として残していた。
 * 消した後も答えが変わらないことを、**文字列に見える非文字列** (1 要素の配列・`String` オブジェクト・
 * `toString` を持つ物) で留める —— これらは `String(value)` へ変換する実装なら通ってしまう形である。
 */
import { describe, expect, it } from 'vitest';
import { BUSINESS_CATEGORY_IDS, isBusinessCategoryId } from '../businessAdvisor';
import { RECORD_ENTRY_SERVICE_IDS, isRecordEntryServiceId } from '../recordEntryLimits';

const looksLikeAString = (id: string): readonly unknown[] => [
  [id],
  new String(id), // 文字列に見える非文字列 (String オブジェクト)
  { toString: () => id },
  Object.assign(() => id, { toString: () => id }),
  Symbol(id),
];

describe('型の門 — 文字列に見える非文字列は通らない', () => {
  it.each(looksLikeAString(BUSINESS_CATEGORY_IDS[0]).map((v, i) => [i, v] as const))('★ 事業カテゴリ (標本 %i)', (_i, v) => {
    expect(isBusinessCategoryId(v)).toBe(false);
  });

  it.each(looksLikeAString(RECORD_ENTRY_SERVICE_IDS[0]).map((v, i) => [i, v] as const))('★ 記録を受けるサービス (標本 %i)', (_i, v) => {
    expect(isRecordEntryServiceId(v)).toBe(false);
  });

  it('対照: 同じ id の文字列そのものは通る (標本が的に当たる)', () => {
    expect(isBusinessCategoryId(BUSINESS_CATEGORY_IDS[0])).toBe(true);
    expect(isRecordEntryServiceId(RECORD_ENTRY_SERVICE_IDS[0])).toBe(true);
    expect(String(new String(BUSINESS_CATEGORY_IDS[0]))).toBe(BUSINESS_CATEGORY_IDS[0]);
  });
});
