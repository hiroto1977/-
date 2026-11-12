/**
 * **士業連携の見出しに「同梱の見本が混ざっていること」を述べる文を、全分岐で全文で留める。** (パス 502)
 *
 * `shigyoDemoMixNote` の `demoCount === 0` (見本が 1 件も無ければ何も言わない) を
 * `false` にする変異体が生き残っていた。既存の検査は画面側 (`investmentDemoMixOnScreen`) が
 * 文の断片を `toContain` で見るだけで、**見本が 0 件のとき `null`** を値として主張する検査が
 * 無かった。外れると、見本が無いのに「表示中の連携先 0 名と月次顧問料 … は同梱の見本です」
 * 「連携 N 名には同梱の見本 0 名が含まれています」と**無い見本を名乗る**文が出る。
 *
 * 4 つの出力 (`null` / 見本だけ / 見本と登録の混在 / 非有限) を値ごと留める。
 */
import { describe, expect, it } from 'vitest';
import { shigyoDemoMixNote } from '../shigyoDirectory';

describe('shigyoDemoMixNote — 全分岐の全文 (パス 502)', () => {
  const FEE = '¥33,000';

  it('★ 見本だけが表示されている (自分の連携先は未登録): 出所を言い、まだ登録が無いことも言う', () => {
    expect(shigyoDemoMixNote(2, 0, FEE)).toBe(
      '表示中の連携先 2 名と月次顧問料 ¥33,000 は同梱の見本です（自分の連携先はまだ登録されていません）。',
    );
  });

  it('★ 見本と自分の登録が混ざっている: 見出しの「連携 N 名」の内訳と、顧問料は見本の値だと言う', () => {
    expect(shigyoDemoMixNote(1, 1, FEE)).toBe(
      '「連携 2 名」には同梱の見本 1 名が含まれています（自分が登録した連携先は 1 名）。月次顧問料 ¥33,000 は見本の値です。',
    );
    expect(shigyoDemoMixNote(2, 3, FEE)).toBe(
      '「連携 5 名」には同梱の見本 2 名が含まれています（自分が登録した連携先は 3 名）。月次顧問料 ¥33,000 は見本の値です。',
    );
  });

  it('★ 見本が 1 件も無ければ何も言わない (自分の登録が在っても無くても null)', () => {
    expect(shigyoDemoMixNote(0, 0, FEE)).toBeNull();
    expect(shigyoDemoMixNote(0, 4, FEE)).toBeNull();
  });

  it('★ 件数が非有限なら文に NaN を埋めず null', () => {
    expect(shigyoDemoMixNote(Number.NaN, 2, FEE)).toBeNull();
    expect(shigyoDemoMixNote(2, Number.POSITIVE_INFINITY, FEE)).toBeNull();
    expect(shigyoDemoMixNote(Number.NEGATIVE_INFINITY, 0, FEE)).toBeNull();
  });
});
