/**
 * **数字を持たない見本の画面に「表示中の数字は同梱のサンプルです」と言わない** (2026-11-25)。
 *
 * `StatusBar` は取得に失敗すると取得元を 1 行で言う。それまでは見本が空の土台でも
 * 「同梱のサンプルです」と言い、Ollama は起動していないと存在しない見本の数字を指していた。
 *
 * 写し `SNAPSHOT_WITHOUT_SAMPLE_NUMBERS` (shared/dataOrigin.ts) は実物の `SNAPSHOT` から
 * 導いた集合と両方向に一致しなければならない。
 */
import { describe, expect, it } from 'vitest';
import { SNAPSHOT } from '../data/snapshot';
import {
  NO_SAMPLE_NUMBERS_NOTE,
  SERVICE_DATA_ORIGIN,
  SNAPSHOT_WITHOUT_SAMPLE_NUMBERS,
  isRefreshable,
  staleDataNote,
} from '../../shared/dataOrigin';

/** 空でない配列か 0 でない有限の数がどこかに在るか。文字列・真偽値は数えない。 */
function hasSampleNumbers(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
  if (v !== null && typeof v === 'object') return Object.values(v).some(hasSampleNumbers);
  return false;
}

/** サービス id → SNAPSHOT の鍵 (`real-estate` → `realEstate`・`microsoft-365` → `microsoft365`)。 */
const snapshotKey = (id: string): string => id.replace(/-(.)/g, (_, c: string) => c.toUpperCase());

describe('見本が数字を持たない画面の台帳', () => {
  const snap = SNAPSHOT as unknown as Record<string, unknown>;
  const refreshable = Object.entries(SERVICE_DATA_ORIGIN).filter(([, o]) => isRefreshable(o)).map(([id]) => id);

  it('判定の標本 (数字・配列は数え、文字列と真偽値と 0 は数えない)', () => {
    expect(hasSampleNumbers({ a: [], b: 0, c: '案内', d: false, e: { f: null } })).toBe(false);
    expect(hasSampleNumbers({ a: { b: [1] } })).toBe(true);
    expect(hasSampleNumbers({ a: { b: 3 } })).toBe(true);
    expect(hasSampleNumbers({ a: Number.NaN })).toBe(false);
    expect(snapshotKey('real-estate')).toBe('realEstate');
    expect(snapshotKey('microsoft-365')).toBe('microsoft365');
  });

  it('★ 台帳は実物の SNAPSHOT から導いた集合と両方向に一致する', () => {
    const derived = refreshable.filter((id) => {
      const s = snap[snapshotKey(id)];
      return s !== undefined && !hasSampleNumbers(s);
    });
    expect([...SNAPSHOT_WITHOUT_SAMPLE_NUMBERS].sort()).toEqual(derived.sort());
    // 走査が空虚でない (見本を持つ画面も持たない画面も十分在る)。
    expect(derived.length).toBeGreaterThanOrEqual(10);
    expect(refreshable.length - derived.length).toBeGreaterThanOrEqual(10);
  });

  it('Ollama は台帳に在り、見本の数字を持つ GitHub は無い (対照)', () => {
    expect(SNAPSHOT_WITHOUT_SAMPLE_NUMBERS.has('ollama')).toBe(true);
    expect(SNAPSHOT_WITHOUT_SAMPLE_NUMBERS.has('github')).toBe(false);
    expect(hasSampleNumbers(snap.github)).toBe(true);
  });
});

describe('staleDataNote の 4 つ目の引数', () => {
  it('見本が数字を持たなければ「同梱のサンプル」と言わず、数字が無いと言う', () => {
    expect(staleDataNote('local', 'snapshot', true, false)).toBe(NO_SAMPLE_NUMBERS_NOTE);
    expect(NO_SAMPLE_NUMBERS_NOTE).not.toContain('同梱のサンプルです');
    expect(staleDataNote('local', 'snapshot', true, true)).toBe('表示中の数字は同梱のサンプルです（まだあなたのデータではありません）');
    expect(staleDataNote('local', 'snapshot', true)).toBe('表示中の数字は同梱のサンプルです（まだあなたのデータではありません）');
  });

  it('取得できた後の失敗・失敗していない・取得しない画面は、引数に依らず今までどおり', () => {
    expect(staleDataNote('remote', 'live', true, false)).toBe('表示中の数字は前回取得できた内容です（今回の更新は反映されていません）');
    expect(staleDataNote('local', 'snapshot', false, false)).toBeNull();
    expect(staleDataNote('sample', 'snapshot', true, false)).toBeNull();
  });
});
