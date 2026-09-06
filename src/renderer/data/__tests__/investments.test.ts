import { describe, expect, it } from 'vitest';
import {
  parsePropertyEntry,
  parseHoldingEntry,
  holdingToForm,
  propertyToForm,
  computeRealEstatePortfolio,
  computeFundPortfolio,
  fundValuation,
  PROPERTIES_COLLECTION,
  HOLDINGS_COLLECTION,
  PROPERTY_TYPES,
  normalizeHolding,
  normalizeProperty,
} from '../investments';
import { SNAPSHOT } from '../snapshot';

describe('parsePropertyEntry (不動産の任意追加)', () => {
  const valid = { name: '福岡市アパート', type: '一棟', monthlyRent: '250000', purchasePrice: '38,000,000' };

  it('parses a valid entry (カンマ・任意項目の既定 0・入居既定 true)', () => {
    const p = parsePropertyEntry(valid);
    expect(p).toEqual({
      name: '福岡市アパート',
      type: '一棟',
      monthlyRent: 250_000,
      purchasePrice: 38_000_000,
      occupied: true,
      monthlyExpenses: 0,
      monthlyLoan: 0,
    });
  });

  it('accepts optional expenses/loan and occupied=false', () => {
    const p = parsePropertyEntry({ ...valid, occupied: false, monthlyExpenses: '30000', monthlyLoan: '120000' });
    expect(p.occupied).toBe(false);
    expect(p.monthlyExpenses).toBe(30_000);
    expect(p.monthlyLoan).toBe(120_000);
  });

  it('rejects empty name / empty type / negative rent / zero price', () => {
    expect(() => parsePropertyEntry({ ...valid, name: '  ' })).toThrow('物件名');
    expect(() => parsePropertyEntry({ ...valid, type: '' })).toThrow('種別');
    expect(() => parsePropertyEntry({ ...valid, monthlyRent: '-1' })).toThrow('家賃');
    expect(() => parsePropertyEntry({ ...valid, purchasePrice: '0' })).toThrow('取得価格');
    expect(() => parsePropertyEntry({ ...valid, monthlyExpenses: 'abc' })).toThrow('月次経費');
  });

  it('exposes stable collection names and type options', () => {
    expect(PROPERTIES_COLLECTION).toBe('realestate-properties');
    expect(HOLDINGS_COLLECTION).toBe('mutualfund-holdings');
    expect(PROPERTY_TYPES).toContain('区分所有');
    expect(PROPERTY_TYPES).toContain('一棟');
  });

  it('数値そのままの入力 (保存済みエントリの再検証) も受理する', () => {
    const p = parsePropertyEntry({
      name: '数値入力', type: '一棟', monthlyRent: 250_000, purchasePrice: 38_000_000,
      monthlyExpenses: 30_000, monthlyLoan: 120_000,
    });
    expect(p.monthlyRent).toBe(250_000);
    expect(p.purchasePrice).toBe(38_000_000);
    expect(p.monthlyExpenses).toBe(30_000);
    expect(p.monthlyLoan).toBe(120_000);
  });

  it('家賃 0 円 (賃料未設定の物件) は受理する (境界)', () => {
    expect(parsePropertyEntry({ ...valid, monthlyRent: '0' }).monthlyRent).toBe(0);
  });

  it('家賃未入力・返済額が不正ならそれぞれのエラーになる', () => {
    expect(() => parsePropertyEntry({ ...valid, monthlyRent: undefined }))
      .toThrow('家賃 (月額) は 0 以上の数値で入力してください');
    expect(() => parsePropertyEntry({ ...valid, monthlyLoan: 'abc' }))
      .toThrow('月次返済額は 0 以上の数値で入力してください');
  });

  it('★ 家賃の空欄・空白だけは 0 円 (番人も「0 円 として計算されています」と言う)', () => {
    expect(parsePropertyEntry({ ...valid, monthlyRent: '' }).monthlyRent).toBe(0);
    expect(parsePropertyEntry({ ...valid, monthlyRent: '   ' }).monthlyRent).toBe(0);
    // 対照: 読めない文字列は 0 に倒さず断る (空欄と「読めない」を混ぜない)
    expect(() => parsePropertyEntry({ ...valid, monthlyRent: 'abc' })).toThrow('家賃');
  });

  it('★ 桁区切りの位置が違う値は保存しない — 画面の指摘と保存が食い違っていた (2026-09-06)', () => {
    // 旧実装は `Number('1,5'.replace(/[,，\s]/g, ''))` = 15。入力欄は ⛔ を出しながら
    // 15 円が保存される、という食い違いだった (読み取りを画面と 1 つにした)。
    for (const bad of ['1,5', '1 5', '0x10', '1e3', '100m2']) {
      expect(() => parsePropertyEntry({ ...valid, monthlyRent: bad }), bad).toThrow('家賃');
    }
    // 対照: 桁区切りが正しい値は読む
    expect(parsePropertyEntry({ ...valid, monthlyRent: '1,200,000' }).monthlyRent).toBe(1_200_000);
    // 対照: 全角も読む (旧実装は NaN で断っていた —— 画面は読めていたので逆向きに食い違っていた)
    expect(parsePropertyEntry({ ...valid, monthlyRent: '１２００' }).monthlyRent).toBe(1200);
  });

  it('物件名は 64 文字・種別は 16 文字まで受理し 1 文字超過で拒否 (境界)', () => {
    expect(parsePropertyEntry({ ...valid, name: 'あ'.repeat(64) }).name).toBe('あ'.repeat(64));
    expect(() => parsePropertyEntry({ ...valid, name: 'あ'.repeat(65) })).toThrow('物件名');
    expect(parsePropertyEntry({ ...valid, type: 'あ'.repeat(16) }).type).toBe('あ'.repeat(16));
    expect(() => parsePropertyEntry({ ...valid, type: 'あ'.repeat(17) })).toThrow('種別');
  });

  it('物件名・種別が文字列でない場合も該当エラー / 種別も trim する', () => {
    expect(() => parsePropertyEntry({ ...valid, name: undefined })).toThrow('物件名は 1〜64 文字で入力してください');
    expect(() => parsePropertyEntry({ ...valid, type: undefined })).toThrow('種別を選択してください');
    expect(parsePropertyEntry({ ...valid, type: ' 一棟 ' }).type).toBe('一棟');
  });
});

