import { describe, expect, it } from 'vitest';
import { sanitizeDocstudioStore, type StoreShape } from '../docstudioStore';

/*
 * 書類スタジオの下書き (localStorage `servicehub.docstudio.v1`)。2026-09-05 に `kessanSheet: 'foo'` で
 * 画面が開くたびに落ちたのを機に、読むときに形を確かめる。値の辞書に数値が紛れると `.trim()` で落ちる。
 */
describe('sanitizeDocstudioStore', () => {
  it('★ 標本: 型の違う欄・値は捨てる (書面 id・数値の値・配列でない recent・辞書でない書式)', () => {
    const got = sanitizeDocstudioStore({
      studio: { invoice: { company: 'A', amount: 100 }, memo: 'not-a-record' },
      teikan: { kk: { name: 'B', founded: 2020 }, gk: null },
      shugyo: ['x'],
      kessan: { company: 'C', sales: 1 },
      kessanSheet: 'foo',
      recent: 'invoice',
    });
    expect(got).toEqual({ studio: { invoice: { company: 'A' } }, teikan: { kk: { name: 'B' } }, kessan: { company: 'C' } });
  });
  it('対照: 合う下書きはそのまま往復する (書面 id・最近使った書式も)', () => {
    const store: StoreShape = {
      studio: { invoice: { company: 'A', amount: '100' } },
      teikan: { kk: { name: 'B' }, gk: { name: 'G' } },
      shugyo: { title: '就業規則' },
      kessan: { company: 'C', sales: '1' },
      kessanSheet: 'bs',
      recent: ['invoice', 'estimate'],
    };
    expect(sanitizeDocstudioStore(JSON.parse(JSON.stringify(store)))).toEqual(store);
  });
  it('対照: recent は文字列だけ残し、オブジェクトでなければ空', () => {
    expect(sanitizeDocstudioStore({ recent: ['a', 1, null, 'b'] })).toEqual({ recent: ['a', 'b'] });
    for (const bad of [null, 'x', 42, ['a']]) expect(sanitizeDocstudioStore(bad), String(bad)).toEqual({});
  });

  it('★ studio の "__proto__" 鍵は prototype を置き換えない (保存していない書式 id に値が現れない・threat: T-189)', () => {
    const parsed: unknown = JSON.parse('{"studio":{"__proto__":{"invoice":"x","yen":"y"},"keiyaku":{"a":"b"}}}');
    const out = sanitizeDocstudioStore(parsed);
    expect(Object.keys(out.studio ?? {})).toEqual(['keiyaku']);
    expect(Object.getPrototypeOf(out.studio)).toBe(Object.prototype);
    expect((out.studio as Record<string, unknown>).invoice).toBeUndefined();
    // 大域の汚染も起きていない。
    expect(({} as Record<string, unknown>).invoice).toBeUndefined();
  });
});
