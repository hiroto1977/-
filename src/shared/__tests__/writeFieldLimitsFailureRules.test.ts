/**
 * **`checkShopifyLineItems` / `checkWriteInteger` が返す断りの「規則」と、数でない値の扱いを値ごとに留める。**
 * (2026-09-30 · パス 502)
 *
 * 変異検査の全掃引 (#179) が `shared/writeFieldLimits.ts` に残した生存のうち、
 * モジュール直下の値 (static・別に扱う) を除く 4 件の仕分け:
 *
 * | 行 | 変異 | 仕分け |
 * | --- | --- | --- |
 * | 243 | 件数超過の断りが名乗る規則の `required: false` → `true` | **本物の穴** —— 断りは `rule` を載せて返すのに、`rule` の中身を留める検査が無かった (`maxItems` だけを見ていた) |
 * | 261 | `quantity` の断りが名乗る規則の `required: true` → `false` | 同上 |
 * | 260 | `typeof item.quantity !== 'number'` を偽にする | **等価** —— `Number.isFinite` は数でない値をすべて偽と答える。形ごと消した (`!Number.isFinite(item.quantity)`) |
 * | 439 | `typeof value !== 'number'` を偽にする | **等価** —— `Number.isInteger` も同じ。`value < rule.min` の型のためだけに在った判定を、`Number.isInteger` が保証する `as number` へ替えた |
 *
 * 断りが `rule` を運ぶのは、呼ぶ側 (`describeWriteFieldFailure` と画面) が「どの規則に触れたか」から
 * 文を組むため。**規則が偽 (必須でないのに必須と名乗る等) だと、文と実際の判定が食い違う。**
 *
 * ★ 等価として消した 2 つは、**消した後も答えが同じ**であることを下の「数でない値」の表が留める
 *   (投げない・どれも `not-integer`)。この表は消す前のコードでも通る。
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SHOPIFY_LINE_ITEMS,
  MAX_WRITE_TITLE_CHARS,
  checkShopifyLineItems,
  checkWriteInteger,
  describeWriteFieldFailure,
} from '../writeFieldLimits';

describe('★ 明細の断りが名乗る規則 (パス 502)', () => {
  it('件数超過: 「無くてよい配列・上限は件数の天井・1 件は必須で 1 行の題名」と名乗り、文は件数を言う', () => {
    const over = checkShopifyLineItems(
      Array.from({ length: MAX_SHOPIFY_LINE_ITEMS + 1 }, () => ({ title: 't', quantity: 1 })),
    );
    expect(over).toEqual({
      field: 'order.lineItems',
      problem: 'too-many',
      rule: {
        kind: 'list',
        required: false,
        maxItems: MAX_SHOPIFY_LINE_ITEMS,
        item: { required: true, max: MAX_WRITE_TITLE_CHARS, multiline: false },
      },
    });
    expect(over === null ? null : describeWriteFieldFailure(over)).toBe('order.lineItems は 200 件以内で指定してください');
  });

  it('quantity が有限の数でない: 「必須の整数・0 以上」と名乗り、文は下限を言う', () => {
    const bad = checkShopifyLineItems([{ title: 't', quantity: 'x' }]);
    expect(bad).toEqual({
      field: 'order.lineItems[0].quantity',
      problem: 'not-integer',
      rule: { kind: 'integer', required: true, min: 0 },
    });
    expect(bad === null ? null : describeWriteFieldFailure(bad)).toBe(
      'order.lineItems[0].quantity は 0 以上の整数で指定してください',
    );
  });
});

/** 数ではない物 (どれも投げずに断られる)。**`typeof` を見なくても `Number.isFinite` / `Number.isInteger` が偽と答える**集合。 */
const NOT_NUMBERS: readonly (readonly [string, unknown])[] = [
  ['数字の文字列', '3'],
  ['空文字', ''],
  ['真偽', true],
  ['オブジェクト', {}],
  ['配列', [3]],
  ['BigInt', 3n],
  ['Number オブジェクト', Object(3)],
  ['シンボル', Symbol('q')],
  ['関数', () => 3],
];

describe('★ 数でない値はどれも投げずに断られる (等価として消した typeof の代わりを留める · パス 502)', () => {
  it.each(NOT_NUMBERS)('明細の quantity が %s: not-integer (投げない)', (_label, quantity) => {
    const bad = checkShopifyLineItems([{ title: 't', quantity }]);
    expect(bad?.field).toBe('order.lineItems[0].quantity');
    expect(bad?.problem).toBe('not-integer');
  });

  it.each(NOT_NUMBERS)('整数の欄が %s: not-integer (投げない)', (_label, value) => {
    expect(checkWriteInteger(value, { kind: 'integer', required: false, min: 0 })).toBe('not-integer');
  });

  it('対照: 有限の数・整数は通る (表が「何でも断る」形になっていない)', () => {
    expect(checkShopifyLineItems([{ title: 't', quantity: 3 }])).toBeNull();
    expect(checkShopifyLineItems([{ title: 't', quantity: 0 }])).toBeNull();
    expect(checkWriteInteger(3, { kind: 'integer', required: false, min: 0 })).toBeNull();
  });
});
