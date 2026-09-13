/**
 * 人材育成の保存先の読み込み —— 「保存した」「まだ無い」「読めなかった」を混ぜず、読み込みで
 * 落とした項目を言う (2026-09-09 · パス 121。チームレーダーのパス 120 と同じ形)。
 *
 * それまで main は「初回起動と壊れたファイルを区別しても画面ですることが同じ」として空を返し、
 * ブラウザ版も「区別しても画面ですることは同じ」と注記して空で続けていた。同じではない ——
 * 壊れた保存では申告・施策・メンバーが消えており、次の保存で空に上書きされる。
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_TALENT_STATE,
  MAX_DEPT_REPORTS,
  MAX_INITIATIVES,
  MAX_LADDER_MEMBERS,
  SAVED_PROVENANCE,
  buildTalentSnapshot,
  describeDroppedEntries,
  describeUnreadEntries,
  readStoredTalent,
  talentProvenance,
  unreadableTalentNote,
} from '../talent';

const good = () => ({
  reports: [{ department: '営業', diseases: ['imprint'] }],
  initiatives: [{ name: '広告の入れ替え', probability: 40 }],
  members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 9 }],
  updatedAt: '2026-09-09',
});

describe('readStoredTalent — 3 つの状態を混ぜない', () => {
  it('null (鍵が無い) は「まだ無い」', () => {
    expect(readStoredTalent(null)).toEqual({ kind: 'none' });
  });

  it('保存した状態を読む (落とした物は無い)', () => {
    expect(readStoredTalent(JSON.stringify(good()))).toEqual({ kind: 'saved', state: good(), dropped: null });
  });

  it('★ JSON でない・オブジェクトでない → 理由つきで「読めなかった」(パス 121 までは黙って空)', () => {
    expect(readStoredTalent('{壊れた')).toEqual({ kind: 'unreadable', reason: 'JSON として読めません' });
    for (const raw of ['42', 'null', '"x"', '[]']) {
      expect(readStoredTalent(raw), raw).toEqual({ kind: 'unreadable', reason: 'オブジェクトではありません' });
    }
  });

  it('★ 一覧の欄が在るのに配列でなければ「読めなかった」(欄が無いのは古い版 = 空として読む)', () => {
    expect(readStoredTalent(JSON.stringify({ ...good(), members: 'x' }))).toEqual({ kind: 'unreadable', reason: 'members が配列ではありません' });
    expect(readStoredTalent(JSON.stringify({ ...good(), reports: 1 }))).toEqual({ kind: 'unreadable', reason: 'reports が配列ではありません' });
    expect(readStoredTalent(JSON.stringify({ ...good(), initiatives: {} }))).toEqual({ kind: 'unreadable', reason: 'initiatives が配列ではありません' });
    const old = readStoredTalent(JSON.stringify({ updatedAt: '2026-01-01' }));
    expect(old).toEqual({ kind: 'saved', state: { reports: [], initiatives: [], members: [], updatedAt: '2026-01-01' }, dropped: null });
  });

  it('★ 読み込みで落とした項目は saved のまま件数を言う (パス 89 は保存側だけだった)', () => {
    const raw = JSON.stringify({
      ...good(),
      members: [
        { id: 'm1', name: '山田', step: 1, yearsInStep: 61 },
        { id: 'm2', name: '佐藤', step: 2, yearsInStep: 1 },
      ],
      initiatives: [{ name: 'bad', probability: 999 }],
    });
    const r = readStoredTalent(raw);
    expect(r.kind).toBe('saved');
    if (r.kind !== 'saved') return;
    expect(r.state.members.map((m) => m.id)).toEqual(['m2']);
    expect(r.state.initiatives).toEqual([]);
    expect(r.dropped).toBe(
      '施策 1 件 (上限 200 件) / メンバー 1 件 (上限 500 件) は読み込みで落としました (形式が合わないか、上限を超えています)。このまま保存すると、これらは失われます。',
    );
  });

  it('上限超過も件数に入る', () => {
    const many = Array.from({ length: MAX_LADDER_MEMBERS + 2 }, (_, i) => ({ id: `m${i}`, name: 'x', step: 1, yearsInStep: 1 }));
    const r = readStoredTalent(JSON.stringify({ ...good(), members: many }));
    expect(r.kind === 'saved' && r.state.members).toHaveLength(MAX_LADDER_MEMBERS);
    expect(r.kind === 'saved' && r.dropped).toContain(`メンバー 2 件 (上限 ${MAX_LADDER_MEMBERS} 件)`);
  });
});

describe('describeUnreadEntries / describeDroppedEntries — 同じ数え方・違う文', () => {
  const sent = { reports: 3, initiatives: 2, members: 5 };

  it('落ちた物が無ければ null', () => {
    expect(describeUnreadEntries(sent, sent)).toBeNull();
    expect(describeDroppedEntries(sent, sent)).toBeNull();
  });

  it('欄ごとの件数と上限を挙げ、読み込み側は「失われます」と言う', () => {
    const kept = { reports: 2, initiatives: 2, members: 3 };
    expect(describeUnreadEntries(sent, kept)).toBe(
      `部署の申告 1 件 (上限 ${MAX_DEPT_REPORTS} 件) / メンバー 2 件 (上限 ${MAX_LADDER_MEMBERS} 件) は読み込みで落としました (形式が合わないか、上限を超えています)。このまま保存すると、これらは失われます。`,
    );
    expect(describeDroppedEntries(sent, kept)).toBe(
      `部署の申告 1 件 (上限 ${MAX_DEPT_REPORTS} 件) / メンバー 2 件 (上限 ${MAX_LADDER_MEMBERS} 件) は保存されませんでした。入力の形式が合わないか、上限を超えています。`,
    );
    expect(describeUnreadEntries({ ...sent, initiatives: 9 }, { ...sent, initiatives: 8 })).toContain(`施策 1 件 (上限 ${MAX_INITIATIVES} 件)`);
  });
});

describe('talentProvenance / buildTalentSnapshot — 状態と由来', () => {
  it('saved: 状態そのもの・注記は落とした件数 (無ければ null)', () => {
    expect(talentProvenance({ kind: 'saved', state: good(), dropped: null })).toEqual({
      state: good(),
      provenance: { stored: 'saved', storedNote: null },
    });
    expect(talentProvenance({ kind: 'saved', state: good(), dropped: 'X' })).toEqual({
      state: good(),
      provenance: { stored: 'saved', storedNote: 'X' },
    });
  });

  it('none: 空・注記なし', () => {
    expect(talentProvenance({ kind: 'none' })).toEqual({ state: EMPTY_TALENT_STATE, provenance: { stored: 'none', storedNote: null } });
  });

  it('★ unreadable: 空 + 理由つきの注記 (黙って空にしない)', () => {
    const out = talentProvenance({ kind: 'unreadable', reason: 'JSON として読めません' });
    expect(out.state).toBe(EMPTY_TALENT_STATE);
    expect(out.provenance).toEqual({ stored: 'unreadable', storedNote: unreadableTalentNote('JSON として読めません') });
    expect(unreadableTalentNote('X')).toBe(
      '保存した人材育成の状態を読めませんでした (X)。空の状態を表示しています。このまま保存すると空で上書きされ、元の保存値は戻りません。',
    );
  });

  it('buildTalentSnapshot は由来を持ち、既定は saved・注記なし', () => {
    const plain = buildTalentSnapshot(good());
    expect(plain.stored).toBe('saved');
    expect(plain.storedNote).toBeNull();
    expect(SAVED_PROVENANCE).toEqual({ stored: 'saved', storedNote: null });
    const un = buildTalentSnapshot(EMPTY_TALENT_STATE, { stored: 'unreadable', storedNote: 'N' });
    expect(un.stored).toBe('unreadable');
    expect(un.storedNote).toBe('N');
    expect(un.diagnosis.reportedDepartments).toBe(0);
  });
});
