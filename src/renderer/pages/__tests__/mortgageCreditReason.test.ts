/** @vitest-environment jsdom */
/**
 * **住宅ローン控除の「¥0」は法的結論なのに、理由が 1 文も無かった** (2026-09-22 · パス 401)。
 *
 * ## 実測 (2026-09-22 · 直す前)
 *
 * 画面 ③ は `税額控除: 住宅ローン (所得税 ¥0 / 住民税 ¥0)` と刷るだけで、
 * ¥0 の理由をどこにも出していなかった。ところが ¥0 になる道は **5 つ**あり、
 * **意味も直す手も違う** (残高 3,000 万・性能区分は各行のとおり):
 *
 * | 原因 | 実測 | 意味 |
 * | --- | --- | --- |
 * | 合計所得 > 2,000 万 | `creditable: 0` | その年は対象外 (国税庁 No.1211) |
 * | 控除期間外 | `creditable: 0` | 終わった |
 * | 2024 年以降 × 省エネ基準非適合 | `balanceCap: 0` → `creditable: 0` | 対象外 (住宅の性能の事実) |
 * | 年末残高 0 | 画面が入力ごと渡さない | 未入力 |
 * | **差し引く税額が無い** | **`creditable: 210,000` / `unused: 210,000`** | **算定できているが引けない** |
 *
 * ★ **最後の 1 行がいちばん重い** —— アプリは 210,000 円を*算定してから*全額を
 * `unused` として捨て、画面には ¥0 だけが出ていた。利用者は「自分には適用され
 * ない」と読むが、実際は「控除額は在るが差し引く税額が無い」である。
 *
 * ★ **そして画面の但し書きは 5 つのうち 4 つで読み手を誤った方へ導いていた** ——
 * 「居住年・住宅性能区分で控除率/上限が変わります (上のセレクタで選択)」は
 * *セレクタを動かせ*と読めるが、所得制限・期間外・残高未入力・税額不足は
 * どれもセレクタでは変わらない。
 *
 * ★ **もう 1 つ: 性能区分の札が偽だった** —— `<option>` は 5 つの上限を手で書いて
 * おり、`その他/非適合` は**どの年でも「〜3,000万」**と名乗っていた。実物は
 * 2024 年以降の居住で **0** で、選べる 6 年のうち **2 年について札が偽**だった。
 * いまは `resolveMortgageParams` から導く (数を 2 度書かない)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TaxPage } from '../TaxPage';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
// **隔離は共有の 1 つを通す** —— `_resetRecordStoreForTests()` は singleton を
// 捨てるだけで IndexedDB は残る (`recordStoreHarness.ts` の実測)。
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForText } from '../../__tests__/jsdomWait';
import {
  DEFAULT_MORTGAGE_CREDIT_PARAMS,
  HOUSING_PERFORMANCE_LABELS,
  calcMortgageCredit,
  noMortgageCreditCause,
  noMortgageCreditNote,
  resolveMortgageParams,
  type HousingPerformance,
  type MortgageCreditInput,
} from '../../../shared/taxCredits';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
const text = (): string => container.textContent ?? '';

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container.remove();
});

/** 健全な入力 (2023 年居住・省エネ適合・残高 3,000 万・所得税 50 万)。 */
const OK: MortgageCreditInput = {
  yearEndBalance: 30_000_000,
  rate: 0.007,
  balanceCap: 40_000_000,
  incomeTaxBeforeCredit: 500_000,
  taxableIncomeForResident: 4_000_000,
  totalIncome: 6_000_000,
  outsidePeriod: false,
};

const causeOf = (over: Partial<MortgageCreditInput> | null) => {
  if (over === null) return noMortgageCreditCause(null, null);
  const input = { ...OK, ...over };
  return noMortgageCreditCause(input, calcMortgageCredit(input));
};

