import { describe, expect, it } from 'vitest';
import { isEvictableStorage, type StorageDurability } from '../storageDurability';

/*
 * この判断は 2026-08-25 まで **`SettingsPage.tsx` の中の `=== 'best-effort'`**
 * だった。`mutate` に `.tsx` が 1 件も無いので、反転させても誰も気付けない。
 * 判断を出したので、ここで両方向を留める。
 */
describe('立ち退きの注意を出すか', () => {
  it.each([
    ['ブラウザの best-effort — 消えうる', 'best-effort', true],
    ['ブラウザの persistent — 守られている', 'persistent', false],
    ['デスクトップのファイル — 立ち退きが無い', 'file', false],
  ] as [string, StorageDurability, boolean][])('%s (%s)', (_label, d, want) => {
    expect(isEvictableStorage(d)).toBe(want);
  });

  /*
   * **分からないときは黙る。** 古いブリッジや取得前は `undefined` になる。
   * ここで警告を出すと「確かめずに脅す」ことになり、本当に消えうるときの
   * 警告まで軽く見られる。
   */
  it('undefined では出さない (確かめずに脅さない)', () => {
    expect(isEvictableStorage(undefined)).toBe(false);
  });

  /*
   * 語彙が増えたときに**既定で警告する**側へ倒れないこと。
   * 新しい値は「消えうる」と決まっていないので、明示するまでは黙る。
   */
  it('知らない値では出さない', () => {
    expect(isEvictableStorage('future-mode' as StorageDurability)).toBe(false);
  });
});
