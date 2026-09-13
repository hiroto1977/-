import { describe, expect, it, vi } from 'vitest';
import { buildHydroponicsSnapshot, fetchHydroponicsSnapshot } from '../hydroponics';
import {
  DEFAULT_CONTROL_SETTINGS,
  DEFAULT_ENVIRONMENT_TARGETS,
  READING_FIELDS,
  READING_FIELD_SPECS,
  TARGET_BASIS,
} from '../../../shared/hydroponicsControl';
import { DEFAULT_CROP_LIST } from '../../../shared/hydroponicCrops';

/*
 * 水耕栽培の運転管理 (2026-09-13 · パス 194)。
 *
 * このサービスは **`LOCAL_SERVICES`** —— 資格情報も通信も無い。返すのは
 * 「何を測るか」の台帳で、利用者の測定・ロット・設定は renderer の record store
 * (端末内) に在り主プロセスからは読めない。
 *
 * だからここで確かめるのは **台帳が shared の 1 か所から導かれていること** と
 * **通信しないこと**である。
 */

describe('fetchHydroponicsSnapshot', () => {
  it('★ 通信しない (fetch を渡しても 1 度も呼ばない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await fetchHydroponicsSnapshot({ token: '', fetch: fetchMock });
    expect(fetchMock, '★ ローカルサービスが通信しました').not.toHaveBeenCalled();
  });

  it('★ トークンが無くても答える (資格情報を要らない)', async () => {
    const snap = await fetchHydroponicsSnapshot({ token: '', fetch: vi.fn<typeof fetch>() });
    expect(snap.fields.length).toBeGreaterThan(0);
  });

  it('測定項目は shared の一覧と総当たりで一致する (数を 2 か所に書かない)', () => {
    const snap = buildHydroponicsSnapshot();
    expect(snap.fields.map((f) => f.field)).toEqual([...READING_FIELDS]);
    for (const f of snap.fields) {
      const s = READING_FIELD_SPECS[f.field];
      expect(f.label, f.field).toBe(s.label);
      expect(f.unit, f.field).toBe(s.unit);
      expect(f.digits, f.field).toBe(s.digits);
      expect(f.plausibleMin, f.field).toBe(s.plausibleMin);
      expect(f.plausibleMax, f.field).toBe(s.plausibleMax);
      expect(f.targetFrom, f.field).toBe(s.targetFrom);
      expect(f.lowerBoundMatters, f.field).toBe(s.lowerBoundMatters);
      expect(f.upperBoundMatters, f.field).toBe(s.upperBoundMatters);
    }
  });

  it('★ 根拠の強さを値と一緒に返す (画面が印を出せる)', () => {
    const snap = buildHydroponicsSnapshot();
    for (const f of snap.fields) {
      expect(f.basis, f.field).toBe(TARGET_BASIS[f.field]);
      // 今日はすべて目安 —— 出典で検証した値ではない。
      expect(f.basis, `${f.field} を 'sourced' と名乗っています`).toBe('reference');
    }
  });

  it('目標域と運転の既定は shared の既定そのまま', () => {
    const snap = buildHydroponicsSnapshot();
    expect(snap.targetDefaults).toEqual({ ...DEFAULT_ENVIRONMENT_TARGETS });
    expect(snap.settingDefaults).toEqual({
      solutionChangeIntervalDays: DEFAULT_CONTROL_SETTINGS.solutionChangeIntervalDays,
      readingStaleDays: DEFAULT_CONTROL_SETTINGS.readingStaleDays,
      harvestNoticeDays: DEFAULT_CONTROL_SETTINGS.harvestNoticeDays,
    });
  });

  it('参考値の品目を、栽培日数と適正域つきで返す', () => {
    const snap = buildHydroponicsSnapshot();
    expect(snap.crops.map((c) => c.id)).toEqual(DEFAULT_CROP_LIST.map((c) => c.id));
    const lettuce = snap.crops.find((c) => c.id === 'leaf-lettuce');
    const src = DEFAULT_CROP_LIST.find((c) => c.id === 'leaf-lettuce')!;
    expect(lettuce).toMatchObject({
      nurseryDays: src.nurseryDays,
      growOutDays: src.growOutDays,
      ecLow: src.ecLow,
      ecHigh: src.ecHigh,
      phLow: src.phLow,
      phHigh: src.phHigh,
    });
  });

  it('★ 利用者の測定・ロットは返さない (主プロセスからは読めない)', () => {
    const snap = buildHydroponicsSnapshot();
    const keys = Object.keys(snap);
    expect(keys).toEqual(['fields', 'targetDefaults', 'settingDefaults', 'crops']);
    expect(keys, '★ 測定の記録を返しています').not.toContain('readings');
    expect(keys).not.toContain('batches');
  });
});
