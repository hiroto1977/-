/**
 * 読み込みで落とした**部署の申告**も件数を言う (パス 502)。
 *
 * `readStoredTalent` は保存値の 3 つの一覧 (申告・施策・メンバー) について「読み込み前の件数」と
 * 「`sanitizeTalentState` を通した後の件数」を比べ、落ちた物を画面の注記にする。
 * 既存の検査 (`talentStored.test.ts`) は**施策とメンバー**が落ちる入力しか与えておらず、
 * 申告の件数を数える行 (`count('reports')`) を別の欄名にしても緑だった —— 申告が落ちても
 * 注記が出ず、次の保存で黙って失われる。
 */
import { describe, expect, it } from 'vitest';
import { readStoredTalent } from '../talent';

const REPORT_OK = { department: '営業', diseases: ['imprint'] };
const FOOTER = ' は読み込みで落としました。このまま保存すると、これらは失われます。';

describe('readStoredTalent — 落とした申告の件数', () => {
  it('部署名が空の申告は落ち、注記は「部署の申告 1 件 (部署名は 1〜64 文字)」だけ (施策・メンバーには触れない)', () => {
    const raw = JSON.stringify({
      reports: [REPORT_OK, { department: '', diseases: [] }],
      initiatives: [],
      members: [],
      updatedAt: '2026-09-09',
    });
    expect(readStoredTalent(raw)).toEqual({
      kind: 'saved',
      state: { reports: [REPORT_OK], initiatives: [], members: [], updatedAt: '2026-09-09' },
      dropped: `部署の申告 1 件 (部署名は 1〜64 文字)${FOOTER}`,
    });
  });

  it('3 つの一覧がすべて落ちたら、申告 → 施策 → メンバーの順に「 / 」で並べる', () => {
    const raw = JSON.stringify({
      reports: [{ department: '', diseases: [] }],
      initiatives: [{ name: 'bad', probability: 999 }],
      members: [{ id: 'm1', name: '山田', step: 1, yearsInStep: 61 }],
      updatedAt: '2026-09-09',
    });
    const r = readStoredTalent(raw);
    expect(r.kind === 'saved' && r.dropped).toBe(
      '部署の申告 1 件 (部署名は 1〜64 文字)' +
        ' / 施策 1 件 (施策名は 1〜128 文字・達成確率は 0〜100)' +
        ' / メンバー 1 件 (氏名は 1〜64 文字・STEP は 1〜4・滞留年数は 0〜60)' +
        FOOTER,
    );
  });
});
