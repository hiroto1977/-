import { describe, expect, it } from 'vitest';
import { arrayOf, chatMessages, isRecord, stringRecord } from '../persistedShape';

/*
 * 端末に残した JSON は型が守らない (2026-09-05、書類スタジオの `kessanSheet: 'foo'` で実際に落ちた)。
 * ここは各画面が「読むたびに形を確かめる」ための小道具。鳴る標本 (形の違う値を落とす) と
 * 通る対照 (合う値はそのまま) を留める。
 */
describe('isRecord', () => {
  it('配列でも null でもないオブジェクトだけ true', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    for (const bad of [[], null, undefined, 'x', 42, true]) expect(isRecord(bad), String(bad)).toBe(false);
  });
});

describe('stringRecord', () => {
  it('★ 文字列の値だけ残す (数値・null・入れ子は落とす)', () => {
    expect(stringRecord({ a: '1', b: 2, c: null, d: 'x', e: { f: 'g' }, g: ['h'] })).toEqual({ a: '1', d: 'x' });
  });
  it('対照: オブジェクトでなければ空、合う辞書はそのまま', () => {
    for (const bad of [[], null, 'x', 42]) expect(stringRecord(bad), String(bad)).toEqual({});
    expect(stringRecord({ company: '株式会社', fyEnd: '2026-03-31' })).toEqual({ company: '株式会社', fyEnd: '2026-03-31' });
  });
});

describe('arrayOf', () => {
  it('★ 配列なら形の合う要素だけ、配列でなければ空', () => {
    const isStr = (v: unknown): v is string => typeof v === 'string';
    expect(arrayOf(['a', 1, null, 'b', undefined], isStr)).toEqual(['a', 'b']);
    for (const bad of ['abc', { 0: 'a', length: 1 }, null, 42]) expect(arrayOf(bad, isStr), String(bad)).toEqual([]);
  });
});

describe('chatMessages', () => {
  interface Msg { readonly role: 'user' | 'bot'; readonly text: string; readonly routedThrough?: string }
  it('★ role が許した値で text が文字列の要素だけ。通った要素は追加の欄ごとそのまま', () => {
    const got = chatMessages<Msg>(
      [
        { role: 'user', text: 'こんにちは' },
        null,
        'str',
        { role: 'admin', text: 'x' },
        { role: 'user', text: 5 },
        { role: 'bot', text: '返答', routedThrough: 'ollama' },
      ],
      ['user', 'bot'],
      50,
    );
    expect(got).toEqual([
      { role: 'user', text: 'こんにちは' },
      { role: 'bot', text: '返答', routedThrough: 'ollama' },
    ]);
  });
  it('対照: 末尾 max 件だけ残し、配列でなければ空', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }));
    expect(chatMessages<Msg>(many, ['user', 'bot'], 2).map((m) => m.text)).toEqual(['m3', 'm4']);
    expect(chatMessages<Msg>({ role: 'user', text: 'x' }, ['user', 'bot'], 2)).toEqual([]);
  });
});
