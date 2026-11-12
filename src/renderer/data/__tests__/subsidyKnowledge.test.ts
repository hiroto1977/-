import { describe, expect, it } from 'vitest';
import { VERIFIED_SUBSIDIES } from '../subsidyKnowledge';

/*
 * `VERIFIED_SUBSIDIES` (補助金・助成金 140 件) には 2026-08-22 まで
 * **これを名指しで検査するファイルが 1 つも無かった**。
 *
 * 覆っていたのは 2 つとも間接:
 *   - `verify:knowledge` (確証ゲート) —— ただし全 4140 件の合計しか見ないので、
 *     この 140 件だけが 0 になっても総数は 4000 のままで通る
 *   - `assistantContext.test.ts` —— AI の文脈組み立てを通して触るだけ
 *
 * 補助金の記述は利用者が申請の可否を判断する材料になる (金額・締切は
 * 「要確認」と明記する運用) ので、出典の確証はここで直接固定する。
 */
describe('VERIFIED_SUBSIDIES (確証済みデータの不変条件)', () => {
  /*
   * 非空の床。以下は「全件について〜」の形なので、配列が空になると
   * **全部そのまま通る**。2026-08-22 の走査で、本番データを回して expect する
   * のに非空を確かめていない検査が 74 件見つかったのを受けて最初に置く。
   */
  it('1 件以上ある (空なら以下の検査は全部空虚に通る)', () => {
    expect(VERIFIED_SUBSIDIES.length).toBeGreaterThanOrEqual(100);
  });

  it('id は一意', () => {
    const ids = VERIFIED_SUBSIDIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全件が出典 2 件以上を持つ', () => {
    const thin = VERIFIED_SUBSIDIES.filter((s) => (s.sources ?? []).length < 2).map((s) => s.id);
    expect(thin).toEqual([]);
  });

  /*
   * 権威ある出典の定義は `sourceVerification.ts` の `OFFICIAL_TYPES`
   * (government / municipality) に合わせる。写経しないよう、判定の根拠は
   * `scripts/verify-knowledge-provenance.cjs` の official 分類と同じ。
   */
  it('全件が公的な出典 (government / municipality) を 1 件以上持つ', () => {
    const unofficial = VERIFIED_SUBSIDIES.filter(
      (s) => !(s.sources ?? []).some((x) => x.type === 'government' || x.type === 'municipality'),
    ).map((s) => s.id);
    expect(unofficial).toEqual([]);
  });

  it('出典 URL は https (取得できる形であること)', () => {
    const bad: string[] = [];
    for (const s of VERIFIED_SUBSIDIES) {
      for (const src of s.sources ?? []) {
        if (!/^https:\/\//.test(src.url)) bad.push(`${s.id}: ${src.url}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('所管・申請方法・基準日が空でない', () => {
    const incomplete = VERIFIED_SUBSIDIES.filter(
      (s) => !s.authority?.trim() || !s.application?.trim() || !s.asOf?.trim(),
    ).map((s) => s.id);
    expect(incomplete).toEqual([]);
  });
});