describe('★ ¥0 の原因は 1 か所で選び、5 通りを言い分ける (パス 401)', () => {
  it('★ 5 つの原因がそれぞれ別の答えになる', () => {
    expect(causeOf(null), '残高ごと未入力').toBe('no-balance');
    expect(causeOf({ yearEndBalance: 0 }), '残高 0').toBe('no-balance');
    expect(causeOf({ totalIncome: 25_000_000 }), '所得制限').toBe('income-over-limit');
    expect(causeOf({ outsidePeriod: true }), '控除期間外').toBe('outside-period');
    expect(causeOf({ balanceCap: 0 }), '2024+ 非適合').toBe('not-energy-compliant');
    expect(
      causeOf({ incomeTaxBeforeCredit: 0, taxableIncomeForResident: 0 }),
      '差し引く税額が無い',
    ).toBe('no-tax-to-offset');
    // 健全な入力では原因が無い (上の 6 件が空の検査でないこと)。
    expect(causeOf({})).toBeNull();
  });

  /**
   * **順序は `calcMortgageCredit` の早期 return と同じでなければならない** ——
   * 別の順序で並べると「計算が使った理由」と「画面が述べる理由」が食い違う
   * (パス 388 が経営サマリーで直した「原因を取り違えた断り」と同じ形)。
   * 2 つ以上当てはまる入力でしか観測できないので、そこを名指しで留める。
   */
  it('★ 2 つ以上当てはまるときは、計算が使った枝と同じ理由を言う', () => {
    expect(
      causeOf({ totalIncome: 25_000_000, outsidePeriod: true }),
      '所得制限が先 (calcMortgageCredit の 1 つ目の早期 return)',
    ).toBe('income-over-limit');
    expect(
      causeOf({ outsidePeriod: true, balanceCap: 0 }),
      '期間外が先 (2 つ目の早期 return)',
    ).toBe('outside-period');
    // 残高 0 は一番先 —— 計算にかける前に画面が入力ごと渡さない。
    expect(
      causeOf({ yearEndBalance: 0, totalIncome: 25_000_000 }),
      '残高未入力が最優先',
    ).toBe('no-balance');
  });

  it('★ 「原因が無い」⟺「画面に出る 2 つの額の合計が 0 でない」(両方向)', () => {
    const cases: (Partial<MortgageCreditInput> | null)[] = [
      null, {}, { yearEndBalance: 0 }, { totalIncome: 25_000_000 }, { outsidePeriod: true },
      { balanceCap: 0 }, { incomeTaxBeforeCredit: 0, taxableIncomeForResident: 0 },
      { yearEndBalance: 1_000 }, { incomeTaxBeforeCredit: 100 },
    ];
    let withCredit = 0;
    let without = 0;
    for (const over of cases) {
      if (over === null) { without += 1; continue; }
      const input = { ...OK, ...over };
      const r = calcMortgageCredit(input);
      const shown = r.fromIncomeTax + r.fromResidentTax;
      const cause = noMortgageCreditCause(input, r);
      expect(cause === null, `${JSON.stringify(over)}: 原因と表示額が食い違う`).toBe(shown > 0);
      if (shown > 0) withCredit += 1; else without += 1;
    }
    // 走査が空虚でない床 (両方の側に標本が在る)。
    expect(withCredit, '控除が出る標本').toBeGreaterThanOrEqual(2);
    expect(without, '0 になる標本').toBeGreaterThanOrEqual(5);
  });

  it('★ 文は原因ごとに別物で、どれも空でない', () => {
    const causes = [
      'no-balance', 'income-over-limit', 'outside-period', 'not-energy-compliant', 'no-tax-to-offset',
    ] as const;
    const notes = causes.map((c) => noMortgageCreditNote(c, 210_000));
    expect(new Set(notes).size, '同じ文を 2 つの原因に使っている').toBe(causes.length);
    for (const n of notes) expect(n.length).toBeGreaterThan(20);
    // **セレクタを動かせと読ませてよいのは 1 つだけ** —— 適合区分を変える話。
    const mentionsSelector = notes.filter((n) => n.includes('区分'));
    expect(mentionsSelector.length, '区分に触れる文は 2 つ (所得制限と非適合)').toBeLessThanOrEqual(3);
    // 税額不足の文は「算定できている額」を出す (「適用されない」と読ませない)。
    expect(noMortgageCreditNote('no-tax-to-offset', 210_000)).toContain('210,000');
    expect(noMortgageCreditNote('no-tax-to-offset', 210_000)).not.toContain('対象外');
  });
});

