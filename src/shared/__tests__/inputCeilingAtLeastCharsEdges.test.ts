/**
 * **`atLeastChars` の非有限の床 —— 負の無限大も「満たせない」に倒す** (2026-09-30 · パス 502)。
 *
 * 床が非有限なら「満たせない」(false) に倒す (読めない規則を通さない)。全掃引 #179 の生存 1 件は
 * `!Number.isFinite(n)` の見張り: `NaN` と `+∞` は見張りが無くても**後段で false になる**
 * (`NaN <= 0` は偽・数え上げは `seen >= n` に届かない) ので区別できないが、`−∞` だけは
 * 見張りが無いと `n <= 0` に当たって **true** (満たす) になる。同じ「非有限」でも −∞ だけが
 * 床が無いのと同じ側へ倒れる形である。有限の負は従来どおり true (対照)。
 */
import { describe, expect, it } from 'vitest';
import { atLeastChars } from '../inputCeiling';

describe('atLeastChars — 床が非有限のとき', () => {
  it.each([
    ['NaN', Number.NaN],
    ['+∞', Number.POSITIVE_INFINITY],
    ['−∞', Number.NEGATIVE_INFINITY],
  ])('★ 床が %s なら、どんな文字列でも満たせない', (_label, floor) => {
    expect(atLeastChars('abc', floor)).toBe(false);
    expect(atLeastChars('', floor)).toBe(false);
  });

  it('対照: 有限の床は従来どおり (0 以下は常に満たす・字数に届けば満たす)', () => {
    expect(atLeastChars('', 0)).toBe(true);
    expect(atLeastChars('abc', -1)).toBe(true);
    expect(atLeastChars('abc', 3)).toBe(true);
    expect(atLeastChars('abc', 4)).toBe(false);
  });
});
