/**
 * **`serviceAdvisor` の境目・防御の枝・文の繋ぎ目を、値ごと (全文) で固定する** (2026-09-30 · パス 502)。
 *
 * 変異検査は全掃引 #179 で `serviceAdvisor.ts` に 27 件を生き残らせた。`serviceAdvisor.test.ts` は
 * 見本の数字と代表的な枝を全文で留めているが、次の 4 つは見ていなかった:
 *
 *   1. **境目ちょうど** —— 評価の差 0.2 pt (`>=`) と客単価の倍率 1.2 (`>=`)。見本の差は 0.1 / 1.0 で、
 *      どちらも境目から離れているので、`>=` を `>` に替えても答えが変わらなかった。
 *   2. **名前を並べる `' / '`** —— 在り得ない値・範囲の外の銘柄が 2 件以上のときの繋ぎ目。
 *      既存の標本はどちらも 1 件だけで、繋ぎ目の字が要る場面が無かった。
 *   3. **読み取りを通らない入力への防御** —— 規則関数 (`adviseX`) は export されており、読み取り
 *      (`parseX`) が通さない入力 (店舗 0 件・銘柄 0 件・非有限の売上 / リターン) を直に渡せる。
 *      そのときは**作り話をせず「未算定」で断る**と、コードの注記が約束している。約束を値で留める。
 *   4. **読み取りの断りが欄を名指しする** —— 投資信託の銘柄の名前は `.ok` だけを見ていて、
 *      文面 (`holdings[i].name`) を誰も主張していなかった。
 *
 * **非有限の値を使う標本について**: `±Infinity` は `maxBy` / `minBy` が読み飛ばす値で、
 * 「最大は在るが最小が決まらない」という**片側だけ null** の状態を作れる (有限の値だけなら最大と最小は
 * 必ず一緒に決まる)。片側だけの null を別々に問う判定 (`top === null || bottom === null` ほか) は、
 * この入力でしか区別できない。
 */