describe('computeRealEstatePortfolio', () => {
  const base = SNAPSHOT.realEstate;

  it('snapshot 行のみ → snapshot に手書きされた集計値と完全一致 (不変条件)', () => {
    const p = computeRealEstatePortfolio(
      base.properties,
      base.monthlyCashflow.operatingExpenses,
      base.monthlyCashflow.mortgagePayment,
    );
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent);
    expect(p.operatingExpenses).toBe(base.monthlyCashflow.operatingExpenses);
    expect(p.mortgagePayment).toBe(base.monthlyCashflow.mortgagePayment);
    expect(p.netCashflow).toBe(base.monthlyCashflow.netCashflow);
    expect(p.portfolioYield).toBe(base.portfolioYield);
    expect(p.occupancyRate).toBe(base.occupancyRate);
  });

  it('ユーザー物件の追加が家賃・経費・返済・入居率へ反映される', () => {
    const user = parsePropertyEntry({
      name: '追加物件', type: '戸建て', monthlyRent: '100000', purchasePrice: '12000000',
      monthlyExpenses: '10000', monthlyLoan: '40000',
    });
    const p = computeRealEstatePortfolio(
      [...base.properties, user],
      base.monthlyCashflow.operatingExpenses,
      base.monthlyCashflow.mortgagePayment,
    );
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent + 100_000);
    expect(p.operatingExpenses).toBe(base.monthlyCashflow.operatingExpenses + 10_000);
    expect(p.mortgagePayment).toBe(base.monthlyCashflow.mortgagePayment + 40_000);
    expect(p.netCashflow).toBe(p.grossRent - p.operatingExpenses - p.mortgagePayment);
    // 追加物件の表面利回り = 100000*12/12000000 = 10.0% → 平均 (4.8+6.2+5.5+8.1+10.0)/5
    expect(p.portfolioYield).toBe(6.92);
    expect(p.occupancyRate).toBe(0.8);
  });

  it('空室のユーザー物件は家賃に入らないが入居率の分母に入る', () => {
    const vacant = parsePropertyEntry({
      name: '空室', type: 'その他', monthlyRent: '80000', purchasePrice: '10000000', occupied: false,
    });
    const p = computeRealEstatePortfolio([...base.properties, vacant], 0, 0);
    expect(p.grossRent).toBe(base.monthlyCashflow.grossRent);
    expect(p.occupancyRate).toBe(0.6);
  });

  it('物件 0 件は全て 0 (ゼロ除算なし)', () => {
    const p = computeRealEstatePortfolio([], 0, 0);
    expect(p).toEqual({ grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0, portfolioYield: 0, occupancyRate: 0 });
  });

  it('snapshot 側の経費・返済が負や NaN なら 0 として扱う (負のキャッシュアウトを作らない)', () => {
    const neg = computeRealEstatePortfolio(base.properties, -5_000, -3_000);
    expect(neg.operatingExpenses).toBe(0);
    expect(neg.mortgagePayment).toBe(0);
    expect(neg.netCashflow).toBe(base.monthlyCashflow.grossRent);

    const nan = computeRealEstatePortfolio(base.properties, Number.NaN, Number.NaN);
    expect(nan.operatingExpenses).toBe(0);
    expect(nan.mortgagePayment).toBe(0);
    expect(nan.netCashflow).toBe(base.monthlyCashflow.grossRent);
  });

  // -0 は Intl.NumberFormat('ja-JP').format(-0) が "-0" を返すため、
  // そのまま持ち回すと「-0 円」と表示される。+0 への正規化を固定する。
  it('-0 の経費・返済は +0 に正規化する (「-0 円」表示の防止)', () => {
    const p = computeRealEstatePortfolio([], -0, -0);
    expect(Object.is(p.operatingExpenses, 0)).toBe(true);
    expect(Object.is(p.mortgagePayment, 0)).toBe(true);
  });

  it('取得価格 0 の行は利回りに加算しない (Infinity を出さない)', () => {
    const p = computeRealEstatePortfolio([{ monthlyRent: 50_000, purchasePrice: 0, occupied: true }], 0, 0);
    expect(p.portfolioYield).toBe(0);
    expect(Number.isFinite(p.portfolioYield)).toBe(true);
    expect(p.grossRent).toBe(50_000);
  });
});

