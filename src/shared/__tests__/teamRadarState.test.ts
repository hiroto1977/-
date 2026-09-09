/**
 * チームレーダーの状態 —— 両ビルドが通す判定・読み込み・組み立て (2026-09-09 · パス 118)。
 *
 * `validateMembers` そのものの境界は `main/clients/__tests__/teamradar.test.ts` が (再輸出経由で)
 * 留めている。ここは shared に**新しく**置いた 3 つ —— `validateTeamRadarState` (順と文面)・
 * `parseStoredTeamRadarState` (読めない物は見本へ)・`buildTeamRadarSnapshot` (形) —— を直に留める。
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_AXES,
  DEFAULT_TEAM_RADAR,
  DEFAULT_TEAM_RADAR_STATE,
  MAX_TEAM_MEMBERS,
  TEAM_RADAR_STORAGE_KEY,
  buildTeamRadarSnapshot,
  parseStoredTeamRadarState,
  validateTeamRadarState,
} from '../teamRadarState';

const member = (id = 'sato', name = '佐藤') => ({ id, name, scores: [1, 2, 3, 4, 5] });
const good = () => ({ department: '開発部', evaluatedAt: '2026-09-09', members: [member()] });

describe('validateTeamRadarState — 両ビルドの save-state が通す 1 つ', () => {
  it('形の合う状態はそのまま返る (余分な欄は落ちる)', () => {
    expect(validateTeamRadarState({ ...good(), extra: 1 })).toEqual(good());
  });

  it('members が無ければ空として受ける (main の saveTeamRadarStateImpl と同じ)', () => {
    expect(validateTeamRadarState({ department: '開発部', evaluatedAt: '2026-09-09' }).members).toEqual([]);
  });

  it('オブジェクトでなければ断る', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      if (Array.isArray(v)) {
        // 配列はオブジェクトだが department が無いので department で断る。
        expect(() => validateTeamRadarState(v)).toThrow(/department must be/);
      } else {
        expect(() => validateTeamRadarState(v)).toThrow(/state must be an object/);
      }
    }
  });

  it('★ 順は members → department → evaluatedAt (main が 2026-08 から持つ順・同じ文面)', () => {
    // 3 つとも壊れていれば members の文面が出る。
    expect(() => validateTeamRadarState({ department: '', evaluatedAt: '', members: [{ id: 'BAD' }] })).toThrow(
      /member id is invalid/,
    );
    expect(() => validateTeamRadarState({ department: '', evaluatedAt: '', members: [] })).toThrow(/department must be a 1-64 char string/);
    expect(() => validateTeamRadarState({ department: 'X', evaluatedAt: '', members: [] })).toThrow(/evaluatedAt must be a 1-32 char string/);
    expect(() => validateTeamRadarState({ department: 'x'.repeat(65), evaluatedAt: '2026', members: [] })).toThrow(/department/);
    expect(() => validateTeamRadarState({ department: 'X', evaluatedAt: 'x'.repeat(33), members: [] })).toThrow(/evaluatedAt/);
  });

  it('上限の文面は定数から (50 人)', () => {
    const many = Array.from({ length: MAX_TEAM_MEMBERS + 1 }, (_, i) => member(`m${i}`, `M${i}`));
    expect(() => validateTeamRadarState({ ...good(), members: many })).toThrow(`members exceeds ${MAX_TEAM_MEMBERS}`);
  });
});

describe('parseStoredTeamRadarState — 読めない物は見本へ倒す (main の loadTeamRadarState の判断)', () => {
  it('保存した状態を読む', () => {
    expect(parseStoredTeamRadarState(JSON.stringify(good()))).toEqual(good());
  });

  it('JSON でない・オブジェクトでない・members が形に合わない → 見本', () => {
    for (const raw of ['{壊れた', '42', 'null', JSON.stringify({ ...good(), members: [{ id: 'BAD' }] })]) {
      expect(parseStoredTeamRadarState(raw), raw).toBe(DEFAULT_TEAM_RADAR_STATE);
    }
    // 配列はオブジェクトとして読め、欄が無いので「空のチーム」になる (main の loadTeamRadarState と同じ)。
    const arr = parseStoredTeamRadarState('[]');
    expect(arr.members).toEqual([]);
    expect(arr.department).toBe('営業部');
  });

  it('department / evaluatedAt は空なら既定に倒し、長ければ切る (読む側は寛容・書く側は断る)', () => {
    const out = parseStoredTeamRadarState(JSON.stringify({ department: '', evaluatedAt: '', members: [] }));
    expect(out.department).toBe('営業部');
    expect(out.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const long = parseStoredTeamRadarState(JSON.stringify({ department: 'x'.repeat(80), evaluatedAt: 'y'.repeat(40), members: [] }));
    expect(long.department).toHaveLength(64);
    expect(long.evaluatedAt).toHaveLength(32);
  });
});

describe('buildTeamRadarSnapshot — 両ビルドの fetchSnapshot が同じ形を返す', () => {
  it('状態 + 固定 5 軸 + 取得時刻の形', () => {
    const snap = buildTeamRadarSnapshot(good());
    expect(snap).toEqual({ ...good(), axes: CANONICAL_AXES, fetchedAt: '2035-04-15T00:00:00.000Z', isMock: true });
    expect(Object.keys(snap).sort()).toEqual(Object.keys(DEFAULT_TEAM_RADAR).sort());
  });

  it('見本は 3 人の営業部 (基準の絵に合わせた物) で、鍵は台帳の 1 つ', () => {
    expect(DEFAULT_TEAM_RADAR_STATE.members).toHaveLength(3);
    expect(DEFAULT_TEAM_RADAR.department).toBe('営業部');
    expect(TEAM_RADAR_STORAGE_KEY).toBe('teamradar.state');
  });
});