import { describe, expect, it } from 'vitest';
import {
  adviseDemaeCan,
  adviseMutualFunds,
  adviseUberEats,
  parseMutualFundsAdviceInput,
  type DemaeCanAdviceInput,
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

describe('Uber Eats の提案 — 店舗が決まらない入力は「未算定」で断る', () => {
  const STORES_UNKNOWN = {
    title: '店舗別売上の比較は未算定',
    rationale: '店舗が読めないため、店舗間の倍率は出しません。',
  };
  const store = (revenue: number, rating = 4) => ({ name: 'X', orders: 1, revenue, rating });

  it('★ 店舗が 0 件でも、売上の比較も評価の比較も作り話をせず「未算定」で断る', () => {
    const r = adviseUberEats({ stores: [], topItems: [], avgRating: 4 });
    expect(r.recommendations[0]).toEqual(STORES_UNKNOWN);
    expect(r.recommendations[1]).toEqual({
      title: '評価の比較は未算定',
      rationale: '平均評価が読めないため、店舗ごとの評価の比較はしません。',
    });
    expect(r.basis).toBe('0 店舗・メニュー 0 品・平均評価 4.0');
  });

  it('★ 売上が −∞ の店舗しか無いとき (最大が決まらない) も「未算定」で断る', () => {
    expect(adviseUberEats({ stores: [store(Number.NEGATIVE_INFINITY)], topItems: [], avgRating: 4 }).recommendations[0]).toEqual(
      STORES_UNKNOWN,
    );
  });

  it('★ 売上が +∞ の店舗しか無いとき (最小が決まらない) も「未算定」で断る', () => {
    expect(adviseUberEats({ stores: [store(Number.POSITIVE_INFINITY)], topItems: [], avgRating: 4 }).recommendations[0]).toEqual(
      STORES_UNKNOWN,
    );
  });

  it('★ 対照: 有限の売上なら、同じ入力の形で倍率の文が出る (「未算定」の針が的に当たる標本)', () => {
    const r = adviseUberEats({ stores: [store(100_000), { ...store(80_000), name: 'Y' }], topItems: [], avgRating: 4 });
    expect(r.recommendations[0]?.title).toBe('店舗間の売上差は小さい');
    expect(r.recommendations[0]).not.toEqual(STORES_UNKNOWN);
  });

  it('★ 境目: 評価の差がしきい値 0.2 pt ちょうどなら「底上げ」と名指しする (以上)', () => {
    // 平均 4.5 − 最低 4.3 = 0.2 (round1 で 0.2)。`>` なら「評価は横並び」になる。
    const r = adviseUberEats({
      stores: [{ name: 'A', orders: 1, revenue: 100, rating: 4.3 }],
      topItems: [],
      avgRating: 4.5,
    });
    expect(r.recommendations[1]).toEqual({
      title: '評価の底上げ: A',
      rationale: 'A の評価 4.3 は平均 4.5 を 0.2 pt 下回ります (しきい値 0.2 pt)。配達時間と包装の改善を優先してください。',
    });
    // 対照: 0.1 pt の差は横並び (境目の内側)
    const flat = adviseUberEats({
      stores: [{ name: 'A', orders: 1, revenue: 100, rating: 4.4 }],
      topItems: [],
      avgRating: 4.5,
    });
    expect(flat.recommendations[1]?.title).toBe('評価は横並び');
  });
});

describe('出前館の提案 — 地域の比較は注文のある 2 か所以上で、境目は以上', () => {
  const base: Pick<DemaeCanAdviceInput, 'monthOrders' | 'cancellationRate' | 'deliveringOrders'> = {
    monthOrders: 10,
    cancellationRate: 0.01,
    deliveringOrders: 0,
  };
  const AREAS_UNKNOWN_TITLE = '客単価の地域比較は未算定';

  it('★ 注文のある地域が 1 か所だけなら、比べずに「未算定」で断る (同じ地域どうしの 1.0 倍を「均一」と言わない)', () => {
    const r = adviseDemaeCan({
      ...base,
      topAreas: [
        { area: 'X', orders: 10, revenue: 30_000 },
        { area: 'Y', orders: 0, revenue: 0 },
      ],
    });
    expect(r.recommendations[1]).toEqual({
      title: AREAS_UNKNOWN_TITLE,
      rationale: '注文のある地域が 1 か所のため、地域間の客単価は比べません。',
    });
  });

  it('★ 客単価が −∞ の地域しか無いとき (最高が決まらない) も作り話をせず「未算定」で断る', () => {
    const r = adviseDemaeCan({
      ...base,
      topAreas: [
        { area: 'X', orders: 1, revenue: Number.NEGATIVE_INFINITY },
        { area: 'Y', orders: 1, revenue: Number.NEGATIVE_INFINITY },
      ],
    });
    expect(r.recommendations[1]?.title).toBe(AREAS_UNKNOWN_TITLE);
  });

  it('★ 客単価が +∞ の地域しか無いとき (最低が決まらない) も作り話をせず「未算定」で断る', () => {
    const r = adviseDemaeCan({
      ...base,
      topAreas: [
        { area: 'X', orders: 1, revenue: Number.POSITIVE_INFINITY },
        { area: 'Y', orders: 1, revenue: Number.POSITIVE_INFINITY },
      ],
    });
    expect(r.recommendations[1]?.title).toBe(AREAS_UNKNOWN_TITLE);
  });

  it('★ 対照: 有限の客単価が 2 か所なら比べる (「未算定」の針が的に当たる標本)', () => {
    const r = adviseDemaeCan({
      ...base,
      topAreas: [
        { area: 'X', orders: 10, revenue: 30_000 },
        { area: 'Y', orders: 10, revenue: 29_000 },
      ],
    });
    expect(r.recommendations[1]?.title).toBe('客単価は地域間で均一');
  });

  it('★ 境目: 客単価の倍率がしきい値 1.2 ちょうどなら「地域格差」と名指しする (以上)', () => {
    // 600 円 ÷ 500 円 = 1.2。`>` なら「客単価は地域間で均一」になる。
    const r = adviseDemaeCan({
      ...base,
      topAreas: [
        { area: 'X', orders: 10, revenue: 6_000 },
        { area: 'Y', orders: 10, revenue: 5_000 },
      ],
    });
    expect(r.recommendations[1]).toEqual({
      title: '客単価の地域格差: X と Y',
      rationale:
        '客単価は最高 X ¥600 / 最低 Y ¥500 で 1.2 倍の開きがあります (しきい値 1.2 倍)。X の高単価メニューを Y でも展開してください。',
    });
  });
});
