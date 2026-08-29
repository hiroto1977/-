import { describe, expect, it, vi } from 'vitest';

/**
 * **定義表を字面で留める。**
 *
 * `ORGAN_DISEASES` / `LEADER_DISQUALIFIERS` / `SKILL_STEPS` は
 * **モジュール直下の定数**なので、静的 import のまま比べても変異体が届かない
 * (覆われた static 変異体)。`vi.resetModules()` + 動的 `import()` で毎回
 * 読み直すと、表を書き換える変異体が比較で落ちる —— この手は
 * `oauth.ts` の `OAUTH_CONFIGS` で 70.05% → 92.13% を出した実績があり、
 * `stryker.config.json` の注記に手順が書いてある。
 *
 * ## なぜ字面で留めるのか
 *
 * これは**社内基準として配られる文言**である。10ヶ条の 1 つが静かに
 * 書き換わっても、判定の形は何も変わらないので既存の検査は全部通る。
 * 2026-08-27 に組織病の語釈を 3 件とも間違えた経験からしても、
 * ここは「動くか」ではなく「**何と書いてあるか**」を留める場所である。
 */

const fresh = async () => {
  vi.resetModules();
  return import('../talent');
};

describe('定義表 — 文言そのものを留める', () => {
  it('★ 5つの企業組織病 (id と名前)', async () => {
    const m = await fresh();
    // **記憶で書かない。** 最初この 5 件を記憶から書いて 3 件外した
    // (`job-shrink` / `number-omnipotence` / `cost-blindness` —— 最後の 1 つは
    //  そもそも存在せず、実際は「フォーマット過信病」)。2026-08-27 に語釈を
    // 3 件とも間違えたのと同じ誤り方で、**この検査がその場で捕まえた**。
    expect(m.ORGAN_DISEASES.map((d) => [d.id, d.name])).toEqual([
      ['imprint', '職務定義の刷り込み誤認'],
      ['model-dependence', 'お手本依存症'],
      ['shrinking', '職務の矮小化現象'],
      ['number-worship', '数字万能病'],
      ['format-trust', 'フォーマット過信病'],
    ]);
  });

  it('★ 5つの病はすべて語釈と出典の強さを持つ', async () => {
    const m = await fresh();
    for (const d of m.ORGAN_DISEASES) {
      expect(d.summary.length, d.id).toBeGreaterThan(20);
      expect(m.SOURCE_STRENGTH_ORDER).toContain(d.source);
    }
    // 出典の内訳 —— 確認済み 3 / 第三者 2。ここが動いたら札の意味が変わる。
    const byStrength = m.ORGAN_DISEASES.reduce<Record<string, number>>((acc, d) => {
      acc[d.source] = (acc[d.source] ?? 0) + 1;
      return acc;
    }, {});
    expect(byStrength).toEqual({ confirmed: 3, secondary: 2 });
  });

  it('★ リーダー失格の10ヶ条 (id と文言)', async () => {
    const m = await fresh();
    expect(m.LEADER_DISQUALIFIERS).toHaveLength(10);
    const texts = m.LEADER_DISQUALIFIERS.map((d) => d.text);
    // 1 つでも書き換わったら落ちる。社内基準として配る文言なので字面で留める。
    expect(texts.join('\n')).toMatchInlineSnapshot(`
      "すぐに諦める
      できない言い訳をする
      危機感がない
      成果が出ない理由を外部要因にする
      やるべきことを「自分がやらなくていい理由」を見つけてやらない
      ミスをしても謝らない
      ミスをしても、バレないようにごまかす
      人が見ていないところでサボる
      うそをついてごまかす
      トラブルから逃げる"
    `);
  });

  it('★ 育成の4つの STEP (順番と名前)', async () => {
    const m = await fresh();
    expect(m.SKILL_STEPS.map((s) => [s.step, s.name])).toMatchInlineSnapshot(`
      [
        [
          1,
          "業務スキル",
        ],
        [
          2,
          "チームマネジメントのスキル",
        ],
        [
          3,
          "未知問題の解決スキル",
        ],
        [
          4,
          "しくみをつくるスキル",
        ],
      ]
    `);
  });

  it('★ 閾値と鍵は字面で固定する', async () => {
    const m = await fresh();
    expect(m.STEP1_MASTERY_YEARS).toBe(5);
    expect(m.TALENT_STORAGE_KEY).toBe('servicehub.talent.state.v1');
    expect(m.MAX_DEPT_REPORTS).toBe(200);
    expect(m.MAX_INITIATIVES).toBe(200);
    expect(m.MAX_LADDER_MEMBERS).toBe(500);
    expect(m.LEADER_DISQUALIFIERS_SOURCE).toBe('confirmed');
    expect(m.SKILL_STEPS_SOURCE).toBe('confirmed');
  });

  it('id は表の中で重複しない', async () => {
    const m = await fresh();
    for (const table of [m.ORGAN_DISEASES, m.LEADER_DISQUALIFIERS, m.SKILL_STEPS]) {
      const ids = table.map((x) => ('id' in x ? x.id : String(x.step)));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