describe('★ 性能区分の札は表から導く (パス 401)', () => {
  it('★ 2024 年以降の居住では「その他/非適合」は対象外になる', () => {
    for (const y of [2020, 2021, 2022, 2023]) {
      expect(resolveMortgageParams(y, 'non-standard').balanceCap, `${y} 年`).toBeGreaterThan(0);
    }
    for (const y of [2024, 2025]) {
      expect(resolveMortgageParams(y, 'non-standard').balanceCap, `${y} 年`).toBe(0);
    }
  });

  it('★ 札の表は上限の額を 1 つも持たない (数を 2 度書かない)', () => {
    for (const [value, label] of HOUSING_PERFORMANCE_LABELS) {
      expect(label, `${value} の札が額を持っている`).not.toMatch(/[0-9０-９]/);
      expect(label).not.toContain('万');
    }
    // 標本: 額を持つ札はこの針に当たる (上の not が空の検査でないこと)。
    expect('その他/非適合 (〜3,000万)').toMatch(/[0-9０-９]/);
    // 区分は 5 つすべて載る (型の網とは別に、件数でも留める)。
    const values = HOUSING_PERFORMANCE_LABELS.map(([v]) => v);
    const expected: HousingPerformance[] = ['long-life', 'zeh', 'standard', 'non-standard', 'used'];
    expect([...values].sort()).toEqual([...expected].sort());
  });
});

describe('★ 画面が理由を刷る (パス 401)', () => {
  /** ③ が出るまで条件で待って描く (固定回数では負荷が嘘をつく・法則 93)。 */
  async function mount(): Promise<void> {
    root = createRoot(container);
    await act(async () => { root!.render(createElement(TaxPage)); });
    await waitForText(text, '税額控除');
  }

  it('★ 既定 (残高未入力) では「年末残高が未入力」と述べる', async () => {
    await mount();
    const note = container.querySelector('[data-no-mortgage-credit]');
    expect(note, '断りの枠が無い').not.toBeNull();
    expect(note?.textContent ?? '').toContain('年末残高が未入力');
    // 数字のすぐ後ろに在る (押してから知る形にしない)。
    expect(text()).toContain('住宅ローン控除が 0 円の理由');
  });

  it('★ 性能区分の選択肢が「対象外」を出す年が在る (既定は 2024 年)', async () => {
    await mount();
    const opts = Array.from(container.querySelectorAll('option'))
      .map((o) => o.textContent ?? '')
      .filter((t) => t.includes('非適合'));
    expect(opts.length, '非適合の選択肢が無い').toBeGreaterThanOrEqual(1);
    // 既定の居住開始年は 2024 年なので、非適合は対象外。
    expect(opts[0]).toContain('対象外');
    expect(opts[0], '偽の札が戻っている').not.toContain('3000万');
  });
});

describe('★ 所得の上限は台帳の値から文へ入る (数を写さない)', () => {
  it('上限を動かすと文の数字も動く', () => {
    const note = noMortgageCreditNote('income-over-limit', 0, {
      ...DEFAULT_MORTGAGE_CREDIT_PARAMS,
      incomeLimit: 30_000_000,
    });
    expect(note).toContain('3000');
    expect(note, '既定の 2,000 万を書き写している').not.toContain('2000 万円を超える');
  });
});
