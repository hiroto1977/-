/** @vitest-environment jsdom */
/**
 * 書き込みの成否 (`data/localWrite.ts`)。**投げない**こと、**理由で文面が分かれる**こと、
 * 成功したときは**実際に入っている**ことを見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeLocalJson, writeLocalString } from '../localWrite';

/**
 * **`Storage.prototype` に挿す。** jsdom の `setItem` は実体 (`window.localStorage`) の
 * 自前プロパティではなくプロトタイプ側に在るので、実体へ spy を挿しても素通りする ——
 * 最初そう書いて、`ok: true` が返り「守りが無い」と読み違えかけた (2026-09-06 実測)。
 */
const throwOnSet = (err: unknown) =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw err;
  });

const named = (name: string) => {
  const e = new Error(name);
  e.name = name;
  return e;
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('writeLocalJson', () => {
  it('成功したら ok で、値が実際に入っている (書けたことの検査)', () => {
    expect(writeLocalJson('k', { a: 1 })).toEqual({ ok: true });
    expect(localStorage.getItem('k')).toBe('{"a":1}');
  });

  it('★ 容量超過は投げずに ok:false、文面は容量と打ち手を言う', () => {
    throwOnSet(named('QuotaExceededError'));
    const r = writeLocalJson('k', { a: 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('保存領域が一杯');
    expect(r.ok === false && r.message).toContain('控え');
  });

  it('★ Firefox の名前 (NS_ERROR_DOM_QUOTA_REACHED) も容量として扱う', () => {
    throwOnSet(named('NS_ERROR_DOM_QUOTA_REACHED'));
    const r = writeLocalJson('k', { a: 1 });
    expect(r.ok === false && r.message).toContain('保存領域が一杯');
  });

  it('★ プライベートモード (SecurityError) は別の文面', () => {
    throwOnSet(named('SecurityError'));
    const r = writeLocalJson('k', { a: 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('プライベートモード');
    expect(r.ok === false && r.message).toContain('通常のウィンドウ'); // 打ち手まで出す
    expect(r.ok === false && r.message).not.toContain('保存領域が一杯');
  });

  it('その他の失敗は理由を出す。Error でない物を投げる実装でも落ちない', () => {
    throwOnSet(named('InvalidStateError'));
    expect(writeLocalJson('k', 1)).toEqual({ ok: false, message: '端末に保存できませんでした (InvalidStateError)。控えを取ってください。' });
    throwOnSet('文字列を投げる実装');
    const r = writeLocalJson('k', 1);
    expect(r.ok === false && r.message).toContain('文字列を投げる実装');
  });

  it('name が空の Error でも理由の欄が空にならない', () => {
    const blank = new Error('本文');
    blank.name = '';
    throwOnSet(blank);
    const r = writeLocalJson('k', 1);
    expect(r.ok === false && r.message).toContain('(Error)');
  });

  it('Error でない長い値は 60 字で切る (文面が画面を埋めない)', () => {
    throwOnSet('あ'.repeat(200));
    const r = writeLocalJson('k', 1);
    const inner = r.ok === false ? /\((.*)\)/.exec(r.message)?.[1] ?? '' : '';
    expect(inner).toHaveLength(60);
  });

  it('JSON にできない値 (循環参照) も投げずに返す', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const r = writeLocalJson('k', cyclic);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('組み立てられませんでした');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('writeLocalString は文字列をそのまま書く', () => {
    expect(writeLocalString('k', 'plain')).toEqual({ ok: true });
    expect(localStorage.getItem('k')).toBe('plain');
  });
});
