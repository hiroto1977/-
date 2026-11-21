import { describe, expect, it } from 'vitest';
import { MAX_DISPLAY_FIELD_CHARS } from '../../../shared/apiResponse';
import { arrayOf, chatMessages, isRecord, storedLabel, storedTrue, stringRecord, type ChatFieldReaders } from '../persistedShape';

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
  const READERS: ChatFieldReaders<Msg> = { routedThrough: storedLabel };

  it('★ role が許した値で text が文字列の要素だけ。追加の欄は読み手が読めた物だけを持ち込む', () => {
    const got = chatMessages<Msg>(
      [
        { role: 'user', text: 'こんにちは' },
        null,
        'str',
        { role: 'admin', text: 'x' },
        { role: 'user', text: 5 },
        // 非文字列の role —— 許可リストとの一致だけで落ちる (型の検査を別に置かない理由・実装の注記)
        { role: 42, text: 'x' },
        { role: null, text: 'x' },
        { role: ['user'], text: 'x' },
        { role: { user: 1 }, text: 'x' },
        { text: 'role が無い' },
        { role: 'bot', text: '返答', routedThrough: 'ollama' },
      ],
      ['user', 'bot'],
      50,
      READERS,
    );
    expect(got).toEqual([
      { role: 'user', text: 'こんにちは' },
      { role: 'bot', text: '返答', routedThrough: 'ollama' },
    ]);
  });

  it('★ 読めない欄は**その欄だけ**を落とし、行は残す (1 つの欄のせいで会話の 1 件を消さない · パス 489)', () => {
    // 直す前は「通った要素は追加の欄ごとそのまま」で、物がそのまま画面の子へ届き、
    // 部品ごと落ちた (浮いた部品ではアプリ全体が白くなった —— 実測)。
    for (const bad of [{ a: 1 }, ['x'], 42, true, null, '', '   ']) {
      const got = chatMessages<Msg>([{ role: 'bot', text: '返答', routedThrough: bad }], ['user', 'bot'], 50, READERS);
      expect(got, JSON.stringify(bad)).toEqual([{ role: 'bot', text: '返答' }]);
      expect(Object.hasOwn(got[0]!, 'routedThrough'), JSON.stringify(bad)).toBe(false);
    }
  });

  it('★ 返すのは新しく組んだ物 —— 読み手に無い欄は持ち込まない (次の版が描き始めた欄を、検めないまま通さない)', () => {
    const stored = JSON.parse('[{"role":"bot","text":"t","evil":{"a":1},"__proto__":{"polluted":1},"routedThrough":"r"}]');
    const got = chatMessages<Msg>(stored, ['user', 'bot'], 50, READERS);
    expect(got).toEqual([{ role: 'bot', text: 't', routedThrough: 'r' }]);
    expect(Object.keys(got[0]!)).toEqual(['role', 'text', 'routedThrough']);
    expect(got[0]).not.toBe(stored[0]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('★ 読み手は「欄が在るとき」だけ呼ぶ (無い欄に既定値を生やさない)', () => {
    let calls = 0;
    const counting: ChatFieldReaders<Msg> = { routedThrough: (v) => { calls += 1; return storedLabel(v); } };
    const got = chatMessages<Msg>([{ role: 'user', text: 'a' }, { role: 'bot', text: 'b', routedThrough: 'r' }], ['user', 'bot'], 50, counting);
    expect(calls).toBe(1);
    expect(got).toEqual([{ role: 'user', text: 'a' }, { role: 'bot', text: 'b', routedThrough: 'r' }]);
  });

  it('対照: 末尾 max 件だけ残し、配列でなければ空', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }));
    expect(chatMessages<Msg>(many, ['user', 'bot'], 2, READERS).map((m) => m.text)).toEqual(['m3', 'm4']);
    expect(chatMessages<Msg>({ role: 'user', text: 'x' }, ['user', 'bot'], 2, READERS)).toEqual([]);
  });

  it('★ 型が全部の欄に読み手を要求する (1 つ書き忘れると tsc が落ちる)', () => {
    interface Two { readonly role: 'u'; readonly text: string; readonly a?: string; readonly b?: true }
    // @ts-expect-error —— `b` の読み手を書き忘れている (ChatFieldReaders の `-?` が要求する)
    const missing: ChatFieldReaders<Two> = { a: storedLabel };
    const full: ChatFieldReaders<Two> = { a: storedLabel, b: storedTrue };
    expect(Object.keys(missing)).toEqual(['a']);
    expect(Object.keys(full)).toEqual(['a', 'b']);
  });
});

describe('storedLabel / storedTrue (パス 489)', () => {
  it('★ 札は文字列だけ・空白だけは読めない・長さは displayField の天井で切る', () => {
    expect(storedLabel('Claude (Anthropic)')).toBe('Claude (Anthropic)');
    for (const bad of [{ a: 1 }, ['x'], 42, true, null, undefined, '', '  \n ']) expect(storedLabel(bad), String(bad)).toBeUndefined();
    const long = 'あ'.repeat(MAX_DISPLAY_FIELD_CHARS + 50);
    expect(storedLabel(long)).toBe(`${'あ'.repeat(MAX_DISPLAY_FIELD_CHARS)}…`);
    expect(storedLabel('あ'.repeat(MAX_DISPLAY_FIELD_CHARS))).toBe('あ'.repeat(MAX_DISPLAY_FIELD_CHARS));
  });

  it('★ 印は true だけ (真に見える値を「オフライン」と名乗らせない)', () => {
    expect(storedTrue(true)).toBe(true);
    for (const v of [false, 1, 'true', {}, [], null, undefined]) expect(storedTrue(v), String(v)).toBeUndefined();
  });
});