describe('parseHoldingEntry (投資信託の任意追加)', () => {
  const valid = { code: '9C31118A', name: 'ニッセイ外国株式インデックス', units: '500000', navPerUnit: '32000' };

  it('parses a valid entry and derives valuation (口数÷1万×基準価額 = auto モード)', () => {
    const h = parseHoldingEntry(valid);
    expect(h.valuation).toBe(fundValuation(500_000, 32_000));
    expect(h.valuation).toBe(1_600_000);
    expect(h.valuationMode).toBe('auto');
    // 取得額の既定は評価額 (損益 0)、YTD の既定は 0。
    expect(h.acquisitionCost).toBe(1_600_000);
    expect(h.ytdReturnPct).toBe(0);
  });

  it('評価額を直接入力すると manual モード (口数・基準価額は任意)', () => {
    const h = parseHoldingEntry({ name: '手動ファンド', valuation: '2,500,000' });
    expect(h.valuationMode).toBe('manual');
    expect(h.valuation).toBe(2_500_000);
    expect(h.units).toBe(0);
    expect(h.navPerUnit).toBe(0);
    expect(h.acquisitionCost).toBe(2_500_000);
  });

  it('manual モードでも口数・基準価額を併記でき、評価額は入力値が勝つ', () => {
    const h = parseHoldingEntry({ ...valid, valuation: '1500000' });
    expect(h.valuationMode).toBe('manual');
    expect(h.valuation).toBe(1_500_000);
    expect(h.units).toBe(500_000);
    expect(h.navPerUnit).toBe(32_000);
  });

  it('manual の評価額 0 円・不正値は拒否 (自動へ戻すには空欄)', () => {
    expect(() => parseHoldingEntry({ name: 'x', valuation: '0' })).toThrow('評価額');
    expect(() => parseHoldingEntry({ name: 'x', valuation: 'abc' })).toThrow('評価額');
  });

  it('accepts optional acquisitionCost / ytdReturnPct', () => {
    const h = parseHoldingEntry({ ...valid, acquisitionCost: '1,400,000', ytdReturnPct: '12.5' });
    expect(h.acquisitionCost).toBe(1_400_000);
    expect(h.ytdReturnPct).toBe(12.5);
  });

  it('rejects empty name / zero units / zero nav / bad ytd / whitespace code', () => {
    expect(() => parseHoldingEntry({ ...valid, name: '' })).toThrow('ファンド名');
    expect(() => parseHoldingEntry({ ...valid, units: '0' })).toThrow('口数');
    expect(() => parseHoldingEntry({ ...valid, navPerUnit: '' })).toThrow('基準価額');
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: '2000' })).toThrow('YTD');
    expect(() => parseHoldingEntry({ ...valid, code: 'AB C' })).toThrow('銘柄コード');
  });

  it('snapshot の評価額の慣習 (1万口あたり基準価額) を再現する', () => {
    for (const h of SNAPSHOT.mutualFunds.holdings) {
      expect(fundValuation(h.units, h.navPerUnit)).toBe(h.valuation);
    }
  });

  it('holdingToForm: auto は評価額欄を空欄で往復 (再保存しても auto のまま)', () => {
    const auto = parseHoldingEntry(valid);
    const form = holdingToForm(auto);
    expect(form.valuation).toBe('');
    expect(parseHoldingEntry(form)).toEqual(auto);
  });

  it('holdingToForm: manual は評価額を持って往復し、空欄にすれば auto へ切替', () => {
    const manual = parseHoldingEntry({ ...valid, valuation: '1500000' });
    const form = holdingToForm(manual);
    expect(form.valuation).toBe('1500000');
    expect(parseHoldingEntry(form)).toEqual(manual);
    // 評価額を空欄にして保存し直す → auto に戻り、口数×基準価額で自動計算。
    const back = parseHoldingEntry({ ...form, valuation: '' });
    expect(back.valuationMode).toBe('auto');
    expect(back.valuation).toBe(1_600_000);
  });

  it('propertyToForm: 物件は往復で等価 (任意欄 0 は空欄へ)', () => {
    const p = parsePropertyEntry({ name: '往復物件', type: '一棟', monthlyRent: '250000', purchasePrice: '38000000' });
    const form = propertyToForm(p);
    expect(form.monthlyExpenses).toBe('');
    expect(parsePropertyEntry(form)).toEqual(p);
  });

  it('propertyToForm: 0 の任意欄は空欄・値があれば文字列で残す', () => {
    const zero = propertyToForm(parsePropertyEntry({ name: '任意欄なし', type: '一棟', monthlyRent: '250000', purchasePrice: '38000000' }));
    expect(zero.monthlyExpenses).toBe('');
    expect(zero.monthlyLoan).toBe('');

    const filled = parsePropertyEntry({
      name: '任意欄あり', type: '一棟', monthlyRent: '250000', purchasePrice: '38000000',
      monthlyExpenses: '30000', monthlyLoan: '120000',
    });
    const form = propertyToForm(filled);
    expect(form.monthlyExpenses).toBe('30000');
    expect(form.monthlyLoan).toBe('120000');
    expect(parsePropertyEntry(form)).toEqual(filled);
  });

  it('銘柄コードは trim し 16 文字まで受理・17 文字は拒否 (境界)', () => {
    expect(parseHoldingEntry({ ...valid, code: ' 9C31118A ' }).code).toBe('9C31118A');
    expect(parseHoldingEntry({ ...valid, code: 'A'.repeat(16) }).code).toBe('A'.repeat(16));
    expect(() => parseHoldingEntry({ ...valid, code: 'A'.repeat(17) })).toThrow('銘柄コード');
  });

  it('ファンド名は trim し 80 文字まで受理・81 文字と非文字列は拒否 (境界)', () => {
    expect(parseHoldingEntry({ ...valid, name: ' ひふみプラス ' }).name).toBe('ひふみプラス');
    expect(parseHoldingEntry({ ...valid, name: 'あ'.repeat(80) }).name).toBe('あ'.repeat(80));
    expect(() => parseHoldingEntry({ ...valid, name: 'あ'.repeat(81) })).toThrow('ファンド名');
    expect(() => parseHoldingEntry({ ...valid, name: undefined })).toThrow('ファンド名は 1〜80 文字で入力してください');
  });

  it('manual モードの口数・基準価額・取得額の不正値はそれぞれのエラーになる', () => {
    expect(() => parseHoldingEntry({ name: 'x', valuation: '100', units: 'abc' }))
      .toThrow('口数は 0 以上の数値で入力してください');
    expect(() => parseHoldingEntry({ name: 'x', valuation: '100', navPerUnit: 'abc' }))
      .toThrow('基準価額は 0 以上の数値で入力してください');
    expect(() => parseHoldingEntry({ ...valid, acquisitionCost: 'abc' }))
      .toThrow('取得額は 0 以上の数値で入力してください');
  });

  it('取得額を空欄にすると評価額と同額 (損益 0) になる — 0 円ではない', () => {
    const h = parseHoldingEntry({ ...valid, acquisitionCost: '' });
    expect(h.acquisitionCost).toBe(h.valuation);
    expect(h.acquisitionCost).toBe(1_600_000);
  });

  it('YTD リターンは −100〜1000 を含む範囲 (境界) で、空白入り・数値入力も受理する', () => {
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: '-100' }).ytdReturnPct).toBe(-100);
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: '1000' }).ytdReturnPct).toBe(1000);
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: ' 12.5 ' }).ytdReturnPct).toBe(12.5);
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: 12.5 }).ytdReturnPct).toBe(12.5);
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: '-101' })).toThrow('YTD');
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: 'abc' })).toThrow('YTD');
  });

  it('★ YTD も画面と同じ読み取り (1,5 を 15% にしない)', () => {
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: '1,5' })).toThrow('YTD');
    expect(() => parseHoldingEntry({ ...valid, ytdReturnPct: '1e2' })).toThrow('YTD');
    // 対照: 空欄は 0 のまま (読めない ≠ 未入力。この門を外すと往復で落ちる)
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: '' }).ytdReturnPct).toBe(0);
    expect(parseHoldingEntry({ ...valid, ytdReturnPct: '-1.5' }).ytdReturnPct).toBe(-1.5);
  });

  it('holdingToForm: manual の 0 の任意欄 (口数・基準価額・YTD) は空欄へ戻す', () => {
    const manual = parseHoldingEntry({ name: '手動ファンド', valuation: '2500000' });
    const form = holdingToForm(manual);
    expect(form.units).toBe('');
    expect(form.navPerUnit).toBe('');
    expect(form.ytdReturnPct).toBe('');
    expect(form.valuation).toBe('2500000');
    expect(form.acquisitionCost).toBe('2500000');
    expect(parseHoldingEntry(form)).toEqual(manual);
  });

  it('holdingToForm: 0 以外の YTD は文字列で残す', () => {
    const form = holdingToForm(parseHoldingEntry({ ...valid, ytdReturnPct: '8.7' }));
    expect(form.ytdReturnPct).toBe('8.7');
  });

  it('holdingToForm: valuationMode を持たない過去データは auto 扱い (評価額欄は空欄)', () => {
    const legacy = { ...parseHoldingEntry(valid), valuationMode: undefined } as unknown as Parameters<typeof holdingToForm>[0];
    const form = holdingToForm(legacy);
    expect(form.valuation).toBe('');
    expect(parseHoldingEntry(form).valuationMode).toBe('auto');
  });
});

