/**
 * **「既定の水準で採点しています」の断りを、全文で留める。** (パス 502)
 *
 * 診断カードは、0 点 / 100 点の水準が同じ値で保存された軸を既定の水準で採点する。
 * その事実を 1 文で言う (`defaultBandNote`)。既存の検査は文の**断片** (軸名・`1 軸`・
 * `既定の水準で採点しています`) を探すだけで、複数の軸名を並べる区切り (`・`) と、
 * 利用者に直し方を示す末尾の一節 (「設定の『数値パラメータ』で違う値にすると効きます」) を
 * 見ていなかった。直し方が消えると、利用者はなぜ既定で採点されるのかも、どこで変えるのかも分からない。
 *
 * 軸は手で組む (`radarAxes` の出力に依らず、ラベルだけが文に出ることを見る)。
 */
import { describe, expect, it } from 'vitest';
import { defaultBandNote } from '../financialRatios';
import type { RadarAxis } from '../financialRatios';

const axis = (key: string, label: string): RadarAxis => ({ key, label, unit: '%', raw: 50, score: 60 });

const TAIL =
  '0 点 / 100 点の水準が同じ値で保存されているため**既定の水準で採点しています**' +
  '（設定の「数値パラメータ」で違う値にすると効きます）。';

describe('defaultBandNote — 断りの全文 (パス 502)', () => {
  it('★ 1 軸: 軸名・件数・水準の説明・直し方を 1 文で', () => {
    expect(defaultBandNote([axis('equityRatio', '自己資本比率')])).toBe(`自己資本比率 の 1 軸は、${TAIL}`);
  });

  it('★ 2 軸: 軸名を「・」で並べ、件数は軸の数', () => {
    expect(defaultBandNote([axis('equityRatio', '自己資本比率'), axis('roe', 'ROE')])).toBe(
      `自己資本比率・ROE の 2 軸は、${TAIL}`,
    );
  });

  it('★ 3 軸: 並びは渡された順のまま、区切りは軸の数 − 1 個', () => {
    const note = defaultBandNote([axis('a', '流動比率'), axis('b', '労働分配率'), axis('c', 'CCC')]);
    expect(note).toBe(`流動比率・労働分配率・CCC の 3 軸は、${TAIL}`);
    // 区切りの「・」は 2 個 (末尾の直し方の文に「・」は無い)。
    expect(note!.split('・').length - 1).toBe(2);
  });

  it('★ 対照: 軸が無ければ断りは出さない (null)', () => {
    expect(defaultBandNote([])).toBeNull();
  });
});
