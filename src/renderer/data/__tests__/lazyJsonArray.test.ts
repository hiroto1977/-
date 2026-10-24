import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyJsonArray } from '../lazyJsonArray';

/*
 * lazyJsonArray — 起動時に 8MB の JSON.parse を走らせないための遅延ビュー。
 * 「配列として透過的に振る舞う」ことと「触るまでパースしない」ことの両方が
 * 崩れると、静かに (a) 実行時エラー or (b) 最適化の消失 になるので両方固定する。
 */
type Row = { id: string; n: number };
const ROWS: Row[] = [
  { id: 'a', n: 1 },
  { id: 'b', n: 2 },
  { id: 'c', n: 3 },
];
const JSON_TEXT = JSON.stringify(ROWS);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lazyJsonArray — 遅延とキャッシュ', () => {
  it('生成しただけでは JSON.parse を呼ばない', () => {
    const spy = vi.spyOn(JSON, 'parse');
    lazyJsonArray<Row>(JSON_TEXT);
    expect(spy).not.toHaveBeenCalled();
  });

  it('最初のプロパティアクセスでパースする', () => {
    const spy = vi.spyOn(JSON, 'parse');
    const view = lazyJsonArray<Row>(JSON_TEXT);
    expect(spy).not.toHaveBeenCalled();
    expect(view.length).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('2 回目以降はパースし直さない (結果を保持する)', () => {
    const view = lazyJsonArray<Row>(JSON_TEXT);
    expect(view.length).toBe(3); // ここでパース
    const spy = vi.spyOn(JSON, 'parse');
    expect(view[0]?.id).toBe('a');
    expect([...view]).toHaveLength(3);
    expect(view.filter((r) => r.n > 1)).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('lazyJsonArray — 配列としての透過性', () => {
  const view = lazyJsonArray<Row>(JSON_TEXT);

  it('Array.isArray が true', () => {
    expect(Array.isArray(view)).toBe(true);
  });

  it('length と添字アクセス', () => {
    expect(view.length).toBe(3);
    expect(view[0]).toEqual({ id: 'a', n: 1 });
    expect(view[2]).toEqual({ id: 'c', n: 3 });
    expect(view[3]).toBeUndefined();
  });

  it('for...of で反復できる (消費側の主要な使い方)', () => {
    const ids: string[] = [];
    for (const r of view) ids.push(r.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('スプレッドと Array.from', () => {
    expect([...view].map((r) => r.n)).toEqual([1, 2, 3]);
    expect(Array.from(view)).toHaveLength(3);
  });

  it('find / filter / map / some / reduce', () => {
    expect(view.find((r) => r.id === 'b')).toEqual({ id: 'b', n: 2 });
    expect(view.filter((r) => r.n >= 2).map((r) => r.id)).toEqual(['b', 'c']);
    expect(view.some((r) => r.n === 3)).toBe(true);
    expect(view.reduce((acc, r) => acc + r.n, 0)).toBe(6);
  });

  it('in 演算子・Object.keys・JSON.stringify', () => {
    expect(0 in view).toBe(true);
    expect(9 in view).toBe(false);
    expect(Object.keys(view)).toEqual(['0', '1', '2']);
    expect(JSON.parse(JSON.stringify(view))).toEqual(ROWS);
  });

  it('読み取り専用: 書き込みと削除は失敗する', () => {
    // Proxy の set/deleteProperty が false を返す → strict mode で TypeError。
    // テストファイルは ESM = strict なので throw を期待できる。
    expect(() => {
      (view as Row[])[0] = { id: 'x', n: 9 };
    }).toThrow(TypeError);
    expect(() => {
      delete (view as Row[])[0];
    }).toThrow(TypeError);
    expect(view[0]?.id).toBe('a');
  });

  it('空配列でも成立する', () => {
    const empty = lazyJsonArray<Row>('[]');
    expect(empty.length).toBe(0);
    expect([...empty]).toEqual([]);
    expect(Array.isArray(empty)).toBe(true);
  });

  it('不正な JSON は最初のアクセス時に throw する (生成時ではない)', () => {
    const broken = lazyJsonArray<Row>('{not json');
    expect(() => broken.length).toThrow();
  });
});