describe('computeFundPortfolio', () => {
  const base = SNAPSHOT.mutualFunds;

  it('snapshot 行のみ → snapshot に手書きされた portfolio と完全一致 (不変条件)', () => {
    const p = computeFundPortfolio(base.holdings, base.portfolio.totalCostBasis, []);
    expect(p.totalValuation).toBe(base.portfolio.totalValuation);
    expect(p.totalCostBasis).toBe(base.portfolio.totalCostBasis);
    expect(p.unrealizedGain).toBe(base.portfolio.unrealizedGain);
    expect(p.unrealizedGainPct).toBe(base.portfolio.unrealizedGainPct);
  });

  it('ユーザー銘柄の評価額・取得額が加算される', () => {
    const h = parseHoldingEntry({ code: '', name: '追加ファンド', units: '100000', navPerUnit: '20000', acquisitionCost: '150000' });
    const p = computeFundPortfolio([...base.holdings, h], base.portfolio.totalCostBasis, [h.acquisitionCost]);
    expect(p.totalValuation).toBe(base.portfolio.totalValuation + 200_000);
    expect(p.totalCostBasis).toBe(base.portfolio.totalCostBasis + 150_000);
    expect(p.unrealizedGain).toBe(p.totalValuation - p.totalCostBasis);
  });

  it('保有 0 件・原価 0 は全て 0 (ゼロ除算なし)', () => {
    expect(computeFundPortfolio([], 0, [])).toEqual({ totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 });
  });

  it('取得原価・ユーザー取得額の負値/NaN は 0 として扱う (原価を減らさない)', () => {
    const p = computeFundPortfolio(base.holdings, -1_000, [-500, Number.NaN, 200_000]);
    expect(p.totalCostBasis).toBe(200_000);
    expect(p.totalValuation).toBe(base.portfolio.totalValuation);

    const nan = computeFundPortfolio(base.holdings, Number.NaN, []);
    expect(nan.totalCostBasis).toBe(0);
    expect(nan.unrealizedGainPct).toBe(0);
  });

  it('-0 の取得原価は +0 に正規化する (「-0 円」表示の防止)', () => {
    const p = computeFundPortfolio([], -0, []);
    expect(Object.is(p.totalCostBasis, 0)).toBe(true);
  });
});

