/**
 * **`serviceAdvisor` の境目・防御の枝・文の繋ぎ目を、値ごと (全文) で固定する** (2026-09-30 · パス 502)。
 *
 * 変異検査は全掃引 #179 で `serviceAdvisor.ts` に 27 件を生き残らせた。`serviceAdvisor.test.ts` は
 * 見本の数字と代表的な枝を全文で留めているが、次の 3 つは見ていなかった:
 *
 *   1. **名前を並べる `' / '`** —— 在り得ない値・範囲の外の銘柄が 2 件以上のときの繋ぎ目。
 *      既存の標本はどちらも 1 件だけで、繋ぎ目の字が要る場面が無かった。
 *   2. **読み取りを通らない入力への防御** —— 規則関数 (`adviseX`) は export されており、読み取り
 *      (`parseX`) が通さない入力 (銘柄 0 件・非有限のリターン) を直に渡せる。
 *      そのときは**作り話をせず「未算定」で断る**と、コードの注記が約束している。約束を値で留める。
 *   3. **読み取りの断りが欄を名指しする** —— 投資信託の銘柄の名前は `.ok` だけを見ていて、
 *      文面 (`holdings[i].name`) を誰も主張していなかった。
 *
 * **非有限の値を使う標本について**: `±Infinity` は `maxBy` / `minBy` が読み飛ばす値で、
 * 「最大は在るが最小が決まらない」という**片側だけ null** の状態を作れる (有限の値だけなら最大と最小は
 * 必ず一緒に決まる)。片側だけの null を別々に問う判定 (`top === null || bottom === null` ほか) は、
 * この入力でしか区別できない。
 */
import { describe, expect, it } from 'vitest';
import {
  adviseMutualFunds,
  parseMutualFundsAdviceInput,
  type MutualFundsAdviceHolding,
} from '../serviceAdvisor';

const titles = (r: { recommendations: readonly { title: string }[] }): string[] => r.recommendations.map((x) => x.title);

const holding = (name: string, ytdReturnPct: number | null, valuation = 100): MutualFundsAdviceHolding => ({
  name,
  valuation,
  ytdReturnPct,
  demo: false,
});

const funds = (holdings: readonly MutualFundsAdviceHolding[], totalValuation = 1000) =>
  adviseMutualFunds({ holdings, totalValuation, unrealizedGainPct: 0 });

describe('投資信託の読み取り — 銘柄の名前の断りは欄と行を名指しする', () => {
  it('★ 1 行目・2 行目の名前が読めないとき、`holdings[i].name` を名指しする', () => {
    const parse = (rows: readonly unknown[]) =>
      parseMutualFundsAdviceInput({ holdings: rows, totalValuation: 100, unrealizedGainPct: null });
    expect(parse([{ name: '', valuation: 1, ytdReturnPct: null, demo: false }])).toEqual({
      ok: false,
      message: 'mutual-funds.advise: holdings[0].name は 1〜64 文字で指定してください',
    });
    expect(parse([holding('A', null), { name: 42, valuation: 1, ytdReturnPct: null, demo: false }])).toEqual({
      ok: false,
      message: 'mutual-funds.advise: holdings[1].name は 1〜64 文字で指定してください',
    });
  });
});

describe('投資信託の提案 — 名前を並べる繋ぎ目と、読み取りを通らない入力', () => {
  it('★ 在り得ない値の銘柄が 2 件以上なら、名前を「 / 」で繋いで名指しする', () => {
    const r = funds([holding('A', -250), holding('B', -300), holding('C', 4)]);
    expect(r.recommendations[1]?.title).toBe('年初来リターンに在り得ない値: A / B');
    expect(r.recommendations[1]?.rationale).toContain('が 2 件あります');
  });

  it('★ 入力時の範囲の外の銘柄が 2 件以上なら、名前を「 / 」で繋いで名指しする', () => {
    const r = funds([holding('A', 1500), holding('B', 2000), holding('C', 4)]);
    expect(r.recommendations[1]?.title).toBe('年初来リターンが入力時の範囲の外: A / B');
    expect(r.recommendations[1]?.rationale).toContain('が 2 件あります');
  });

  it('★ 下端の外と上端の外が混ざっても、それぞれ別の題名で繋ぐ', () => {
    const r = funds([holding('A', -250), holding('B', -300), holding('C', 1500), holding('D', 2000), holding('E', 4)]);
    expect(titles(r).slice(1, 3)).toEqual([
      '年初来リターンに在り得ない値: A / B',
      '年初来リターンが入力時の範囲の外: C / D',
    ]);
  });

  it('★ 銘柄が 0 件でも、評価額の合計が正なら作り話をせず「集中度は未算定」で断る (読み取りは 1 件以上を保証する)', () => {
    const r = funds([], 1000);
    expect(r.recommendations[0]).toEqual({
      title: '集中度は未算定',
      rationale: '評価額の合計が読めないため、銘柄の集中度は出しません。',
    });
    // 年初来も「未入力」で断る (銘柄が無いので比べる相手が無い)
    expect(r.recommendations[1]?.title).toBe('年初来リターンは未入力');
  });

  it('★ 年初来リターンが +∞ の銘柄しか無いとき、最大は決まるが最小は決まらない —— 比較を作り話にしない', () => {
    const comparison = /^年初来(リターン: |マイナスの銘柄: |の牽引役: )/;
    const inf = funds([holding('A', Number.POSITIVE_INFINITY, 1000)]);
    expect(titles(inf).some((t) => comparison.test(t)), titles(inf).join(' | ')).toBe(false);
    expect(JSON.stringify(inf.recommendations)).not.toContain('Infinity');
    // 対照: 有限の値が 1 件なら、同じ針 (comparison) は比較の題名に当たる (針が的に当たる標本)
    const finite = funds([holding('A', 7.25, 1000)]);
    expect(titles(finite).some((t) => comparison.test(t))).toBe(true);
    expect(JSON.stringify(finite.recommendations)).toContain('7.3%');
    // `Infinity` という綴りは、値を刷る経路が実際に出す字である (否定の針が的に当たる)
    expect(`${Number.POSITIVE_INFINITY.toFixed(1)}%`).toContain('Infinity');
  });
});
