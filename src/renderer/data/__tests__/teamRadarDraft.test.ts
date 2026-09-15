import { describe, expect, it } from 'vitest';
import { sanitizeRadarDraft, sanitizeTeamMember, type RadarDraft } from '../teamRadarDraft';

/*
 * Team Radar の下書き (localStorage) は `as RadarDraft` で信じられていた。members が配列でないと
 * `.map` で、axes が「軸の数と同じ長さの文字列」だと配列扱いの所で落ちる。標本と対照を留める。
 */
describe('sanitizeRadarDraft', () => {
  it('★ 標本: 型の違う欄は捨てる (members が文字列・axes が同じ長さの文字列・title が数値)', () => {
    expect(sanitizeRadarDraft({ members: 'nope', axes: 'abcde', title: 3, department: null, evaluatedAt: 2026 })).toEqual({});
  });
  it('★ 標本: 要素単位で捨てる — null のメンバー、点が数でない箇所は 0、付箋は軸番号→文字列だけ', () => {
    const got = sanitizeRadarDraft({
      axes: ['a', 1, 'b', null],
      members: [
        null,
        { id: 'm1', name: '山田', scores: [3, 'x', NaN, null, 5], notes: { 0: 'ok', x: 'bad', 1: 5, '-1': 'neg' } },
        { id: 7, name: '佐藤', scores: [1] },
        { id: 'm3', name: '鈴木', scores: 'not-array' },
      ],
    });
    expect(got).toEqual({ axes: ['a', 'b'], members: [{ id: 'm1', name: '山田', scores: [3, 0, 0, 0, 5], notes: { 0: 'ok' } }] });
  });
  it('対照: 合う下書きはそのまま往復する', () => {
    const draft: RadarDraft = {
      title: '営業チーム',
      axes: ['営業力', '顧客対応力'],
      department: '営業部',
      evaluatedAt: '2026-09-05',
      members: [{ id: 'm1', name: '山田', scores: [4, 5], notes: { 1: '良い' } }],
    };
    expect(sanitizeRadarDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
  it('対照: オブジェクトでなければ空 (下書きなし)', () => {
    for (const bad of [null, 'x', 42, ['a']]) expect(sanitizeRadarDraft(bad), String(bad)).toEqual({});
    expect(sanitizeTeamMember('x')).toBeNull();
  });
});
