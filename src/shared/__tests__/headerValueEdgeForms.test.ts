/**
 * **ヘッダ値の関門の端の形を値で留める** (2026-09-30 · パス 502)。
 *
 * `normalizeHeaderValue` は端の見張り (`start < end` / `end > start`) を持たず、`isHeaderValue` は
 * 添字でなく 1 文字ずつ回す。どちらも**結果の変わらない比較を消した形**で、同じ答えを返すことは
 * `headerValue.test.ts` の実物の `new Headers()` との突き合わせが見ている。ここは、その形を
 * 支えている前提 —— 範囲の外の読み (NaN) が何も落とさない・`slice` は逆転した範囲で空になる —— と、
 * 既存の標本に無かった形 (孤立サロゲート・空白 1 種類だけ) を留める。
 */
import { describe, expect, it } from 'vitest';
import { isHeaderValue, normalizeHeaderValue } from '../headerValue';

const TAB = String.fromCharCode(0x09);
const LF = String.fromCharCode(0x0a);
const CR = String.fromCharCode(0x0d);
const NBSP = String.fromCharCode(0xa0);

describe('isHeaderValue — 1 文字ずつ見ても、サロゲートは先頭の単位で弾く', () => {
  it.each([
    ['孤立した上位サロゲート', 'ok' + String.fromCharCode(0xd800)],
    ['孤立した下位サロゲート', 'ok' + String.fromCharCode(0xdc00)],
    ['対が壊れた (上位だけ・末尾)', 'ok' + String.fromCharCode(0xd83d)],
    ['対 (絵文字)', 'ok' + String.fromCodePoint(0x1f600)],
    ['先頭が絵文字', String.fromCodePoint(0x1f600) + 'ok'],
  ])('★ %s は弾く (new Headers() も投げる)', (_label, value) => {
    expect(() => new Headers({ 'x-test': value })).toThrow();
    expect(isHeaderValue(value)).toBe(false);
  });

  it('対照: Latin1 だけの値は通り、最後の字まで見る (末尾の NUL を見落とさない)', () => {
    expect(isHeaderValue('abc')).toBe(true);
    expect(isHeaderValue('abc' + String.fromCharCode(0x00))).toBe(false);
  });
});

describe('normalizeHeaderValue — 端の見張りが無くても、全部が空白なら空・混じれば中身だけ', () => {
  it.each([
    ['空白 1 つ', ' '],
    ['TAB だけ', TAB],
    ['LF だけ', LF],
    ['CR だけ', CR],
    ['4 種の連なり', ' ' + TAB + CR + LF + ' '],
  ])('★ %s だけなら空文字', (_label, value) => {
    expect(normalizeHeaderValue(value)).toBe('');
  });

  it('★ NBSP だけは落とさない (Headers が保つ Latin1 の空白)', () => {
    expect(normalizeHeaderValue(NBSP)).toBe(NBSP);
    expect(normalizeHeaderValue(' ' + NBSP + ' ')).toBe(NBSP);
  });

  it.each([
    ['前だけ', ' ' + TAB + 'a', 'a'],
    ['後ろだけ', 'a' + CR + LF + ' ', 'a'],
    ['両端・中に空白', ' a' + TAB + 'b ', 'a' + TAB + 'b'],
    ['1 文字', 'a', 'a'],
  ])('★ %s', (_label, value, expected) => {
    expect(normalizeHeaderValue(value)).toBe(expected);
  });
});