// --- 保存された 1 件を読む境界 -------------------------------------------
//
// 復元の形の検査 (`collectionShapes.ts`) は `mutualfund-holdings` の
// code / valuationMode / acquisitionCost / ytdReturnPct を**任意**にしている
// (前方互換。`valuationMode` の注記は「過去データに無い場合は auto 扱い」)。
// 型 `HoldingEntry` はこの 4 つを必須と言うので、欄の無い控えが復元を通ると
// 型が嘘になり、2026-09-06 の時点で画面が 2 通りに壊れた:
//   ytdReturnPct が無い → 一覧の `.toFixed(1)` が TypeError で画面が枠になる
//     (しかもその画面が保有銘柄の一覧なので、利用者はそのレコードを消せない)
//   acquisitionCost が無い → 取得原価の合計が NaN になり「¥NaN」が出る
// 補いは読む所 1 か所 (`normalizeHolding`) に置く。
describe('normalizeHolding', () => {
  const full = {
    code: '0331C152', name: 'eMAXIS Slim', units: 1_000_000, navPerUnit: 20_000,
    valuation: 2_000_000, valuationMode: 'manual', acquisitionCost: 1_500_000, ytdReturnPct: 12.5,
  };

  it('揃っている控えは 1 つも書き換えない (対照)', () => {
    expect(normalizeHolding(full)).toEqual(full);
  });

  it('年初来リターンが無い控えは 0 になる (旧: .toFixed で TypeError)', () => {
    const { ytdReturnPct: _drop, ...without } = full;
    expect(normalizeHolding(without).ytdReturnPct).toBe(0);
  });

  it('取得額が無い控えは評価額と同額 = 損益 0 (旧: NaN)', () => {
    const { acquisitionCost: _drop, ...without } = full;
    expect(normalizeHolding(without).acquisitionCost).toBe(2_000_000);
  });

  it('評価モードが無い / 知らない値の控えは auto', () => {
    const { valuationMode: _drop, ...without } = full;
    expect(normalizeHolding(without).valuationMode).toBe('auto');
    expect(normalizeHolding({ ...full, valuationMode: 'ぜんぶ' }).valuationMode).toBe('auto');
    expect(normalizeHolding(full).valuationMode).toBe('manual');
  });

  it('銘柄コード・名前が無い控えは空文字 (表示は「—」に落ちる)', () => {
    expect(normalizeHolding({}).code).toBe('');
    expect(normalizeHolding({}).name).toBe('');
  });

  it('評価額が無い控えは 口数 ÷ 1万 × 基準価額 から導く', () => {
    const { valuation: _drop, ...without } = full;
    expect(normalizeHolding(without).valuation).toBe(2_000_000);
    expect(normalizeHolding(without).acquisitionCost).toBe(1_500_000);
  });

  it('数でない値・非有限値も既定に倒す (文字列の金額・NaN・Infinity)', () => {
    const junk = normalizeHolding({
      code: 42, name: null, units: '1000', navPerUnit: Number.NaN,
      valuation: Number.POSITIVE_INFINITY, acquisitionCost: 'たくさん', ytdReturnPct: Number.NaN,
    });
    expect(junk).toEqual({
      code: '', name: '', units: 0, navPerUnit: 0, valuation: 0,
      valuationMode: 'auto', acquisitionCost: 0, ytdReturnPct: 0,
    });
    for (const v of Object.values(junk)) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('数であるだけでは通さない —— NaN / ±∞ の欄も既定に倒す', () => {
    // 変異検査が拾った穴: `typeof v === 'number' && Number.isFinite(v)` の `&&` を
    // `||` にしても、標本が文字列だけだと差が出ない (NaN は typeof が number)。
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const h = normalizeHolding({ ...full, units: bad, navPerUnit: bad, valuation: bad,
        acquisitionCost: bad, ytdReturnPct: bad });
      expect(h.units).toBe(0);
      expect(h.navPerUnit).toBe(0);
      expect(h.valuation).toBe(0); // 導出も 0 × 0
      expect(h.acquisitionCost).toBe(0); // = 評価額
      expect(h.ytdReturnPct).toBe(0);
    }
  });

  it('物でない引数 (null / 配列 / 数) も落ちずに空の形になる', () => {
    for (const raw of [null, undefined, 42, 'x', [] as unknown]) {
      const h = normalizeHolding(raw);
      expect(h.name).toBe('');
      expect(h.ytdReturnPct).toBe(0);
    }
  });
});

describe('normalizeProperty', () => {
  const core = { name: '一棟目', type: 'アパート', monthlyRent: 400_000, purchasePrice: 40_000_000, occupied: true };

  it('経費・返済が無い控えは 0 になる (旧: 年間CF が NaN)', () => {
    const p = normalizeProperty(core);
    expect(p.monthlyExpenses).toBe(0);
    expect(p.monthlyLoan).toBe(0);
  });

  it('対照: 揃った控えは 1 つも書き換えない', () => {
    const full = { ...core, monthlyExpenses: 50_000, monthlyLoan: 120_000 };
    expect(normalizeProperty(full)).toEqual(full);
  });

  it('NaN / ±∞ の欄も 0 に倒す (数であるだけでは通さない)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const p = normalizeProperty({ ...core, monthlyRent: bad, purchasePrice: bad,
        monthlyExpenses: bad, monthlyLoan: bad });
      expect([p.monthlyRent, p.purchasePrice, p.monthlyExpenses, p.monthlyLoan]).toEqual([0, 0, 0, 0]);
    }
  });

  it('数でない値・非有限値・物でない引数も既定に倒す', () => {
    const p = normalizeProperty({ ...core, monthlyRent: '400000', monthlyExpenses: Number.NaN, occupied: 'yes' });
    expect(p.monthlyRent).toBe(0);
    expect(p.monthlyExpenses).toBe(0);
    expect(p.occupied).toBe(false);
    expect(normalizeProperty(null).name).toBe('');
  });
});
