/**
 * パス 261 — 外部サービスの「成功した」応答を読む規則。
 *
 * 文面は**肯定形で**留める (CLAUDE.md: 有ることの検査は、無ければ必ず鳴る)。
 * 「確認できません」という句は断りの要点なので、全ての断りに在ることを確かめる。
 */
import { describe, expect, it } from 'vitest';
import {
  optionalString,
  optionalStringArray,
  requireArray,
  requireChild,
  requireNumber,
  requireObject,
  requireString,
  readArrayField,
} from '../apiResponse';

const L = 'Svc API';

describe('requireObject', () => {
  it('オブジェクトは通す', () => {
    expect(requireObject({ a: 1 }, L)).toEqual({ a: 1 });
  });
  it.each([['null', null], ['配列', []], ['数値', 12], ['文字列', 'x'], ['真偽値', true], ['undefined', undefined]])(
    '%s は断る',
    (_label, raw) => {
      expect(() => requireObject(raw, L)).toThrow('Svc API の応答が JSON のオブジェクトではありません');
    },
  );
});

describe('requireArray', () => {
  it('空の配列も通す (形は合っている)', () => {
    expect(requireArray([], L)).toEqual([]);
  });
  it.each([['オブジェクト', {}], ['null', null], ['文字列', 'x']])('%s は断る', (_label, raw) => {
    expect(() => requireArray(raw, L)).toThrow('Svc API の応答が JSON の配列ではありません');
  });
});

describe('requireString', () => {
  it('非空の文字列は通す', () => {
    expect(requireString({ id: 'abc' }, 'id', L)).toBe('abc');
  });
  it('★ 空文字は断る —— 欄の抜けた URL は undefined を埋めるのと同じ結果になる', () => {
    expect(() => requireString({ id: '' }, 'id', L)).toThrow('id (非空の文字列)');
  });
  it.each([['数値', 12], ['オブジェクト', {}], ['null', null], ['配列', []], ['未定義', undefined]])(
    '%s は断る',
    (_label, v) => {
      expect(() => requireString({ id: v }, 'id', L)).toThrow('Svc API の応答に id (非空の文字列) がありません');
    },
  );
  it('prototype の鍵は自分の欄として数えない', () => {
    expect(() => requireString({}, 'toString', L)).toThrow('toString (非空の文字列)');
  });
});

describe('requireNumber', () => {
  it('有限の数値は通す (0 も負も)', () => {
    expect(requireNumber({ n: 0 }, 'n', L)).toBe(0);
    expect(requireNumber({ n: -3 }, 'n', L)).toBe(-3);
  });
  it.each([['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['数字の文字列', '12'], ['null', null]])(
    '%s は断る',
    (_label, v) => {
      expect(() => requireNumber({ n: v }, 'n', L)).toThrow('Svc API の応答に n (有限の数値) がありません');
    },
  );
});

describe('requireChild', () => {
  it('入れ子のオブジェクトは通す', () => {
    expect(requireChild({ folder: { id: 'f' } }, 'folder', L)).toEqual({ id: 'f' });
  });
  it.each([['配列', []], ['null', null], ['文字列', 'x'], ['未定義', undefined]])('%s は断る', (_label, v) => {
    expect(() => requireChild({ folder: v }, 'folder', L)).toThrow(
      'Svc API の応答に folder (オブジェクト) がありません',
    );
  });
});

describe('任意の欄は既定値を作らずに落とす', () => {
  it('optionalString', () => {
    expect(optionalString({ s: 'x' }, 's')).toBe('x');
    expect(optionalString({ s: '' }, 's')).toBe('');
    expect(optionalString({ s: 12 }, 's')).toBeUndefined();
    expect(optionalString({}, 's')).toBeUndefined();
  });
  it('optionalStringArray は文字列の要素だけ残す', () => {
    expect(optionalStringArray({ a: ['x', 1, null, 'y'] }, 'a')).toEqual(['x', 'y']);
    expect(optionalStringArray({ a: 'nope' }, 'a')).toEqual([]);
    expect(optionalStringArray({}, 'a')).toEqual([]);
  });
});

describe('★ 断りは必ず「確認できません」と述べる', () => {
  // 標本: 5 つの断りの経路すべてを実際に鳴らし、句が入っていることを見る。
  const refusals: Array<[string, () => unknown]> = [
    ['requireObject', () => requireObject(null, L)],
    ['requireArray', () => requireArray({}, L)],
    ['requireString', () => requireString({}, 'id', L)],
    ['requireNumber', () => requireNumber({}, 'n', L)],
    ['requireChild', () => requireChild({}, 'c', L)],
  ];
  it.each(refusals)('%s', (_name, run) => {
    let message = '';
    try {
      run();
      throw new Error('断るはずの入力が通った — この検査は無意味になっている');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('処理したことを確認できません');
    expect(message).toContain(L);
  });
});

describe('readArrayField — 鍵が在ったのかを一緒に返す (パス 264)', () => {
  it('★ 鍵が在って配列なら read: true (中身は素通し)', () => {
    expect(readArrayField({ value: [1, 2] }, 'value')).toEqual({ rows: [1, 2], read: true });
  });

  it('★ 空の配列も read: true —— 0 件は「答え」である', () => {
    expect(readArrayField({ value: [] }, 'value')).toEqual({ rows: [], read: true });
  });

  it('★ 鍵が無い / 配列でない / 物でない は read: false (件数を言わせない)', () => {
    for (const body of [
      {},
      { other: [] },
      { value: 'x' },
      { value: 42 },
      { value: null },
      null,
      undefined,
      42,
      'nope',
      [1, 2],
    ] as unknown[]) {
      expect(readArrayField(body, 'value'), JSON.stringify(body) ?? 'undefined').toEqual({
        rows: [],
        read: false,
      });
    }
  });

  it('★ prototype の鍵は拾わない (Object.hasOwn ではなく Array.isArray で落ちる)', () => {
    expect(readArrayField({}, 'constructor').read).toBe(false);
    expect(readArrayField({}, 'toString').read).toBe(false);
  });
});
