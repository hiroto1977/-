/**
 * **保管値が数として読めない物件の欄が、黙って 0 に倒れていた** (2026-09-24 · パス 446)。
 *
 * `normalizeProperty` は型から読むので投げも連結もしない —— 代わりに**倒す**。
 * 実測 (直す前・1 件・正しい控え = 月次キャッシュフロー ¥70,000 / 表面利回り 6%):
 *
 * | 壊した欄 | 月次キャッシュフロー | 表面利回り | 画面の断り |
 * | --- | ---: | ---: | --- |
 * | (正しい控え) | ¥70,000 | 6% | 無し |
 * | **月次経費** | **¥90,000** | 6% | **無し** |
 * | **月次返済額** | **¥80,000** | 6% | **無し** |
 * | 家賃 (入居中) | △¥30,000 | **0%** | 「家賃が読めないため」 |
 * | 取得価格 | ¥70,000 | ― | 「取得価格が読めない 1 件」 |
 *
 * `'30000'` / `{z:1}` / `[1]` / `true` / `null` / `NaN` の 6 形すべてで同じ。
 * **同じ関数の 4 欄のうち 2 つだけが黙っており、しかも手残りを過大に見せる向き**である。
 *
 * 3 つ目: 家賃が読めない物件は表面利回りの分子が分からないのに 0% として平均に
 * 入っていた —— 実測で 3 件そろい **5.50% が 4 件目 1 件で 4.13%** になり、
 * `yieldScopeNote` は 1 文も出さない (その文自身が「0% として平均すると全体が
 * 下がります」と名指ししている当の失敗である)。空室ならどの断りにも現れない。
 *
 * 4 つ目: 入居中で家賃 0 円の物件に「家賃が読めないため」と述べていた。家賃 0 は
 * **入力欄が受け付ける値** (`parsePropertyEntry` は 0 以上を通す) なので、0 と
 * 打ち込んだ利用者にとって偽であり、直す手も違う (パス 388)。
 */
import { describe, expect, it } from 'vitest';
import {
  PROPERTY_NUMERIC_FIELDS,
  computeRealEstatePortfolio,
  normalizeProperty,
  occupiedWithoutRentNote,
  unreadableCostNote,
  unreadablePropertyField,
  yieldScopeNote,
  type PortfolioProperty,
} from '../investments';
import { COLLECTION_SHAPES } from '../collectionShapes';

/** 正しい控え 1 件 —— 家賃 10 万・取得 2,000 万・経費 2 万・返済 1 万。 */
const GOOD = {
  name: '一棟目',
  type: 'アパート',
  monthlyRent: 100_000,
  purchasePrice: 20_000_000,
  occupied: true,
  monthlyExpenses: 20_000,
  monthlyLoan: 10_000,
} as const;

/**
 * **数でない 6 形**。どれも `structuredClone` が通すので保管値として実在しうる
 * (IndexedDB に入る形だけを標本にする · パス 441 の `ONE_FIELD_VALUES` と同じ判断)。
 */
const BAD_VALUES: readonly (readonly [string, unknown])[] = [
  ["'30000' (10進の文字列)", '30000'],
  ['{z:1}', { z: 1 }],
  ['[1]', [1]],
  ['true', true],
  ['null', null],
  ['NaN', Number.NaN],
];

const one = (raw: unknown): PortfolioProperty => normalizeProperty(raw);
const port = (raw: unknown) => computeRealEstatePortfolio([one(raw)], 0, 0);

