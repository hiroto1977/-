/**
 * チームレーダーの状態 —— 両ビルドが通す判定・読み込み・組み立て (2026-09-09 · パス 118)。
 *
 * `validateMembers` そのものの境界は `main/clients/__tests__/teamradar.test.ts` が (再輸出経由で)
 * 留めている。ここは shared に**新しく**置いた 3 つ —— `validateTeamRadarState` (順と文面)・
 * `readStoredTeamRadar` (保存した / まだ無い / 読めなかった を分ける —— パス 120)・`buildTeamRadarSnapshot` (形) —— を直に留める。
 */
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_AXES,
  DEFAULT_TEAM_RADAR,
  DEFAULT_TEAM_RADAR_STATE,
  MAX_TEAM_MEMBERS,
  TEAM_RADAR_STORAGE_KEY,
  buildTeamRadarSnapshot,
  readStoredTeamRadar,
  unreadableTeamRadarNote,
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

describe('readStoredTeamRadar — 「保存した」「まだ無い」「読めなかった」を混ぜない (パス 120)', () => {
  it('null (鍵が無い) は「まだ無い」', () => {
    expect(readStoredTeamRadar(null)).toEqual({ kind: 'none' });
  });

  it('保存した状態を読む', () => {
    expect(readStoredTeamRadar(JSON.stringify(good()))).toEqual({ kind: 'saved', state: good() });
  });

  it('★ JSON でない・オブジェクトでない・members が判定を通らない → 理由つきで「読めなかった」(パス 118 までは黙って見本)', () => {
    expect(readStoredTeamRadar('{壊れた')).toEqual({ kind: 'unreadable', reason: 'JSON として読めません' });
    for (const raw of ['42', 'null', '"x"', '[]']) {
      expect(readStoredTeamRadar(raw), raw).toEqual({ kind: 'unreadable', reason: 'オブジェクトではありません' });
    }
    expect(readStoredTeamRadar(JSON.stringify({ ...good(), members: [{ id: 'BAD' }] }))).toEqual({
      kind: 'unreadable',
      reason: 'member id is invalid: BAD',
    });
    expect(readStoredTeamRadar(JSON.stringify({ ...good(), members: 'x' }))).toEqual({ kind: 'unreadable', reason: 'members must be an array' });
  });

  it('department / evaluatedAt は空なら既定に倒し、長ければ切る (読む側は寛容・書く側は断る)', () => {
    const out = readStoredTeamRadar(JSON.stringify({ department: '', evaluatedAt: '', members: [] }));
    expect(out.kind).toBe('saved');
    if (out.kind !== 'saved') return;
    expect(out.state.department).toBe('営業部');
    expect(out.state.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const long = readStoredTeamRadar(JSON.stringify({ department: 'x'.repeat(80), evaluatedAt: 'y'.repeat(40), members: [] }));
    expect(long.kind === 'saved' && long.state.department).toHaveLength(64);
    expect(long.kind === 'saved' && long.state.evaluatedAt).toHaveLength(32);
    // members が無ければ空として読む。
    const none = readStoredTeamRadar(JSON.stringify({ department: 'X', evaluatedAt: '2026-01-01' }));
    expect(none.kind === 'saved' && none.state.members).toEqual([]);
  });
});

describe('buildTeamRadarSnapshot — 両ビルドの fetchSnapshot が同じ形を返す', () => {
  it('★ 保存した状態: 固定 5 軸 + 取得時刻、isMock=false・stored=saved (利用者の物を「同梱データ」と言わない)', () => {
    const snap = buildTeamRadarSnapshot({ kind: 'saved', state: good() });
    expect(snap).toEqual({
      ...good(),
      axes: CANONICAL_AXES,
      fetchedAt: '2035-04-15T00:00:00.000Z',
      isMock: false,
      stored: 'saved',
      storedNote: null,
    });
    expect(Object.keys(snap).sort()).toEqual(Object.keys(DEFAULT_TEAM_RADAR).sort());
  });

  it('まだ無い: 見本を isMock=true・stored=none で返す', () => {
    const snap = buildTeamRadarSnapshot({ kind: 'none' });
    expect(snap).toEqual({ ...DEFAULT_TEAM_RADAR, fetchedAt: '2035-04-15T00:00:00.000Z' });
    expect(snap.isMock).toBe(true);
    expect(snap.stored).toBe('none');
    expect(snap.storedNote).toBeNull();
  });

  it('★ 読めなかった: 見本を返しつつ、理由つきの 1 行で言う (黙って見本に化けない)', () => {
    const snap = buildTeamRadarSnapshot({ kind: 'unreadable', reason: 'JSON として読めません' });
    expect(snap.members).toBe(DEFAULT_TEAM_RADAR_STATE.members);
    expect(snap.isMock).toBe(true);
    expect(snap.stored).toBe('unreadable');
    expect(snap.storedNote).toBe(unreadableTeamRadarNote('JSON として読めません'));
    expect(unreadableTeamRadarNote('X')).toBe(
      '保存したチームの状態を読めませんでした (X)。見本を表示しています。「チーム情報を保存」を押すと画面の内容で上書きされ、元の保存値は戻りません。',
    );
  });

  it('見本は 3 人の営業部 (基準の絵に合わせた物) で、鍵は台帳の 1 つ', () => {
    expect(DEFAULT_TEAM_RADAR_STATE.members).toHaveLength(3);
    expect(DEFAULT_TEAM_RADAR.department).toBe('営業部');
    expect(TEAM_RADAR_STORAGE_KEY).toBe('teamradar.state');
  });
});
