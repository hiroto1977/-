/**
 * `sameRecordData` —— 「欄を開いた時の中身のままか」の判定 (2026-09-27 · パス 499)。
 *
 * 誤りの向きは非対称である (本体の docblock の表)。**違う物を「同じ」と言うと別のタブの
 * 書き換えを黙って上書きする**ので、そちらの向きは 1 つずつ標本で留める。逆向き
 * (同じ物を「違う」と言う) は 2 度押せば通るが、**保管層から読んだ物で起きると
 * その行は永久に保存できない**ので、そこは母集団 (全 collection の標本) で留める。
 */
import { describe, expect, it } from 'vitest';
import { sameRecordData } from '../sameRecordData';
import { SAMPLES } from './collectionSamples';

describe('sameRecordData —— 保管層から読んだ物は、その複製と必ず「同じ」', () => {
  it('★ 全 collection の標本が、structured clone と「同じ」 (永久に保存できない行を作らない)', () => {
    const names = Object.keys(SAMPLES);
    // 走査が空虚でない (標本の台帳が消えれば鳴る)。
    expect(names.length).toBeGreaterThanOrEqual(20);
    for (const name of names) {
      const good = SAMPLES[name]!.good;
      expect(sameRecordData(good, structuredClone(good)), name).toBe(true);
    }
  });

  it('★ NaN を持つ行も自分自身とは「同じ」 (=== で比べると永久に断る)', () => {
    const row = { amount: Number.NaN, nested: [Number.NaN] };
    expect(sameRecordData(row, structuredClone(row))).toBe(true);
    // 対照: 素の等号はこの行を自分自身と違うと言う —— だから Object.is で比べる。
    expect(row.amount === structuredClone(row).amount).toBe(false);
  });

  it('鍵の順序は見ない (同じ中身を別の順で書いた行は「同じ」)', () => {
    expect(sameRecordData({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it('Object.create(null) の行も素のオブジェクトとして比べる', () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(sameRecordData(bare, { a: 1 })).toBe(true);
    expect(sameRecordData({ a: 1 }, bare)).toBe(true);
  });
});

describe('sameRecordData —— 違う物を「同じ」と言わない (こちらを誤ると上書きする)', () => {
  const CASES: readonly (readonly [string, unknown, unknown])[] = [
    ['素の値が違う', { valuation: 300000 }, { valuation: 500000 }],
    ['文字列が違う', { name: 'A' }, { name: 'B' }],
    ['型が違う (数と文字列)', { units: 1 }, { units: '1' }],
    ['null と 0', { cost: null }, { cost: 0 }],
    ['null と未定義', { cost: null }, { cost: undefined }],
    ['鍵が 1 つ多い', { a: 1 }, { a: 1, b: 2 }],
    ['鍵が 1 つ少ない', { a: 1, b: 2 }, { a: 1 }],
    ['同じ数の鍵で名前が違う', { a: 1 }, { b: 1 }],
    ['値が undefined の鍵と、鍵が無いこと', { a: undefined }, {}],
    ['入れ子の値が違う', { x: { y: 1 } }, { x: { y: 2 } }],
    ['配列の長さが違う', { xs: [1, 2] }, { xs: [1, 2, 3] }],
    ['配列の要素が違う', { xs: [1, 2] }, { xs: [1, 3] }],
    ['配列の順序が違う', { xs: [1, 2] }, { xs: [2, 1] }],
    ['配列と、同じ鍵のオブジェクト', { xs: [1] }, { xs: { 0: 1 } }],
    ['オブジェクトと、同じ鍵の配列', { xs: { 0: 1 } }, { xs: [1] }],
    ['オブジェクトと null', { x: {} }, { x: null }],
    ['null とオブジェクト', { x: null }, { x: {} }],
    ['0 と -0', { x: 0 }, { x: -0 }],
    ['日時の違う Date (鍵の集合では同じに見える)', { at: new Date(0) }, { at: new Date(1) }],
  ];
  for (const [label, a, b] of CASES) {
    it(`${label} → 違う`, () => {
      expect(sameRecordData(a, b)).toBe(false);
    });
  }

  it('★ 素のオブジェクトでない物は、同じ中身に見えても「違う」へ倒す (保管層の約束の外)', () => {
    // 鍵を持たない Date 2 つは鍵の集合で比べると「同じ」になる —— 日時が同じでも倒すのは、
    // 約束の外の値を「同じ」と言う道を 1 つも残さないため。
    expect(sameRecordData({ at: new Date(5) }, { at: new Date(5) })).toBe(false);
    expect(sameRecordData(new Map([[1, 2]]), new Map([[1, 2]]))).toBe(false);
    // 同じ実体そのものは「同じ」(Object.is)。
    const d = new Date(5);
    expect(sameRecordData({ at: d }, { at: d })).toBe(true);
  });

  it('基準が素のオブジェクトでなければ「違う」 (書かずに changed へ倒れる安全な向き)', () => {
    expect(sameRecordData({ a: 1 }, undefined)).toBe(false);
    expect(sameRecordData({ a: 1 }, null)).toBe(false);
    expect(sameRecordData({ a: 1 }, 'a')).toBe(false);
    expect(sameRecordData(undefined, { a: 1 })).toBe(false);
  });
});