describe('PROPERTY_NUMERIC_FIELDS — 数の欄の表は 1 つ', () => {
  /**
   * **母集団は形から振る舞いで導く** —— 表を写すと、表が誤っていても一致する。
   * 「この欄に数でない値を入れると 0 に倒れるか」を実物に訊いて数える。
   */
  const foldsToZero = (key: string): boolean => {
    const p = normalizeProperty({ ...GOOD, [key]: '9' }) as unknown as Record<string, unknown>;
    return p[key] === 0;
  };

  it('★ 表の欄はすべて「数でない値を 0 に倒す」欄である', () => {
    for (const f of PROPERTY_NUMERIC_FIELDS) {
      expect(foldsToZero(f.key), `${f.key} は 0 に倒れていない`).toBe(true);
    }
  });

  /** 形の表の欄名 (走査が空になったら床で落とす)。 */
  const shapeFields = (): readonly string[] => {
    const shape = COLLECTION_SHAPES['realestate-properties'];
    expect(shape, 'realestate-properties の形が無い').toBeDefined();
    const fields = shape?.fields ?? [];
    expect(fields.length).toBeGreaterThanOrEqual(7);
    return fields;
  };

  it('★ 逆向き: 0 に倒る欄で表に無い物は 1 つも無い (5 つ目の欄が足された日に鳴る)', () => {
    const listed = new Set(PROPERTY_NUMERIC_FIELDS.map((f) => f.key));
    const missing = shapeFields().filter((k) => !listed.has(k) && foldsToZero(k));
    expect(missing).toEqual([]);
  });

  it('★ 表の欄は形の表 (COLLECTION_SHAPES) の欄でもある (両方向)', () => {
    const shape = new Set(shapeFields());
    for (const f of PROPERTY_NUMERIC_FIELDS) {
      expect(shape.has(f.key), `${f.key} は形の表に無い`).toBe(true);
    }
    expect(PROPERTY_NUMERIC_FIELDS.length).toBeGreaterThanOrEqual(4);
  });

  it('ラベルは重複しない (名簿は日本語ラベルで持つので、重なると欄を見分けられない)', () => {
    const labels = PROPERTY_NUMERIC_FIELDS.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('normalizeProperty — 倒した欄を名簿にする', () => {
  it('★ 正しい控えの名簿は空 (答えも 1 つも変わらない)', () => {
    const n = normalizeProperty(GOOD);
    expect(n.unreadableFields).toEqual([]);
    const p = computeRealEstatePortfolio([n], 0, 0);
    expect(p.netCashflow).toBe(70_000);
    expect(p.portfolioYield).toBe(6);
    expect([yieldScopeNote(p), occupiedWithoutRentNote(p), unreadableCostNote(p)]).toEqual([null, null, null]);
  });

  it('★ 6 形 × 4 欄すべてが名簿に載る', () => {
    for (const f of PROPERTY_NUMERIC_FIELDS) {
      for (const [label, v] of BAD_VALUES) {
        const n = normalizeProperty({ ...GOOD, [f.key]: v });
        expect(n.unreadableFields, `${f.key} = ${label}`).toEqual([f.label]);
      }
    }
  });

  it('★ 未入力は名簿に入れない (欄が無い控えは「読めなかった」ではない)', () => {
    const { monthlyExpenses: _e, monthlyLoan: _l, ...noCost } = GOOD;
    expect(normalizeProperty(noCost).unreadableFields).toEqual([]);
    // 必須の 2 欄が無い控え (前方互換) も同じ —— 「入力してください」としか言えない。
    expect(normalizeProperty({ name: 'A', type: 'アパート', occupied: true }).unreadableFields).toEqual([]);
  });

  it('★ 本当に 0 と打ち込んだ欄も名簿に入れない (0 は事実でありうる)', () => {
    expect(normalizeProperty({ ...GOOD, monthlyRent: 0, monthlyExpenses: 0 }).unreadableFields).toEqual([]);
  });
});

describe('unreadablePropertyField — 鍵で問う口', () => {
  it('★ 2 つの口は全欄で同じ答えを出す (鍵で問う / ラベルで見る)', () => {
    for (const f of PROPERTY_NUMERIC_FIELDS) {
      const roster = normalizeProperty({ ...GOOD, [f.key]: '9' }).unreadableFields;
      expect(unreadablePropertyField(f.key, roster), f.key).toBe(true);
      // 逆向き: 他の欄は false
      for (const other of PROPERTY_NUMERIC_FIELDS) {
        if (other.key === f.key) continue;
        expect(unreadablePropertyField(other.key, roster), `${f.key} の名簿で ${other.key}`).toBe(false);
      }
    }
  });

  it('名簿が無い (見本の行) なら常に false', () => {
    for (const f of PROPERTY_NUMERIC_FIELDS) expect(unreadablePropertyField(f.key, undefined)).toBe(false);
  });

  it('表に無い鍵は false (綴り違いを true にしない)', () => {
    expect(unreadablePropertyField('monthlyRentt', ['家賃'])).toBe(false);
  });
});

describe('★ 月次経費・月次返済が読めないと、手残りが過大に出る', () => {
  it('★ 6 形とも手残りが過大になり、そのことを述べる', () => {
    for (const [label, v] of BAD_VALUES) {
      const exp = port({ ...GOOD, monthlyExpenses: v });
      expect(exp.netCashflow, `経費 = ${label}`).toBe(90_000); // 正しい控えは 70,000
      expect(exp.unreadableCostRows).toBe(1);
      const note = unreadableCostNote(exp);
      expect(note).toContain('月次経費・月次返済が数として読めない 1 件');
      expect(note).toContain('過大');

      const loan = port({ ...GOOD, monthlyLoan: v });
      expect(loan.netCashflow, `返済 = ${label}`).toBe(80_000);
      expect(unreadableCostNote(loan)).not.toBeNull();
    }
  });

  it('★ 1 物件で 2 欄とも読めなくても 1 件として数える (件数は物件数)', () => {
    const p = port({ ...GOOD, monthlyExpenses: '3', monthlyLoan: '1' });
    expect(p.unreadableCostRows).toBe(1);
    expect(p.netCashflow).toBe(100_000);
  });

  it('★ 対照: 経費・返済の欄が無い控えは断らない (宣言どおりの 0)', () => {
    const { monthlyExpenses: _e, monthlyLoan: _l, ...noCost } = GOOD;
    const p = port(noCost);
    expect(p.unreadableCostRows).toBe(0);
    expect(unreadableCostNote(p)).toBeNull();
  });

  it('★ 家賃・取得価格が読めないだけでは経費の断りは出ない (原因を混ぜない)', () => {
    expect(unreadableCostNote(port({ ...GOOD, monthlyRent: '1' }))).toBeNull();
    expect(unreadableCostNote(port({ ...GOOD, purchasePrice: '1' }))).toBeNull();
  });
});

describe('★ 家賃が読めない物件を表面利回りの平均から外す', () => {
  /** 取得価格 2,000 万・家賃 8.0 / 10.3333 / 9.1667 万 → 平均 5.50%。 */
  const three = [80_000, 103_333, 91_667].map((monthlyRent) =>
    normalizeProperty({ ...GOOD, monthlyRent, monthlyExpenses: 0, monthlyLoan: 0 }),
  );

  it('★ 家賃が読めない 1 件を足しても平均は動かない (直す前は 5.50% → 4.13%)', () => {
    expect(computeRealEstatePortfolio(three, 0, 0).portfolioYield).toBe(5.5);
    for (const occupied of [true, false]) {
      const broken = normalizeProperty({ ...GOOD, monthlyRent: '90000', occupied, monthlyExpenses: 0, monthlyLoan: 0 });
      const p = computeRealEstatePortfolio([...three, broken], 0, 0);
      expect(p.portfolioYield, `occupied=${occupied}`).toBe(5.5);
      expect(p.yieldMeasured).toBe(3);
      expect(p.yieldUnmeasuredRent).toBe(1);
      expect(p.yieldUnmeasuredPrice).toBe(0);
      expect(yieldScopeNote(p)).toContain('家賃が数として読めない 1 件');
    }
  });

  it('★ 空室でも述べる (入居中の断りは出ないので、ここが唯一の面になる)', () => {
    const vacant = normalizeProperty({ ...GOOD, monthlyRent: '90000', occupied: false, monthlyExpenses: 0, monthlyLoan: 0 });
    const p = computeRealEstatePortfolio([...three, vacant], 0, 0);
    expect(occupiedWithoutRentNote(p)).toBeNull();
    expect(yieldScopeNote(p)).not.toBeNull();
  });

  it('★ 対照: 本当に 0 円の家賃は外さない (空室の表面利回り 0% は既存の判断)', () => {
    const zero = normalizeProperty({ ...GOOD, monthlyRent: 0, occupied: false, monthlyExpenses: 0, monthlyLoan: 0 });
    const p = computeRealEstatePortfolio([...three, zero], 0, 0);
    expect(p.portfolioYield).toBe(4.13);
    expect(p.yieldMeasured).toBe(4);
    expect(p.yieldUnmeasuredRent).toBe(0);
    expect(yieldScopeNote(p)).toBeNull();
  });

  it('★ 内訳の合計は外した件数に等しい (1 件は 1 つの原因にだけ数える)', () => {
    const rows = [
      ...three,
      normalizeProperty({ ...GOOD, monthlyRent: '9', monthlyExpenses: 0, monthlyLoan: 0 }),
      normalizeProperty({ ...GOOD, purchasePrice: '9', monthlyExpenses: 0, monthlyLoan: 0 }),
      // 両方読めない 1 件 —— 取得価格の側だけに数える (割る物が無い)
      normalizeProperty({ ...GOOD, monthlyRent: '9', purchasePrice: '9', monthlyExpenses: 0, monthlyLoan: 0 }),
    ];
    const p = computeRealEstatePortfolio(rows, 0, 0);
    expect(p.yieldUnmeasuredPrice + p.yieldUnmeasuredRent).toBe(p.yieldUnmeasured);
    expect(p.yieldUnmeasured).toBe(rows.length - p.yieldMeasured);
    expect(p.yieldUnmeasuredPrice).toBe(2);
    expect(p.yieldUnmeasuredRent).toBe(1);
  });

  it('★ 原因を言い分ける (両方向) —— 取得価格の文は家賃を名乗らない / その逆も', () => {
    const priceOnly = yieldScopeNote(computeRealEstatePortfolio([...three, normalizeProperty({ ...GOOD, purchasePrice: '9', monthlyExpenses: 0, monthlyLoan: 0 })], 0, 0));
    expect(priceOnly).toContain('取得価格が読めない');
    expect(priceOnly).not.toContain('家賃が数として読めない');

    const rentOnly = yieldScopeNote(computeRealEstatePortfolio([...three, normalizeProperty({ ...GOOD, monthlyRent: '9', monthlyExpenses: 0, monthlyLoan: 0 })], 0, 0));
    expect(rentOnly).toContain('家賃が数として読めない');
    expect(rentOnly).not.toContain('取得価格が読めない');
  });
});

describe('★ 入居中で家賃が入っていない —— 原因を 2 つに分ける', () => {
  const occupiedNoRent = (rent: unknown) =>
    computeRealEstatePortfolio([normalizeProperty({ ...GOOD, monthlyRent: rent })], 0, 0);

  it('★ 本当に 0 円なら「0 円のため」と述べ、入力を促す (直す前は「読めないため」)', () => {
    const p = occupiedNoRent(0);
    expect(p.occupiedWithoutRent).toBe(1);
    expect(p.occupiedWithoutRentUnreadable).toBe(0);
    const note = occupiedWithoutRentNote(p);
    expect(note).toContain('家賃が 0 円のため');
    expect(note).toContain('家賃を入力してください');
    expect(note).not.toContain('数として読めない');
  });

  it('★ 読めないなら「数として読めないため」と述べ、消して入れ直させる', () => {
    const p = occupiedNoRent('100000');
    expect(p.occupiedWithoutRent).toBe(1);
    expect(p.occupiedWithoutRentUnreadable).toBe(1);
    const note = occupiedWithoutRentNote(p);
    expect(note).toContain('家賃が数として読めないため');
    expect(note).toContain('形式の合わないレコード');
    expect(note).not.toContain('家賃が 0 円のため');
  });

  it('★ 混ざっていれば 2 文とも出て、件数が分かれる', () => {
    const p = computeRealEstatePortfolio(
      [normalizeProperty({ ...GOOD, monthlyRent: 0 }), normalizeProperty({ ...GOOD, monthlyRent: '1' })],
      0,
      0,
    );
    expect(p.occupiedWithoutRent).toBe(2);
    expect(p.occupiedWithoutRentUnreadable).toBe(1);
    const note = occupiedWithoutRentNote(p);
    expect(note).toContain('1 件は家賃が 0 円のため');
    expect(note).toContain('1 件は家賃が数として読めないため');
  });

  it('★ 対照: 空室の家賃 0 は数えない (空室に家賃が無いのは正しい)', () => {
    const p = computeRealEstatePortfolio([normalizeProperty({ ...GOOD, monthlyRent: 0, occupied: false })], 0, 0);
    expect(p.occupiedWithoutRent).toBe(0);
    expect(occupiedWithoutRentNote(p)).toBeNull();
  });

  it('内数の不変条件: 読めない件数は入居中で家賃の無い件数を超えない', () => {
    for (const rent of [0, '1', 100_000] as const) {
      const p = occupiedNoRent(rent);
      expect(p.occupiedWithoutRentUnreadable).toBeLessThanOrEqual(p.occupiedWithoutRent);
    }
  });
});

describe('見本 (snapshot) の行は名簿を持たない', () => {
  it('名簿の無い行は 1 つも数えられない (どの断りも出ない)', () => {
    const demo: PortfolioProperty = { monthlyRent: 100_000, purchasePrice: 20_000_000, occupied: true, demo: true };
    const p = computeRealEstatePortfolio([demo], 0, 0);
    expect([p.unreadableCostRows, p.yieldUnmeasuredRent, p.occupiedWithoutRentUnreadable]).toEqual([0, 0, 0]);
    expect([yieldScopeNote(p), occupiedWithoutRentNote(p), unreadableCostNote(p)]).toEqual([null, null, null]);
  });
});
